import subprocess,pathlib,json,urllib.request,urllib.error,os
root=pathlib.Path('/opt/dechive-reader')
def out(args): return subprocess.check_output(args,text=True).strip()
def sql(q,db='dechive_reader_pilot'):
 return out(['docker','exec','wiki-reader-db','psql','-X','-U','postgres','-d',db,'-Atc',q])
checks={}
checks['empty_catalog']=sql('select count(*) from kg.entities;')=='0'
checks['empty_public']=sql('select count(*) from kg.public_entries;')=='0'
checks['reader_not_owner']=sql("select rolsuper or rolcreatedb or rolcreaterole or rolreplication from pg_roles where rolname='kg_public_http';")=='f'
checks['reader_no_private_tables']=sql("select has_table_privilege('kg_public_http','kg.revisions','SELECT') or has_table_privilege('kg_public_http','kg.approvals','INSERT');")=='f'
checks['reader_no_publish']=sql("select has_function_privilege('kg_public_http','kg.publish(uuid,uuid,bigint)','EXECUTE');")=='f'
checks['reader_views_only']=sql("select has_table_privilege('kg_public_http','kg.public_entries','SELECT') and has_table_privilege('kg_public_http','kg.public_search_verified','SELECT') and has_table_privilege('kg_public_http','kg.public_claim_sources','SELECT');")=='t'
web=json.loads(out(['docker','inspect','wiki-reader-web']))[0]
db=json.loads(out(['docker','inspect','wiki-reader-db']))[0]
checks['web_nonroot_readonly']=web['Config']['User']=='node' and web['HostConfig']['ReadonlyRootfs']
checks['no_db_host_port']=not db['HostConfig']['PortBindings']
checks['loopback_http_only']=web['HostConfig']['PortBindings']['3000/tcp'][0]['HostIp']=='127.0.0.1'
checks['internal_docker_network']=json.loads(out(['docker','network','inspect','wiki-reader-private']))[0]['Internal']
def fetch(path,method='GET'):
 req=urllib.request.Request('http://127.0.0.1:3000'+path,method=method,data=b'{}' if method=='POST' else None)
 try:
  with urllib.request.urlopen(req,timeout=15) as r:return r.status,r.read().decode(),r.headers
 except urllib.error.HTTPError as e:return e.code,e.read().decode(),e.headers
status,body,headers=fetch('/')
checks['home_200']=status==200 and 'DECHIVE.WIKI' in body
status,body,headers=fetch('/search?q=knowledge')
checks['empty_search_200']=status==200 and 'No approved records matching' in body
checks['search_headers']='noindex' in headers.get('X-Robots-Tag','') and 'no-store' in headers.get('Cache-Control','') and headers.get('X-Frame-Options')=='DENY'
for path in ['/studio','/api/staff','/api/graphql','/api/g1/publish','/payload.config.ts','/knowledge/00000000-0000-0000-0000-000000000000']:
 checks['blocked_'+path]=fetch(path)[0]==404
checks['no_login_api']=fetch('/api/staff/login','POST')[0]==404
backup=root/'backup';backup.mkdir(exist_ok=True);backup.chmod(0o700)
with (backup/'empty-pilot.dump').open('wb') as f:subprocess.run(['docker','exec','wiki-reader-db','pg_dump','-U','postgres','-d','dechive_reader_pilot','-Fc'],stdout=f,check=True)
(backup/'empty-pilot.dump').chmod(0o600)
subprocess.run(['docker','exec','wiki-reader-db','createdb','-U','postgres','dechive_restore_check'],check=True)
with (backup/'empty-pilot.dump').open('rb') as f:subprocess.run(['docker','exec','-i','wiki-reader-db','pg_restore','-U','postgres','-d','dechive_restore_check','--exit-on-error'],stdin=f,check=True)
checks['backup_restore']=sql('select count(*) from kg.public_entries;','dechive_restore_check')=='0' and sql("select count(*) from information_schema.views where table_schema='kg';",'dechive_restore_check')==sql("select count(*) from information_schema.views where table_schema='kg';")
subprocess.run(['docker','exec','wiki-reader-db','dropdb','-U','postgres','dechive_restore_check'],check=True)
checks['stop_timer_active']=out(['systemctl','is-active','dechive-pilot-stop.timer'])=='active'
checks['session_agent_active']=out(['systemctl','is-active','amazon-ssm-agent'])=='active'
result={'checks':checks,'passed':sum(checks.values()),'total':len(checks)}
(root/'verification.json').write_text(json.dumps(result,indent=2))
print(json.dumps(result,sort_keys=True))
assert all(checks.values())
print('PRIVATE_AWS_READER_ALL_CHECKS_SUCCESS')
