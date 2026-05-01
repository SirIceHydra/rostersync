/**
 * RosterSync Comprehensive Test Seed Script
 *
 * Creates:
 *  - 1 clean test department: "Groote Schuur Emergency" (code: GSEM2026)
 *  - 10 doctors with realistic SA cumulative histories
 *    • 3 veterans (3+ yrs), varying PH/weekend exposure
 *    • 3 mid-career (1–2 yrs)
 *    • 2 new joiners (NEXT_MONTH mode)
 *    • 1 new joiner (IMMEDIATE mode)
 *    • 1 admin/HOD
 *  - 1 admin account with known password: admin@gsem.test / TestPass123
 *  - All doctor accounts password: TestPass123
 *  - Approved and pending requests (leave, unavailable, preferred_work)
 *  - Resets all known dev accounts to TestPass123
 *
 * Usage:  node backend/scripts/seed-test-data.mjs
 */

import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '../data/rostersync.db');

const db = new Database(DB_PATH);
const KNOWN_HASH = await bcrypt.hash('TestPass123', 10);
const now = Date.now();

// ─── helpers ────────────────────────────────────────────────────────────────
const run  = (sql, params = []) => db.prepare(sql).run(...params);
const get  = (sql, params = []) => db.prepare(sql).get(...params);
const all  = (sql, params = []) => db.prepare(sql).all(...params);

function ts(yearsAgo = 0, monthsAgo = 0, daysAgo = 0) {
  const d = new Date();
  d.setFullYear(d.getFullYear()  - yearsAgo);
  d.setMonth(d.getMonth()        - monthsAgo);
  d.setDate(d.getDate()          - daysAgo);
  return d.getTime();
}

// ─── 1. Reset all existing dev-account passwords ────────────────────────────
console.log('🔑  Resetting existing account passwords to TestPass123…');
const devEmails = [
  'test2@med.com','test3@med.com','reshad.amin101@gmail.com',
  'admin@email.com','admin@admin.com','reshad@test.com',
  'reshad@email.com','yazdan@test.com','suwaibah@email.com',
];
for (const email of devEmails) {
  run(`UPDATE users SET password_hash = ? WHERE email = ?`, [KNOWN_HASH, email]);
}
console.log(`   ✓ ${devEmails.length} accounts reset`);

// ─── 2. Create test department ───────────────────────────────────────────────
const DEPT_ID   = 'dept-gsem-2026';
const DEPT_CODE = 'GSEM2026';
const DEPT_NAME = 'Groote Schuur Emergency';

