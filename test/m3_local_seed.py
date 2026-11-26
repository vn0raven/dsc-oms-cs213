"""Synthetic-only D1 fixture integrity test. No remote database usage."""
import sqlite3
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parent.parent

class DemoSeedTest(unittest.TestCase):
    def test_seed_is_additive_idempotent_and_ref_integral(self):
        db=sqlite3.connect(':memory:')
        db.execute('PRAGMA foreign_keys=ON')
        for file in sorted((ROOT/'migrations').glob('*.sql')):
            db.executescript(file.read_text(encoding='utf-8'))
        seed=(ROOT/'scripts/m3_local_demo_seed.sql').read_text(encoding='utf-8')
        for _ in (1,2):
            db.executescript(seed)
            counts=tuple(db.execute('SELECT (SELECT count(*) FROM users),(SELECT count(*) FROM projects),(SELECT count(*) FROM events),(SELECT count(*) FROM tasks),(SELECT count(*) FROM announcements)').fetchone())
            self.assertEqual(counts,(6,3,4,5,2))
            self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])
        self.assertEqual(db.execute("SELECT role FROM users WHERE id='demo_user_lead'").fetchone(),('Lead',))
        self.assertEqual(db.execute("SELECT status FROM events WHERE id='m3demo_event_hackathon'").fetchone(),('For Approval',))
        self.assertEqual(db.execute("SELECT status FROM events WHERE id='m3demo_event_workshop'").fetchone(),('Planning',))
        self.assertEqual(db.execute("SELECT count(*) FROM announcements WHERE audience='Department'").fetchone()[0],1)
        self.assertEqual(db.execute("SELECT count(*) FROM tasks WHERE project_id IS NULL").fetchone()[0],2)
        # Rejected or unknown event is not silently promoted during fixture insertion.
        self.assertEqual(db.execute("SELECT count(*) FROM event_approvals WHERE event_id='m3demo_event_hackathon'").fetchone()[0],0)

if __name__=='__main__':unittest.main(verbosity=2)
