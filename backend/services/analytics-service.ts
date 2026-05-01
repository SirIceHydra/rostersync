import express from 'express';
import cors from 'cors';
import { Database } from '../shared/database.js';
import { authMiddleware, adminOnly, requireDepartment } from '../shared/auth.js';
import { RosterEngine } from '../shared/rosterEngine.js';
import {
  getPublishedYearRollupForDepartment,
  normalizeFairnessHistoryMode,
} from '../shared/fairnessRollup.js';
import { logger } from '../shared/logger.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.ANALYTICS_SERVICE_PORT || 4005;
const db = Database.getInstance();

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

const withDept = requireDepartment(() => db);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  const dbOk = await db.ping();
  res.status(dbOk ? 200 : 503).json({ status: dbOk ? 'ok' : 'degraded', service: 'analytics' });
});

// ── Fairness report for a roster ──────────────────────────────────────────────
app.get('/api/analytics/roster/:year/:month/fairness', authMiddleware, withDept, async (req, res) => {
  try {
    const departmentId = (req as any).departmentId;
    const year  = parseInt(req.params.year);
    const month = parseInt(req.params.month);

    const roster = await db.get(
      'SELECT * FROM rosters WHERE department_id = ? AND year = ? AND month = ?',
      [departmentId, year, month]
    );
    if (!roster) return res.status(404).json({ error: 'Roster not found' });

    const user = (req as any).user as { role?: string } | undefined;
    if (roster.status === 'DRAFT' && user?.role !== 'ADMIN') {
      return res.status(404).json({ error: 'Roster not found' });
    }

    const shifts = await db.all('SELECT * FROM shifts WHERE roster_id = ?', [roster.id]);

    const fairnessRow = await db
      .get('SELECT fairness_history_mode FROM fairness_settings WHERE department_id = ?', [departmentId])
      .catch(() => null);
    const historyMode = normalizeFairnessHistoryMode(fairnessRow?.fairness_history_mode as string | undefined);

    const yearRollup =
      historyMode === 'CALENDAR_YEAR'
        ? await getPublishedYearRollupForDepartment(db, departmentId, year, { excludeRosterId: roster.id as string })
        : null;

    const doctors = await db.all(
      `SELECT u.id, u.email, u.name, u.role, u.firm,
              u.cumulative_holiday_hours, u.cumulative_total_hours, u.cumulative_weekend_shifts
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

    const doctorsFormatted = doctors.map(d => {
      if (historyMode === 'CALENDAR_YEAR' && yearRollup) {
        const r = yearRollup.get(d.id) ?? { totalHours: 0, weekendShifts: 0, holidayHours: 0 };
        return {
          id: d.id, email: d.email, name: d.name, role: d.role, firm: d.firm,
          cumulativeHolidayHours: r.holidayHours,
          cumulativeTotalHours:   r.totalHours,
          cumulativeWeekendShifts: r.weekendShifts,
        };
      }
      return {
        id: d.id, email: d.email, name: d.name, role: d.role, firm: d.firm,
        cumulativeHolidayHours:  d.cumulative_holiday_hours  || 0,
        cumulativeTotalHours:    d.cumulative_total_hours    || 0,
        cumulativeWeekendShifts: d.cumulative_weekend_shifts || 0,
      };
    });

    const requestsFormatted = requests.map(r => ({
      id: r.id, doctorId: r.doctor_id, type: r.type, date: r.date,
      status: r.status, reason: r.reason, swapWithDoctorId: r.swap_with_doctor_id, createdAt: r.created_at
    }));

    const shiftsFormatted = shifts.map(s => ({
      id: s.id, date: s.date, doctorId: s.doctor_id, templateId: s.template_id,
      isPublicHoliday: Boolean(s.is_public_holiday)
    }));

    const stats: Record<string, any> = {};
    doctorsFormatted.forEach(doc => {
      stats[doc.id] = { totalHours: 0, weekends: 0, holidays: doc.cumulativeHolidayHours, lastWorkedDay: -2 };
    });
    for (const shift of shiftsFormatted) {
      const hours = shift.templateId === 'weekend' ? 24 : 16;
      const day   = new Date(shift.date).getDate();
      if (stats[shift.doctorId]) {
        stats[shift.doctorId].totalHours += hours;
        if (shift.templateId === 'weekend') stats[shift.doctorId].weekends++;
        if (shift.isPublicHoliday)           stats[shift.doctorId].holidays += hours;
        stats[shift.doctorId].lastWorkedDay = day;
      }
    }

    // Load fairness thresholds (snake_case from Postgres)
    const settings = await db
      .get('SELECT hour_diff_limit, weekend_diff_limit FROM fairness_settings WHERE department_id = ?', [departmentId])
      .catch(() => null);

    const approvedRequests = requestsFormatted.filter((r: any) => r.status === 'APPROVED');
    const report = RosterEngine.validateFairness(
      doctorsFormatted, stats, shiftsFormatted, approvedRequests, [],
      { maxHourDiff: settings?.hour_diff_limit ?? 24, maxWeekendDiff: settings?.weekend_diff_limit ?? 1 }
    );

    res.json(report);
  } catch (error: any) {
    logger.error({ err: error }, 'Get fairness report error');
    res.status(500).json({ error: 'Failed to generate fairness report' });
  }
});

// ── Get fairness settings ─────────────────────────────────────────────────────
app.get('/api/analytics/fairness-settings', authMiddleware, withDept, adminOnly, async (req, res) => {
  try {
    const departmentId = (req as any).departmentId;
    const row = await db.get(
      `SELECT hour_diff_limit, weekend_diff_limit, max_shifts_per_7_days,
              allow_consecutive_shifts, min_rest_days, fairness_history_mode
       FROM fairness_settings WHERE department_id = ?`,
      [departmentId]
    );
    const minRestDays = (row?.min_rest_days ?? null) !== null
      ? row.min_rest_days
      : (row?.allow_consecutive_shifts === 1 ? 0 : 1);

    res.json({
      hourLimit:        row?.hour_diff_limit    ?? 24,
      weekendLimit:     row?.weekend_diff_limit ?? 1,
      maxShiftsPer7Days: row?.max_shifts_per_7_days ?? 2,
      minRestDays,
      allowConsecutiveShifts: minRestDays === 0,
      fairnessHistoryMode: normalizeFairnessHistoryMode(row?.fairness_history_mode as string | undefined),
    });
  } catch (error: any) {
    logger.error({ err: error }, 'Get fairness settings error');
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

// ── Update fairness settings ──────────────────────────────────────────────────
app.put('/api/analytics/fairness-settings', authMiddleware, withDept, adminOnly, async (req, res) => {
  try {
    const departmentId = (req as any).departmentId;
    const { hourLimit, weekendLimit, maxShiftsPer7Days, minRestDays, allowConsecutiveShifts, fairnessHistoryMode: rawMode } = req.body;

    if (hourLimit == null || weekendLimit == null) {
      return res.status(400).json({ error: 'hourLimit and weekendLimit are required' });
    }

    const resolvedMinRestDays = (minRestDays !== undefined && minRestDays !== null)
      ? Math.max(0, Math.floor(minRestDays))
      : (allowConsecutiveShifts ? 0 : 1);
    const resolvedHistoryMode = normalizeFairnessHistoryMode(rawMode);

    const now = Date.now();
    await db.run(
      `UPDATE fairness_settings
       SET hour_diff_limit = ?, weekend_diff_limit = ?, max_shifts_per_7_days = ?,
           allow_consecutive_shifts = ?, min_rest_days = ?, fairness_history_mode = ?, updated_at = ?
       WHERE department_id = ?`,
      [
        hourLimit, weekendLimit, maxShiftsPer7Days ?? 2,
        resolvedMinRestDays === 0 ? 1 : 0,
        resolvedMinRestDays, resolvedHistoryMode, now, departmentId
      ]
    );

    res.json({
      success: true, hourLimit, weekendLimit,
      maxShiftsPer7Days: maxShiftsPer7Days ?? 2,
      minRestDays: resolvedMinRestDays,
      allowConsecutiveShifts: resolvedMinRestDays === 0,
      fairnessHistoryMode: resolvedHistoryMode,
    });
  } catch (error: any) {
    logger.error({ err: error }, 'Update fairness settings error');
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

db.waitForInit().then(() => {
  app.listen(PORT, () => {
    logger.info(`Analytics Service running on port ${PORT}`);
  });
}).catch(err => {
  logger.error({ err }, 'Failed to initialise database');
  process.exit(1);
});
