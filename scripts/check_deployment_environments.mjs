/** Offline-only release gate. Never deploys or reads Cloudflare credentials.
 * Call with: node scripts/check_deployment_environments.mjs [config-path]
 * A passing gate does not replace Access policy, secret or D1 validation.
 */
import fs from 'node:fs';
const path = process.argv[2] || 'wrangler.jsonc';
const errors=[];
let config;
try { config=JSON.parse(fs.readFileSync(path,'utf8')); }
catch {errors.push('Configuration missing or not plain JSON. Inspect manually if using JSONC comments.');}
if (config) {
 const stage=config.env?.staging;
 const prod=config.env?.production;
 for(const [name,env] of [['staging',stage],['production',prod]]) {
  if(!env){errors.push(`Missing env.${name} deployment declaration`);continue;}
  if(env.vars?.APP_ENV !== name) errors.push(`env.${name}.vars.APP_ENV must equal '${name}'`);
  if(env.vars?.DEV_USER_EMAIL || env.vars?.TEAM_DOMAIN || env.vars?.POLICY_AUD)
   errors.push(`env.${name}.vars must not contain dev identity or JWT secrets`);
  const db=env.d1_databases?.find(d=>d.binding==='DB');
  if(!db || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(db.database_id||''))
   errors.push(`env.${name}.DB requires a syntactically valid database UUID (verify ownership out of band)`);
  if(!env.assets?.directory && !config.assets?.directory)
   errors.push(`env.${name} missing assets directory`);
 }
 if(stage?.d1_databases?.[0]?.database_id &&
    stage.d1_databases[0].database_id===prod?.d1_databases?.[0]?.database_id)
   errors.push('Staging and production D1 identifiers must differ');
 if(config.vars?.DEV_USER_EMAIL || config.vars?.APP_ENV==='local')
   errors.push('Top-level development identity/bypass is forbidden in release config');
}
if(errors.length){
 console.error('Release configuration NOT VERIFIED. No deployment performed.');
 for(const x of errors) console.error('- '+x);
 process.exitCode=1;
}else {
 console.log('Local environment-separation checks passed. Cloudflare Access, secrets and backups still need operator verification.');
}
