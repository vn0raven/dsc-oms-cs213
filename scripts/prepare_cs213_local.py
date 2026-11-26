"""Write a loopback-only CS 213 QA config WITHOUT DEV_USER_EMAIL so browser login/logout is enforced."""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
target = ROOT / "wrangler.cs213.jsonc"
config = {
    "name": "dsc-oms-cs213-local",
    "main": "src/index.ts",
    "compatibility_date": "2026-10-07",
    "assets": {
        "directory": "./public",
        "run_worker_first": ["/api", "/api/*"],
    },
    "vars": {
        "APP_ENV": "local",
    },
    "d1_databases": [
        {
            "binding": "DB",
            "database_name": "dsc-oms-cs213-local",
            "database_id": "00000000-0000-0000-0000-000000000213",
            "migrations_dir": "migrations",
        }
    ],
}
target.write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")
print("Prepared wrangler.cs213.jsonc (synthetic local DB, cookie login enforced). Never deploy this file.")
