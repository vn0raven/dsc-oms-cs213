"""Write a loopback-only QA config using a synthetic database ID.
Does not modify .dev.vars, wrangler.jsonc or existing local D1 data.
"""
from pathlib import Path
import argparse,json
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--identity',choices=['member','lead','executive'],default='member')
args=parser.parse_args()
target=ROOT/'wrangler.qa.jsonc'
config={'name':'dsc-oms-local-qa','main':'src/index.ts','compatibility_date':'2026-10-07',
 'assets':{'directory':'./public','run_worker_first':['/api','/api/*']},
 'vars':{'APP_ENV':'local','DEV_USER_EMAIL':f'demo.{args.identity}@example.test'},
 'd1_databases':[{'binding':'DB','database_name':'dsc-oms-local-qa',
 'database_id':'00000000-0000-0000-0000-000000000001','migrations_dir':'migrations'}]}
if target.exists():
 try:previous=json.loads(target.read_text(encoding='utf-8'))
 except Exception:raise SystemExit('Existing QA configuration is not recognizable. Inspect it manually.')
 if previous.get('name')!='dsc-oms-local-qa' or previous.get('d1_databases',[{}])[0].get('database_id')!='00000000-0000-0000-0000-000000000001':raise SystemExit('Refusing to overwrite a non-synthetic configuration.')
target.write_text(json.dumps(config,indent=2)+'\n',encoding='utf-8')
print('Prepared synthetic local QA configuration. Never use it for deployment.')
