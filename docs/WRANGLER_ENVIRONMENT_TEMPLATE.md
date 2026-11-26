# Explicit Wrangler environment separation — operator template

**This is not an operative configuration.** A real production D1 identifier and production Cloudflare Access application have not been supplied. Do not add placeholders to a deployable config.

Retain the existing `main`, `compatibility_date`, flags, assets and observability settings. Under `env`, provide **both** named environments. Example shape (replace with approved real values before using):

```json
{
  "env": {
    "staging": {
      "name": "dsc-oms-staging",
      "vars": {"APP_ENV":"staging"},
      "d1_databases": [
        {"binding":"DB","database_name":"dsc-oms-staging","database_id":"STAGING-UUID-REQUIRES-APPROVAL"}
      ]
    },
    "production": {
      "name": "dsc-oms-production",
      "vars": {"APP_ENV":"production"},
      "d1_databases": [
        {"binding":"DB","database_name":"dsc-oms-production","database_id":"PRODUCTION-UUID-REQUIRES-APPROVAL"}
      ]
    }
  }
}
```

The currently packaged `wrangler.jsonc` intentionally remains unchanged; modifying it without an approved production D1 target could send users to the wrong database. The local `npm run check:deploy-config` fails closed until both environments have independently verified IDs, non-local `APP_ENV`, and no development identity variables. Passing that check **does not** verify Access policies, private secrets, backup restore, or D1 migration state; they must be attested by the operator. `TEAM_DOMAIN` and `POLICY_AUD` must be configured separately in each environment via Cloudflare secrets, not checked into version control. Explicitly target the environment (`wrangler deploy --env staging` / `--env production`) only after review and approval. The existing general `npm run deploy` should not be used for a production release without an approved config and deployment change process.
