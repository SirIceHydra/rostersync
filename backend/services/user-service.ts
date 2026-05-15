import express from 'express';
import cors from 'cors';
import { Database } from '../shared/database.js';
import { authMiddleware, adminOnly, requireDepartment } from '../shared/auth.js';
import { getPublishedYearRollupForDepartment, normalizeFairnessHistoryMode, type FairnessYearRollup } from '../shared/fairnessRollup.js';
import { logger } from '../shared/logger.js';
import { corsOrigin } from '../shared/corsOrigin.js';
import dotenv from 'dotenv';
import { initializeSubscriptionCheckout } from '../shared/paystack.js';
import {
  confirmDepartmentSubscription,
  createPendingDepartmentSubscription,
  getDepartmentSubscriptionManageLink,
  getDepartmentSubscriptionStatus,
} from '../shared/subscriptionService.js';
import { z } from 'zod';

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
              u.cumulative_weekend_shifts, u.start_date, u.workload_start_mode,
              u.is_placeholder
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
        isPlaceholder: !!d.is_placeholder,
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

// ── Create placeholder doctor (admin) ─────────────────────────────────────────
app.post('/api/users/placeholder', authMiddleware, withDept, adminOnly, async (req, res) => {
  try {
    const departmentId = (req as any).departmentId;
    const { name, firm } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });

    const id = crypto.randomUUID();
    const now = Date.now();
    const fakeEmail = `placeholder_${id}@placeholder.internal`;

    await db.run(
      `INSERT INTO users (id, email, password_hash, name, role, firm,
         cumulative_holiday_hours, cumulative_total_hours, cumulative_weekend_shifts,
         start_date, workload_start_mode, is_placeholder, created_at, updated_at)
       VALUES (?, ?, '', ?, 'DOCTOR', ?, 0, 0, 0, ?, 'STAGGERED', TRUE, ?, ?)`,
      [id, fakeEmail, name.trim(), firm?.trim() || '', now, now, now]
    );
    await db.run(
      'INSERT INTO user_departments (user_id, department_id, role_in_dept, joined_at) VALUES (?, ?, ?, ?)',
      [id, departmentId, 'MEMBER', now]
    );

    res.status(201).json({
      id, email: fakeEmail, name: name.trim(), role: 'DOCTOR', firm: firm?.trim() || '',
      cumulativeHolidayHours: 0, cumulativeTotalHours: 0, cumulativeWeekendShifts: 0,
      startDate: now, workloadStartMode: 'STAGGERED', isPlaceholder: true,
    });
  } catch (error: any) {
    logger.error({ err: error }, 'Create placeholder error');
    res.status(500).json({ error: 'Failed to create placeholder', details: error.message });
  }
});

