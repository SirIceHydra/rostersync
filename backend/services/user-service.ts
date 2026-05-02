import express from 'express';
import cors from 'cors';
import { Database } from '../shared/database.js';
import { authMiddleware, adminOnly, requireDepartment } from '../shared/auth.js';
import { getPublishedYearRollupForDepartment, normalizeFairnessHistoryMode, type FairnessYearRollup } from '../shared/fairnessRollup.js';
import { logger } from '../shared/logger.js';
import { corsOrigin } from '../shared/corsOrigin.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.USER_SERVICE_PORT || 4004;
const db = Database.getInstance();
const withDept = requireDepartment(() => db);

app.use(cors({ origin: corsOrigin(), credentials: true }));
app.use(express.json());

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  const dbOk = await db.ping();
  res.status(dbOk ? 200 : 503).json({ status: dbOk ? 'ok' : 'degraded', service: 'user' });
});

// ── Get doctors in department ─────────────────────────────────────────────────
app.get('/api/users/doctors', authMiddleware, withDept, async (req, res) => {
  try {
    const departmentId = (req as any).departmentId;
    const yearParam = req.query.schedulingYear;
    const schedulingYear = yearParam !== undefined && yearParam !== ''
      ? parseInt(String(yearParam), 10) : null;

    // Use plain snake_case — Postgres lowercases camelCase aliases
    const fairnessRow = await db
      .get('SELECT fairness_history_mode FROM fairness_settings WHERE department_id = ?', [departmentId])
      .catch(() => null);
    const fairnessHistoryMode = normalizeFairnessHistoryMode(fairnessRow?.fairness_history_mode as string | undefined);

    const doctors = await db.all(
      `SELECT u.id, u.email, u.name, u.role, u.firm,
              u.cumulative_holiday_hours, u.cumulative_total_hours,
              u.cumulative_weekend_shifts, u.start_date, u.workload_start_mode
       FROM users u
       INNER JOIN user_departments ud ON ud.user_id = u.id AND ud.department_id = ?
       WHERE u.role IN ('DOCTOR','ADMIN')
       ORDER BY u.name`,
      [departmentId]
    );

    let yearRollup: Map<string, FairnessYearRollup> | null = null;
    if (fairnessHistoryMode === 'CALENDAR_YEAR' && schedulingYear !== null && !Number.isNaN(schedulingYear)) {
      yearRollup = await getPublishedYearRollupForDepartment(db, departmentId, schedulingYear);
    }

    res.json(doctors.map(d => {
      const lifetimeHoliday  = d.cumulative_holiday_hours  || 0;
      const lifetimeTotal    = d.cumulative_total_hours    || 0;
      const lifetimeWeekends = d.cumulative_weekend_shifts || 0;
      const base: Record<string, unknown> = {
        id: d.id, email: d.email, name: d.name, role: d.role, firm: d.firm,
        cumulativeHolidayHours:  lifetimeHoliday,
        cumulativeTotalHours:    lifetimeTotal,
        cumulativeWeekendShifts: lifetimeWeekends,
        startDate: d.start_date || null,
        workloadStartMode: d.workload_start_mode || 'STAGGERED',
        fairnessHistoryMode,
      };

      if (yearRollup && schedulingYear !== null) {
        const r = yearRollup.get(d.id) ?? { totalHours: 0, weekendShifts: 0, holidayHours: 0 };
        base.lifetimeTotalHours      = lifetimeTotal;
        base.lifetimeWeekendShifts   = lifetimeWeekends;
        base.lifetimeHolidayHours    = lifetimeHoliday;
        base.schedulingYear          = schedulingYear;
        base.schedulingTotalHours    = r.totalHours;
        base.schedulingWeekendShifts = r.weekendShifts;
        base.schedulingHolidayHours  = r.holidayHours;
        base.cumulativeTotalHours    = r.totalHours;
        base.cumulativeWeekendShifts = r.weekendShifts;
        base.cumulativeHolidayHours  = r.holidayHours;
      }
      return base;
    }));
  } catch (error: any) {
    logger.error({ err: error }, 'Get doctors error');
    res.status(500).json({ error: 'Failed to fetch doctors' });
  }
});

