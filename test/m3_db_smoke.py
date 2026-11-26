"""M3 synthetic SQLite migration and invariant checks. No production data."""
import glob,sqlite3,unittest
class M3DatabaseTests(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:')
  self.db.execute('PRAGMA foreign_keys=ON')
  for script in sorted(glob.glob('migrations/*.sql')):
   self.db.executescript(__import__('pathlib').Path(script).read_text(encoding='utf-8'))
  self.db.execute("INSERT INTO departments(id,name) VALUES('d1','Example Department')")
  self.db.execute("INSERT INTO users(id,name,email,department_id,role) VALUES('u1','Synthetic Lead','lead@example.test','d1','Lead')")
  self.db.execute("INSERT INTO events(id,name,event_type,created_by,status,created_at,updated_at) VALUES('e1','Example Event','Other','u1','Preparation','2026-01-01','2026-01-01')")
 def test_readiness_rejects_unverified(self):
  self.db.execute("INSERT INTO event_requirements(id,event_id,phase,title,created_by,created_at,updated_at) VALUES('r1','e1','Readiness','Venue','u1','now','now')")
  with self.assertRaisesRegex(sqlite3.IntegrityError,'readiness requirements'):
   self.db.execute("UPDATE events SET status='Ready for Event' WHERE id='e1'")
 def test_verified_requirement_allows_transition(self):
  self.db.execute("INSERT INTO event_requirements(id,event_id,phase,title,status,evidence_reference,verified_by,verified_at,created_by,created_at,updated_at) VALUES('r1','e1','Readiness','Venue','Verified','record-1','u1','now','u1','now','now')")
  self.db.execute("UPDATE events SET status='Ready for Event' WHERE id='e1'")
  self.assertEqual(self.db.execute("SELECT status FROM events WHERE id='e1'").fetchone()[0],'Ready for Event')
 def test_duplicate_verification_blocked(self):
  self.db.execute("INSERT INTO event_requirements(id,event_id,phase,title,status,evidence_reference,verified_by,verified_at,created_by,created_at,updated_at) VALUES('r1','e1','Readiness','Venue','Verified','record-1','u1','now','u1','now','now')")
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute("UPDATE event_requirements SET status='Verified' WHERE id='r1'")
 def test_announcement_audience_constraint(self):
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute("INSERT INTO announcements(id,title,body,audience,created_by,created_at,updated_at) VALUES('a1','Test','Body','Department','u1','now','now')")
 def test_read_unique(self):
  self.db.execute("INSERT INTO announcements(id,title,body,audience,created_by,created_at,updated_at) VALUES('a1','Test','Body','Organization','u1','now','now')")
  self.db.execute("INSERT INTO announcement_reads(announcement_id,user_id,read_at) VALUES('a1','u1','now')")
  with self.assertRaises(sqlite3.IntegrityError):self.db.execute("INSERT INTO announcement_reads(announcement_id,user_id,read_at) VALUES('a1','u1','now')")
 def tearDown(self):self.db.close()
if __name__=='__main__':unittest.main()
