import express from 'express';
import cors from 'cors';
import { Database } from '../shared/database.js';
import { authMiddleware, adminOnly, requireDepartment } from '../shared/auth.js';
import { RosterEngine } from '../shared/rosterEngine.js';
import { getSAPublicHolidays } from '../shared/publicHolidays.js';
import { getPublishedYearRollupForDepartment, normalizeFairnessHistoryMode } from '../shared/fairnessRollup.js';
import { logger } from '../shared/logger.js';
import { corsOrigin } from '../shared/corsOrigin.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.ROSTER_SERVICE_PORT || 4002;
const db = Database.getInstance();
const withDept = requireDepartment(() => db);

app.use(cors({ origin: corsOrigin(), credentials: true }));
app.use(express.json());

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  const dbOk = await db.ping();
  res.status(dbOk ? 200 : 503).json({ status: dbOk ? 'ok' : 'degraded', service: 'roster' });
});

// ── SA public holidays ────────────────────────────────────────────────────────
/** Rolling calendar months of roster metadata for archive UI (no new tables — uses `rosters`). */
app.get('/api/rosters/archive', authMiddleware, withDept, async (req, res) => {
  try {
    const departmentId = (req as any).departmentId;
    const role = String((req as any).user?.role ?? '');
    const months = Math.min(24, Math.max(1, parseInt(String(req.query.months ?? '6'), 10) || 6));
    const now = new Date();
    const slots: { year: number; month: number }[] = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      slots.push({ year: d.getFullYear(), month: d.getMonth() });
    }

    const entries = [];
    for (const { year, month } of slots) {
      const row = await db.get(
        'SELECT id, status, updated_at FROM rosters WHERE department_id = ? AND year = ? AND month = ?',
        [departmentId, year, month]
      );
      if (!row) {
        entries.push({ year, month, rosterId: null, status: null, updatedAt: null });
        continue;
      }
      const isAdmin = role === 'ADMIN';
      if (row.status === 'DRAFT' && !isAdmin) {
        entries.push({ year, month, rosterId: null, status: null, updatedAt: null, hint: 'draft' });
        continue;
      }
      entries.push({
        year,
        month,
        rosterId: row.id,
        status: row.status,
        updatedAt: row.updated_at,
      });
    }
    res.json({ entries });
  } catch (error: any) {
    logger.error({ err: error }, 'Roster archive index error');
    res.status(500).json({ error: 'Failed to list roster archive' });
  }
});

app.get('/api/rosters/public-holidays/:year', authMiddleware, (req, res) => {
  try {
    const year = parseInt(req.params.year, 10);
    if (isNaN(year) || year < 2020 || year > 2035) {
      return res.status(400).json({ error: 'Invalid year' });
    }
    res.json({ year, country: 'ZA', source: 'gov.za', dates: getSAPublicHolidays(year) });
  } catch {
    res.status(500).json({ error: 'Failed to get public holidays' });
  }
});

// ── Get roster for month/year ─────────────────────────────────────────────────
app.get('/api/rosters/:year/:month', authMiddleware, withDept, async (req, res) => {
  try {
    const departmentId = (req as any).departmentId;
    const year  = parseInt(req.params.year);
    const month = parseInt(req.params.month);

    const roster = await db.get(
      'SELECT * FROM rosters WHERE department_id = ? AND year = ? AND month = ?',
      [departmentId, year, month]
    );
    if (!roster) return res.json(null);

    const user = (req as any).user as { role?: string } | undefined;
    if (roster.status === 'DRAFT' && user?.role !== 'ADMIN') return res.json(null);

    const shifts = await db.all('SELECT * FROM shifts WHERE roster_id = ? ORDER BY date', [roster.id]);
    res.json({
      id: roster.id, month: roster.month, year: roster.year, status: roster.status,
      shifts: shifts.map(s => ({
        id: s.id, date: s.date, doctorId: s.doctor_id, templateId: s.template_id,
        isPublicHoliday: Boolean(s.is_public_holiday)
      })),
      createdAt: roster.created_at
    });
  } catch (error: any) {
    logger.error({ err: error }, 'Get roster error');
    res.status(500).json({ error: 'Failed to fetch roster' });
  }
});

