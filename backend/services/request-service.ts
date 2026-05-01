import express from 'express';
import cors from 'cors';
import { Database } from '../shared/database.js';
import { authMiddleware, adminOnly, requireDepartment } from '../shared/auth.js';
import { logger } from '../shared/logger.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.REQUEST_SERVICE_PORT || 4003;
const db = Database.getInstance();
const withDept = requireDepartment(() => db);

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:3000', credentials: true }));
app.use(express.json());

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  const dbOk = await db.ping();
  res.status(dbOk ? 200 : 503).json({ status: dbOk ? 'ok' : 'degraded', service: 'request' });
});

// ── Get all requests for current department ───────────────────────────────────
app.get('/api/requests', authMiddleware, withDept, async (req, res) => {
  try {
    const departmentId = (req as any).departmentId;
    const requests = await db.all(
      `SELECT id, doctor_id, type, date, status, reason, swap_with_doctor_id, created_at
       FROM requests WHERE department_id = ?
       ORDER BY created_at DESC`,
      [departmentId]
    );
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
    const { type, date, reason, swapWithDoctorId } = req.body;

    if (!type || !date) return res.status(400).json({ error: 'Type and date required' });

    const id = crypto.randomUUID();
    const now = Date.now();

    await db.run(
      `INSERT INTO requests (id, department_id, doctor_id, type, date, status, reason, swap_with_doctor_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?)`,
      [id, departmentId, user.userId, type, date, reason || null, swapWithDoctorId || null, now, now]
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
