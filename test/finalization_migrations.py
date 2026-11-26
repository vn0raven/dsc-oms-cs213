"""Synthetic upgrade, receipt persistence and SQLite backup/restore rehearsal."""
from pathlib import Path
import sqlite3,tempfile,unittest
ROOT=Path(__file__).resolve().parents[1]
class FinalizationMigration(unittest.TestCase):
 def test_upgrade_preserves_records_and_backup_restores(self):
  db=sqlite3.connect(':memory:',isolation_level=None);db.execute('PRAGMA foreign_keys=ON')
  try:
   paths=sorted((ROOT/'migrations').glob('*.sql'))
   for p in paths[:7]:db.executescript(p.read_text(encoding='utf-8-sig'))
   db.executescript((ROOT/'scripts/m3_local_demo_seed.sql').read_text(encoding='utf-8-sig'))
   names=[r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
   before={name:db.execute(f'SELECT * FROM {name} ORDER BY rowid').fetchall() for name in names}
   for p in paths[7:]:db.executescript(p.read_text(encoding='utf-8-sig'))
   for name,rows in before.items():self.assertEqual(db.execute(f'SELECT * FROM {name} ORDER BY rowid').fetchall(),rows,name)
   self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])
   self.assertEqual(db.execute('PRAGMA integrity_check').fetchone(),('ok',))
   with tempfile.TemporaryDirectory() as folder:
    backup=sqlite3.connect(str(Path(folder)/'synthetic-backup.sqlite'))
    try:db.backup(backup)
    finally:backup.close()
    restored=sqlite3.connect(str(Path(folder)/'synthetic-backup.sqlite'))
    try:
     for name,rows in before.items():self.assertEqual(restored.execute(f'SELECT * FROM {name} ORDER BY rowid').fetchall(),rows,name)
     self.assertEqual(restored.execute('PRAGMA integrity_check').fetchone(),('ok',))
    finally:restored.close()
  finally:db.close()
if __name__=='__main__':unittest.main()
