/** Create an untracked, dependency-light ESM build for Node's built-in test runner.
 * Compiles real TypeScript source without Wrangler or Windows native bindings.
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const root = path.resolve(import.meta.dirname, '..');
const build = path.join(root, '.audit-build');
fs.rmSync(build, {recursive:true,force:true});
fs.mkdirSync(build,{recursive:true});
fs.writeFileSync(path.join(build,'package.json'),'{'+'"type":"module"'+'}');
function recurse(folder){
  for(const entry of fs.readdirSync(folder,{withFileTypes:true})){
    const full=path.join(folder,entry.name);
    if(entry.isDirectory()){ recurse(full); continue; }
    if(!entry.name.endsWith('.ts')) continue;
    const rel=path.relative(root,full).replace(/\.ts$/,'.js');
    const dest=path.join(build,rel);
    fs.mkdirSync(path.dirname(dest),{recursive:true});
    let output=ts.transpileModule(fs.readFileSync(full,'utf8'),{
      compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}
    }).outputText;
    output=output.replace(/(from\s*['"]|import\s*\(\s*['"])(\.{1,2}\/[^'"]+)(['"])/g,(all,pre,spec,post)=>
      pre+(/\.(?:js|mjs|json)$/.test(spec)?spec:spec+'.js')+post);
    fs.writeFileSync(dest,output);
  }
}
recurse(path.join(root,'src'));
console.log('Created offline test-only build from actual src TypeScript');