// ── Generate roster ───────────────────────────────────────────────────────────
app.post('/api/rosters/generate', authMiddleware, withDept, adminOnly, async (req, res) => {
  try {
    const departmentId = (req as any).departmentId;
    const now = new Date();
    const targetMonth = req.body.month ?? now.getMonth();
    const targetYear  = req.body.year  ?? now.getFullYear();

    const doctors = await db.all(
      `SELECT u.id, u.email, u.name, u.role, u.firm,
              u.cumulative_holiday_hours, u.cumulative_total_hours,
              u.cumulative_weekend_shifts, u.start_date, u.workload_start_mode
       FROM users u
       INNER JOIN user_departments ud ON ud.user_id = u.id AND ud.department_id = ?
       WHERE u.role IN ('DOCTOR','ADMIN')`,
      [departmentId]
    );

    const requests = await db.all(
      `SELECT id, doctor_id, type, date, status, reason, swap_with_doctor_id, created_at
       FROM requests WHERE department_id = ?`,
      [departmentId]
    );

    const doctorsFormatted = doctors.map(d => ({
      id: d.id, email: d.email, name: d.name, role: d.role, firm: d.firm,
      cumulativeHolidayHours:  d.cumulative_holiday_hours  || 0,
      cumulativeTotalHours:    d.cumulative_total_hours    || 0,
      cumulativeWeekendShifts: d.cumulative_weekend_shifts || 0,
      startDate: d.start_date || null,
      workloadStartMode: (d.workload_start_mode as 'IMMEDIATE'|'STAGGERED'|'NEXT_MONTH') || 'STAGGERED',
    }));

    const requestsFormatted = requests.map(r => ({
      id: r.id, doctorId: r.doctor_id, type: r.type, date: r.date,
      status: r.status, reason: r.reason, swapWithDoctorId: r.swap_with_doctor_id, createdAt: r.created_at
    }));

    // Load fairness settings — use plain snake_case column names (Postgres-safe)
    const settings = await db.get(
      `SELECT hour_diff_limit, weekend_diff_limit, max_shifts_per_7_days,
              allow_consecutive_shifts, min_rest_days, fairness_history_mode
       FROM fairness_settings WHERE department_id = ?`,
      [departmentId]
    ).catch(() => null);

    const resolvedMinRestDays = (settings?.min_rest_days ?? null) !== null
      ? settings.min_rest_days
      : (settings?.allow_consecutive_shifts === 1 ? 0 : 1);

    const historyMode = normalizeFairnessHistoryMode(settings?.fairness_history_mode as string | undefined);

    if (historyMode === 'CALENDAR_YEAR') {
      const yearRollup = await getPublishedYearRollupForDepartment(db, departmentId, targetYear);
      for (const d of doctorsFormatted) {
        const r = yearRollup.get(d.id) ?? { totalHours: 0, weekendShifts: 0, holidayHours: 0 };
        d.cumulativeTotalHours    = r.totalHours;
        d.cumulativeWeekendShifts = r.weekendShifts;
        d.cumulativeHolidayHours  = r.holidayHours;
      }
    }

    const { roster, report } = RosterEngine.generate(
      targetMonth, targetYear, doctorsFormatted, requestsFormatted,
      {
        maxHourDiff:       settings?.hour_diff_limit       ?? 24,
        maxWeekendDiff:    settings?.weekend_diff_limit    ?? 1,
        maxShiftsPer7Days: settings?.max_shifts_per_7_days ?? 2,
        minRestDays:       resolvedMinRestDays,
      }
    );

    const tentativeRosterId = `roster-${departmentId}-${targetYear}-${targetMonth}`;
    const nowTs = Date.now();

    const existing = await db.get(
      `SELECT id, status FROM rosters WHERE (department_id = ? AND year = ? AND month = ?) OR id = ?`,
      [departmentId, targetYear, targetMonth, tentativeRosterId]
    ) as { id: string; status: string } | undefined;

    const rosterId = existing?.id ?? tentativeRosterId;
    /** Keep published rosters published after regenerate so doctors still see them; admins should re-sync cumulatives if totals change materially. */
    const persistStatus = existing?.status === 'FINAL' ? 'FINAL' : roster.status;

    if (existing) {
      await db.run('UPDATE rosters SET department_id = ?, status = ?, updated_at = ? WHERE id = ?',
        [departmentId, persistStatus, nowTs, rosterId]);
      await db.run('DELETE FROM shifts WHERE roster_id = ?', [rosterId]);
    } else {
      await db.run(
        'INSERT INTO rosters (id, department_id, month, year, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [rosterId, departmentId, targetMonth, targetYear, roster.status, nowTs, nowTs]
      );
    }

    for (const shift of roster.shifts) {
      await db.run(
        `INSERT INTO shifts (id, roster_id, date, doctor_id, template_id, is_public_holiday) VALUES (?, ?, ?, ?, ?, ?)`,
        [`${rosterId}-${shift.date}`, rosterId, shift.date, shift.doctorId, shift.templateId, shift.isPublicHoliday ? 1 : 0]
      );
    }

    // Engine uses placeholder ids (`roster-${y}-${m}`, `s-${date}`); DB uses `roster-${dept}-${y}-${m}` and `${rosterId}-${date}`.
    const rosterOut = {
      ...roster,
      id: rosterId,
      status: persistStatus as typeof roster.status,
      shifts: roster.shifts.map((s) => ({
        ...s,
        id: `${rosterId}-${s.date}`,
      })),
    };
    res.json({ roster: rosterOut, report });
  } catch (error: any) {
    logger.error({ err: error }, 'Generate roster error');
    res.status(500).json({ error: 'Failed to generate roster', details: error.message });
  }
});

