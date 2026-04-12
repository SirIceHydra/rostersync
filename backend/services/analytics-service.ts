import express from 'express';
import cors from 'cors';
import { Database } from '../shared/database.js';
import { authMiddleware, adminOnly, requireDepartment } from '../shared/auth.js';
import { RosterEngine } from '../shared/rosterEngine.js';
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

// Get fairness report for a roster
app.get('/api/analytics/roster/:year/:month/fairness', authMiddleware, withDept, async (req, res) => {
  try {
    const departmentId = (req as any).departmentId;
    const year = parseInt(req.params.year);
    const month = parseInt(req.params.month);

    // Get roster for this department
    const roster = await db.get(
      'SELECT * FROM rosters WHERE department_id = ? AND year = ? AND month = ?',
      [departmentId, year, month]
    );

    if (!roster) {
      return res.status(404).json({ error: 'Roster not found' });
    }

    // Get shifts
    const shifts = await db.all(
      'SELECT * FROM shifts WHERE roster_id = ?',
      [roster.id]
    );

    // Get doctors in this department
    const doctors = await db.all(
      `SELECT u.id, u.email, u.name, u.role, u.firm, u.cumulative_holiday_hours 
       FROM users u
       INNER JOIN user_departments ud ON ud.user_id = u.id AND ud.department_id = ?
       WHERE u.role IN ('DOCTOR', 'ADMIN')`,
      [departmentId]
    );

    // Get requests for this department
    const requests = await db.all(
      `SELECT id, doctor_id, type, date, status, reason, swap_with_doctor_id, created_at
       FROM requests WHERE department_id = ?`,
      [departmentId]
    );

    // Convert to expected format
    const doctorsFormatted = doctors.map(d => ({
      id: d.id,
      email: d.email,
      name: d.name,
      role: d.role,
      firm: d.firm,
      cumulativeHolidayHours: d.cumulative_holiday_hours || 0
    }));

    const requestsFormatted = requests.map(r => ({
      id: r.id,
      doctorId: r.doctor_id,
      type: r.type,
      date: r.date,
      status: r.status,
      reason: r.reason,
      swapWithDoctorId: r.swap_with_doctor_id,
      createdAt: r.created_at
    }));

    const shiftsFormatted = shifts.map(s => ({
      id: s.id,
      date: s.date,
      doctorId: s.doctor_id,
      templateId: s.template_id,
      isPublicHoliday: Boolean(s.is_public_holiday)
    }));

    // Calculate stats for fairness validation
    const stats: Record<string, any> = {};
    doctorsFormatted.forEach(doc => {
      stats[doc.id] = {
        totalHours: 0,
        weekends: 0,
        holidays: doc.cumulativeHolidayHours,
        lastWorkedDay: -2
      };
    });

    // Process shifts to calculate stats
    for (const shift of shiftsFormatted) {
      const template = shift.templateId === 'weekend' ? { totalHours: 24 } : { totalHours: 16 };
      const date = new Date(shift.date);
      const day = date.getDate();
      
      if (stats[shift.doctorId]) {
        stats[shift.doctorId].totalHours += template.totalHours;
        if (shift.templateId === 'weekend') {
          stats[shift.doctorId].weekends++;
        }
        if (shift.isPublicHoliday) {
          stats[shift.doctorId].holidays += template.totalHours;
        }
        stats[shift.doctorId].lastWorkedDay = day;
      }
    }

    // Load fairness settings for this department
    const settings = await db.get(
      'SELECT hour_diff_limit as hourLimit, weekend_diff_limit as weekendLimit FROM fairness_settings WHERE department_id = ?',
      [departmentId]
    ).catch(() => ({ hourLimit: 24, weekendLimit: 1 }));

    // Generate fairness report using configured thresholds
    const report = RosterEngine.validateFairness(
      doctorsFormatted,
      stats,
      shiftsFormatted,
      {
        maxHourDiff: settings?.hourLimit ?? 24,
        maxWeekendDiff: settings?.weekendLimit ?? 1
      }
    );

    res.json(report);
  } catch (error: any) {
    console.error('Get fairness report error:', error);
    res.status(500).json({ error: 'Failed to generate fairness report' });
  }
});

// Get fairness settings
app.get('/api/analytics/fairness-settings', authMiddleware, withDept, adminOnly, async (req, res) => {
  try {
    const departmentId = (req as any).departmentId;
    const row = await db.get(
      'SELECT hour_diff_limit as hourLimit, weekend_diff_limit as weekendLimit FROM fairness_settings WHERE department_id = ?',
      [departmentId]
    );
    res.json({
      hourLimit: row?.hourLimit ?? 24,
      weekendLimit: row?.weekendLimit ?? 1
    });
  } catch (error: any) {
    console.error('Get fairness settings error:', error);
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

// Update fairness settings
app.put('/api/analytics/fairness-settings', authMiddleware, withDept, adminOnly, async (req, res) => {
  try {
    const departmentId = (req as any).departmentId;
    const { hourLimit, weekendLimit } = req.body;

    if (hourLimit == null || weekendLimit == null) {
      return res.status(400).json({ error: 'hourLimit and weekendLimit are required' });
    }

    const now = Date.now();
    await db.run(
      `UPDATE fairness_settings
       SET hour_diff_limit = ?, weekend_diff_limit = ?, updated_at = ?
       WHERE department_id = ?`,
      [hourLimit, weekendLimit, now, departmentId]
    );

    res.json({ success: true, hourLimit, weekendLimit });
  } catch (error: any) {
    console.error('Update fairness settings error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

app.listen(PORT, () => {
  console.log(`📊 Analytics Service running on port ${PORT}`);
});
