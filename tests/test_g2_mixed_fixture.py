"""G2 mixed-type fixture checks and offline Wikibase-compatible data-model projection.
This is NOT an execution against a live Wikibase service.
"""
from pathlib import Path
import hashlib
import json
import subprocess
import unittest
import uuid
from test_pg_p0 import run,ok,rejected

ROOT=Path(__file__).resolve().parents[1]
FIXTURE=json.loads((ROOT/"fixtures/g2/mixed_12.json").read_text())
PROPERTY_BY_KIND={name:f"P{100+i}" for i,name in enumerate(sorted({r["kind"] for r in FIXTURE["relations"]}),start=1)}
QP={"edition_number":"P901","context":"P902"}
SRC_PROP="P991"; PINPOINT_PROP="P992"; STANCE_PROP="P993"

def item_snake(property_id, target_key):
    number=int(target_key[1:])
    return {"snaktype":"value","property":property_id,"datatype":"wikibase-item",
      "datavalue":{"type":"wikibase-entityid","value":{"entity-type":"item","numeric-id":number,"id":f"Q{number}"}}}

def text_snake(property_id, text):
    return {"snaktype":"value","property":property_id,"datatype":"string",
      "datavalue":{"type":"string","value":text}}

def wikibase_shape(fixture=FIXTURE):
    # Offline conversion to the canonical Action API JSON representation.
    # Q/P IDs are fixture-local placeholders, NOT minted IDs from any Wikibase.
    by_subject={e["key"]:{"type":"item","id":f"Q{int(e['key'][1:])}",
      "labels":{"en":{"language":"en","value":e["label_en"]}},
      "claims":{}} for e in fixture["entities"]}
    src={s["key"]:s for s in fixture["sources"]}
    for rel in fixture["relations"]:
        prop=PROPERTY_BY_KIND[rel["kind"]]
        claims=by_subject[rel["subject"]]["claims"]
        statement={"id":f"Q{int(rel['subject'][1:])}$"+str(uuid.UUID(rel["id"])).upper(),
          "type":"statement","rank":"normal","mainsnak":item_snake(prop,rel["object"]),
          "references":[]}
        if rel["qualifiers"]:
            statement["qualifiers"]={}
            statement["qualifiers-order"]=[]
            for qual in rel["qualifiers"]:
                qp=QP[qual["property"]]
                statement["qualifiers"].setdefault(qp,[]).append(text_snake(qp,qual["value"]))
                if qp not in statement["qualifiers-order"]:statement["qualifiers-order"].append(qp)
        for reference in rel["references"]:
            locator=src[reference["source"]]["locator"]
            values={SRC_PROP:[text_snake(SRC_PROP,locator)],
                    PINPOINT_PROP:[text_snake(PINPOINT_PROP,reference["pinpoint"])],
                    STANCE_PROP:[text_snake(STANCE_PROP,reference["stance"])]}
            fingerprint=hashlib.sha1(json.dumps(values,sort_keys=True).encode()).hexdigest()
            statement["references"].append({"hash":fingerprint,"snaks":values,
              "snaks-order":[SRC_PROP,PINPOINT_PROP,STANCE_PROP]})
        claims.setdefault(prop,[]).append(statement)
    return by_subject

def clear_data():
    ok("""TRUNCATE kg.relation_qualifiers,
       kg.search_projection,kg.outbox,kg.heads,kg.snapshots,
       kg.approvals,kg.claim_evidence,kg.claims,kg.revision_media,kg.media,
       kg.relation_evidence,kg.relations,kg.revisions,
       kg.category_edges,kg.categories,kg.entities,kg.sources
       RESTART IDENTITY CASCADE;""")

def load_pg():
    for s in FIXTURE["sources"]:
        ok(f"INSERT INTO kg.sources(id,locator,description) VALUES('{s['id']}','{s['locator']}','{s['description']}');")
    for e in FIXTURE["entities"]:
        ok(f"INSERT INTO kg.entities(id,kind,name) VALUES('{e['id']}','{e['type']}','{e['label_en']}');")
    ids={e["key"]:e["id"] for e in FIXTURE["entities"]}
    sources={s["key"]:s["id"] for s in FIXTURE["sources"]}
    for rel in FIXTURE["relations"]:
        ok(f"INSERT INTO kg.relations(id,kind,subject,object,status) VALUES"
           f"('{rel['id']}','{rel['kind']}','{ids[rel['subject']]}','{ids[rel['object']]}','proposed');")
        for q in rel["qualifiers"]:
            ok(f"INSERT INTO kg.relation_qualifiers VALUES"
               f"('{rel['id']}','{q['property']}','{q['value']}');")
        for ref in rel["references"]:
            ok(f"INSERT INTO kg.relation_evidence(relation_id,source_id,stance,pinpoint,reviewer) VALUES"
               f"('{rel['id']}','{sources[ref['source']]}','{ref['stance']}','{ref['pinpoint']}','fixture-only');")