// ── Update shift ──────────────────────────────────────────────────────────────
app.patch('/api/rosters/:rosterId/shifts/:shiftId', authMiddleware, withDept, adminOnly, async (req, res) => {
  try {
    const { rosterId, shiftId } = req.params;
    const { doctorId } = req.body;
    if (!doctorId) return res.status(400).json({ error: 'doctorId required' });

    await db.run('UPDATE shifts SET doctor_id = ? WHERE id = ? AND roster_id = ?', [doctorId, shiftId, rosterId]);
    res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, 'Update shift error');
    res.status(500).json({ error: 'Failed to update shift' });
  }
});

// ── Publish roster (wrapped in a transaction) ─────────────────────────────────
app.post('/api/rosters/:rosterId/publish', authMiddleware, withDept, adminOnly, async (req, res) => {
  try {
    const departmentId = (req as any).departmentId;
    const { rosterId } = req.params;

    const roster = await db.get('SELECT * FROM rosters WHERE id = ? AND department_id = ?', [rosterId, departmentId]);
    if (!roster)               return res.status(404).json({ error: 'Roster not found' });
    if (roster.status === 'FINAL') return res.status(400).json({ error: 'Roster already published' });

    const shifts = await db.all('SELECT * FROM shifts WHERE roster_id = ?', [rosterId]);

    // Aggregate per-doctor stats before the transaction
    const doctorStats: Record<string, { hours: number; weekends: number; phHours: number }> = {};
    for (const shift of shifts) {
      const isWeekend = shift.template_id && String(shift.template_id).includes('weekend');
      const hours  = isWeekend ? 24 : 16;
      const isPH   = Boolean(shift.is_public_holiday);
      const phHours = isPH ? hours : 0;
      if (!doctorStats[shift.doctor_id]) doctorStats[shift.doctor_id] = { hours: 0, weekends: 0, phHours: 0 };
      doctorStats[shift.doctor_id].hours   += hours;
      if (isWeekend) doctorStats[shift.doctor_id].weekends++;
      doctorStats[shift.doctor_id].phHours += phHours;
    }

    // Execute the publish as a single atomic transaction
    const now = Date.now();
    await db.transaction(async (tx) => {
      for (const [doctorId, stats] of Object.entries(doctorStats)) {
        await tx.run(
          `UPDATE users
           SET cumulative_total_hours    = COALESCE(cumulative_total_hours,    0) + ?,
               cumulative_weekend_shifts = COALESCE(cumulative_weekend_shifts, 0) + ?,
               cumulative_holiday_hours  = COALESCE(cumulative_holiday_hours,  0) + ?,
               updated_at = ?
           WHERE id = ?`,
          [stats.hours, stats.weekends, stats.phHours, now, doctorId]
        );
      }
      await tx.run('UPDATE rosters SET status = ?, updated_at = ? WHERE id = ?', ['FINAL', now, rosterId]);
    });

    res.json({ success: true, message: 'Roster published and cumulative stats updated' });
  } catch (error: any) {
    logger.error({ err: error }, 'Publish roster error');
    res.status(500).json({ error: 'Failed to publish roster' });
  }
});

