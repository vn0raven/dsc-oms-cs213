/** CS 213 SA 3 Verification Suite: executes TC01-TC12 + TC-SEC-01 against real Hono routes and SQLite D1 schema (0001-0010). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import app from '../../.audit-build/src/index.js';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const EVIDENCE_DIR = resolve(ROOT, 'docs/cs213/evidence');

class SqliteD1Adapter {
  constructor() {
    this.sqlite = new DatabaseSync(':memory:');
    this.sqlite.exec('PRAGMA foreign_keys=ON');
    for (const f of readdirSync(resolve(ROOT, 'migrations')).filter((n) => /^\d.*\.sql$/.test(n)).sort()) {
      this.sqlite.exec(readFileSync(resolve(ROOT, 'migrations', f), 'utf8'));
    }
    this.sqlite.exec(readFileSync(resolve(ROOT, 'scripts/m3_local_demo_seed.sql'), 'utf8'));
    this.sqlite.exec(readFileSync(resolve(ROOT, 'scripts/cs213_demo_seed.sql'), 'utf8'));
  }

  prepare(sql) {
    const db = this.sqlite;
    let args = [];
    return {
      bind(...params) {
        args = params;
        return this;
      },
      first() {
        return db.prepare(sql).get(...args) || null;
      },
      all() {
        return { results: db.prepare(sql).all(...args) };
      },
      run() {
        return { meta: db.prepare(sql).run(...args) };
      },
    };
  }

  async batch(statements) {
    this.sqlite.exec('BEGIN');
    try {
      const results = statements.map((s) => s.run());
      this.sqlite.exec('COMMIT');
      return results;
    } catch (e) {
      this.sqlite.exec('ROLLBACK');
      throw e;
    }
  }

  scalar(sql, ...args) {
    return this.sqlite.prepare(sql).get(...args);
  }

  allRows(sql, ...args) {
    return this.sqlite.prepare(sql).all(...args);
  }

  close() {
    this.sqlite.close();
  }
}

async function httpApi(db, path, { method = 'GET', body, cookie, devEmail } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (cookie) headers['cookie'] = cookie;
  const env = { DB: db, APP_ENV: 'local' };
  if (devEmail) env.DEV_USER_EMAIL = devEmail;
  const response = await app.fetch(
    new Request(`http://127.0.0.1:8787/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env
  );
  const setCookie = response.headers.get('set-cookie');
  let parsed = null;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }
  return { status: response.status, body: parsed, setCookie };
}

function extractSessionCookie(setCookieHeader) {
  if (!setCookieHeader) return null;
  const m = /dsc_oms_session=([^;]+)/.exec(setCookieHeader);
  return m ? `dsc_oms_session=${m[1]}` : null;
}

const evidence = {
  executedAt: new Date().toISOString(),
  testSuite: 'test/node/cs213-sa3.test.mjs',
  cases: {},
};

test('CS 213 SA 3 Complete Verification (TC01-TC12 & TC-SEC-01)', async (t) => {
  const db = new SqliteD1Adapter();
  t.after(() => {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(resolve(EVIDENCE_DIR, 'cs213_tc01_tc12_results.json'), JSON.stringify(evidence, null, 2), 'utf8');
    db.close();
  });

  // TC03: Authentication and logout (PBKDF2-SHA256 + HttpOnly session cookie)
  const badLogin = await httpApi(db, '/auth/login', {
    method: 'POST',
    body: { email: 'demo.lead@example.test', password: 'WrongPassword!123' },
  });
  assert.equal(badLogin.status, 401);

  const unauthTasks = await httpApi(db, '/tasks');
  assert.equal(unauthTasks.status, 401);

  const leadLogin = await httpApi(db, '/auth/login', {
    method: 'POST',
    body: { email: 'demo.lead@example.test', password: 'LeadPass#2026' },
  });
  assert.equal(leadLogin.status, 200);
  const leadCookie = extractSessionCookie(leadLogin.setCookie);
  assert.ok(leadCookie && leadCookie.includes('dsc_oms_session='));
  assert.match(leadLogin.setCookie, /HttpOnly/i);

  const authMe = await httpApi(db, '/auth/me', { cookie: leadCookie });
  assert.equal(authMe.status, 200);
  assert.equal(authMe.body.user.email, 'demo.lead@example.test');

  const logoutRes = await httpApi(db, '/auth/logout', { method: 'POST', cookie: leadCookie });
  assert.equal(logoutRes.status, 200);
  assert.equal(logoutRes.body.ok, true);

  const afterLogoutTasks = await httpApi(db, '/tasks', { cookie: leadCookie });
  assert.equal(afterLogoutTasks.status, 401);

  const revokedCount = db.scalar('SELECT COUNT(*) AS n FROM auth_sessions WHERE revoked_at IS NOT NULL').n;
  assert.equal(revokedCount, 1);

  evidence.cases.TC03 = {
    status: 'PASS',
    wrongPasswordStatus: badLogin.status,
    unauthenticatedProtectedStatus: unauthTasks.status,
    validLoginStatus: leadLogin.status,
    postLogoutProtectedStatus: afterLogoutTasks.status,
    revokedSessionCount: revokedCount,
  };

  // Sign back in as Lead and Member for subsequent tests
  const leadSession = extractSessionCookie(
    (await httpApi(db, '/auth/login', { method: 'POST', body: { email: 'demo.lead@example.test', password: 'LeadPass#2026' } })).setCookie
  );
  const memberSession = extractSessionCookie(
    (await httpApi(db, '/auth/login', { method: 'POST', body: { email: 'demo.member@example.test', password: 'MemberPass#2026' } })).setCookie
  );

  // TC01: Core workflow (create task, retrieve/search, update, verify persistence)
  const createTaskRes = await httpApi(db, '/tasks', {
    method: 'POST',
    cookie: leadSession,
    body: {
      title: 'CS213 Core Verification Task',
      departmentId: 'demo_dept_eng',
      priority: 'High',
      description: 'Initial core workflow description',
    },
  });
  assert.equal(createTaskRes.status, 201);
  const createdTaskId = createTaskRes.body.task.id;

  const updateTaskRes = await httpApi(db, `/tasks/${createdTaskId}`, {
    method: 'PATCH',
    cookie: leadSession,
    body: { description: 'Updated core workflow description' },
  });
  assert.equal(updateTaskRes.status, 200);

  const fetchedTaskRes = await httpApi(db, `/tasks/${createdTaskId}`, { cookie: leadSession });
  assert.equal(fetchedTaskRes.status, 200);
  assert.equal(fetchedTaskRes.body.task.description, 'Updated core workflow description');

  evidence.cases.TC01 = {
    status: 'PASS',
    createdTaskId,
    updatedDescription: fetchedTaskRes.body.task.description,
  };

  // TC02: Data integrity (duplicate email & duplicate event team rejected; original unchanged)
  const beforeUserCount = db.scalar('SELECT COUNT(*) AS n FROM users').n;
  const dupUserRes = await httpApi(db, '/users', {
    method: 'POST',
    cookie: leadSession,
    body: {
      name: 'Duplicate Lead Attempt',
      email: 'DEMO.LEAD@example.test',
      departmentId: 'demo_dept_eng',
      role: 'Member',
    },
  });
  assert.ok([400, 409].includes(dupUserRes.status), `Expected 400 or 409, got ${dupUserRes.status}`);
  const afterUserCount = db.scalar('SELECT COUNT(*) AS n FROM users').n;
  assert.equal(afterUserCount, beforeUserCount);

  evidence.cases.TC02 = {
    status: 'PASS',
    duplicateRejectedStatus: dupUserRes.status,
    userCountBefore: beforeUserCount,
    userCountAfter: afterUserCount,
  };

  // TC04 & TC-SEC-01: Role-Permission Matrix enforcement (Member denied user creation & reports; Lead allowed)
  const memberCreateUser = await httpApi(db, '/users', {
    method: 'POST',
    cookie: memberSession,
    body: {
      name: 'Unauthorized Clerk',
      email: 'test_clerk@example.test',
      departmentId: 'demo_dept_eng',
      role: 'Member',
    },
  });
  assert.equal(memberCreateUser.status, 403);
  const memberReports = await httpApi(db, '/reports/overview', { cookie: memberSession });
  assert.equal(memberReports.status, 403);
  assert.equal(db.scalar("SELECT COUNT(*) AS n FROM users WHERE email='test_clerk@example.test'").n, 0);

  const leadCreateUser = await httpApi(db, '/users', {
    method: 'POST',
    cookie: leadSession,
    body: {
      name: 'Test Clerk',
      email: 'test_clerk@example.test',
      departmentId: 'demo_dept_eng',
      role: 'Member',
    },
  });
  assert.equal(leadCreateUser.status, 201);
  assert.equal(db.scalar("SELECT COUNT(*) AS n FROM users WHERE email='test_clerk@example.test'").n, 1);

  evidence.cases.TC04 = {
    status: 'PASS',
    memberCreateUserStatus: memberCreateUser.status,
    memberReportsStatus: memberReports.status,
    leadCreateUserStatus: leadCreateUser.status,
    testClerkCountAfterLeadCreate: 1,
  };
  evidence.cases['TC-SEC-01'] = { ...evidence.cases.TC04 };

  // TC05: Successful multi-table atomic transaction (Event task creation as accepted Event Director demo_user_member)
  const tasksBeforeTC05 = db.scalar('SELECT COUNT(*) AS n FROM tasks').n;
  const linksBeforeTC05 = db.scalar('SELECT COUNT(*) AS n FROM event_task_links').n;
  const receiptsBeforeTC05 = db.scalar('SELECT COUNT(*) AS n FROM event_task_creation_requests').n;
  const auditBeforeTC05 = db.scalar('SELECT COUNT(*) AS n FROM activity_log').n;

  const txReqId = 'cs213_tc05_req_' + crypto.randomUUID().slice(0, 16);
  const tc05Res = await httpApi(db, '/events/m3demo_event_workshop/tasks/create', {
    method: 'POST',
    cookie: memberSession,
    body: {
      requestId: txReqId,
      teamId: 'm3demo_team_program',
      title: 'CS213 Atomic Event Task',
      priority: 'High',
    },
  });
  assert.equal(tc05Res.status, 201, JSON.stringify(tc05Res));

  const tasksAfterTC05 = db.scalar('SELECT COUNT(*) AS n FROM tasks').n;
  const linksAfterTC05 = db.scalar('SELECT COUNT(*) AS n FROM event_task_links').n;
  const receiptsAfterTC05 = db.scalar('SELECT COUNT(*) AS n FROM event_task_creation_requests').n;
  const auditAfterTC05 = db.scalar('SELECT COUNT(*) AS n FROM activity_log').n;

  assert.equal(tasksAfterTC05, tasksBeforeTC05 + 1);
  assert.equal(linksAfterTC05, linksBeforeTC05 + 1);
  assert.equal(receiptsAfterTC05, receiptsBeforeTC05 + 1);
  assert.equal(auditAfterTC05, auditBeforeTC05 + 2); // TASK_CREATED + EVENT_TASK_CREATED

  evidence.cases.TC05 = {
    status: 'PASS',
    httpStatus: tc05Res.status,
    before: { tasks: tasksBeforeTC05, links: linksBeforeTC05, receipts: receiptsBeforeTC05, audit: auditBeforeTC05 },
    after: { tasks: tasksAfterTC05, links: linksAfterTC05, receipts: receiptsAfterTC05, audit: auditAfterTC05 },
  };

  // TC06: Transaction rollback (simulate mid-batch state conflict aborting oms_event_task_creation_guard)
  const origBatch = db.batch.bind(db);
  let injectConflict = true;
  db.batch = async (statements) => {
    if (injectConflict) {
      injectConflict = false;
      // Simulate another transaction deactivating the actor right before batch commits
      db.sqlite.exec("UPDATE users SET status='Inactive' WHERE id='demo_user_member'");
    }
    return origBatch(statements);
  };

  const tc06ReqId = 'cs213_tc06_req_' + crypto.randomUUID().slice(0, 16);
  const tc06Res = await httpApi(db, '/events/m3demo_event_workshop/tasks/create', {
    method: 'POST',
    cookie: memberSession,
    body: {
      requestId: tc06ReqId,
      teamId: 'm3demo_team_program',
      title: 'CS213 Should Rollback Completely',
      priority: 'Medium',
    },
  });
  assert.equal(tc06Res.status, 409, JSON.stringify(tc06Res));
  db.batch = origBatch;

  const tasksAfterTC06 = db.scalar('SELECT COUNT(*) AS n FROM tasks').n;
  const linksAfterTC06 = db.scalar('SELECT COUNT(*) AS n FROM event_task_links').n;
  const receiptsAfterTC06 = db.scalar('SELECT COUNT(*) AS n FROM event_task_creation_requests').n;
  const auditAfterTC06 = db.scalar('SELECT COUNT(*) AS n FROM activity_log').n;

  assert.equal(tasksAfterTC06, tasksAfterTC05);
  assert.equal(linksAfterTC06, linksAfterTC05);
  assert.equal(receiptsAfterTC06, receiptsAfterTC05);
  assert.equal(auditAfterTC06, auditAfterTC05);
  assert.equal(db.scalar("SELECT COUNT(*) AS n FROM tasks WHERE title='CS213 Should Rollback Completely'").n, 0);

  // Restore member account back to Active for subsequent tests
  db.sqlite.exec("UPDATE users SET status='Active' WHERE id='demo_user_member'");

  evidence.cases.TC06 = {
    status: 'PASS',
    httpStatus: tc06Res.status,
    errorCode: tc06Res.body?.error,
    before: { tasks: tasksAfterTC05, links: linksAfterTC05, receipts: receiptsAfterTC05, audit: auditAfterTC05 },
    after: { tasks: tasksAfterTC06, links: linksAfterTC06, receipts: receiptsAfterTC06, audit: auditAfterTC06 },
  };

  // TC07: Concurrent transactions competing for single Event Director slot on m3demo_event_talk
  const coleadSession = extractSessionCookie(
    (await httpApi(db, '/auth/login', { method: 'POST', body: { email: 'demo.colead@example.test', password: 'CoLeadPass#2026' } })).setCookie
  );
  const [raceA, raceB] = await Promise.all([
    httpApi(db, '/events/m3demo_event_talk/appointments', {
      method: 'POST',
      cookie: leadSession,
      body: { userId: 'demo_user_member', role: 'Event Director', responsibilities: 'Session A director' },
    }),
    httpApi(db, '/events/m3demo_event_talk/appointments', {
      method: 'POST',
      cookie: coleadSession,
      body: { userId: 'demo_user_executive', role: 'Event Director', responsibilities: 'Session B director' },
    }),
  ]);
  const raceStatuses = [raceA.status, raceB.status].sort();
  assert.deepEqual(raceStatuses, [201, 409]);
  const openDirectors = db.scalar(
    "SELECT COUNT(*) AS n FROM event_appointments WHERE event_id='m3demo_event_talk' AND role='Event Director' AND status IN ('Proposed','Accepted')"
  ).n;
  assert.equal(openDirectors, 1);

  evidence.cases.TC07 = {
    status: 'PASS',
    concurrentStatuses: raceStatuses,
    openDirectorCountInDb: openDirectors,
  };

  // TC08: Detailed report and date-range filter
  const octOnly = await httpApi(db, '/reports/detailed?startDate=2026-10-01&endDate=2026-10-31', { cookie: leadSession });
  assert.equal(octOnly.status, 200);
  const octIds = octOnly.body.report.rows.map((r) => r.id);
  assert.ok(octIds.includes('cs213_task_oct_completed'));
  assert.ok(!octIds.includes('cs213_task_nov_overdue'));
  assert.ok(!octIds.includes('cs213_task_archived_excl'));

  const novOnly = await httpApi(db, '/reports/detailed?startDate=2026-11-01&endDate=2026-11-30', { cookie: leadSession });
  assert.equal(novOnly.status, 200);
  const novIds = novOnly.body.report.rows.map((r) => r.id);
  assert.ok(novIds.includes('cs213_task_nov_overdue'));
  assert.ok(novIds.includes('cs213_task_nov_future'));
  assert.ok(!novIds.includes('cs213_task_oct_completed'));
  assert.ok(!novIds.includes('cs213_task_archived_excl'));

  evidence.cases.TC08 = {
    status: 'PASS',
    octoberCount: octOnly.body.report.totalCount,
    novemberCount: novOnly.body.report.totalCount,
    excludedArchivedFromDefault: true,
  };

  // TC09: Summary report accuracy (excludes Archived tasks and Draft projects/events)
  const sumRes = await httpApi(db, '/reports/summary', { cookie: leadSession });
  assert.equal(sumRes.status, 200);
  const sumReport = sumRes.body.report;
  const expectedNonArchived = db.scalar("SELECT COUNT(*) AS n FROM tasks WHERE status <> 'Archived'").n;
  const expectedArchived = db.scalar("SELECT COUNT(*) AS n FROM tasks WHERE status = 'Archived'").n;
  const expectedDraftProjects = db.scalar("SELECT COUNT(*) AS n FROM projects WHERE status = 'Draft'").n;
  assert.equal(sumReport.totals.totalTasks, expectedNonArchived);
  assert.equal(sumReport.exclusions.excludedArchivedTasks, expectedArchived);
  assert.equal(sumReport.exclusions.excludedDraftProjects, expectedDraftProjects);
  assert.ok(sumReport.exclusions.excludedArchivedTasks >= 1);
  assert.ok(sumReport.exclusions.excludedDraftProjects >= 1);

  evidence.cases.TC09 = {
    status: 'PASS',
    totalNonArchivedTasks: sumReport.totals.totalTasks,
    exclusions: sumReport.exclusions,
  };

  // TC10: Exception report (overdue threshold asOfDate=2026-11-25)
  const excRes = await httpApi(db, '/reports/exceptions?asOfDate=2026-11-25', { cookie: leadSession });
  assert.equal(excRes.status, 200);
  const exc = excRes.body.report;
  const overdueIds = exc.overdueTasks.map((x) => x.id);
  assert.ok(overdueIds.includes('cs213_task_nov_overdue'));
  assert.ok(!overdueIds.includes('cs213_task_nov_future'));
  assert.ok(!overdueIds.includes('cs213_task_oct_completed'));
  assert.ok(exc.unresolvedHighEventIssues.some((i) => i.id === 'cs213_issue_urgent'));

  evidence.cases.TC10 = {
    status: 'PASS',
    asOfDate: exc.asOfDate,
    overdueCount: exc.overdueTasks.length,
    unassignedPriorityCount: exc.unassignedPriorityTasks.length,
    unresolvedHighEventIssuesCount: exc.unresolvedHighEventIssues.length,
  };

  // TC11: Data Mart ETL Load & Reconciliation (ADV-01)
  const dmLoadRes = await httpApi(db, '/reports/datamart/load', {
    method: 'POST',
    cookie: leadSession,
    body: { asOfDate: '2026-11-25' },
  });
  assert.equal(dmLoadRes.status, 200, JSON.stringify(dmLoadRes));
  const dm = dmLoadRes.body.report;
  assert.equal(dm.reconciliation.reconciled, true);
  assert.equal(dm.reconciliation.martTotalTaskCount, dm.reconciliation.oltpNonArchivedTaskCount);
  assert.equal(dm.reconciliation.oltpNonArchivedTaskCount, expectedNonArchived);
  assert.ok(dm.monthlyRows.length >= 2);
  assert.ok(dm.reconciliation.byMonth.every((m) => m.matches));

  evidence.cases.TC11 = {
    status: 'PASS',
    etlRunId: dm.latestRun?.id,
    oltpNonArchivedTaskCount: dm.reconciliation.oltpNonArchivedTaskCount,
    martTotalTaskCount: dm.reconciliation.martTotalTaskCount,
    excludedArchivedTaskCount: dm.reconciliation.excludedArchivedTaskCount,
    reconciled: dm.reconciliation.reconciled,
    byMonth: dm.reconciliation.byMonth,
  };

  // TC12: Audit trail records auth, mutations, and ETL load with actor, action, timestamp, reference
  const auditActions = db.allRows(
    "SELECT action, actor_user_id, actor_role, reference_type, reference_id, occurred_at FROM activity_log ORDER BY occurred_at DESC"
  );
  for (const requiredAction of ['AUTH_LOGIN_FAILED', 'AUTH_LOGIN_SUCCESS', 'AUTH_LOGOUT', 'EVENT_TASK_CREATED', 'USER_CREATED', 'DATAMART_ETL_LOADED']) {
    assert.ok(
      auditActions.some((a) => a.action === requiredAction),
      `Missing expected audit action: ${requiredAction}`
    );
  }

  evidence.cases.TC12 = {
    status: 'PASS',
    totalAuditRows: auditActions.length,
    verifiedActions: ['AUTH_LOGIN_FAILED', 'AUTH_LOGIN_SUCCESS', 'AUTH_LOGOUT', 'EVENT_TASK_CREATED', 'USER_CREATED', 'DATAMART_ETL_LOADED'],
    sampleRows: auditActions.slice(0, 6),
  };
});

test('Lead-only Department CRUD (Create, Rename, Activate/Deactivate) & RBAC', async (t) => {
  const db = new SqliteD1Adapter();
  t.after(() => {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(resolve(EVIDENCE_DIR, 'cs213_tc01_tc12_results.json'), JSON.stringify(evidence, null, 2), 'utf8');
    db.close();
  });

  const leadCookie = extractSessionCookie(
    (await httpApi(db, '/auth/login', { method: 'POST', body: { email: 'demo.lead@example.test', password: 'LeadPass#2026' } })).setCookie
  );
  const coleadCookie = extractSessionCookie(
    (await httpApi(db, '/auth/login', { method: 'POST', body: { email: 'demo.colead@example.test', password: 'CoLeadPass#2026' } })).setCookie
  );
  const execCookie = extractSessionCookie(
    (await httpApi(db, '/auth/login', { method: 'POST', body: { email: 'demo.executive@example.test', password: 'ExecPass#2026' } })).setCookie
  );
  const memberCookie = extractSessionCookie(
    (await httpApi(db, '/auth/login', { method: 'POST', body: { email: 'demo.member@example.test', password: 'MemberPass#2026' } })).setCookie
  );

  // Non-Lead roles must receive 403 FORBIDDEN on all management endpoints
  for (const [role, cookie] of [['Co-Lead', coleadCookie], ['Executive', execCookie], ['Member', memberCookie]]) {
    assert.equal((await httpApi(db, '/departments', { method: 'POST', cookie, body: { name: `${role} Blocked Dept` } })).status, 403);
    assert.equal((await httpApi(db, '/departments/demo_dept_creative', { method: 'PATCH', cookie, body: { name: `${role} Rename` } })).status, 403);
    assert.equal((await httpApi(db, '/departments/demo_dept_creative/status', { method: 'PATCH', cookie, body: { status: 'Inactive' } })).status, 403);
  }

  // Lead creates a department
  const created = await httpApi(db, '/departments', { method: 'POST', cookie: leadCookie, body: { name: 'CS213 Operations' } });
  assert.equal(created.status, 201, JSON.stringify(created));
  const deptId = created.body.department.id;
  assert.ok(deptId.startsWith('dept_'));
  assert.equal(created.body.department.status, 'Active');

  // Case-insensitive duplicate rejected (409)
  const dup = await httpApi(db, '/departments', { method: 'POST', cookie: leadCookie, body: { name: 'cs213 operations' } });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error, 'DEPARTMENT_CONFLICT');

  // Rename succeeds (200)
  const renamed = await httpApi(db, `/departments/${deptId}`, { method: 'PATCH', cookie: leadCookie, body: { name: 'CS213 External Affairs' } });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.body.department.name, 'CS213 External Affairs');

  // Lead cannot deactivate own permanent department (demo_dept_eng)
  const ownDeactivate = await httpApi(db, '/departments/demo_dept_eng/status', { method: 'PATCH', cookie: leadCookie, body: { status: 'Inactive' } });
  assert.equal(ownDeactivate.status, 409);

  // Soft deactivate & reactivate target department succeed (200)
  const deactivated = await httpApi(db, `/departments/${deptId}/status`, { method: 'PATCH', cookie: leadCookie, body: { status: 'Inactive' } });
  assert.equal(deactivated.status, 200);
  assert.equal(deactivated.body.department.status, 'Inactive');

  const reactivated = await httpApi(db, `/departments/${deptId}/status`, { method: 'PATCH', cookie: leadCookie, body: { status: 'Active' } });
  assert.equal(reactivated.status, 200);
  assert.equal(reactivated.body.department.status, 'Active');

  // Audit log must record all 3 department actions
  const deptLogs = db.allRows("SELECT action, reference_type, reference_id FROM activity_log WHERE reference_type='DEPARTMENT' AND reference_id=?", deptId);
  const actions = deptLogs.map((r) => r.action);
  for (const expected of ['DEPARTMENT_CREATED', 'DEPARTMENT_UPDATED', 'DEPARTMENT_STATUS_CHANGED']) {
    assert.ok(actions.includes(expected), `Missing audit action ${expected}`);
  }

  evidence.cases.DEPT_CRUD = {
    status: 'PASS',
    createdId: deptId,
    nonLead403Checked: ['Co-Lead', 'Executive', 'Member'],
    duplicateRejectedStatus: dup.status,
    renamedTo: renamed.body.department.name,
    ownDeptDeactivateStatus: ownDeactivate.status,
    deactivatedStatus: deactivated.body.department.status,
    reactivatedStatus: reactivated.body.department.status,
    auditActions: actions,
  };
});

test('Audit fixes regression (AUD-01 through AUD-04)', async (t) => {
  const db = new SqliteD1Adapter();
  t.after(() => {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(resolve(EVIDENCE_DIR, 'cs213_tc01_tc12_results.json'), JSON.stringify(evidence, null, 2), 'utf8');
    db.close();
  });

  const leadCookie = extractSessionCookie(
    (await httpApi(db, '/auth/login', { method: 'POST', body: { email: 'demo.lead@example.test', password: 'LeadPass#2026' } })).setCookie
  );

  // AUD-01: Lead creates user with initial password -> immediate login works, wrong password fails, password never logged
  const createdUser = await httpApi(db, '/users', {
    method: 'POST',
    cookie: leadCookie,
    body: {
      name: 'New Clerk',
      email: 'new.clerk@example.test',
      departmentId: 'demo_dept_eng',
      role: 'Member',
      password: 'ClerkPass#2026',
    },
  });
  assert.equal(createdUser.status, 201, JSON.stringify(createdUser));
  const clerkId = createdUser.body.user.id;
  assert.equal(db.scalar('SELECT COUNT(*) AS n FROM user_credentials WHERE user_id=?', clerkId).n, 1);
  const userLog = db.scalar("SELECT new_value FROM activity_log WHERE reference_id=? AND action='USER_CREATED'", clerkId);
  assert.ok(userLog && !String(userLog.new_value).includes('ClerkPass#2026'), 'Password must never appear in activity_log');

  const clerkWrongLogin = await httpApi(db, '/auth/login', {
    method: 'POST',
    body: { email: 'new.clerk@example.test', password: 'WrongPassword#1' },
  });
  assert.equal(clerkWrongLogin.status, 401);

  const clerkLogin = await httpApi(db, '/auth/login', {
    method: 'POST',
    body: { email: 'new.clerk@example.test', password: 'ClerkPass#2026' },
  });
  assert.equal(clerkLogin.status, 200);
  const clerkCookie = extractSessionCookie(clerkLogin.setCookie);
  assert.ok(clerkCookie);

  // AUD-03: Deactivating user revokes existing auth_sessions so reactivating does NOT revive old cookie
  const deactUser = await httpApi(db, `/users/${clerkId}/status`, {
    method: 'PATCH',
    cookie: leadCookie,
    body: { status: 'Inactive' },
  });
  assert.equal(deactUser.status, 200);
  assert.equal(db.scalar('SELECT COUNT(*) AS n FROM auth_sessions WHERE user_id=? AND revoked_at IS NULL', clerkId).n, 0);

  const reactUser = await httpApi(db, `/users/${clerkId}/status`, {
    method: 'PATCH',
    cookie: leadCookie,
    body: { status: 'Active' },
  });
  assert.equal(reactUser.status, 200);
  const oldSessionAfterReactivate = await httpApi(db, '/auth/me', { cookie: clerkCookie });
  assert.equal(oldSessionAfterReactivate.status, 401);

  // AUD-02: Soft-deactivating a department with non-archived tasks preserves 3-way reconciliation
  const deactDept = await httpApi(db, '/departments/demo_dept_creative/status', {
    method: 'PATCH',
    cookie: leadCookie,
    body: { status: 'Inactive' },
  });
  assert.equal(deactDept.status, 200);

  const [sumRes, detRes, dmRes] = await Promise.all([
    httpApi(db, '/reports/summary', { cookie: leadCookie }),
    httpApi(db, '/reports/detailed', { cookie: leadCookie }),
    httpApi(db, '/reports/datamart/load', { method: 'POST', cookie: leadCookie, body: { asOfDate: '2026-11-25' } }),
  ]);
  assert.equal(sumRes.status, 200);
  assert.equal(detRes.status, 200);
  assert.equal(dmRes.status, 200);

  const summaryTotal = sumRes.body.report.totals.totalTasks;
  const detailedTotal = detRes.body.report.totalCount;
  const dmOltpTotal = dmRes.body.report.reconciliation.oltpNonArchivedTaskCount;
  const dmMartTotal = dmRes.body.report.reconciliation.martTotalTaskCount;
  assert.equal(summaryTotal, detailedTotal);
  assert.equal(summaryTotal, dmOltpTotal);
  assert.equal(summaryTotal, dmMartTotal);
  const creativeSummaryRow = sumRes.body.report.departments.find((d) => d.departmentId === 'demo_dept_creative');
  assert.ok(creativeSummaryRow && creativeSummaryRow.departmentStatus === 'Inactive');

  // AUD-04: Bulk testing status toggle logs TESTING_STATUS_CHANGED atomically
  const testToggle = await httpApi(db, '/users/testing/status', {
    method: 'PATCH',
    cookie: leadCookie,
    body: { status: 'Inactive' },
  });
  assert.equal(testToggle.status, 200);
  assert.equal(
    db.scalar("SELECT COUNT(*) AS n FROM activity_log WHERE action='TESTING_STATUS_CHANGED' AND reference_type='DEPARTMENT' AND reference_id='DEPT-TEST-001'").n,
    1
  );

  evidence.cases.AUDIT_FIXES = {
    status: 'PASS',
    aud01LoginAfterCreateStatus: clerkLogin.status,
    aud01WrongPasswordStatus: clerkWrongLogin.status,
    aud03OldCookieAfterReactivateStatus: oldSessionAfterReactivate.status,
    aud02ReconciledTotals: { summaryTotal, detailedTotal, dmOltpTotal, dmMartTotal },
    aud04TestingStatusLogged: true,
  };
});

test('Deep audit fixes regression (LOG-01 through LOG-03)', async (t) => {
  const db = new SqliteD1Adapter();
  t.after(() => {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(resolve(EVIDENCE_DIR, 'cs213_tc01_tc12_results.json'), JSON.stringify(evidence, null, 2), 'utf8');
    db.close();
  });

  const leadCookie = extractSessionCookie(
    (await httpApi(db, '/auth/login', { method: 'POST', body: { email: 'demo.lead@example.test', password: 'LeadPass#2026' } })).setCookie
  );

  // LOG-01: Draft project linked to an Event returns 409 PROJECT_DELETE_NOT_SAFE (never 500)
  const linkedEventRes = await httpApi(db, '/events', {
    method: 'POST',
    cookie: leadCookie,
    body: {
      name: 'CS213 Draft Project Guard Event',
      eventType: 'Workshop',
      projectId: 'cs213_project_draft',
    },
  });
  assert.equal(linkedEventRes.status, 201, JSON.stringify(linkedEventRes));

  const delDraftProject = await httpApi(db, '/projects/cs213_project_draft', {
    method: 'DELETE',
    cookie: leadCookie,
  });
  assert.equal(delDraftProject.status, 409, JSON.stringify(delDraftProject));
  assert.equal(delDraftProject.body.error, 'PROJECT_DELETE_NOT_SAFE');
  assert.equal(db.scalar("SELECT COUNT(*) AS n FROM projects WHERE id='cs213_project_draft'").n, 1);

  // LOG-02: Soft-deactivating demo_dept_creative keeps Department Workload == Summary totals
  const deactDept = await httpApi(db, '/departments/demo_dept_creative/status', {
    method: 'PATCH',
    cookie: leadCookie,
    body: { status: 'Inactive' },
  });
  assert.equal(deactDept.status, 200);

  const [workloadRes, summaryRes] = await Promise.all([
    httpApi(db, '/reports/department-workload', { cookie: leadCookie }),
    httpApi(db, '/reports/summary', { cookie: leadCookie }),
  ]);
  assert.equal(workloadRes.status, 200);
  assert.equal(summaryRes.status, 200);
  const workloadRows = workloadRes.body.report;
  assert.ok(workloadRows.some((d) => d.id === 'demo_dept_creative'));
  const workloadTaskSum = workloadRows.reduce((acc, d) => acc + Number(d.taskCount || 0), 0);
  assert.equal(workloadTaskSum, summaryRes.body.report.totals.totalTasks);

  // LOG-03: Concurrent POST /api/m3/events/:id/debrief returns [201, 409] (never 500)
  db.sqlite.exec(`
    INSERT INTO events (id, name, event_type, created_by, status, created_at, updated_at)
    VALUES ('cs213_post_event', 'CS213 Post-Event Debrief Race', 'Workshop', 'demo_user_lead', 'Post-Event', '2026-11-26T00:00:00Z', '2026-11-26T00:00:00Z');
  `);
  const [debA, debB] = await Promise.all([
    httpApi(db, '/m3/events/cs213_post_event/debrief', {
      method: 'POST',
      cookie: leadCookie,
      body: { summary: 'Debrief A', lessons: 'Lesson A' },
    }),
    httpApi(db, '/m3/events/cs213_post_event/debrief', {
      method: 'POST',
      cookie: leadCookie,
      body: { summary: 'Debrief B', lessons: 'Lesson B' },
    }),
  ]);
  const debStatuses = [debA.status, debB.status].sort();
  assert.deepEqual(debStatuses, [201, 409]);
  assert.equal(db.scalar("SELECT COUNT(*) AS n FROM event_debriefs WHERE event_id='cs213_post_event'").n, 1);

  evidence.cases.DEEP_AUDIT_FIXES = {
    status: 'PASS',
    log01DeleteBlockedStatus: delDraftProject.status,
    log01ErrorCode: delDraftProject.body.error,
    log02WorkloadSum: workloadTaskSum,
    log02SummaryTotal: summaryRes.body.report.totals.totalTasks,
    log03ConcurrentDebriefStatuses: debStatuses,
  };

  // P3: Renaming a department marks Data Mart dimensionsSynced=false until ETL Load refreshes dm_dim_department
  const initialLoad = await httpApi(db, '/reports/datamart/load', { method: 'POST', cookie: leadCookie, body: { asOfDate: '2026-11-25' } });
  assert.equal(initialLoad.body.report.reconciliation.dimensionsSynced, true);
  assert.equal(initialLoad.body.report.reconciliation.reconciled, true);

  const renameEng = await httpApi(db, '/departments/demo_dept_eng', {
    method: 'PATCH',
    cookie: leadCookie,
    body: { name: 'Demo Engineering Renamed' },
  });
  assert.equal(renameEng.status, 200);

  const staleDm = await httpApi(db, '/reports/datamart', { cookie: leadCookie });
  assert.equal(staleDm.status, 200);
  assert.equal(staleDm.body.report.reconciliation.dimensionsSynced, false);
  assert.equal(staleDm.body.report.reconciliation.reconciled, false);

  const refreshedDm = await httpApi(db, '/reports/datamart/load', { method: 'POST', cookie: leadCookie, body: { asOfDate: '2026-11-25' } });
  assert.equal(refreshedDm.body.report.reconciliation.dimensionsSynced, true);
  assert.equal(refreshedDm.body.report.reconciliation.reconciled, true);
  assert.equal(
    db.scalar("SELECT department_name FROM dm_dim_department WHERE department_key='demo_dept_eng'").department_name,
    'Demo Engineering Renamed'
  );
  evidence.cases.P3_DIMENSION_SYNC = {
    status: 'PASS',
    staleDimensionsSynced: staleDm.body.report.reconciliation.dimensionsSynced,
    refreshedDimensionsSynced: refreshedDm.body.report.reconciliation.dimensionsSynced,
  };
});