class G2Contracts(unittest.TestCase):
    def setUp(self):clear_data()

    def test_01_synthetic_12_types_identity(self):
        self.assertEqual(len(FIXTURE["entities"]),12)
        self.assertEqual(len(set(e["id"] for e in FIXTURE["entities"])),12)
        self.assertEqual(len(set(e["key"] for e in FIXTURE["entities"])),12)
        self.assertTrue(all(uuid.UUID(e["id"]) for e in FIXTURE["entities"]))
        self.assertEqual(FIXTURE["status"],"fabricated-test-data-not-facts")

    def test_02_pg_ingests_all_12_and_relations(self):
        load_pg()
        self.assertEqual(ok("SELECT count(*) FROM kg.entities;"),"12")
        self.assertEqual(ok("SELECT count(*) FROM kg.relations;"),"11")
        self.assertEqual(ok("SELECT count(*) FROM kg.relation_evidence;"),"12")
        self.assertEqual(ok("SELECT count(*) FROM kg.relation_qualifiers;"),"2")
        self.assertEqual(ok("SELECT count(DISTINCT kind) FROM kg.entities;"),"9")

    def test_03_bibliographic_graph_and_typed_edges(self):
        load_pg()
        self.assertEqual(ok("SELECT count(*) FROM kg.relations WHERE kind IN "
              "('edition_of','has_issue','contains_article','published_as');"),"4")
        paper=next(e["id"] for e in FIXTURE["entities"] if e["key"]=="K005")
        edition=next(e["id"] for e in FIXTURE["entities"] if e["key"]=="K008")
        rejected(f"INSERT INTO kg.relations VALUES('{uuid.uuid4()}','edition_of','{paper}','{edition}','proposed');",
                 "INVALID_RELATION_DOMAIN_RANGE")

    def test_04_evidence_and_qualifiers_preserved(self):
        load_pg()
        self.assertEqual(ok("SELECT count(*) FROM kg.relation_evidence WHERE stance='contradicts';"),"1")
        self.assertEqual(ok("SELECT count(*) FROM kg.relation_evidence WHERE stance='supports';"),"11")
        self.assertEqual(ok("SELECT count(*) FROM kg.relation_qualifiers WHERE qualifier_key='edition_number';"),"1")

    def test_05_offline_wikibase_json_shape(self):
        export=wikibase_shape()
        self.assertEqual(len(export),12)
        all_stmts=[s for record in export.values() for seq in record["claims"].values() for s in seq]
        self.assertEqual(len(all_stmts),11)
        self.assertEqual(sum(len(s["references"]) for s in all_stmts),12)
        self.assertEqual(sum(len(s.get("qualifiers",{})) for s in all_stmts),2)
        self.assertTrue(all(s["mainsnak"]["datavalue"]["value"]["id"].startswith("Q")
                            for s in all_stmts))
        self.assertTrue(all(s["rank"]=="normal" for s in all_stmts))
        self.assertTrue(all(s["references"] for s in all_stmts))
        # Placeholder P/Q IDs must never be mistaken for server-confirmed IDs.
        self.assertEqual(export["K001"]["id"],"Q1")

    def test_06_qualifier_and_contradiction_roundtrip(self):
        export=wikibase_shape()
        normal=[s for seq in export["K001"]["claims"].values() for s in seq]
        r=next(s for s in normal if len(s["references"])==2)
        stances=[ref["snaks"][STANCE_PROP][0]["datavalue"]["value"]
                 for ref in r["references"]]
        self.assertEqual(set(stances),{"supports","contradicts"})
        edition=[s for seq in export["K008"]["claims"].values() for s in seq][0]
        self.assertEqual(edition["qualifiers"][QP["edition_number"]][0]["datavalue"]["value"],"1")

if __name__=="__main__":
    unittest.main(verbosity=2)
