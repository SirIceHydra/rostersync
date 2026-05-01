#!/usr/bin/env python3
"""
RosterSync Comprehensive Test Seed Script
Populates a realistic SA hospital department with 10 doctors, varied histories,
real SA public holidays, and a rich set of requests for May/June 2026.

Usage:  python3 backend/scripts/seed-test-data.py
"""

import sqlite3
import time
import sys
import os

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'rostersync.db')

# Pre-computed bcrypt hash for 'TestPass123' (rounds=10)
# Verified: bcrypt.compare('TestPass123', hash) => true
HASH = '$2a$10$KUY.5F6GUAeyajEZPbLBoeG5nwyYlJQU.uh4zFwBgjDqgsBF5636e'

conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

now_ms = int(time.time() * 1000)

def ts(years=0, months=0, days=0):
    """Return a timestamp (ms) N years/months/days in the past."""
    import datetime
    d = datetime.datetime.now()
    # rough: 365.25 days/yr, 30.44 days/month
    delta = datetime.timedelta(days=years*365.25 + months*30.44 + days)
    return int((d - delta).timestamp() * 1000)

# ── 1. Reset existing dev account passwords ──────────────────────────────────
print("🔑  Resetting existing account passwords → TestPass123")
dev_emails = [
    'test2@med.com', 'test3@med.com', 'reshad.amin101@gmail.com',
    'admin@email.com', 'admin@admin.com', 'reshad@test.com',
    'reshad@email.com', 'yazdan@test.com', 'suwaibah@email.com',
]
for email in dev_emails:
    cur.execute("UPDATE users SET password_hash=? WHERE email=?", (HASH, email))
print(f"   ✓ {cur.rowcount} existing accounts had passwords reset")

# ── 2. Create test department ────────────────────────────────────────────────
DEPT_ID   = 'dept-gsem-2026'
DEPT_CODE = 'GSEM2026'
DEPT_NAME = 'Groote Schuur Emergency'

exists = cur.execute("SELECT id FROM departments WHERE id=?", (DEPT_ID,)).fetchone()
if not exists:
    cur.execute(
        "INSERT INTO departments (id, code, name, created_at, created_by) VALUES (?,?,?,?,NULL)",
        (DEPT_ID, DEPT_CODE, DEPT_NAME, now_ms)
    )
    print(f"🏥  Created department: {DEPT_NAME}  [{DEPT_CODE}]")
else:
    print(f"🏥  Department already exists: {DEPT_NAME}  [{DEPT_CODE}]")

# Seed fairness settings for this department (if not present)
cur.execute("SELECT 1 FROM fairness_settings WHERE department_id=?", (DEPT_ID,))
if not cur.fetchone():
    cur.execute("""
        INSERT INTO fairness_settings
            (department_id, hour_diff_limit, weekend_diff_limit,
             max_shifts_per_7_days, allow_consecutive_shifts, min_rest_days,
             created_at, updated_at)
        VALUES (?,24,1,2,0,1,?,?)
    """, (DEPT_ID, now_ms, now_ms))

# ── 3. Doctors ───────────────────────────────────────────────────────────────
# (id, name, email, role, firm, role_in_dept,
#  cumTotalHours, cumWeekends, cumPHHours, startDate, workloadMode)
#
# Cumulative figures reflect ~12 published months of realistic variability.
# SA public holiday hours accumulate slowly (typically 1–3 PH shifts/year):
#   Good Friday (16h), Easter Mon/Family Day (16h),
#   Workers' Day 1 May (16h), Human Rights Day 21 Mar (16h),
#   Freedom Day 27 Apr (16h), Youth Day 16 Jun (16h),
#   Christmas 25 Dec (24h, weekend), etc.