// ── Sync cumulative stats ─────────────────────────────────────────────────────
app.post('/api/rosters/sync-cumulative', authMiddleware, withDept, adminOnly, async (req, res) => {
  try {
    const departmentId = (req as any).departmentId;
    const published = await db.all(
      'SELECT id FROM rosters WHERE department_id = ? AND status = ? ORDER BY year, month',
      [departmentId, 'FINAL']
    );

    const doctorTotals: Record<string, { hours: number; weekends: number; phHours: number }> = {};
    for (const row of published) {
      const shifts = await db.all('SELECT * FROM shifts WHERE roster_id = ?', [row.id]);
      for (const shift of shifts) {
        const isWeekend = shift.template_id && String(shift.template_id).includes('weekend');
        const hours = isWeekend ? 24 : 16;
        const phHours = Boolean(shift.is_public_holiday) ? hours : 0;
        if (!doctorTotals[shift.doctor_id]) doctorTotals[shift.doctor_id] = { hours: 0, weekends: 0, phHours: 0 };
        doctorTotals[shift.doctor_id].hours += hours;
        if (isWeekend) doctorTotals[shift.doctor_id].weekends++;
        doctorTotals[shift.doctor_id].phHours += phHours;
      }
    }

    const now = Date.now();
    await db.transaction(async (tx) => {
      for (const [doctorId, stats] of Object.entries(doctorTotals)) {
        await tx.run(
          `UPDATE users SET cumulative_total_hours = ?, cumulative_weekend_shifts = ?,
           cumulative_holiday_hours = ?, updated_at = ? WHERE id = ?`,
          [stats.hours, stats.weekends, stats.phHours, now, doctorId]
        );
      }

      const allDoctors = await db.all(
        `SELECT u.id FROM users u
         INNER JOIN user_departments ud ON ud.user_id = u.id AND ud.department_id = ?
         WHERE u.role IN ('DOCTOR','ADMIN')`,
        [departmentId]
      );
      for (const { id } of allDoctors) {
        if (!doctorTotals[id]) {
          await tx.run(
            `UPDATE users SET cumulative_total_hours = 0, cumulative_weekend_shifts = 0,
             cumulative_holiday_hours = 0, updated_at = ? WHERE id = ?`,
            [now, id]
          );
        }
      }
    });

    res.json({ success: true, message: 'Cumulative stats synced', doctorsUpdated: Object.keys(doctorTotals).length });
  } catch (error: any) {
    logger.error({ err: error }, 'Sync cumulative error');
    res.status(500).json({ error: 'Failed to sync cumulative stats' });
  }
});

db.waitForInit().then(() => {
  app.listen(PORT, () => logger.info(`Roster Service running on port ${PORT}`));
}).catch(err => {
  logger.error({ err }, 'Failed to initialise database');
  process.exit(1);
});