const existing = get(`SELECT id FROM departments WHERE id = ?`, [DEPT_ID]);
if (!existing) {
  run(`INSERT INTO departments (id, name, code, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    [DEPT_ID, DEPT_NAME, DEPT_CODE, now, now]);
  console.log(`🏥  Created department: ${DEPT_NAME}  [${DEPT_CODE}]`);
} else {
  console.log(`🏥  Department already exists: ${DEPT_NAME}`);
}

// ─── 3. Doctor roster ────────────────────────────────────────────────────────
// cumulative figures reflect ~3 published months of real-world variability
// SA PH hours accumulate slowly (typically 1–3 PH shifts/year)

const DOCTORS = [
  // ── HOD / Admin ──────────────────────────────────────────────────────────
  {
    id: 'u-gsem-admin',
    name: 'Dr. Amara Nkosi',
    email: 'admin@gsem.test',
    role: 'ADMIN',
    firm: 'HOD',
    startDate: ts(4),            // 4 years in post
    workloadStartMode: 'NEXT_MONTH',
    // Admins still take calls; moderate weekend load
    cumTotalHours: 1120,         // ~3.7 months at ~95h/month
    cumWeekends: 14,
    cumPHHours: 48,              // worked Christmas, New Year, Good Friday
  },
  // ── Veterans (3+ years) ──────────────────────────────────────────────────
  {
    id: 'u-gsem-v1',
    name: 'Dr. Sipho Dlamini',
    email: 'sipho@gsem.test',
    role: 'DOCTOR',
    firm: 'Team A',
    startDate: ts(3, 2),         // 3y 2m
    workloadStartMode: 'NEXT_MONTH',
    cumTotalHours: 1248,         // slightly heavier history
    cumWeekends: 16,
    cumPHHours: 64,              // Christmas + Easter + Freedom Day
  },
  {
    id: 'u-gsem-v2',
    name: 'Dr. Fatima Essop',
    email: 'fatima@gsem.test',
    role: 'DOCTOR',
    firm: 'Team B',
    startDate: ts(3, 0),
    workloadStartMode: 'NEXT_MONTH',
    cumTotalHours: 1056,         // lighter — had extended sick leave once
    cumWeekends: 12,
    cumPHHours: 32,
  },
  {
    id: 'u-gsem-v3',
    name: 'Dr. Tendai Moyo',
    email: 'tendai@gsem.test',
    role: 'DOCTOR',
    firm: 'Team A',
    startDate: ts(3, 6),         // 3y 6m
    workloadStartMode: 'NEXT_MONTH',
    cumTotalHours: 1312,         // most experienced, highest cumulative
    cumWeekends: 17,
    cumPHHours: 72,              // worked most PH shifts historically
  },
  // ── Mid-career (1–2 years) ───────────────────────────────────────────────
  {
    id: 'u-gsem-m1',
    name: 'Dr. Naledi Sithole',
    email: 'naledi@gsem.test',
    role: 'DOCTOR',
    firm: 'Team B',
    startDate: ts(1, 8),         // 1y 8m
    workloadStartMode: 'NEXT_MONTH',
    cumTotalHours: 576,
    cumWeekends: 7,
    cumPHHours: 16,              // one PH shift
  },
  {
    id: 'u-gsem-m2',
    name: 'Dr. Kwame Asante',
    email: 'kwame@gsem.test',
    role: 'DOCTOR',
    firm: 'Team A',
    startDate: ts(1, 3),
    workloadStartMode: 'NEXT_MONTH',
    cumTotalHours: 432,
    cumWeekends: 5,
    cumPHHours: 0,               // never been rostered on a PH yet
  },
  {
    id: 'u-gsem-m3',
    name: 'Dr. Zanele Khumalo',
    email: 'zanele@gsem.test',
    role: 'DOCTOR',
    firm: 'Team B',
    startDate: ts(1, 0),         // exactly 1 year
    workloadStartMode: 'NEXT_MONTH',
    cumTotalHours: 352,
    cumWeekends: 4,
    cumPHHours: 24,              // one weekend PH
  },
  // ── New joiners ──────────────────────────────────────────────────────────
  {
    id: 'u-gsem-n1',
    name: 'Dr. Aisha Mohammed',
    email: 'aisha@gsem.test',
    role: 'DOCTOR',
    firm: 'Team A',
    startDate: ts(0, 1, 15),     // ~6 weeks ago — brand new
    workloadStartMode: 'NEXT_MONTH',
    cumTotalHours: 0,
    cumWeekends: 0,
    cumPHHours: 0,
  },
  {
    id: 'u-gsem-n2',
    name: 'Dr. Luca Ferreira',
    email: 'luca@gsem.test',
    role: 'DOCTOR',
    firm: 'Team B',
    startDate: ts(0, 0, 20),     // 20 days ago — newest
    workloadStartMode: 'NEXT_MONTH',
    cumTotalHours: 0,
    cumWeekends: 0,
    cumPHHours: 0,
  },
  {
    id: 'u-gsem-n3',
    name: 'Dr. Priya Naidoo',
    email: 'priya@gsem.test',
    role: 'DOCTOR',
    firm: 'Team A',
    startDate: ts(0, 1, 0),      // exactly 1 month ago
    workloadStartMode: 'IMMEDIATE', // admin said: give her full load from day 1
    cumTotalHours: 80,            // already has 80h from first partial month
    cumWeekends: 1,
    cumPHHours: 0,
  },
];

console.log(`\n👨‍⚕️  Seeding ${DOCTORS.length} doctors…`);
for (const doc of DOCTORS) {
  const exists = get(`SELECT id FROM users WHERE id = ?`, [doc.id]);
  if (exists) {
    run(`UPDATE users SET
           name = ?, email = ?, role = ?, firm = ?,
           password_hash = ?,
           cumulative_total_hours = ?, cumulative_weekend_shifts = ?,
           cumulative_holiday_hours = ?, start_date = ?,
           workload_start_mode = ?, updated_at = ?
         WHERE id = ?`,
      [doc.name, doc.email, doc.role, doc.firm,
       KNOWN_HASH,
       doc.cumTotalHours, doc.cumWeekends,
       doc.cumPHHours, doc.startDate,
       doc.workloadStartMode, now,
       doc.id]);
  } else {
    run(`INSERT INTO users
           (id, email, password_hash, name, role, firm,
            cumulative_holiday_hours, cumulative_total_hours,
            cumulative_weekend_shifts, start_date, workload_start_mode,
            created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [doc.id, doc.email, KNOWN_HASH, doc.name, doc.role, doc.firm,
       doc.cumPHHours, doc.cumTotalHours, doc.cumWeekends,
       doc.startDate, doc.workloadStartMode,
       now, now]);
  }

  // Upsert department membership
  const mem = get(`SELECT 1 FROM user_departments WHERE user_id = ? AND department_id = ?`,
    [doc.id, DEPT_ID]);
  if (!mem) {
    run(`INSERT INTO user_departments (user_id, department_id) VALUES (?, ?)`,
      [doc.id, DEPT_ID]);
  }
  console.log(`   ✓ ${doc.role.padEnd(6)} ${doc.name.padEnd(25)} ${doc.email}`);
}

