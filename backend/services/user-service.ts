import express from 'express';
import cors from 'cors';
import { Database } from '../shared/database.js';
import { authMiddleware, adminOnly, requireDepartment } from '../shared/auth.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.USER_SERVICE_PORT || 4004;
const db = Database.getInstance();
const withDept = requireDepartment(() => db);

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

// Get doctors in current department
app.get('/api/users/doctors', authMiddleware, withDept, async (req, res) => {
  try {
    const departmentId = (req as any).departmentId;
    const doctors = await db.all(
      `SELECT u.id, u.email, u.name, u.role, u.firm,
              u.cumulative_holiday_hours,
              u.cumulative_total_hours,
              u.cumulative_weekend_shifts,
              u.start_date
       FROM users u
       INNER JOIN user_departments ud ON ud.user_id = u.id AND ud.department_id = ?
       WHERE u.role IN ('DOCTOR', 'ADMIN')
       ORDER BY u.name`,
      [departmentId]
    );

    res.json(doctors.map(d => ({
      id: d.id,
      email: d.email,
      name: d.name,
      role: d.role,
      firm: d.firm,
      cumulativeHolidayHours: d.cumulative_holiday_hours || 0,
      cumulativeTotalHours: d.cumulative_total_hours || 0,
      cumulativeWeekendShifts: d.cumulative_weekend_shifts || 0,
      startDate: d.start_date || null
    })));
  } catch (error: any) {
    console.error('Get doctors error:', error);
    res.status(500).json({ error: 'Failed to fetch doctors' });
  }
});

// Get all users in current department (admin only)
app.get('/api/users', authMiddleware, withDept, adminOnly, async (req, res) => {
  try {
    const departmentId = (req as any).departmentId;
    const users = await db.all(
      `SELECT u.id, u.email, u.name, u.role, u.firm,
              u.cumulative_holiday_hours,
              u.cumulative_total_hours,
              u.cumulative_weekend_shifts,
              u.start_date
       FROM users u
       INNER JOIN user_departments ud ON ud.user_id = u.id AND ud.department_id = ?
       ORDER BY u.name`,
      [departmentId]
    );

    res.json(users.map(u => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      firm: u.firm,
      cumulativeHolidayHours: u.cumulative_holiday_hours || 0,
      cumulativeTotalHours: u.cumulative_total_hours || 0,
      cumulativeWeekendShifts: u.cumulative_weekend_shifts || 0,
      startDate: u.start_date || null
    })));
  } catch (error: any) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Add existing doctor (by email) to current department (admin only)
app.post('/api/users', authMiddleware, withDept, adminOnly, async (req, res) => {
  try {
    const departmentId = (req as any).departmentId;
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const existing = await db.get(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );
    if (!existing) {
      return res.status(404).json({ error: 'No registered user found with that email. Ask them to sign up first.' });
    }
    if (existing.role !== 'DOCTOR') {
      return res.status(400).json({ error: 'Only doctor accounts can be added to staffing.' });
    }

    const now = Date.now();

    await db.run(
      'INSERT OR IGNORE INTO user_departments (user_id, department_id, role_in_dept, joined_at) VALUES (?, ?, ?, ?)',
      [existing.id, departmentId, 'MEMBER', now]
    );

    const user = await db.get('SELECT * FROM users WHERE id = ?', [existing.id]);
    res.status(201).json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      firm: user.firm,
      cumulativeHolidayHours: user.cumulative_holiday_hours || 0,
      cumulativeTotalHours: user.cumulative_total_hours || 0,
      cumulativeWeekendShifts: user.cumulative_weekend_shifts || 0,
      startDate: user.start_date || null
    });
  } catch (error: any) {
    console.error('Add user error:', error);
    res.status(500).json({ error: 'Failed to add user', details: error.message });
  }
});

// Delete doctor (admin only)
app.delete('/api/users/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;

    // Don't allow deleting yourself
    const user = (req as any).user;
    if (user.userId === id) {
      return res.status(400).json({ error: 'Cannot delete yourself' });
    }

    await db.run('DELETE FROM users WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Update user (admin only)
app.patch('/api/users/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, firm, cumulativeHolidayHours } = req.body;

    const updates: string[] = [];
    const params: any[] = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name);
    }
    if (firm !== undefined) {
      updates.push('firm = ?');
      params.push(firm);
    }
    if (cumulativeHolidayHours !== undefined) {
      updates.push('cumulative_holiday_hours = ?');
      params.push(cumulativeHolidayHours);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('updated_at = ?');
    params.push(Date.now());
    params.push(id);

    await db.run(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    const user = await db.get('SELECT * FROM users WHERE id = ?', [id]);
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      firm: user.firm,
      cumulativeHolidayHours: user.cumulative_holiday_hours || 0
    });
  } catch (error: any) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

app.listen(PORT, () => {
  console.log(`👥 User Service running on port ${PORT}`);
});