DOCTORS = [
    # ── HOD / Admin ──────────────────────────────────────────────────────────
    dict(
        id='u-gsem-admin', name='Dr. Amara Nkosi',
        email='admin@gsem.test', role='ADMIN', firm='HOD', role_in_dept='ADMIN',
        cumTotalHours=1440, cumWeekends=18, cumPHHours=64,
        # Worked Christmas (24h), New Year (16h), Good Friday (16h) = 56h + extras
        startDate=ts(years=4),
        workloadMode='STAGGERED',
    ),
    # ── Veterans (3+ years) ──────────────────────────────────────────────────
    dict(
        id='u-gsem-v1', name='Dr. Sipho Dlamini',
        email='sipho@gsem.test', role='DOCTOR', firm='Team A', role_in_dept='MEMBER',
        # Highest cumulative — most senior, consistent attendee
        cumTotalHours=1552, cumWeekends=20, cumPHHours=80,
        # Worked Christmas 2024 (24h wknd), Easter 2025 (16h), Workers Day (16h) × 2 = 72+
        startDate=ts(years=3, months=4),
        workloadMode='STAGGERED',
    ),
    dict(
        id='u-gsem-v2', name='Dr. Fatima Essop',
        email='fatima@gsem.test', role='DOCTOR', firm='Team B', role_in_dept='MEMBER',
        # Had extended sick leave — lower cumulative despite long tenure
        cumTotalHours=1200, cumWeekends=14, cumPHHours=32,
        startDate=ts(years=3),
        workloadMode='STAGGERED',
    ),
    dict(
        id='u-gsem-v3', name='Dr. Tendai Moyo',
        email='tendai@gsem.test', role='DOCTOR', firm='Team A', role_in_dept='MEMBER',
        # Most PH hours — historically drew the short straw on holidays
        cumTotalHours=1488, cumWeekends=19, cumPHHours=96,
        # Worked Christmas 2023 (24h), Good Friday 2024 (16h), Human Rights Day (16h),
        # Freedom Day (16h), Workers Day (16h), Youth Day (8h partial) = 96h
        startDate=ts(years=3, months=8),
        workloadMode='STAGGERED',
    ),
    # ── Mid-career (1–2 years) ───────────────────────────────────────────────
    dict(
        id='u-gsem-m1', name='Dr. Naledi Sithole',
        email='naledi@gsem.test', role='DOCTOR', firm='Team B', role_in_dept='MEMBER',
        cumTotalHours=640, cumWeekends=8, cumPHHours=16,
        # One PH: Easter Monday/Family Day (16h)
        startDate=ts(years=1, months=9),
        workloadMode='STAGGERED',
    ),
    dict(
        id='u-gsem-m2', name='Dr. Kwame Asante',
        email='kwame@gsem.test', role='DOCTOR', firm='Team A', role_in_dept='MEMBER',
        cumTotalHours=496, cumWeekends=6, cumPHHours=0,
        # Never been rostered on a public holiday — will get priority this month
        startDate=ts(years=1, months=4),
        workloadMode='STAGGERED',
    ),
    dict(
        id='u-gsem-m3', name='Dr. Zanele Khumalo',
        email='zanele@gsem.test', role='DOCTOR', firm='Team B', role_in_dept='MEMBER',
        cumTotalHours=384, cumWeekends=5, cumPHHours=24,
        # One weekend PH shift (Christmas Day on weekend = 24h)
        startDate=ts(years=1),
        workloadMode='STAGGERED',
    ),
    # ── New joiners ──────────────────────────────────────────────────────────
    dict(
        id='u-gsem-n1', name='Dr. Aisha Mohammed',
        email='aisha@gsem.test', role='DOCTOR', firm='Team A', role_in_dept='MEMBER',
        # ~6 weeks in — hasn't had any published roster yet
        cumTotalHours=0, cumWeekends=0, cumPHHours=0,
        startDate=ts(days=45),
        workloadMode='STAGGERED',
    ),
    dict(
        id='u-gsem-n2', name='Dr. Luca Ferreira',
        email='luca@gsem.test', role='DOCTOR', firm='Team B', role_in_dept='MEMBER',
        # 3 weeks in — very new
        cumTotalHours=0, cumWeekends=0, cumPHHours=0,
        startDate=ts(days=22),
        workloadMode='STAGGERED',
    ),
    dict(
        id='u-gsem-n3', name='Dr. Priya Naidoo',
        email='priya@gsem.test', role='DOCTOR', firm='Team A', role_in_dept='MEMBER',
        # 1 month in, IMMEDIATE mode — admin gave her full load from month 1
        # Already has 80h from partial first month (published manually)
        cumTotalHours=80, cumWeekends=1, cumPHHours=0,
        startDate=ts(months=1),
        workloadMode='IMMEDIATE',
    ),
]