// ── Link placeholder to a real user account (admin) ───────────────────────────
app.post('/api/users/:id/link', authMiddleware, withDept, adminOnly, async (req, res) => {
  try {
    const departmentId = (req as any).departmentId;
    const { id: placeholderId } = req.params;
    const { realUserId } = req.body;
    if (!realUserId) return res.status(400).json({ error: 'realUserId is required' });

    const placeholder = await db.get(
      'SELECT * FROM users WHERE id = ? AND is_placeholder = TRUE', [placeholderId]
    );
    if (!placeholder) return res.status(404).json({ error: 'Placeholder not found' });

    const realUser = await db.get('SELECT * FROM users WHERE id = ? AND is_placeholder IS NOT TRUE', [realUserId]);
    if (!realUser) return res.status(404).json({ error: 'Real user not found' });

    const now = Date.now();

    // Transfer cumulative history to the real user
    await db.run(
      `UPDATE users SET
         cumulative_total_hours    = cumulative_total_hours    + ?,
         cumulative_weekend_shifts = cumulative_weekend_shifts + ?,
         cumulative_holiday_hours  = cumulative_holiday_hours  + ?,
         updated_at = ?
       WHERE id = ?`,
      [
        placeholder.cumulative_total_hours    || 0,
        placeholder.cumulative_weekend_shifts || 0,
        placeholder.cumulative_holiday_hours  || 0,
        now, realUserId
      ]
    );

    // Re-point all shifts from placeholder to real user
    await db.run('UPDATE shifts SET doctor_id = ? WHERE doctor_id = ?', [realUserId, placeholderId]);

    // Re-point all requests from placeholder to real user
    await db.run('UPDATE requests SET doctor_id = ? WHERE doctor_id = ?', [realUserId, placeholderId]);

    // Add real user to department if not already there
    await db.run(
      'INSERT INTO user_departments (user_id, department_id, role_in_dept, joined_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING',
      [realUserId, departmentId, 'MEMBER', now]
    );

    // Mark placeholder as linked, then remove it
    await db.run('DELETE FROM user_departments WHERE user_id = ?', [placeholderId]);
    await db.run('DELETE FROM users WHERE id = ?', [placeholderId]);

    const updated = await db.get('SELECT * FROM users WHERE id = ?', [realUserId]);
    res.json({
      id: updated.id, email: updated.email, name: updated.name, role: updated.role, firm: updated.firm,
      cumulativeHolidayHours:  updated.cumulative_holiday_hours  || 0,
      cumulativeTotalHours:    updated.cumulative_total_hours    || 0,
      cumulativeWeekendShifts: updated.cumulative_weekend_shifts || 0,
      startDate: updated.start_date || null,
      workloadStartMode: updated.workload_start_mode || 'STAGGERED',
      isPlaceholder: false,
    });
  } catch (error: any) {
    logger.error({ err: error }, 'Link placeholder error');
    res.status(500).json({ error: 'Failed to link placeholder', details: error.message });
  }
});

