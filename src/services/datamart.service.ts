import type { Env } from "../types/env";
import type { AuthenticatedUser } from "../types/user";
import type {
  DataMartEtlRun,
  DataMartMonthlyRow,
  DataMartReconciliationMonth,
  DataMartReport,
} from "../types/report";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthMetadata(monthKey: string): { year: number; month: number; quarter: number; label: string } {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) {
    return { year: 2026, month: 1, quarter: 1, label: monthKey };
  }
  const year = Number(match[1]);
  const month = Math.min(12, Math.max(1, Number(match[2])));
  const quarter = Math.ceil(month / 3);
  const label = `${MONTH_NAMES[month - 1]} ${year}`;
  return { year, month, quarter, label };
}

export async function getOperationsDataMart(env: Env): Promise<DataMartReport> {
  const [latestRunRow, factRes, oltpTotalRow, archivedRow, oltpByMonthRes, martByMonthRes, staleDeptRow] = await Promise.all([
    env.DB.prepare(`
      SELECT
        r.id,
        r.started_at AS startedAt,
        r.completed_at AS completedAt,
        r.triggered_by AS triggeredBy,
        u.name AS triggeredByName,
        r.source_task_count AS sourceTaskCount,
        r.mart_task_count AS martTaskCount,
        r.reconciled
      FROM dm_etl_runs r
      LEFT JOIN users u ON u.id = r.triggered_by
      ORDER BY r.completed_at DESC
      LIMIT 1
    `).first<{
      id: string;
      startedAt: string;
      completedAt: string;
      triggeredBy: string;
      triggeredByName: string | null;
      sourceTaskCount: number;
      martTaskCount: number;
      reconciled: number;
    }>(),

    env.DB.prepare(`
      SELECT
        f.month_key AS monthKey,
        m.label AS monthLabel,
        m.year,
        m.month,
        m.quarter,
        f.department_key AS departmentKey,
        d.department_name AS departmentName,
        f.active_task_count AS activeTaskCount,
        f.completed_task_count AS completedTaskCount,
        f.overdue_task_count AS overdueTaskCount,
        f.avg_progress AS avgProgress,
        f.loaded_at AS loadedAt
      FROM dm_fact_department_monthly_tasks f
      INNER JOIN dm_dim_month m ON m.month_key = f.month_key
      INNER JOIN dm_dim_department d ON d.department_key = f.department_key
      ORDER BY f.month_key DESC, d.department_name ASC
    `).all<DataMartMonthlyRow>(),

    env.DB.prepare(`SELECT COUNT(*) AS cnt FROM tasks WHERE status <> 'Archived'`).first<{ cnt: number }>(),
    env.DB.prepare(`SELECT COUNT(*) AS cnt FROM tasks WHERE status = 'Archived'`).first<{ cnt: number }>(),

    env.DB.prepare(`
      SELECT substr(created_at, 1, 7) AS monthKey, COUNT(*) AS cnt
      FROM tasks
      WHERE status <> 'Archived'
      GROUP BY substr(created_at, 1, 7)
      ORDER BY monthKey DESC
    `).all<{ monthKey: string; cnt: number }>(),

    env.DB.prepare(`
      SELECT month_key AS monthKey, SUM(active_task_count + completed_task_count) AS cnt
      FROM dm_fact_department_monthly_tasks
      GROUP BY month_key
      ORDER BY month_key DESC
    `).all<{ monthKey: string; cnt: number }>(),

    env.DB.prepare(`
      SELECT COUNT(*) AS cnt
      FROM departments d
      LEFT JOIN dm_dim_department dm ON dm.department_key = d.id
      WHERE dm.department_key IS NULL
         OR dm.department_name <> d.name
         OR dm.status <> d.status
    `).first<{ cnt: number }>(),
  ]);

  const oltpMap = new Map(oltpByMonthRes.results.map((r) => [r.monthKey, Number(r.cnt ?? 0)]));
  const martMap = new Map(martByMonthRes.results.map((r) => [r.monthKey, Number(r.cnt ?? 0)]));
  const allMonths = Array.from(new Set([...oltpMap.keys(), ...martMap.keys()])).sort().reverse();

  const byMonth: DataMartReconciliationMonth[] = allMonths.map((monthKey) => {
    const oltpCount = oltpMap.get(monthKey) ?? 0;
    const martCount = martMap.get(monthKey) ?? 0;
    return {
      monthKey,
      oltpCount,
      martCount,
      matches: oltpCount === martCount,
    };
  });

  const oltpNonArchivedTaskCount = Number(oltpTotalRow?.cnt ?? 0);
  const martTotalTaskCount = factRes.results.reduce(
    (sum, r) => sum + Number(r.activeTaskCount ?? 0) + Number(r.completedTaskCount ?? 0),
    0
  );
  const excludedArchivedTaskCount = Number(archivedRow?.cnt ?? 0);
  const dimensionsSynced = Number(staleDeptRow?.cnt ?? 0) === 0;

  const latestRun: DataMartEtlRun | null = latestRunRow
    ? {
        id: latestRunRow.id,
        startedAt: latestRunRow.startedAt,
        completedAt: latestRunRow.completedAt,
        triggeredBy: latestRunRow.triggeredBy,
        triggeredByName: latestRunRow.triggeredByName,
        sourceTaskCount: Number(latestRunRow.sourceTaskCount ?? 0),
        martTaskCount: Number(latestRunRow.martTaskCount ?? 0),
        reconciled: Boolean(latestRunRow.reconciled),
      }
    : null;

  return {
    latestRun,
    monthlyRows: factRes.results.map((r) => ({
      ...r,
      year: Number(r.year),
      month: Number(r.month),
      quarter: Number(r.quarter),
      activeTaskCount: Number(r.activeTaskCount),
      completedTaskCount: Number(r.completedTaskCount),
      overdueTaskCount: Number(r.overdueTaskCount),
      avgProgress: Number(r.avgProgress),
    })),
    reconciliation: {
      oltpNonArchivedTaskCount,
      martTotalTaskCount,
      excludedArchivedTaskCount,
      dimensionsSynced,
      reconciled: oltpNonArchivedTaskCount === martTotalTaskCount && byMonth.every((m) => m.matches) && dimensionsSynced,
      byMonth,
    },
  };
}

