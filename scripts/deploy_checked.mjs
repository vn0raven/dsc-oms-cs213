/** Deliberate operator-only deployment gate; never runs as part of tests/build.
 * Usage: DSC_RELEASE_APPROVED=YES npm run deploy -- staging
 * Cloudflare account permissions and human approval must be checked separately.
 */
import {spawnSync} from 'node:child_process';
const target=process.argv[2];
if (!['staging','production'].includes(target)) {
 console.error('Refusing ambiguous deploy. Explicitly select staging or production.');
 process.exit(1);
}
const verified=spawnSync(process.execPath, ['scripts/check_deployment_environments.mjs'], {stdio:'inherit'});
if (verified.status !== 0) {
 console.error('Refusing deploy: environment isolation gate failed.');
 process.exit(1);
}
if(process.env.DSC_RELEASE_APPROVED!=='YES') {
 console.error('Refusing deploy: obtain release approval, then set DSC_RELEASE_APPROVED=YES for this invocation.');
 process.exit(1);
}
const result=spawnSync('wrangler',['deploy','--env',target],{stdio:'inherit',shell:process.platform==='win32'});
process.exit(result.status ?? 1);