print(f"\n👨‍⚕️  Seeding {len(DOCTORS)} doctors…")
for doc in DOCTORS:
    exists = cur.execute("SELECT id FROM users WHERE id=?", (doc['id'],)).fetchone()
    if exists:
        cur.execute("""
            UPDATE users SET
                name=?, email=?, role=?, firm=?,
                password_hash=?,
                cumulative_total_hours=?, cumulative_weekend_shifts=?,
                cumulative_holiday_hours=?, start_date=?,
                workload_start_mode=?, updated_at=?
            WHERE id=?
        """, (doc['name'], doc['email'], doc['role'], doc['firm'],
              HASH,
              doc['cumTotalHours'], doc['cumWeekends'],
              doc['cumPHHours'], doc['startDate'],
              doc['workloadMode'], now_ms,
              doc['id']))
    else:
        cur.execute("""
            INSERT INTO users
                (id, email, password_hash, name, role, firm,
                 cumulative_holiday_hours, cumulative_total_hours,
                 cumulative_weekend_shifts, start_date, workload_start_mode,
                 created_at, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (doc['id'], doc['email'], HASH, doc['name'], doc['role'], doc['firm'],
              doc['cumPHHours'], doc['cumTotalHours'], doc['cumWeekends'],
              doc['startDate'], doc['workloadMode'],
              now_ms, now_ms))

    # Upsert department membership
    mem = cur.execute(
        "SELECT 1 FROM user_departments WHERE user_id=? AND department_id=?",
        (doc['id'], DEPT_ID)
    ).fetchone()
    if not mem:
        cur.execute(
            "INSERT INTO user_departments (user_id, department_id, role_in_dept, joined_at) VALUES (?,?,?,?)",
            (doc['id'], DEPT_ID, doc['role_in_dept'], now_ms)
        )
    print(f"   ✓ {doc['role']:6} {doc['name']:28} {doc['email']}")

# ── 4. Requests ──────────────────────────────────────────────────────────────
# May 2026 public holidays (SA):
#   Workers' Day → 2026-05-01 (Friday)
#   (no other PH in May)
# June 2026:
#   Youth Day → 2026-06-16 (Tuesday)

print("\n📋  Seeding requests…")

REQUESTS = [
    # ── APPROVED LEAVE ────────────────────────────────────────────────────────
    # Sipho: 3-day annual leave block mid-month
    dict(id='req-gsem-001', doctorId='u-gsem-v1', type='LEAVE',
         date='2026-05-12', status='APPROVED', reason='Annual leave'),
    dict(id='req-gsem-002', doctorId='u-gsem-v1', type='LEAVE',
         date='2026-05-13', status='APPROVED', reason='Annual leave'),
    dict(id='req-gsem-003', doctorId='u-gsem-v1', type='LEAVE',
         date='2026-05-14', status='APPROVED', reason='Annual leave'),

    # Fatima: sick leave
    dict(id='req-gsem-004', doctorId='u-gsem-v2', type='LEAVE',
         date='2026-05-07', status='APPROVED', reason='Sick leave'),

    # Tendai: conference travel (leave, not just unavailable)
    dict(id='req-gsem-005', doctorId='u-gsem-v3', type='LEAVE',
         date='2026-05-28', status='APPROVED', reason='Conference — Cape Town'),
    dict(id='req-gsem-006', doctorId='u-gsem-v3', type='LEAVE',
         date='2026-05-29', status='APPROVED', reason='Conference — Cape Town'),

    # ── APPROVED UNAVAILABLE ─────────────────────────────────────────────────
    # Naledi: Workers' Day (May 1 PH) — family commitment
    dict(id='req-gsem-007', doctorId='u-gsem-m1', type='UNAVAILABLE',
         date='2026-05-01', status='APPROVED', reason='Family commitment'),

    # Weekend conflict test: Kwame AND Tendai both want May 16 (Sat) off
    # → algorithm should flag: 2 doctors requested same weekend day
    dict(id='req-gsem-008', doctorId='u-gsem-m2', type='UNAVAILABLE',
         date='2026-05-16', status='APPROVED', reason='Wedding — cannot attend'),
    dict(id='req-gsem-009', doctorId='u-gsem-v3', type='UNAVAILABLE',
         date='2026-05-16', status='APPROVED', reason='Conference travel (Sat departure)'),

    # Zanele: Sunday May 17 (same weekend as above conflict)
    dict(id='req-gsem-010', doctorId='u-gsem-m3', type='UNAVAILABLE',
         date='2026-05-17', status='APPROVED', reason='Out of town'),

    # ── APPROVED PREFERRED_WORK ───────────────────────────────────────────────
    # Fatima wants Workers' Day (May 1 PH) — she needs PH hours (only 32h cumulative)
    # She's also on sick leave May 7, so she specifically requests this PH
    dict(id='req-gsem-011', doctorId='u-gsem-v2', type='PREFERRED_WORK',
         date='2026-05-01', status='APPROVED', reason='Want PH hours — post-call preference'),

    # Priya (IMMEDIATE) wants May 20 (Wed)
    dict(id='req-gsem-012', doctorId='u-gsem-n3', type='PREFERRED_WORK',
         date='2026-05-20', status='APPROVED', reason='Post-call day suits schedule'),

    # Kwame wants May 8 (Fri) — to make up for missing May 16
    dict(id='req-gsem-013', doctorId='u-gsem-m2', type='PREFERRED_WORK',
         date='2026-05-08', status='APPROVED', reason='Happy to cover this Friday'),

    # ── PENDING (not yet approved — must be ignored by generator) ─────────────
    dict(id='req-gsem-014', doctorId='u-gsem-n1', type='UNAVAILABLE',
         date='2026-05-23', status='PENDING', reason='Personal — awaiting approval'),

    dict(id='req-gsem-015', doctorId='u-gsem-admin', type='LEAVE',
         date='2026-05-26', status='PENDING', reason='CME conference — pending'),

    # ── REJECTED (must also be ignored by generator) ──────────────────────────
    dict(id='req-gsem-016', doctorId='u-gsem-n2', type='UNAVAILABLE',
         date='2026-05-09', status='REJECTED', reason='Not approved — insufficient cover'),

    # ── JUNE 2026 REQUESTS ────────────────────────────────────────────────────
    # Youth Day (Jun 16): Sipho on leave, Fatima prefers to work it (PH hours)
    dict(id='req-gsem-017', doctorId='u-gsem-v1', type='LEAVE',
         date='2026-06-16', status='APPROVED', reason='Annual leave continues'),
    dict(id='req-gsem-018', doctorId='u-gsem-v2', type='PREFERRED_WORK',
         date='2026-06-16', status='APPROVED', reason='Wants Youth Day PH hours'),

    # Naledi: weekend off in June
    dict(id='req-gsem-019', doctorId='u-gsem-m1', type='UNAVAILABLE',
         date='2026-06-20', status='APPROVED', reason='Family visit'),
    dict(id='req-gsem-020', doctorId='u-gsem-m1', type='UNAVAILABLE',
         date='2026-06-21', status='APPROVED', reason='Family visit'),

    # Tendai: prefers to work Heritage Day (Sep 24 — planning ahead)
    dict(id='req-gsem-021', doctorId='u-gsem-v3', type='PREFERRED_WORK',
         date='2026-09-24', status='APPROVED', reason='Heritage Day — wants PH shift'),

    # ── POST_CALL_OFF examples ───────────────────────────────────────────────
    # Zanele needs Wed Jun 24 OFF (school event) — algo will try to give her Tue Jun 23 call.
    dict(id='req-gsem-022', doctorId='u-gsem-m3', type='POST_CALL_OFF',
         date='2026-06-24', status='APPROVED', reason='School event — needs day off, ok being post-call'),
    # Naledi: needs Mon May 25 OFF (childcare). Algo prefers her on Sun May 24 call so she's post-call.
    dict(id='req-gsem-023', doctorId='u-gsem-m1', type='POST_CALL_OFF',
         date='2026-05-25', status='APPROVED', reason='Childcare — fine being on Sun call before'),
]

for req in REQUESTS:
    exists = cur.execute("SELECT id FROM requests WHERE id=?", (req['id'],)).fetchone()
    if not exists:
        cur.execute("""
            INSERT INTO requests
                (id, doctor_id, type, date, status, reason, department_id,
                 created_at, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?)
        """, (req['id'], req['doctorId'], req['type'], req['date'],
              req['status'], req.get('reason'), DEPT_ID, now_ms, now_ms))
    else:
        cur.execute(
            "UPDATE requests SET status=?, updated_at=? WHERE id=?",
            (req['status'], now_ms, req['id'])
        )

print(f"   ✓ {len(REQUESTS)} requests seeded")

# ── 5. Commit ────────────────────────────────────────────────────────────────
conn.commit()
conn.close()

# ── 6. Summary ───────────────────────────────────────────────────────────────
print("""
╔══════════════════════════════════════════════════════════════════════════╗
║                 SEED COMPLETE — All passwords: TestPass123               ║
╠══════════════════════════════════════════════════════════════════════════╣
║  LOGIN AS ADMIN   →  admin@gsem.test   / TestPass123                     ║
║  Department code  →  GSEM2026                                            ║
╠══════════════════════════════════════════════════════════════════════════╣
║  DOCTOR ACCOUNTS (all password: TestPass123)                             ║
║  sipho@gsem.test    — Veteran 3y+, 1552h cum, 20 wknds, 80h PH          ║
║  fatima@gsem.test   — Veteran 3y, 1200h cum, 14 wknds, 32h PH           ║
║  tendai@gsem.test   — Veteran 3y+, 1488h cum, 19 wknds, 96h PH (most)  ║
║  naledi@gsem.test   — Mid 1.9y, 640h cum, 8 wknds, 16h PH              ║
║  kwame@gsem.test    — Mid 1.3y, 496h cum, 6 wknds, 0h PH (0!)          ║
║  zanele@gsem.test   — Mid 1y, 384h cum, 5 wknds, 24h PH                ║
║  aisha@gsem.test    — New joiner (45d), 0h cum                          ║
║  luca@gsem.test     — New joiner (22d), 0h cum                          ║
║  priya@gsem.test    — New (1mo, IMMEDIATE), 80h cum                     ║
╠══════════════════════════════════════════════════════════════════════════╣
║  OLD DEV ACCOUNTS also reset to TestPass123:                             ║
║  admin@email.com  admin@admin.com  test2@med.com  test3@med.com          ║
╠══════════════════════════════════════════════════════════════════════════╣
║  EXPECTED ROSTER BEHAVIOUR (May 2026):                                   ║
║  • Workers Day (May 1, PH): Fatima wins (PREFERRED_WORK + 32h cumPH)    ║
║  • Kwame wins May 8 (PREFERRED_WORK)                                     ║
║  • Sipho NOT assigned May 12–14 (approved LEAVE)                         ║
║  • May 16 (Sat): CONFLICT WARNING — Kwame + Tendai both unavailable      ║
║  • New joiners (Aisha, Luca, STAGGERED): ~fair share (median floor)     ║
║  • Priya (IMMEDIATE) competes at full strength                           ║
║  • Kwame gets priority for any PH (0h cumulative PH hours)               ║
║  • Hour spread should be ≤ 16h after optimiser                           ║
╚══════════════════════════════════════════════════════════════════════════╝
""")
