import express from 'express';
import cors from 'cors';
import { Database } from '../shared/database.js';
import { authMiddleware, adminOnly, requireDepartment } from '../shared/auth.js';
import { RosterEngine } from '../shared/rosterEngine.js';
import { getSAPublicHolidays } from '../shared/publicHolidays.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.ROSTER_SERVICE_PORT || 4002;
const db = Database.getInstance();
const withDept = requireDepartment(() => db);

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

// SA Public Holidays (gov.za) — no department needed
app.get('/api/rosters/public-holidays/:year', authMiddleware, (req, res) => {
  try {
    const year = parseInt(req.params.year, 10);
    if (isNaN(year) || year < 2020 || year > 2030) {
      return res.status(400).json({ error: 'Invalid year' });
    }
    const dates = getSAPublicHolidays(year);
    res.json({ year, country: 'ZA', source: 'gov.za', dates });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get public holidays' });
  }
});

// Get roster for month/year (department-scoped)
app.get('/api/rosters/:year/:month', authMiddleware, withDept, async (req, res) => {
  try {
    const departmentId = (req as any).departmentId;
    const year = parseInt(req.params.year);
    const month = parseInt(req.params.month);

    const roster = await db.get(
      'SELECT * FROM rosters WHERE department_id = ? AND year = ? AND month = ?',
      [departmentId, year, month]
    );

    if (!roster) {
      return res.json(null);
    }

    // Get shifts
    const shifts = await db.all(
      'SELECT * FROM shifts WHERE roster_id = ? ORDER BY date',
      [roster.id]
    );

    res.json({
      id: roster.id,
      month: roster.month,
      year: roster.year,
      status: roster.status,
      shifts: shifts.map(s => ({
        id: s.id,
        date: s.date,
        doctorId: s.doctor_id,
        templateId: s.template_id,
        isPublicHoliday: Boolean(s.is_public_holiday)
      })),
      createdAt: roster.created_at
    });
  } catch (error: any) {
    console.error('Get roster error:', error);
    res.status(500).json({ error: 'Failed to fetch roster' });
  }
});

// Generate roster (admin only, department-scoped)
app.post('/api/rosters/generate', authMiddleware, withDept, adminOnly, async (req, res) => {
  try {
    const departmentId = (req as any).departmentId;
    const { month, year } = req.body;
    const now = new Date();
    const targetMonth = month ?? now.getMonth();
    const targetYear = year ?? now.getFullYear();

    // Get doctors in this department (user_departments + users)
    const doctors = await db.all(
      `SELECT u.id, u.email, u.name, u.role, u.firm,
              u.cumulative_holiday_hours,
              u.cumulative_total_hours,
              u.cumulative_weekend_shifts,
              u.start_date
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

    // Convert to expected format with cumulative data
    const doctorsFormatted = doctors.map(d => ({
      id: d.id,
      email: d.email,
      name: d.name,
      role: d.role,
      firm: d.firm,
      cumulativeHolidayHours: d.cumulative_holiday_hours || 0,
      cumulativeTotalHours: d.cumulative_total_hours || 0,
      cumulativeWeekendShifts: d.cumulative_weekend_shifts || 0,
      startDate: d.start_date || null
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

    // Load fairness settings for this department
    const settings = await db.get(
      'SELECT hour_diff_limit as hourLimit, weekend_diff_limit as weekendLimit FROM fairness_settings WHERE department_id = ?',
      [departmentId]
    ).catch(() => ({ hourLimit: 24, weekendLimit: 1 }));

    // Generate roster using current fairness configuration
    const { roster, report } = RosterEngine.generate(
      targetMonth,
      targetYear,
      doctorsFormatted,
      requestsFormatted,
      {
        maxHourDiff: settings?.hourLimit ?? 24,
        maxWeekendDiff: settings?.weekendLimit ?? 1
      }
    );

    // Check if roster exists for this department
    const existing = await db.get(
      'SELECT id FROM rosters WHERE department_id = ? AND year = ? AND month = ?',
      [departmentId, targetYear, targetMonth]
    );

    // Use an existing roster ID if present; otherwise create a new unique ID
    const rosterId = existing?.id || `roster-${departmentId}-${targetYear}-${targetMonth}`;
    const nowTimestamp = Date.now();

    if (existing) {
      await db.run(
        'UPDATE rosters SET status = ?, updated_at = ? WHERE id = ?',
        [roster.status, nowTimestamp, rosterId]
      );
      await db.run('DELETE FROM shifts WHERE roster_id = ?', [rosterId]);
    } else {
      await db.run(
        'INSERT INTO rosters (id, department_id, month, year, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [rosterId, departmentId, targetMonth, targetYear, roster.status, nowTimestamp, nowTimestamp]
      );
    }

    // Insert shifts. Use a department/roster-scoped id instead of the engine's
    // generic id so we never collide across departments.
    for (const shift of roster.shifts) {
      const shiftId = `${rosterId}-${shift.date}`;
      await db.run(
        `INSERT INTO shifts (id, roster_id, date, doctor_id, template_id, is_public_holiday)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [shiftId, rosterId, shift.date, shift.doctorId, shift.templateId, shift.isPublicHoliday ? 1 : 0]
      );
    }

    res.json({ roster, report });
  } catch (error: any) {
    console.error('Generate roster error:', error);
    res.status(500).json({ error: 'Failed to generate roster', details: error.message });
  }
});

