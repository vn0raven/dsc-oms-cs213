"""Capture exact, reproducible local validation results. No deploy/remote commands."""
from pathlib import Path
import subprocess,sys,json,shutil,argparse,datetime
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--browser',action='store_true');parser.add_argument('--native',action='store_true');args=parser.parse_args()
out=ROOT/'dist/validation';out.mkdir(parents=True,exist_ok=True)
node=shutil.which('node');assert node,'Node is required'
commands=[('typescript',[node,'node_modules/typescript/bin/tsc','--noEmit']),
 ('test-typescript',[node,'node_modules/typescript/bin/tsc','--noEmit','-p','test/tsconfig.json']),
 ('offline-build',[node,'test/offline-build.mjs']),
 ('node-tests',[node,'--test',*[str(p.relative_to(ROOT)) for p in sorted((ROOT/'test/node').glob('*.test.mjs'))]])]
for name in ['db_invariants','m3_db_smoke','m3_migration_upgrade','m3_local_seed','finalization_migrations','css_syntax']:
 commands.append((name,[sys.executable,f'test/{name}.py']))
if args.native:commands.append(('native-tests',[node,'node_modules/vitest/vitest.mjs','run']))
if args.browser:
 for name in ['m35_browser','m35_special_cases','finalization_browser']:
  commands.append((name,[sys.executable,f'test/{name}.py']))
results=[]
for name,command in commands:
 result=subprocess.run(command,cwd=ROOT,capture_output=True,text=True,encoding='utf-8',errors='replace')
 (out/f'{name}.txt').write_text(result.stdout+'\n'+result.stderr,encoding='utf-8')
 results.append({'check':name,'command':command,'exitCode':result.returncode});print(name,'PASS' if result.returncode==0 else 'FAIL',flush=True)
 if name=='offline-build' and result.returncode:break
syntax=[]
for file in sorted((ROOT/'public/js').glob('*')):
 if file.suffix not in ('.js','.mjs'):continue
 check=subprocess.run([node,'--input-type=module','--check'],input=file.read_text(encoding='utf-8-sig'),capture_output=True,text=True,encoding='utf-8')
 if check.returncode:syntax.append({'file':str(file.relative_to(ROOT)),'error':check.stderr})
results.append({'check':'frontend-js-syntax','exitCode':int(bool(syntax)),'failures':syntax})
report={'executedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'results':results}
(out/'results.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
raise SystemExit(int(any(r['exitCode'] for r in results)))
