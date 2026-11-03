"""Real PostgreSQL P0 integrity tests; synthetic data only. No cloud access."""
import concurrent.futures
import subprocess
import unittest
import uuid

CONTAINER = "dechive-wiki-p0-db"
DB = "dechive_wiki_p0"

def uid():
    return str(uuid.uuid4())

def run(sql):
    command = ["docker", "exec", "-i", CONTAINER, "psql",
               "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1",
               "-U", "postgres", "-d", DB, "-c", sql]
    return subprocess.run(command, capture_output=True, text=True, timeout=25)

def ok(sql):
    result=run(sql)
    assert result.returncode == 0, f"SQL failed: {result.stderr}\n{sql}"
    return result.stdout.strip()

def rejected(sql, error_fragment):
    result=run(sql)
    assert result.returncode != 0, f"Expected rejection: {sql}"
    assert error_fragment in result.stderr, result.stderr
    return result

class RealDatabaseContracts(unittest.TestCase):
    def setUp(self):
        ok("""TRUNCATE kg.search_projection,kg.outbox,kg.heads,kg.snapshots,
        kg.approvals,kg.claim_evidence,kg.claims,kg.revision_media,kg.media,
        kg.relation_evidence,kg.relations,kg.revisions,
        kg.category_edges,kg.categories,kg.entities,kg.sources
        RESTART IDENTITY CASCADE;""")

    def categories(self, n=3):
        ids=[uid() for _ in range(n)]
        for i,ident in enumerate(ids):
            ok(f"INSERT INTO kg.categories VALUES ('{ident}','cat_{i}','Category {i}');")
        return ids

    def entity(self, kind="concept", name="Synthetic concept"):
        ident=uid()
        ok(f"INSERT INTO kg.entities(id,kind,name) VALUES ('{ident}','{kind}','{name}');")
        return ident

    def approved_revision(self, entity=None, body="Synthetic proof: paper introduced a test idea."):
        entity=entity or self.entity()
        rev,src=uid(),uid()
        claim="paper introduced a test idea"
        assert claim in body
        ok(f"INSERT INTO kg.revisions(id,entity_id,locale,body) "
           f"VALUES('{rev}','{entity}','en','{body}');")
        ok(f"INSERT INTO kg.sources(id,locator,description) "
           f"VALUES('{src}','urn:synthetic:{src}','Fixture source, not external proof');")
        ok(f"INSERT INTO kg.claims VALUES('{rev}','C-001','paragraph-1','{claim}');")
        ok(f"INSERT INTO kg.claim_evidence(revision_id,claim_key,source_id,stance,pinpoint,reviewer) "
           f"VALUES('{rev}','C-001','{src}','supports','fixture-line-1','test-reviewer');")
        ok(f"INSERT INTO kg.approvals VALUES('{rev}','test-reviewer');")
        return entity,rev

    def test_01_taxonomy_cycle_blocked(self):
        a,b,c=self.categories()
        ok(f"INSERT INTO kg.category_edges VALUES('{a}','{b}'),('{b}','{c}');")
        rejected(f"INSERT INTO kg.category_edges VALUES('{c}','{a}');","CATEGORY_CYCLE")
        self.assertEqual(ok("SELECT count(*) FROM kg.category_edges;"),"2")

    def test_02_concurrent_two_node_cycle(self):
        a,b=self.categories(2)
        sqls=[f"INSERT INTO kg.category_edges VALUES('{a}','{b}');",
              f"INSERT INTO kg.category_edges VALUES('{b}','{a}');"]
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:
            results=list(ex.map(run,sqls))
        self.assertEqual(sum(r.returncode==0 for r in results),1,[r.stderr for r in results])
        self.assertEqual(ok("SELECT count(*) FROM kg.category_edges;"),"1")

    def test_03_concurrent_three_node_cycle(self):
        a,b,c=self.categories()
        ok(f"INSERT INTO kg.category_edges VALUES('{a}','{b}');")
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:
            results=list(ex.map(run,[
               f"INSERT INTO kg.category_edges VALUES('{b}','{c}');",
               f"INSERT INTO kg.category_edges VALUES('{c}','{a}');"]))
        self.assertEqual(sum(r.returncode==0 for r in results),1,[r.stderr for r in results])
        self.assertEqual(ok("SELECT count(*) FROM kg.category_edges;"),"2")

    def test_04_multi_parent_allowed(self):
        a,b,c=self.categories()
        ok(f"INSERT INTO kg.category_edges VALUES('{a}','{c}'),('{b}','{c}');")
        self.assertEqual(ok(f"SELECT count(*) FROM kg.category_edges WHERE child='{c}';"),"2")
        self.assertEqual(ok(f"SELECT code FROM kg.categories WHERE id='{c}';"),"cat_2")

    def test_05_symmetric_duplicate_concurrent(self):
        a,b=self.entity(),self.entity(name="Another concept")
        first,second=uid(),uid()
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:
            results=list(ex.map(run,[
               f"INSERT INTO kg.relations(id,kind,subject,object) VALUES('{first}','related_to','{a}','{b}');",
               f"INSERT INTO kg.relations(id,kind,subject,object) VALUES('{second}','related_to','{b}','{a}');"]))
        self.assertEqual(sum(r.returncode==0 for r in results),1,[r.stderr for r in results])
        self.assertEqual(ok("SELECT count(*) FROM kg.relations;"),"1")

    def test_06_invalid_typed_relation_blocked(self):
        person=self.entity("person","Synthetic author")
        paper=self.entity("research_paper","Synthetic paper")
        rejected(f"INSERT INTO kg.relations VALUES('{uid()}','related_to','{person}','{paper}','approved');",
                 "INVALID_RELATION_DOMAIN_RANGE")
        ok(f"INSERT INTO kg.relations VALUES('{uid()}','authored','{person}','{paper}','approved');")
        self.assertEqual(ok("SELECT kind FROM kg.relations;"),"authored")

    def test_07_relation_support_and_contradiction_retained(self):
        a,b=self.entity(),self.entity(name="Counterpart")
        relation=uid()
        ok(f"INSERT INTO kg.relations VALUES('{relation}','related_to','{a}','{b}','approved');")
        for stance in ("supports","contradicts"):
            src=uid()
            ok(f"INSERT INTO kg.sources(id,locator,description) "
               f"VALUES('{src}','urn:synthetic:{src}','Fixture reference');")
            ok(f"INSERT INTO kg.relation_evidence(relation_id,source_id,stance,pinpoint,reviewer) "
               f"VALUES('{relation}','{src}','{stance}','page-1','test-reviewer');")
        self.assertEqual(ok("SELECT count(*) FROM kg.relation_evidence;"),"2")

    def test_08_unapproved_revision_never_public(self):
        entity=self.entity();rev=uid()
        ok(f"INSERT INTO kg.revisions(id,entity_id,locale,body) "
           f"VALUES('{rev}','{entity}','en','Unreviewed draft');")
        rejected(f"SELECT kg.publish('{entity}','{rev}',0);","NOT_APPROVED")
        self.assertEqual(ok("SELECT count(*) FROM kg.public_entries;"),"0")
        self.assertEqual(ok("SELECT count(*) FROM kg.outbox;"),"0")

    def test_09_approval_rejects_mismatched_text(self):
        entity=self.entity();rev,src=uid(),uid()
        ok(f"INSERT INTO kg.revisions VALUES('{rev}','{entity}','en','Different claim entirely',DEFAULT);")
        ok(f"INSERT INTO kg.sources(id,locator,description) "
           f"VALUES('{src}','urn:synthetic:{src}','Fixture');")
        ok(f"INSERT INTO kg.claims VALUES('{rev}','C-01','first','Unrelated statement');")
        ok(f"INSERT INTO kg.claim_evidence(revision_id,claim_key,source_id,stance,pinpoint,reviewer) "
           f"VALUES('{rev}','C-01','{src}','supports','test','reviewer');")
        rejected(f"INSERT INTO kg.approvals VALUES('{rev}','reviewer');",
                 "APPROVAL_REQUIRES_REVISION_BOUND_EVIDENCE")

    def test_10_public_snapshot_ignores_new_draft(self):
        entity,rev=self.approved_revision()
        self.assertEqual(ok(f"SELECT kg.publish('{entity}','{rev}',0);"),"1")
        unapproved=uid()
        ok(f"INSERT INTO kg.revisions(id,entity_id,locale,body) "
           f"VALUES('{unapproved}','{entity}','en','Unsourced different draft');")
        self.assertEqual(ok("SELECT count(*) FROM kg.public_entries;"),"1")
        self.assertEqual(ok("SELECT revision_id::text FROM kg.public_entries;"),rev)
        self.assertEqual(ok("SELECT count(*) FROM kg.public_entries WHERE body LIKE '%Unsourced%';"),"0")

    def test_11_frozen_revision_and_claims(self):
        entity,rev=self.approved_revision()
        rejected(f"UPDATE kg.revisions SET body='tampered' WHERE id='{rev}';","IMMUTABLE")
        rejected(f"UPDATE kg.claims SET statement='different' WHERE revision_id='{rev}';",
                 "APPROVED_CLAIMS_IMMUTABLE")

    def test_12_rights_gate_and_takedown_view(self):
        entity=self.entity();rev,src,asset=uid(),uid(),uid()
        body="Synthetic proof: paper introduced a test idea."
        ok(f"INSERT INTO kg.revisions(id,entity_id,locale,body) VALUES('{rev}','{entity}','en','{body}');")
        ok(f"INSERT INTO kg.sources(id,locator,description) "
           f"VALUES('{src}','urn:synthetic:{src}','Fixture');")
        ok(f"INSERT INTO kg.claims VALUES('{rev}','C-001','p1','paper introduced a test idea');")
        ok(f"INSERT INTO kg.claim_evidence(revision_id,claim_key,source_id,stance,pinpoint,reviewer) "
           f"VALUES('{rev}','C-001','{src}','supports','p1','reviewer');")
        ok(f"INSERT INTO kg.media VALUES('{asset}','private/test-asset','fake-sha','unknown',false);")
        ok(f"INSERT INTO kg.revision_media VALUES('{rev}','{asset}');")
        ok(f"INSERT INTO kg.approvals VALUES('{rev}','reviewer');")
        rejected(f"SELECT kg.publish('{entity}','{rev}',0);","RIGHTS_BLOCKED")
        ok(f"UPDATE kg.media SET rights_status='approved',public_use=true WHERE id='{asset}';")
        ok(f"SELECT kg.publish('{entity}','{rev}',0);")
        self.assertEqual(ok("SELECT count(*) FROM kg.public_media;"),"1")
        ok(f"UPDATE kg.media SET rights_status='takedown' WHERE id='{asset}';")
        self.assertEqual(ok("SELECT count(*) FROM kg.public_media;"),"0")

    def test_13_two_publishers_cannot_both_win(self):
        entity,rev1=self.approved_revision()
        _,rev2=self.approved_revision(entity,body="Synthetic proof: paper introduced a test idea. Second version.")
        sqls=[f"SELECT kg.publish('{entity}','{rev1}',0);",
              f"SELECT kg.publish('{entity}','{rev2}',0);"]
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:
            outcomes=list(ex.map(run,sqls))
        self.assertEqual(sum(x.returncode==0 for x in outcomes),1,[x.stderr for x in outcomes])
        self.assertEqual(ok("SELECT count(*) FROM kg.snapshots;"),"1")
        self.assertEqual(ok("SELECT count(*) FROM kg.outbox;"),"1")

    def test_14_outbox_replay_cannot_resurrect_older_version(self):
        entity,rev1=self.approved_revision()
        _,rev2=self.approved_revision(entity,body="Synthetic proof: paper introduced a test idea. Version two.")
        ok(f"SELECT kg.publish('{entity}','{rev1}',0);")
        ok(f"SELECT kg.publish('{entity}','{rev2}',1);")
        self.assertEqual(ok("SELECT kg.project_event((SELECT id FROM kg.outbox WHERE version=2));"),"t")
        self.assertEqual(ok("SELECT kg.project_event((SELECT id FROM kg.outbox WHERE version=1));"),"f")
        self.assertEqual(ok("SELECT version FROM kg.search_projection;"),"2")
        self.assertEqual(ok("SELECT revision_id::text FROM kg.search_projection;"),rev2)

    def test_15_transaction_rollback_leaks_nothing(self):
        entity,rev=self.approved_revision()
        ok(f"BEGIN;SELECT kg.publish('{entity}','{rev}',0);ROLLBACK;")
        self.assertEqual(ok("SELECT count(*) FROM kg.heads;"),"0")
        self.assertEqual(ok("SELECT count(*) FROM kg.outbox;"),"0")
        self.assertEqual(ok("SELECT count(*) FROM kg.snapshots;"),"0")

if __name__ == "__main__":
    unittest.main(verbosity=2)