// ── Get all users in department (admin) ───────────────────────────────────────
app.get('/api/users', authMiddleware, withDept, adminOnly, async (req, res) => {
  try {
    const departmentId = (req as any).departmentId;
    const users = await db.all(
      `SELECT u.id, u.email, u.name, u.role, u.firm,
              u.cumulative_holiday_hours, u.cumulative_total_hours,
              u.cumulative_weekend_shifts, u.start_date, u.workload_start_mode
       FROM users u
       INNER JOIN user_departments ud ON ud.user_id = u.id AND ud.department_id = ?
       ORDER BY u.name`,
      [departmentId]
    );
    res.json(users.map(u => ({
      id: u.id, email: u.email, name: u.name, role: u.role, firm: u.firm,
      cumulativeHolidayHours:  u.cumulative_holiday_hours  || 0,
      cumulativeTotalHours:    u.cumulative_total_hours    || 0,
      cumulativeWeekendShifts: u.cumulative_weekend_shifts || 0,
      startDate: u.start_date || null,
      workloadStartMode: u.workload_start_mode || 'STAGGERED',
    })));
  } catch (error: any) {
    logger.error({ err: error }, 'Get users error');
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// ── Add existing doctor by email (admin) ──────────────────────────────────────
app.post('/api/users', authMiddleware, withDept, adminOnly, async (req, res) => {
  try {
    const departmentId = (req as any).departmentId;
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const existing = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    if (!existing) return res.status(404).json({ error: 'No registered user found with that email. Ask them to sign up first.' });
    if (existing.role !== 'DOCTOR') return res.status(400).json({ error: 'Only doctor accounts can be added to staffing.' });

    const now = Date.now();
    // ON CONFLICT DO NOTHING is the Postgres equivalent of INSERT OR IGNORE
    await db.run(
      'INSERT INTO user_departments (user_id, department_id, role_in_dept, joined_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING',
      [existing.id, departmentId, 'MEMBER', now]
    );

    const user = await db.get('SELECT * FROM users WHERE id = ?', [existing.id]);
    res.status(201).json({
      id: user.id, email: user.email, name: user.name, role: user.role, firm: user.firm,
      cumulativeHolidayHours:  user.cumulative_holiday_hours  || 0,
      cumulativeTotalHours:    user.cumulative_total_hours    || 0,
      cumulativeWeekendShifts: user.cumulative_weekend_shifts || 0,
      startDate: user.start_date || null,
      workloadStartMode: user.workload_start_mode || 'STAGGERED',
    });
  } catch (error: any) {
    logger.error({ err: error }, 'Add user error');
    res.status(500).json({ error: 'Failed to add user', details: error.message });
  }
});

// ── Delete doctor (admin) ─────────────────────────────────────────────────────
app.delete('/api/users/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;
    if (user.userId === id) return res.status(400).json({ error: 'Cannot delete yourself' });
    await db.run('DELETE FROM users WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, 'Delete user error');
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// ── Update user (admin) ───────────────────────────────────────────────────────
app.patch('/api/users/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, firm, cumulativeHolidayHours, workloadStartMode } = req.body;

    const updates: string[] = [];
    const params: any[] = [];

    if (name !== undefined)                 { updates.push('name = ?');                      params.push(name); }
    if (firm !== undefined)                 { updates.push('firm = ?');                      params.push(firm); }
    if (cumulativeHolidayHours !== undefined) { updates.push('cumulative_holiday_hours = ?'); params.push(cumulativeHolidayHours); }
    if (workloadStartMode !== undefined) {
      if (!['IMMEDIATE','STAGGERED','NEXT_MONTH'].includes(workloadStartMode)) {
        return res.status(400).json({ error: 'workloadStartMode must be IMMEDIATE, STAGGERED, or NEXT_MONTH' });
      }
      updates.push('workload_start_mode = ?');
      params.push(workloadStartMode);
    }
    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

    updates.push('updated_at = ?');
    params.push(Date.now(), id);

    await db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);

    const user = await db.get('SELECT * FROM users WHERE id = ?', [id]);
    res.json({
      id: user.id, email: user.email, name: user.name, role: user.role, firm: user.firm,
      cumulativeHolidayHours: user.cumulative_holiday_hours || 0,
      workloadStartMode: user.workload_start_mode || 'STAGGERED',
    });
  } catch (error: any) {
    logger.error({ err: error }, 'Update user error');
    res.status(500).json({ error: 'Failed to update user' });
  }
});

db.waitForInit().then(() => {
  app.listen(PORT, () => logger.info(`User Service running on port ${PORT}`));
}).catch(err => {
  logger.error({ err }, 'Failed to initialise database');
  process.exit(1);
});
