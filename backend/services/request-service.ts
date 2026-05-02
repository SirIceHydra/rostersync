import express from 'express';
import cors from 'cors';
import { Database } from '../shared/database.js';
import { authMiddleware, adminOnly, requireDepartment } from '../shared/auth.js';
import { logger } from '../shared/logger.js';
import { corsOrigin } from '../shared/corsOrigin.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.REQUEST_SERVICE_PORT || 4003;
const db = Database.getInstance();
const withDept = requireDepartment(() => db);

app.use(cors({ origin: corsOrigin(), credentials: true }));
app.use(express.json());

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  const dbOk = await db.ping();
  res.status(dbOk ? 200 : 503).json({ status: dbOk ? 'ok' : 'degraded', service: 'request' });
});

// ── Approved schedule (no reasons) — for roster/transparency while keeping leave notes private ──
app.get('/api/requests/approved-schedule', authMiddleware, withDept, async (req, res) => {
  try {
    const departmentId = (req as any).departmentId;
    const start = String(req.query.start ?? '').trim();
    const end = String(req.query.end ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      return res.status(400).json({ error: 'Query params start and end are required (YYYY-MM-DD)' });
    }
    const rows = await db.all(
      `SELECT date, type, doctor_id
       FROM requests
       WHERE department_id = ? AND status = 'APPROVED' AND date >= ? AND date <= ?
       ORDER BY date ASC, doctor_id ASC`,
      [departmentId, start, end]
    );
    res.json({
      entries: rows.map((r: any) => ({
        date: r.date,
        type: r.type,
        doctorId: r.doctor_id,
      })),
    });
  } catch (error: any) {
    logger.error({ err: error }, 'Approved schedule error');
    res.status(500).json({ error: 'Failed to fetch approved schedule' });
  }
});

// ── List requests: admins see the department queue; doctors only see their own ──
app.get('/api/requests', authMiddleware, withDept, async (req, res) => {
  try {
    const departmentId = (req as any).departmentId;
    const user = (req as any).user as { userId?: string; role?: string };
    const isAdmin = user?.role === 'ADMIN';
    const sql = isAdmin
      ? `SELECT id, doctor_id, type, date, status, reason, swap_with_doctor_id, created_at
         FROM requests WHERE department_id = ?
         ORDER BY created_at DESC`
      : `SELECT id, doctor_id, type, date, status, reason, swap_with_doctor_id, created_at
         FROM requests WHERE department_id = ? AND doctor_id = ?
         ORDER BY created_at DESC`;
    const params = isAdmin ? [departmentId] : [departmentId, user.userId];
    const requests = await db.all(sql, params);
    res.json(requests.map(r => ({
      id: r.id, doctorId: r.doctor_id, type: r.type, date: r.date,
      status: r.status, reason: r.reason,
      swapWithDoctorId: r.swap_with_doctor_id, createdAt: r.created_at,
    })));
  } catch (error: any) {
    logger.error({ err: error }, 'Get requests error');
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

// ── Create request ────────────────────────────────────────────────────────────
app.post('/api/requests', authMiddleware, withDept, async (req, res) => {
  try {
    const user = (req as any).user;
    const departmentId = (req as any).departmentId;
    const { type, date, reason, swapWithDoctorId, doctorId: onBehalfOf } = req.body;

    if (!type || !date) return res.status(400).json({ error: 'Type and date required' });

    // Admins may submit on behalf of another doctor in the same department
    let targetDoctorId = user.userId;
    if (onBehalfOf && user.role === 'ADMIN') {
      const member = await db.get(
        'SELECT user_id FROM user_departments WHERE user_id = ? AND department_id = ?',
        [onBehalfOf, departmentId]
      );
      if (!member) return res.status(400).json({ error: 'Doctor not found in this department' });
      targetDoctorId = onBehalfOf;
    }

    const id = crypto.randomUUID();
    const now = Date.now();

    await db.run(
      `INSERT INTO requests (id, department_id, doctor_id, type, date, status, reason, swap_with_doctor_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?)`,
      [id, departmentId, targetDoctorId, type, date, reason || null, swapWithDoctorId || null, now, now]
    );

    const request = await db.get('SELECT * FROM requests WHERE id = ?', [id]);
    res.status(201).json({
      id: request.id, doctorId: request.doctor_id, type: request.type, date: request.date,
      status: request.status, reason: request.reason,
      swapWithDoctorId: request.swap_with_doctor_id, createdAt: request.created_at,
    });
  } catch (error: any) {
    logger.error({ err: error }, 'Create request error');
    res.status(500).json({ error: 'Failed to create request', details: error.message });
  }
});

// ── Update request status (admin) ─────────────────────────────────────────────
app.patch('/api/requests/:id/status', authMiddleware, withDept, adminOnly, async (req, res) => {
  try {
    const departmentId = (req as any).departmentId;
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !['PENDING', 'APPROVED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ error: 'Valid status required' });
    }

    await db.run(
      'UPDATE requests SET status = ?, updated_at = ? WHERE id = ? AND department_id = ?',
      [status, Date.now(), id, departmentId]
    );

    const request = await db.get('SELECT * FROM requests WHERE id = ?', [id]);
    if (!request) return res.status(404).json({ error: 'Request not found' });

    res.json({
      id: request.id, doctorId: request.doctor_id, type: request.type, date: request.date,
      status: request.status, reason: request.reason,
      swapWithDoctorId: request.swap_with_doctor_id, createdAt: request.created_at,
    });
  } catch (error: any) {
    logger.error({ err: error }, 'Update request error');
    res.status(500).json({ error: 'Failed to update request' });
  }
});

db.waitForInit().then(() => {
  app.listen(PORT, () => logger.info(`Request Service running on port ${PORT}`));
}).catch(err => {
  logger.error({ err }, 'Failed to initialise database');
  process.exit(1);
});