// ─── 4. Requests — realistic mix ────────────────────────────────────────────
// We add requests for May & June 2026 (the months most likely to be generated next)
console.log('\n📋  Seeding requests…');

const REQUESTS = [
  // ── Approved LEAVE ────────────────────────────────────────────────────────
  {
    id: 'req-gsem-001',
    doctorId: 'u-gsem-v1',            // Sipho — annual leave block
    type: 'LEAVE',
    date: '2026-05-12',
    status: 'APPROVED',
    reason: 'Annual leave',
  },
  {
    id: 'req-gsem-002',
    doctorId: 'u-gsem-v1',
    type: 'LEAVE',
    date: '2026-05-13',
    status: 'APPROVED',
    reason: 'Annual leave',
  },
  {
    id: 'req-gsem-003',
    doctorId: 'u-gsem-v1',
    type: 'LEAVE',
    date: '2026-05-14',
    status: 'APPROVED',
    reason: 'Annual leave',
  },
  {
    id: 'req-gsem-004',
    doctorId: 'u-gsem-v2',            // Fatima — sick leave
    type: 'LEAVE',
    date: '2026-05-07',
    status: 'APPROVED',
    reason: 'Sick leave',
  },
  // ── Approved UNAVAILABLE ──────────────────────────────────────────────────
  {
    id: 'req-gsem-005',
    doctorId: 'u-gsem-m1',            // Naledi — unavailable on PH (Workers Day May 1)
    type: 'UNAVAILABLE',
    date: '2026-05-01',
    status: 'APPROVED',
    reason: 'Family commitment',
  },
  {
    id: 'req-gsem-006',
    doctorId: 'u-gsem-m2',            // Kwame — unavailable weekend
    type: 'UNAVAILABLE',
    date: '2026-05-16',
    status: 'APPROVED',
    reason: 'Wedding',
  },
  {
    id: 'req-gsem-007',
    doctorId: 'u-gsem-m3',            // Zanele — unavailable weekend
    type: 'UNAVAILABLE',
    date: '2026-05-17',               // Same weekend (Sun) — will flag conflict with Kwame's Sat
    status: 'APPROVED',
    reason: 'Out of town',
  },
  // ── Conflict: two doctors request the SAME weekend day off ────────────────
  {
    id: 'req-gsem-008',
    doctorId: 'u-gsem-v3',            // Tendai also wants May 16 off
    type: 'UNAVAILABLE',
    date: '2026-05-16',               // Same Sat as Kwame → weekend conflict warning
    status: 'APPROVED',
    reason: 'Conference travel',
  },
  // ── Approved PREFERRED_WORK ───────────────────────────────────────────────
  {
    id: 'req-gsem-009',
    doctorId: 'u-gsem-v2',            // Fatima WANTS Workers Day (PH) — wants PH hours
    type: 'PREFERRED_WORK',
    date: '2026-05-01',
    status: 'APPROVED',
    reason: 'Post-call day suits me',
  },
  {
    id: 'req-gsem-010',
    doctorId: 'u-gsem-n3',            // Priya (IMMEDIATE) wants a specific weekday
    type: 'PREFERRED_WORK',
    date: '2026-05-20',
    status: 'APPROVED',
    reason: 'Post-call preference',
  },
  // ── Pending (not yet approved — should be ignored by algorithm) ───────────
  {
    id: 'req-gsem-011',
    doctorId: 'u-gsem-n1',
    type: 'UNAVAILABLE',
    date: '2026-05-23',
    status: 'PENDING',
    reason: 'Personal — pending approval',
  },
  {
    id: 'req-gsem-012',
    doctorId: 'u-gsem-admin',
    type: 'LEAVE',
    date: '2026-05-28',
    status: 'PENDING',
    reason: 'Conference',
  },
  // ── June requests (for next-month planning) ───────────────────────────────
  {
    id: 'req-gsem-013',
    doctorId: 'u-gsem-v1',
    type: 'LEAVE',
    date: '2026-06-16',             // Youth Day PH
    status: 'APPROVED',
    reason: 'Annual leave',
  },
  {
    id: 'req-gsem-014',
    doctorId: 'u-gsem-v2',
    type: 'PREFERRED_WORK',
    date: '2026-06-16',             // Fatima wants Youth Day (PH) — competing with Sipho's leave
    status: 'APPROVED',
    reason: 'Wants PH hours',
  },
];

