"""Real Wikibase HTTP benchmark: 12 synthetic entities, 11 relations and provenance.
This runs ONLY against localhost in a disposable CI-hosted Wikibase container.
No real-world source, service account, public AWS resource, or unlicensed asset.
"""
import http.cookiejar
import json
import os
from pathlib import Path
import urllib.parse
import urllib.request

API="http://127.0.0.1:8181/w/api.php"
ROOT=Path(__file__).resolve().parents[1]
FIXTURE=json.loads((ROOT/"fixtures/g2/mixed_12.json").read_text())
PASSWORD=os.environ.get("WBS_ADMIN_PASS")
assert PASSWORD, "WBS_ADMIN_PASS required"
jar=http.cookiejar.CookieJar()
opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

def api(args, post=False, client=opener):
    p={**args,"format":"json","formatversion":"2"}
    encoded=urllib.parse.urlencode(p).encode()
    req=urllib.request.Request(API+(("" if post else "?"+encoded.decode())),
       data=encoded if post else None,
       headers={"User-Agent":"DECHIVE-WIKI-Synthetic-Graph-Benchmark/0.2"})
    with client.open(req,timeout=45) as response:
        result=json.load(response)
    if "error" in result:
        err=result["error"]
        raise RuntimeError(f"API code={err.get('code')} info={str(err.get('info'))[:200]}")
    return result

def edit(new=None, entity=None, data=None, csrf=None):
    payload={"action":"wbeditentity","data":json.dumps(data,ensure_ascii=False),"token":csrf}
    if new: payload["new"]=new
    else: payload["id"]=entity
    return api(payload,post=True)["entity"]

def property_create(label,datatype,csrf):
    return edit(new="property",data={"labels":{"en":{"language":"en","value":"DECHIVE synthetic "+label}},
      "datatype":datatype},csrf=csrf)["id"]

def item_create(label,csrf):
    return edit(new="item",data={"labels":{"en":{"language":"en","value":label}}},csrf=csrf)["id"]

