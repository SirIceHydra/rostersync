import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import { Database } from '../shared/database.js';
import { generateToken, verifyToken, authMiddleware as sharedAuthMiddleware, adminOnly, requireDepartment } from '../shared/auth.js';
import { generateUniqueDepartmentCode } from '../shared/departmentCode.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.AUTH_SERVICE_PORT || 4001;
const db = Database.getInstance();
const withDept = requireDepartment(() => db);

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

async function getDepartmentsForUser(userId: string): Promise<{ id: string; code: string; name: string | null }[]> {
  const rows = await db.all(
    `SELECT d.id, d.code, d.name FROM departments d
     INNER JOIN user_departments ud ON ud.department_id = d.id
     WHERE ud.user_id = ? ORDER BY ud.joined_at`,
    [userId]
  );
  return rows.map((r: any) => ({ id: r.id, code: r.code, name: r.name || null }));
}

// Register endpoint
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name, role, firm, departmentName } = req.body;

    if (!email || !password || !name || !role) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (role !== 'ADMIN' && role !== 'DOCTOR') {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const existing = await db.get('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) {
      return res.status(409).json({ error: 'User already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const id = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();

    await db.run(
      `INSERT INTO users (id, email, password_hash, name, role, firm, cumulative_holiday_hours, cumulative_total_hours, cumulative_weekend_shifts, start_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?)`,
      [id, email, passwordHash, name, role, firm || null, now, now, now]
    );

    let departments: { id: string; code: string; name: string | null }[] = [];

    if (role === 'ADMIN') {
      const deptId = `dept-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const code = await generateUniqueDepartmentCode(db);
      const name = departmentName || `Department ${code}`;
      await db.run(
        'INSERT INTO departments (id, code, name, created_at, created_by) VALUES (?, ?, ?, ?, ?)',
        [deptId, code, name, now, id]
      );
      await db.run(
        'INSERT INTO user_departments (user_id, department_id, role_in_dept, joined_at) VALUES (?, ?, ?, ?)',
        [id, deptId, 'ADMIN', now]
      );
      await db.run(
        'INSERT INTO fairness_settings (department_id, hour_diff_limit, weekend_diff_limit, created_at, updated_at) VALUES (?, 24, 1, ?, ?)',
        [deptId, now, now]
      );
      departments = [{ id: deptId, code, name }];
    }

    const token = generateToken({ userId: id, email, role });

    res.status(201).json({
      user: {
        id,
        email,
        name,
        role,
        firm: firm || null,
        cumulativeHolidayHours: 0,
        cumulativeTotalHours: 0,
        cumulativeWeekendShifts: 0,
        startDate: now
      },
      token,
      department: role === 'ADMIN' ? departments[0] : null,
      departments
    });
  } catch (error: any) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed', details: error.message });
  }
});

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const departments = await getDepartmentsForUser(user.id);
    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role
    });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        firm: user.firm,
        cumulativeHolidayHours: user.cumulative_holiday_hours || 0,
        cumulativeTotalHours: user.cumulative_total_hours || 0,
        cumulativeWeekendShifts: user.cumulative_weekend_shifts || 0,
        startDate: user.start_date || null
      },
      token,
      departments
    });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed', details: error.message });
  }
});

// Verify token endpoint
app.get('/api/auth/verify', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    const payload = verifyToken(token);
    if (!payload) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const user = await db.get('SELECT * FROM users WHERE id = ?', [payload.userId]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const departments = await getDepartmentsForUser(user.id);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        firm: user.firm,
        cumulativeHolidayHours: user.cumulative_holiday_hours || 0,
        cumulativeTotalHours: user.cumulative_total_hours || 0,
        cumulativeWeekendShifts: user.cumulative_weekend_shifts || 0,
        startDate: user.start_date || null
      },
      departments
    });
  } catch (error: any) {
    console.error('Verify error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// Optional auth middleware for protected routes (kept for backwards compatibility)
function authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const payload = verifyToken(authHeader.substring(7));
  if (!payload) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  (req as any).userId = payload.userId;
  next();
}

// Join a department by code (doctor or admin can join another department)
// For doctors, this now creates a join request that admins must approve.
app.post('/api/auth/join-department', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { code } = req.body;

    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Department code required' });
    }

    const trimmed = code.trim().toUpperCase();
    const dept = await db.get('SELECT id, code, name FROM departments WHERE code = ?', [trimmed]);
    if (!dept) {
      return res.status(404).json({ error: 'Invalid department code' });
    }

    const existing = await db.get(
      'SELECT 1 FROM user_departments WHERE user_id = ? AND department_id = ?',
      [userId, dept.id]
    );
    if (existing) {
      // Already a member – just return the department info
      return res.json({ department: { id: dept.id, code: dept.code, name: dept.name || null }, alreadyMember: true });
    }

    const now = Date.now();
    // Check for existing pending request
    const pending = await db.get(
      'SELECT id, status FROM department_join_requests WHERE user_id = ? AND department_id = ? AND status = ?',
      [userId, dept.id, 'PENDING']
    );
    if (pending) {
      return res.json({
        department: { id: dept.id, code: dept.code, name: dept.name || null },
        pending: true
      });
    }

    const reqId = `join-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    await db.run(
      'INSERT INTO department_join_requests (id, user_id, department_id, status, created_at) VALUES (?, ?, ?, ?, ?)',
      [reqId, userId, dept.id, 'PENDING', now]
    );

    res.json({
      department: { id: dept.id, code: dept.code, name: dept.name || null },
      pending: true
    });
  } catch (error: any) {
    console.error('Join department error:', error);
    res.status(500).json({ error: 'Failed to join department' });
  }
});

// List departments the user belongs to
app.get('/api/auth/departments', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const departments = await getDepartmentsForUser(userId);
    res.json({ departments });
  } catch (error: any) {
    console.error('Get departments error:', error);
    res.status(500).json({ error: 'Failed to get departments' });
  }
});