// ── Get unlinked real doctors (not yet in this department, for linking) ────────
app.get('/api/users/unlinked', authMiddleware, withDept, adminOnly, async (req, res) => {
  try {
    const departmentId = (req as any).departmentId;
    // Real (non-placeholder) doctors with no membership in this department
    const rows = await db.all(
      `SELECT u.id, u.name, u.email, u.firm FROM users u
       WHERE u.role = 'DOCTOR'
         AND (u.is_placeholder IS NULL OR u.is_placeholder = FALSE)
         AND u.id NOT IN (
           SELECT user_id FROM user_departments WHERE department_id = ?
         )
       ORDER BY u.name`,
      [departmentId]
    );
    res.json(rows.map(r => ({ id: r.id, name: r.name, email: r.email, firm: r.firm })));
  } catch (error: any) {
    logger.error({ err: error }, 'Get unlinked users error');
    res.status(500).json({ error: 'Failed to fetch unlinked users' });
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

// ── Billing (Paystack subscriptions) ─────────────────────────────────────────
const SubscribeInitializeSchema = z.object({
  planCode: z.string().min(1),
});

const SubscribeConfirmSchema = z.object({
  reference: z.string().min(1),
});

app.get('/api/billing/plans', authMiddleware, adminOnly, withDept, async (_req, res) => {
  try {
    const rows = await db.all(
      `SELECT id, slug, paystack_plan_code, name, description, billing_interval,
              amount_cents, currency, display_order
       FROM subscription_plans
       WHERE is_active = TRUE
       ORDER BY display_order ASC, name ASC`
    );
    res.json({
      plans: rows.map((r: any) => ({
        id: r.id,
        slug: r.slug,
        planCode: r.paystack_plan_code,
        name: r.name,
        description: r.description,
        amount: r.amount_cents,
        currency: r.currency,
        interval: r.billing_interval,
        displayOrder: r.display_order,
      })),
    });
  } catch (error: any) {
    logger.error({ err: error }, 'List subscription plans error');
    res.status(500).json({ error: 'Could not load subscription plans' });
  }
});

/** @deprecated Use GET /api/billing/plans */
app.get('/api/billing/plan', authMiddleware, adminOnly, withDept, async (_req, res) => {
  try {
    const row = await db.get(
      `SELECT id, slug, paystack_plan_code, name, description, billing_interval,
              amount_cents, currency, display_order
       FROM subscription_plans
       WHERE is_active = TRUE
       ORDER BY display_order ASC
       LIMIT 1`
    );
    if (!row) return res.status(404).json({ error: 'No subscription plans configured' });
    res.json({
      planCode: row.paystack_plan_code,
      name: row.name,
      amount: row.amount_cents,
      currency: row.currency,
      interval: row.billing_interval,
    });
  } catch (error: any) {
    logger.error({ err: error }, 'Fetch subscription plan error');
    res.status(500).json({ error: 'Could not load subscription plan' });
  }
});

app.post('/api/billing/subscribe/initialize', authMiddleware, adminOnly, withDept, async (req, res) => {
  try {
    const parsed = SubscribeInitializeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'planCode is required' });
    }

    const planRow = await db.get(
      'SELECT id, paystack_plan_code FROM subscription_plans WHERE paystack_plan_code = ? AND is_active = TRUE',
      [parsed.data.planCode]
    );
    if (!planRow) {
      return res.status(400).json({ error: 'Unknown or inactive subscription plan' });
    }

    const user = (req as any).user;
    const departmentId = (req as any).departmentId as string;
    const reference = `rs_sub_${departmentId.replace(/-/g, '').slice(0, 12)}_${Date.now()}`;

    const data = await initializeSubscriptionCheckout({
      email: user.email,
      planCode: planRow.paystack_plan_code,
      reference,
      metadata: {
        department_id: departmentId,
        user_id: user.userId,
        plan_id: planRow.id,
        plan_code: planRow.paystack_plan_code,
      },
    });

    const subscriptionId = await createPendingDepartmentSubscription(db, {
      departmentId,
      planId: planRow.id,
      subscribedByUserId: user.userId,
      checkoutReference: data.reference,
    });

    res.json({
      accessCode: data.access_code,
      authorizationUrl: data.authorization_url,
      reference: data.reference,
      planCode: planRow.paystack_plan_code,
      subscriptionId,
    });
  } catch (error: any) {
    logger.error({ err: error }, 'Initialize subscription error');
    res.status(502).json({ error: error.message || 'Could not start checkout' });
  }
});

app.post('/api/billing/subscribe/confirm', authMiddleware, adminOnly, withDept, async (req, res) => {
  try {
    const parsed = SubscribeConfirmSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'reference is required' });
    }

    const user = (req as any).user;
    const departmentId = (req as any).departmentId as string;

    const result = await confirmDepartmentSubscription(db, {
      departmentId,
      reference: parsed.data.reference,
      userId: user.userId,
    });

    res.json(result);
  } catch (error: any) {
    logger.error({ err: error }, 'Confirm subscription error');
    res.status(400).json({ error: error.message || 'Could not confirm subscription' });
  }
});

app.get('/api/billing/status', authMiddleware, withDept, async (req, res) => {
  try {
    const departmentId = (req as any).departmentId as string;
    const status = await getDepartmentSubscriptionStatus(db, departmentId);
    res.json(status);
  } catch (error: any) {
    logger.error({ err: error }, 'Subscription status error');
    res.status(500).json({ error: 'Could not load subscription status' });
  }
});

app.post('/api/billing/subscribe/manage-link', authMiddleware, adminOnly, withDept, async (req, res) => {
  try {
    const departmentId = (req as any).departmentId as string;
    const link = await getDepartmentSubscriptionManageLink(db, departmentId);
    res.json({ link });
  } catch (error: any) {
    logger.error({ err: error }, 'Subscription manage link error');
    res.status(400).json({ error: error.message || 'Could not open subscription management' });
  }
});

db.waitForInit().then(() => {
  app.listen(PORT, () => logger.info(`User Service running on port ${PORT}`));
}).catch(err => {
  logger.error({ err }, 'Failed to initialise database');
  process.exit(1);
});