def main():
    result=api({"action":"query","meta":"siteinfo","siprop":"general"})
    assert result["query"]["general"]["sitename"]
    print("PASS / real MediaWiki API")
    login_token=api({"action":"query","meta":"tokens","type":"login"})["query"]["tokens"]["logintoken"]
    logged=api({"action":"login","lgname":"G2Editor","lgpassword":PASSWORD,"lgtoken":login_token},post=True)
    assert logged["login"]["result"]=="Success", f"Admin login: {logged['login']['result']}"
    csrf=api({"action":"query","meta":"tokens","type":"csrf"})["query"]["tokens"]["csrftoken"]
    print("PASS / authenticated Wikibase editor")

    # All Q and P numbers are minted by Wikibase itself; fixture IDs remain
    # stable mapping keys rather than assuming particular Q/P IDs.
    qids={e["key"]:item_create(e["label_en"],csrf) for e in FIXTURE["entities"]}
    assert len(qids)==12 and len(set(qids.values()))==12
    print("PASS / created 12 actual Q-items",len(qids))

    relation_kinds=sorted(set(r["kind"] for r in FIXTURE["relations"]))
    kinds={kind:property_create(kind,"wikibase-item",csrf) for kind in relation_kinds}
    qualifier_props={q["property"]:property_create("qualifier "+q["property"],"string",csrf)
       for r in FIXTURE["relations"] for q in r["qualifiers"]}
    evidence_keys=("source_locator","pinpoint","stance")
    evidence_props={k:property_create("reference "+k,"string",csrf) for k in evidence_keys}
    assert len(kinds)==len(relation_kinds)==10
    print("PASS / created typed properties: 10 relations, 2 qualifiers, 3 source fields")

    refs_by_source={s["key"]:s["locator"] for s in FIXTURE["sources"]}
    for relation in FIXTURE["relations"]:
        subj=qids[relation["subject"]]
        obj=qids[relation["object"]]
        claim_response=api({
          "action":"wbcreateclaim","entity":subj,"property":kinds[relation["kind"]],
          "snaktype":"value","value":json.dumps({
            "entity-type":"item","numeric-id":int(obj[1:]),"id":obj}),
          "token":csrf},post=True)
        statement=claim_response["claim"]["id"]
        for qual in relation["qualifiers"]:
            api({"action":"wbsetqualifier","claim":statement,
              "property":qualifier_props[qual["property"]],
              "snaktype":"value","value":json.dumps(qual["value"]),
              "token":csrf},post=True)
        for reference in relation["references"]:
            fields={"source_locator":refs_by_source[reference["source"]],
                    "pinpoint":reference["pinpoint"],"stance":reference["stance"]}
            snaks={}
            for key,value in fields.items():
                pid=evidence_props[key]
                snaks[pid]=[{"snaktype":"value","property":pid,
                  "datavalue":{"value":value,"type":"string"}}]
            api({"action":"wbsetreference","statement":statement,
              "snaks":json.dumps(snaks),"token":csrf},post=True)
    print("PASS / created 11 actual cross-domain Wikibase statements")

    # The actual Wikibase state is retrieved from its HTTP API, not the fixture.
    entities=api({"action":"wbgetentities","ids":"|".join(qids.values()),
                  "props":"labels|claims|info"})["entities"]
    assert len(entities)==12, f"Retrieved {len(entities)} items"
    all_claims=[stmt for entry in entities.values()
       for values in entry.get("claims",{}).values() for stmt in values]
    references=sum(len(c.get("references",[])) for c in all_claims)
    qualifiers=sum(sum(len(v) for v in c.get("qualifiers",{}).values()) for c in all_claims)
    assert len(all_claims)==11, f"Claim count {len(all_claims)}"
    assert references==12, f"Reference count {references}"
    assert qualifiers==2, f"Qualifier count {qualifiers}"
    print("PASS / actual server round-trip: 12 entities; 11 statements; 12 provenance references; 2 qualifiers")

    q1=qids["K001"]
    anonymous=urllib.request.build_opener()
    public=api({"action":"wbgetentities","ids":q1,"props":"labels|claims"},client=anonymous)
    assert public["entities"][q1]["labels"]["en"]["value"]==next(
      x["label_en"] for x in FIXTURE["entities"] if x["key"]=="K001")
    print("OBSERVED / anonymous public Wikibase read is immediately available")

    previous_revision=entities[q1].get("lastrevid")
    api({"action":"wbeditentity","id":q1,
         "data":json.dumps({"labels":{"en":{"language":"en",
           "value":"Synthetic AI reasoning concept (revised)"}}}),
         "token":csrf},post=True)
    updated=api({"action":"wbgetentities","ids":q1,"props":"labels|info"})["entities"][q1]
    assert updated["labels"]["en"]["value"].endswith("(revised)")
    assert updated.get("lastrevid")!=previous_revision
    print("PASS / changing an item creates a later MediaWiki revision")

    # Important semantic divergence test: Wikibase property datatypes accept
    # Q-items without requiring the subject/object domain rules of our graph.
    invalid_subj=qids["K003"]  # person
    invalid_obj=qids["K005"]   # research paper
    rejected=False
    try:
        api({"action":"wbcreateclaim","entity":invalid_subj,
             "property":kinds["related_to"],"snaktype":"value",
             "value":json.dumps({"entity-type":"item",
                "numeric-id":int(invalid_obj[1:]),"id":invalid_obj}),
             "token":csrf},post=True)
    except RuntimeError as err:
        print("OBSERVED / invalid domain-range claim rejected:",str(err)[:120])
        rejected=True
    if not rejected:
        print("OBSERVED / INVALID DOMAIN-RANGE accepted by default Wikibase entity API; custom enforcement needed")
    print("G2_WIKIBASE_12_ENTITY_LIVE_ROUNDTRIP_SUCCESS")

if __name__=="__main__":
    main()
