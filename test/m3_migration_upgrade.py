"""Rehearse M2->M3 migration on a synthetic M2 database, preserving its records."""
from pathlib import Path
import sqlite3,unittest
ROOT=Path(__file__).resolve().parent.parent
class Upgrade(unittest.TestCase):
 def test_existing_m2_records_survive(self):
  db=sqlite3.connect(':memory:');db.execute('PRAGMA foreign_keys=ON')
  try:
   for num in range(1,6):db.executescript(next((ROOT/'migrations').glob(f'{num:04d}_*.sql')).read_text(encoding='utf-8-sig'))
   db.execute("INSERT INTO departments(id,name) VALUES('dept','Synthetic')")
   db.execute("INSERT INTO users(id,name,email,department_id,role) VALUES('user','Synthetic Lead','lead@example.test','dept','Lead')")
   db.execute("INSERT INTO projects(id,name,type,created_by,status,created_at,updated_at) VALUES('project','Legacy Project','Organization','user','Active','now','now')")
   db.execute("INSERT INTO events(id,name,event_type,created_by,status,created_at,updated_at) VALUES('event','Legacy Event','Other','user','Approved','now','now')")
   db.execute("INSERT INTO notifications(id,user_id,type,title,message,status,created_at) VALUES('notification','user','Project Updated','Legacy update','Legacy message','Unread','now')")
   before={t:db.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0] for t in ['users','departments','projects','events','notifications']}
   for num in (6,7):db.executescript(next((ROOT/'migrations').glob(f'{num:04d}_*.sql')).read_text(encoding='utf-8-sig'))
   after={t:db.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0] for t in before}
   self.assertEqual(before,after)
   self.assertEqual(db.execute("SELECT type,message FROM notifications WHERE id='notification'").fetchone(),('Project Updated','Legacy message'))
   db.execute("INSERT INTO notifications(id,user_id,type,title,message,reference_type,reference_id,status,created_at) VALUES('new','user','Official Announcement','Title','Text','ANNOUNCEMENT','notice','Unread','now')")
   self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])
  finally:db.close()
if __name__=='__main__':unittest.main()