export async function loadOperationsDataMart(
  env: Env,
  actor: AuthenticatedUser,
  asOfDate?: string
): Promise<DataMartReport> {
  const startedAt = new Date().toISOString();
  const effectiveAsOf = asOfDate && /^\d{4}-\d{2}-\d{2}$/.test(asOfDate) ? asOfDate : startedAt.slice(0, 10);

  const [deptRes, aggRes, totalSourceRow] = await Promise.all([
    env.DB.prepare(`SELECT id, name, status FROM departments`).all<{ id: string; name: string; status: string }>(),
    env.DB.prepare(`
      SELECT
        substr(t.created_at, 1, 7) AS monthKey,
        t.department_id AS departmentKey,
        SUM(CASE WHEN t.status <> 'Completed' THEN 1 ELSE 0 END) AS activeTaskCount,
        SUM(CASE WHEN t.status = 'Completed' THEN 1 ELSE 0 END) AS completedTaskCount,
        SUM(CASE WHEN t.deadline IS NOT NULL AND substr(t.deadline, 1, 10) <= ? AND t.status <> 'Completed' THEN 1 ELSE 0 END) AS overdueTaskCount,
        COALESCE(ROUND(AVG(t.progress), 1), 0) AS avgProgress
      FROM tasks t
      WHERE t.status <> 'Archived'
      GROUP BY substr(t.created_at, 1, 7), t.department_id
    `).bind(effectiveAsOf).all<{
      monthKey: string;
      departmentKey: string;
      activeTaskCount: number;
      completedTaskCount: number;
      overdueTaskCount: number;
      avgProgress: number;
    }>(),
    env.DB.prepare(`SELECT COUNT(*) AS cnt FROM tasks WHERE status <> 'Archived'`).first<{ cnt: number }>(),
  ]);

  const completedAt = new Date().toISOString();
  const runId = `dm_run_${crypto.randomUUID()}`;
  const statements = [env.DB.prepare(`DELETE FROM dm_fact_department_monthly_tasks`)];

  for (const d of deptRes.results) {
    statements.push(
      env.DB.prepare(`
        INSERT INTO dm_dim_department (department_key, department_name, status)
        VALUES (?, ?, ?)
        ON CONFLICT(department_key) DO UPDATE SET
          department_name = excluded.department_name,
          status = excluded.status
      `).bind(d.id, d.name, d.status)
    );
  }

  const seenMonths = new Set<string>();
  let martTaskCount = 0;

  for (const row of aggRes.results) {
    if (!seenMonths.has(row.monthKey)) {
      seenMonths.add(row.monthKey);
      const meta = monthMetadata(row.monthKey);
      statements.push(
        env.DB.prepare(`
          INSERT INTO dm_dim_month (month_key, year, month, quarter, label)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(month_key) DO UPDATE SET
            year = excluded.year,
            month = excluded.month,
            quarter = excluded.quarter,
            label = excluded.label
        `).bind(row.monthKey, meta.year, meta.month, meta.quarter, meta.label)
      );
    }

    const activeCount = Number(row.activeTaskCount ?? 0);
    const completedCount = Number(row.completedTaskCount ?? 0);
    const overdueCount = Number(row.overdueTaskCount ?? 0);
    const avgProgress = Number(row.avgProgress ?? 0);
    martTaskCount += activeCount + completedCount;

    statements.push(
      env.DB.prepare(`
        INSERT INTO dm_fact_department_monthly_tasks (
          month_key, department_key, active_task_count, completed_task_count,
          overdue_task_count, avg_progress, loaded_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(row.monthKey, row.departmentKey, activeCount, completedCount, overdueCount, avgProgress, completedAt)
    );
  }

  const sourceTaskCount = Number(totalSourceRow?.cnt ?? 0);
  const reconciledInt = sourceTaskCount === martTaskCount ? 1 : 0;

  statements.push(
    env.DB.prepare(`
      INSERT INTO dm_etl_runs (
        id, started_at, completed_at, triggered_by, source_task_count, mart_task_count, reconciled
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(runId, startedAt, completedAt, actor.id, sourceTaskCount, martTaskCount, reconciledInt),

    env.DB.prepare(`
      INSERT INTO activity_log (
        id, occurred_at, actor_user_id, actor_name, actor_role,
        action, reference_type, reference_id, old_value, new_value
      )
      VALUES (?, ?, ?, ?, ?, 'DATAMART_ETL_LOADED', 'DATAMART', ?, NULL, ?)
    `).bind(
      `act_${crypto.randomUUID()}`,
      completedAt,
      actor.id,
      actor.name,
      actor.role,
      runId,
      JSON.stringify({ sourceTaskCount, martTaskCount, reconciled: reconciledInt === 1, asOfDate: effectiveAsOf })
    )
  );

  await env.DB.batch(statements);
  return getOperationsDataMart(env);
}