// Update shift (admin only, department-scoped)
app.patch('/api/rosters/:rosterId/shifts/:shiftId', authMiddleware, withDept, adminOnly, async (req, res) => {
  try {
    const { rosterId, shiftId } = req.params;
    const { doctorId } = req.body;

    if (!doctorId) {
      return res.status(400).json({ error: 'doctorId required' });
    }

    await db.run(
      'UPDATE shifts SET doctor_id = ? WHERE id = ? AND roster_id = ?',
      [doctorId, shiftId, rosterId]
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error('Update shift error:', error);
    res.status(500).json({ error: 'Failed to update shift' });
  }
});

// Publish roster (admin only, department-scoped)
app.post('/api/rosters/:rosterId/publish', authMiddleware, withDept, adminOnly, async (req, res) => {
  try {
    const departmentId = (req as any).departmentId;
    const { rosterId } = req.params;

    const roster = await db.get('SELECT * FROM rosters WHERE id = ? AND department_id = ?', [rosterId, departmentId]);
    if (!roster) {
      return res.status(404).json({ error: 'Roster not found' });
    }
    if (roster.status === 'FINAL') {
      return res.status(400).json({ error: 'Roster already published' });
    }

    // Get all shifts for this roster
    const shifts = await db.all('SELECT * FROM shifts WHERE roster_id = ?', [rosterId]);

    // Calculate hours and weekend counts per doctor
    const doctorStats: Record<string, { hours: number; weekends: number; phHours: number }> = {};
    
    for (const shift of shifts) {
      const isWeekend = shift.template_id && String(shift.template_id).includes('weekend');
      const hours = isWeekend ? 24 : 16; // Weekend = 24h, weekday = 16h
      const isPH = Boolean(shift.is_public_holiday); // SQLite stores 0/1
      const phHours = isPH ? hours : 0;

      if (!doctorStats[shift.doctor_id]) {
        doctorStats[shift.doctor_id] = { hours: 0, weekends: 0, phHours: 0 };
      }
      doctorStats[shift.doctor_id].hours += hours;
      if (isWeekend) doctorStats[shift.doctor_id].weekends++;
      doctorStats[shift.doctor_id].phHours += phHours;
    }

    // Update cumulative stats for each doctor
    const now = Date.now();
    for (const [doctorId, stats] of Object.entries(doctorStats)) {
      await db.run(
        `UPDATE users 
         SET cumulative_total_hours = COALESCE(cumulative_total_hours, 0) + ?,
             cumulative_weekend_shifts = COALESCE(cumulative_weekend_shifts, 0) + ?,
             cumulative_holiday_hours = COALESCE(cumulative_holiday_hours, 0) + ?,
             updated_at = ?
         WHERE id = ?`,
        [stats.hours, stats.weekends, stats.phHours, now, doctorId]
      );
    }

    // Mark roster as published
    await db.run(
      'UPDATE rosters SET status = ?, updated_at = ? WHERE id = ?',
      ['FINAL', now, rosterId]
    );

    res.json({ success: true, message: 'Roster published and cumulative stats updated' });
  } catch (error: any) {
    console.error('Publish roster error:', error);
    res.status(500).json({ error: 'Failed to publish roster' });
  }
});

// Sync cumulative hours from all published rosters (admin only; cumulative is global per user)
app.post('/api/rosters/sync-cumulative', authMiddleware, withDept, adminOnly, async (req, res) => {
  try {
    const published = await db.all(
      'SELECT id FROM rosters WHERE status = ? ORDER BY year, month',
      ['FINAL']
    );

    const doctorTotals: Record<string, { hours: number; weekends: number; phHours: number }> = {};

    for (const row of published) {
      const shifts = await db.all('SELECT * FROM shifts WHERE roster_id = ?', [row.id]);
      for (const shift of shifts) {
        const isWeekend = shift.template_id && String(shift.template_id).includes('weekend');
        const hours = isWeekend ? 24 : 16;
        const isPH = Boolean(shift.is_public_holiday);
        const phHours = isPH ? hours : 0;

        if (!doctorTotals[shift.doctor_id]) {
          doctorTotals[shift.doctor_id] = { hours: 0, weekends: 0, phHours: 0 };
        }
        doctorTotals[shift.doctor_id].hours += hours;
        if (isWeekend) doctorTotals[shift.doctor_id].weekends++;
        doctorTotals[shift.doctor_id].phHours += phHours;
      }
    }

    const now = Date.now();
    for (const [doctorId, stats] of Object.entries(doctorTotals)) {
      await db.run(
        `UPDATE users 
         SET cumulative_total_hours = ?,
             cumulative_weekend_shifts = ?,
             cumulative_holiday_hours = ?,
             updated_at = ?
         WHERE id = ?`,
        [stats.hours, stats.weekends, stats.phHours, now, doctorId]
      );
    }

    // Reset doctors who have no published shifts (e.g. new joiners)
    const allDoctorIds = await db.all(
      `SELECT id FROM users WHERE role IN ('DOCTOR', 'ADMIN')`
    );
    for (const { id } of allDoctorIds) {
      if (!doctorTotals[id]) {
        await db.run(
          `UPDATE users SET cumulative_total_hours = 0, cumulative_weekend_shifts = 0, cumulative_holiday_hours = 0, updated_at = ? WHERE id = ?`,
          [now, id]
        );
      }
    }

    res.json({
      success: true,
      message: 'Cumulative stats synced from all published rosters',
      doctorsUpdated: Object.keys(doctorTotals).length
    });
  } catch (error: any) {
    console.error('Sync cumulative error:', error);
    res.status(500).json({ error: 'Failed to sync cumulative stats' });
  }
});

app.listen(PORT, () => {
  console.log(`📅 Roster Service running on port ${PORT}`);
});
