"""Offline SQLite migration/invariant tests with synthetic fixtures only.
Run: python test/db_invariants.py
No Cloudflare account, production DB, or real member data is touched.
"""
from pathlib import Path
import sqlite3
import unittest

ROOT = Path(__file__).resolve().parents[1]


def make_db():
    db = sqlite3.connect(':memory:', isolation_level=None)
    db.execute('PRAGMA foreign_keys=ON')
    for path in sorted((ROOT / 'migrations').glob('[0-9]*.sql')):
        db.executescript(path.read_text(encoding='utf-8-sig'))
    db.execute("INSERT INTO departments (id,name) VALUES ('a','Department A'),('b','Department B')")
    for ident, role in [('lead1','Lead'), ('lead2','Lead'), ('member1','Member')]:
        db.execute('INSERT INTO users (id,name,email,department_id,role) VALUES (?,?,?,?,?)',
                   (ident, ident, ident+'@example.invalid','a',role))
    db.execute("""INSERT INTO requests
        (id,title,type,requester_department_id,receiver_department_id,requested_by,status,created_at)
        VALUES ('r1','Test request','Task Request','a','b','member1','Pending','2026-01-01T00:00:00Z')""")
    db.execute("""INSERT INTO tasks
        (id,title,department_id,created_by,status,created_at,updated_at)
        VALUES ('t1','Synthetic task','a','lead1','Created','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')""")
    return db


class Invariants(unittest.TestCase):
    def setUp(self):
        self.db = make_db()

    def tearDown(self):
        self.db.close()

    def state(self, table, column, ident):
        return self.db.execute(f'SELECT {column} FROM {table} WHERE id=?',(ident,)).fetchone()[0]

    def test_request_approval_and_conversion(self):
        self.db.execute("UPDATE requests SET status='Approved' WHERE id='r1'")
        self.db.execute("UPDATE requests SET status='Converted' WHERE id='r1'")
        self.assertEqual(self.state('requests','status','r1'), 'Converted')

    def test_withdrawn_request_cannot_approve(self):
        self.db.execute("UPDATE requests SET is_withdrawn=1 WHERE id='r1'")
        with self.assertRaisesRegex(sqlite3.IntegrityError, 'OMS_STATE_CONFLICT'):
            self.db.execute("UPDATE requests SET status='Approved' WHERE id='r1'")
        self.assertEqual(self.state('requests','status','r1'), 'Pending')

    def test_approved_request_cannot_be_withdrawn(self):
        self.db.execute("UPDATE requests SET status='Approved' WHERE id='r1'")
        with self.assertRaisesRegex(sqlite3.IntegrityError, 'OMS_STATE_CONFLICT'):
            self.db.execute("UPDATE requests SET is_withdrawn=1 WHERE id='r1'")

    def test_replay_approval_is_rejected(self):
        self.db.execute("UPDATE requests SET status='Approved' WHERE id='r1'")
        with self.assertRaisesRegex(sqlite3.IntegrityError, 'OMS_STATE_CONFLICT'):
            self.db.execute("UPDATE requests SET status='Approved' WHERE id='r1'")

    def test_rejected_cannot_be_converted(self):
        self.db.execute("UPDATE requests SET status='Rejected' WHERE id='r1'")
        with self.assertRaisesRegex(sqlite3.IntegrityError, 'OMS_STATE_CONFLICT'):
            self.db.execute("UPDATE requests SET status='Converted' WHERE id='r1'")

    def test_archived_cannot_transition(self):
        self.db.execute("UPDATE requests SET status='Rejected' WHERE id='r1'")
        self.db.execute("UPDATE requests SET is_archived=1 WHERE id='r1'")
        with self.assertRaisesRegex(sqlite3.IntegrityError, 'OMS_STATE_CONFLICT'):
            self.db.execute("UPDATE requests SET status='Approved' WHERE id='r1'")
        self.db.execute("UPDATE requests SET is_archived=0 WHERE id='r1'")

    def test_batch_rolls_back_audit_log_on_conflict(self):
        self.db.execute("UPDATE requests SET is_withdrawn=1 WHERE id='r1'")
        with self.assertRaisesRegex(sqlite3.IntegrityError, 'OMS_STATE_CONFLICT'):
            self.db.execute('BEGIN')
            try:
                self.db.execute("UPDATE requests SET status='Approved' WHERE id='r1'")
                self.db.execute("""INSERT INTO activity_log (id,occurred_at,actor_name,actor_role,action,reference_type,reference_id)
                    VALUES ('fake','2026-01-01','Lead','Lead','REQUEST_APPROVED','REQUEST','r1')""")
                self.db.execute('COMMIT')
            except sqlite3.Error:
                self.db.execute('ROLLBACK')
                raise
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM activity_log').fetchone()[0],0)

    def test_request_conversion_unique_constraint(self):
        self.db.execute("UPDATE requests SET status='Approved' WHERE id='r1'")
        self.db.execute("UPDATE requests SET status='Converted' WHERE id='r1'")
        sql="""INSERT INTO tasks (id,title,department_id,created_by,status,created_at,updated_at,source_request_id)
               VALUES (?,?,?,?,?,?,?,?)"""
        self.db.execute(sql, ('t2','One task','a','lead1','Created','2026-01-01','2026-01-01','r1'))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(sql, ('t3','Duplicate task','a','lead1','Created','2026-01-01','2026-01-01','r1'))

    def test_last_lead_cannot_demote_or_deactivate(self):
        self.db.execute("UPDATE users SET status='Inactive' WHERE id='lead2'")
        with self.assertRaisesRegex(sqlite3.IntegrityError, 'OMS_STATE_CONFLICT'):
            self.db.execute("UPDATE users SET role='Member' WHERE id='lead1'")
        with self.assertRaisesRegex(sqlite3.IntegrityError, 'OMS_STATE_CONFLICT'):
            self.db.execute("UPDATE users SET status='Inactive' WHERE id='lead1'")

    def test_task_lifecycle_allowed(self):
        for s in ['Assigned','Ongoing','For Review','Completed','Archived','Completed']:
            self.db.execute('UPDATE tasks SET status=? WHERE id=?',(s,'t1'))
        self.assertEqual(self.state('tasks','status','t1'),'Completed')

    def test_task_invalid_state_transition(self):
        with self.assertRaisesRegex(sqlite3.IntegrityError, 'OMS_STATE_CONFLICT'):
            self.db.execute("UPDATE tasks SET status='Completed' WHERE id='t1'")

    def test_foreign_keys_and_unique_indexes(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO users(id,name,email,department_id,role) VALUES ('bad','Bad','bad@example.invalid','missing','Member')")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO users(id,name,email,department_id,role) VALUES ('dupe','Duplicate','LEAD1@example.invalid','a','Member')")


if __name__ == '__main__':
    unittest.main(verbosity=2)