for (const req of REQUESTS) {
  const exists = get(`SELECT id FROM requests WHERE id = ?`, [req.id]);
  if (!exists) {
    run(`INSERT INTO requests
           (id, doctor_id, type, date, status, reason, department_id, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
      [req.id, req.doctorId, req.type, req.date, req.status,
       req.reason ?? null, DEPT_ID, now, now]);
  } else {
    run(`UPDATE requests SET status=?, updated_at=? WHERE id=?`,
      [req.status, now, req.id]);
  }
}
console.log(`   ✓ ${REQUESTS.length} requests seeded`);

// ─── 5. Summary ──────────────────────────────────────────────────────────────
console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║              SEED COMPLETE — Login Details                           ║
╠══════════════════════════════════════════════════════════════════════╣
║  Password for ALL accounts below:  TestPass123                       ║
╠══════════════════════════════════════════════════════════════════════╣
║  ADMIN (HOD)         admin@gsem.test           Dr. Amara Nkosi       ║
║  Department code:    GSEM2026                                         ║
╠══════════════════════════════════════════════════════════════════════╣
║  VETERAN (3y+)       sipho@gsem.test            Dr. Sipho Dlamini    ║
║  VETERAN (3y+)       fatima@gsem.test           Dr. Fatima Essop     ║
║  VETERAN (3y+)       tendai@gsem.test           Dr. Tendai Moyo      ║
║  MID-CAREER (1.5y)   naledi@gsem.test           Dr. Naledi Sithole   ║
║  MID-CAREER (1.2y)   kwame@gsem.test            Dr. Kwame Asante     ║
║  MID-CAREER (1y)     zanele@gsem.test           Dr. Zanele Khumalo   ║
║  NEW JOINER          aisha@gsem.test            Dr. Aisha Mohammed   ║
║  NEW JOINER          luca@gsem.test             Dr. Luca Ferreira    ║
║  NEW (IMMEDIATE)     priya@gsem.test            Dr. Priya Naidoo     ║
╠══════════════════════════════════════════════════════════════════════╣
║  OLD DEV ACCOUNTS (all reset to TestPass123)                         ║
║  admin@email.com    admin@admin.com    test2@med.com                 ║
║  test3@med.com      reshad.amin101@gmail.com   reshad@test.com       ║
╚══════════════════════════════════════════════════════════════════════╝

What to test:
  1. Log in as admin@gsem.test  (role: ADMIN)
  2. Generate roster for May 2026 → should flag:
       • Weekend conflict on 2026-05-16 (Kwame + Tendai both unavailable)
       • Fatima's PREFERRED_WORK on Workers Day (May 1 PH) honoured
       • Sipho on leave May 12-14 → not assigned those days
  3. Check fairness report — hour spread should be ≤ 16h
  4. Generate June 2026 → Youth Day (Jun 16) conflict: Sipho leave vs Fatima preferred
  5. Log in as sipho@gsem.test to see doctor view
`);

db.close();