// List pending join requests for the current department (admin only)
app.get('/api/auth/join-requests', sharedAuthMiddleware, withDept, adminOnly, async (req, res) => {
  try {
    const departmentId = (req as any).departmentId;
    const rows = await db.all(
      `SELECT r.id, r.user_id, r.created_at, u.email, u.name
       FROM department_join_requests r
       JOIN users u ON u.id = r.user_id
       WHERE r.department_id = ? AND r.status = 'PENDING'
       ORDER BY r.created_at`,
      [departmentId]
    );
    res.json({
      requests: rows.map((r: any) => ({
        id: r.id,
        userId: r.user_id,
        email: r.email,
        name: r.name,
        createdAt: r.created_at
      }))
    });
  } catch (error: any) {
    console.error('Get join requests error:', error);
    res.status(500).json({ error: 'Failed to get join requests' });
  }
});

// Approve a join request (admin only)
app.post('/api/auth/join-requests/:id/approve', sharedAuthMiddleware, withDept, adminOnly, async (req, res) => {
  try {
    const departmentId = (req as any).departmentId;
    const admin = (req as any).user;
    const { id } = req.params;

    const requestRow = await db.get(
      'SELECT * FROM department_join_requests WHERE id = ? AND department_id = ?',
      [id, departmentId]
    );
    if (!requestRow || requestRow.status !== 'PENDING') {
      return res.status(404).json({ error: 'Join request not found or already handled' });
    }

    const now = Date.now();
    await db.run(
      'UPDATE department_join_requests SET status = ?, decided_at = ?, decided_by = ? WHERE id = ?',
      ['APPROVED', now, admin.userId, id]
    );
    await db.run(
      'INSERT OR IGNORE INTO user_departments (user_id, department_id, role_in_dept, joined_at) VALUES (?, ?, ?, ?)',
      [requestRow.user_id, departmentId, 'MEMBER', now]
    );

    const user = await db.get('SELECT * FROM users WHERE id = ?', [requestRow.user_id]);
    res.json({
      success: true,
      user: user && {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        firm: user.firm,
        cumulativeHolidayHours: user.cumulative_holiday_hours || 0,
        cumulativeTotalHours: user.cumulative_total_hours || 0,
        cumulativeWeekendShifts: user.cumulative_weekend_shifts || 0,
        startDate: user.start_date || null
      }
    });
  } catch (error: any) {
    console.error('Approve join request error:', error);
    res.status(500).json({ error: 'Failed to approve join request' });
  }
});

// Reject a join request (admin only)
app.post('/api/auth/join-requests/:id/reject', sharedAuthMiddleware, withDept, adminOnly, async (req, res) => {
  try {
    const departmentId = (req as any).departmentId;
    const admin = (req as any).user;
    const { id } = req.params;

    const requestRow = await db.get(
      'SELECT * FROM department_join_requests WHERE id = ? AND department_id = ?',
      [id, departmentId]
    );
    if (!requestRow || requestRow.status !== 'PENDING') {
      return res.status(404).json({ error: 'Join request not found or already handled' });
    }

    const now = Date.now();
    await db.run(
      'UPDATE department_join_requests SET status = ?, decided_at = ?, decided_by = ? WHERE id = ?',
      ['REJECTED', now, admin.userId, id]
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error('Reject join request error:', error);
    res.status(500).json({ error: 'Failed to reject join request' });
  }
});

app.listen(PORT, () => {
  console.log(`🔐 Auth Service running on port ${PORT}`);
});
