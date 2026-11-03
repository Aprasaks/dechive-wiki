"""G2 actual Wikibase Action API probe (synthetic-only, isolated CI container).
First gate: health, authenticated API mutation, persistent Q/P entities and lookup.
This intentionally does not claim full Wikibase Suite or WDQS validation.
"""
import http.cookiejar
import json
import os
import sys
import time
import urllib.parse
import urllib.request

API="http://127.0.0.1:8181/w/api.php"
PASSWORD=os.environ.get("WBS_ADMIN_PASS")
assert PASSWORD, "WBS_ADMIN_PASS is required"
jar=http.cookiejar.CookieJar()
opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
def api(args, post=False):
    params=dict(args)
    params["format"]="json"
    params["formatversion"]="2"
    encoded=urllib.parse.urlencode(params).encode("utf-8")
    if post:
        req=urllib.request.Request(API,data=encoded,headers={"User-Agent":"DECHIVE-WIKI-G2-Synthetic-API-Probe/0.1"})
    else:
        req=urllib.request.Request(API+"?"+encoded.decode(),headers={"User-Agent":"DECHIVE-WIKI-G2-Synthetic-API-Probe/0.1"})
    with opener.open(req,timeout=45) as reply:
        response=json.load(reply)
    if "error" in response:
        raise AssertionError("Wikibase API error: "+json.dumps(response["error"])[:800])
    return response

def main():
    result=api({"action":"query","meta":"siteinfo","siprop":"general"})
    assert result["query"]["general"]["sitename"]
    print("PASS: Real MediaWiki Action API healthy")
    token=api({"action":"query","meta":"tokens","type":"login"})["query"]["tokens"]["logintoken"]
    logged_in=api({"action":"login","lgname":"G2Editor","lgpassword":PASSWORD,"lgtoken":token},post=True)
    status=logged_in.get("login",{}).get("result")
    assert status=="Success", "Wikibase local editor login failed: "+str(status)
    print("PASS: Authenticated test editor session")
    csrf=api({"action":"query","meta":"tokens","type":"csrf"})["query"]["tokens"]["csrftoken"]
    property_payload={"labels":{"en":{"language":"en","value":"Synthetic related topic"}},
                      "datatype":"wikibase-item"}
    prop=api({"action":"wbeditentity","new":"property","data":json.dumps(property_payload),"token":csrf},post=True)
    pid=prop["entity"]["id"]
    assert pid.startswith("P")
    print("PASS: Created real P-property in Wikibase",pid)
    item_payload={"labels":{"en":{"language":"en","value":"Synthetic AI reasoning concept"}}}
    item=api({"action":"wbeditentity","new":"item","data":json.dumps(item_payload),"token":csrf},post=True)
    qid=item["entity"]["id"]
    assert qid.startswith("Q")
    lookup=api({"action":"wbgetentities","ids":qid,"props":"labels"})
    assert lookup["entities"][qid]["labels"]["en"]["value"]=="Synthetic AI reasoning concept"
    print("PASS: Created and read back actual Q-item",qid)
    print("G2_ACTUAL_WIKIBASE_HTTP_API_SMOKE_SUCCESS")

if __name__=="__main__":
    main()
