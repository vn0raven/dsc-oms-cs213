"""Parse all shipped stylesheets, including nested rules and declarations."""
from pathlib import Path
import tinycss2
ROOT=Path(__file__).resolve().parents[1]
errors=[]
def inspect(nodes,file):
 for node in nodes:
  if node.type=='error':errors.append(f'{file}:{node.source_line}: {node.message}')
  if node.type=='qualified-rule':inspect(tinycss2.parse_declaration_list(node.content,skip_whitespace=True,skip_comments=True),file)
  if node.type=='at-rule' and node.content is not None:
   if node.lower_at_keyword in ('media','supports','layer','container','keyframes','-webkit-keyframes','scope','starting-style'):
    inspect(tinycss2.parse_rule_list(node.content,skip_whitespace=True,skip_comments=True),file)
   else:inspect(tinycss2.parse_declaration_list(node.content,skip_whitespace=True,skip_comments=True),file)
files=list((ROOT/'public/styles').glob('*.css'))
for p in files:inspect(tinycss2.parse_stylesheet(p.read_text(encoding='utf-8-sig'),skip_whitespace=True,skip_comments=True),p.name)
print(f'Parsed {len(files)} stylesheets; {len(errors)} errors')
for error in errors:print(error)
raise SystemExit(bool(errors))
