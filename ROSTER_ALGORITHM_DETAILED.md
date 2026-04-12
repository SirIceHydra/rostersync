# RosterSync Roster Generation Algorithm - DETAILED TECHNICAL DOCUMENTATION

## Table of Contents
1. [Algorithm Overview](#algorithm-overview)
2. [Core Principles](#core-principles)
3. [Input Parameters](#input-parameters)
4. [Data Structures](#data-structures)
5. [Phase-by-Phase Execution](#phase-by-phase-execution)
6. [Fairness Metrics & Sorting](#fairness-metrics--sorting)
7. [Constraint Handling](#constraint-handling)
8. [Fallback Cascades](#fallback-cascades)
9. [Post-Generation Validation](#post-generation-validation)
10. [Variables & State Tracking](#variables--state-tracking)
11. [Edge Cases & Special Handling](#edge-cases--special-handling)
12. [Examples & Scenarios](#examples--scenarios)

---

## Algorithm Overview

The RosterSync roster generation algorithm is a **greedy, fairness-optimized scheduling engine** that assigns doctors to shifts on a day-by-day basis for a given month. Rather than trying to solve the entire month at once (which would be computationally expensive), it processes each day sequentially and selects the **most fair candidate** based on multiple weighted criteria.

### High-Level Flow

```
INPUT: 
  - Month & Year to schedule
  - List of all doctors in department
  - All requests (LEAVE, UNAVAILABLE, SWAP) marked APPROVED

OUTPUT:
  - Complete monthly roster with shift assignments
  - Fairness report with warnings if criteria violated
  - Metrics for each doctor (hours, weekends, holidays worked)

FOR EACH DAY IN MONTH:
  1. Determine if day is weekend/weekday/public holiday
  2. Filter doctors to identify who is ELIGIBLE
  3. Sort eligible doctors by FAIRNESS CRITERIA
  4. Assign most fair doctor to the shift
  5. Update all tracking statistics
  6. (Handle fallbacks if no eligible candidate found)

RETURN: Roster + FairnessReport
```

---

## Core Principles

### 1. **Cross-Month Fairness (Cumulative Tracking)**
The algorithm maintains **longitudinal fairness** by considering cumulative hours from all previous published months. This prevents situations where a doctor gets overloaded in consecutive months.

**Why This Matters:**
- A doctor who worked 380 hours in January should work fewer hours in February
- Fairness is department-wide and persistent, not reset monthly
- This is tracked via `User.cumulativeTotalHours` and `User.cumulativeWeekendShifts`

### 2. **New Joiner Fairness**
Doctors who recently joined the department should NOT be penalized for having fewer cumulative hours. They need time to reach the "steady state."

**Implementation:**
- Doctor with `startDate` < 2 months ago is marked as "new joiner"
- Their "effective cumulative hours" are calculated proportionally
- They're allowed slight catch-up without being overworked

### 3. **No Consecutive Shifts (Hard Constraint)**
A doctor cannot work on consecutive days. If they worked Monday, they cannot work Tuesday.

**Why This Matters:**
- Medical professionals need rest between shifts to stay alert
- Prevents burnout and patient safety risks
- This is a **hard constraint** that must always be respected unless the entire department is unavailable

### 4. **Rolling 7-Day Window (Soft Constraint)**
No doctor should work more than `MAX_SHIFTS_PER_7_DAYS` (currently set to 2) shifts within any rolling 7-day period.

**Example:**
- If a doctor worked on March 1st and March 3rd, they cannot work again until after March 8th
- This prevents clustering of shifts and ensures steady distribution

### 5. **Weekend Equity (Primary Sort on Weekends)**
When assigning weekend shifts, the algorithm **first checks and balances weekend counts** across all doctors.

**Why This Matters:**
- Weekends are more valuable personal time (harder to work)
- Everyone should share weekend burden equally
- If one doctor already did 2 weekends, they shouldn't do a 3rd until others catch up

### 6. **Public Holiday Longitudinal Tracking**
Public holiday hours are tracked cumulatively across years (not reset monthly). Doctors with fewer PH hours get priority for PH assignments.

**Public Holidays in System (South Africa):**
- Fixed dates: New Year's Day (Jan 1), Human Rights Day (Mar 21), etc.
- Moveable dates: Easter, Good Friday (calculated annually using Computus algorithm)
- Sunday holidays: If a holiday falls on Sunday, the following Monday is observed

---

## Input Parameters

### `generate(month, year, doctors, requests, config?)`

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `month` | `number` (0-11) | Yes | Month to generate (0=January, 11=December) |
| `year` | `number` | Yes | Year to generate (e.g., 2025) |
| `doctors` | `User[]` | Yes | Array of all doctors in the department |
| `requests` | `Request[]` | Yes | Array of all requests (includes PENDING, APPROVED, REJECTED) |
| `config` | Object | No | Configuration overrides: `{ maxHourDiff?: 24, maxWeekendDiff?: 1 }` |

#### Config Defaults
- `maxHourDiff`: 24 hours (≤ 1 shift difference acceptable)
- `maxWeekendDiff`: 1 shift (weekend shifts should differ by ≤1 between doctors)

### Filtering Input Requests

**Only APPROVED requests are considered for exclusion:**
```typescript
const approvedRequests = requests.filter(r => r.status === RequestStatus.APPROVED)
```

This means:
- PENDING requests are ignored (doctor still works scheduled shifts)
- REJECTED requests are ignored
- Only APPROVED requests force exclusions

---

## Data Structures

### User (Doctor Profile)

```typescript
interface User {
  id: string;                          // Unique identifier
  name: string;                        // Doctor's name
  email: string;                       // Email address
  role: Role;                          // ADMIN or DOCTOR
  firm: string;                        // Team/firm label (informational)
  cumulativeHolidayHours: number;      // Total PH hours across all months
  cumulativeTotalHours?: number;       // Total work hours across all published months
  cumulativeWeekendShifts?: number;    // Weekend shift count across all published months
  startDate?: number;                  // Timestamp when doctor joined department
}
```

### Request (Time-Off / Unavailability Request)

```typescript
interface Request {
  id: string;                          // Unique identifier
  doctorId: string;                    // Which doctor made the request
  type: RequestType;                   // UNAVAILABLE, SWAP, or LEAVE
  date: string;                        // YYYY-MM-DD format
  status: RequestStatus;               // PENDING, APPROVED, or REJECTED
  reason?: string;                     // Optional reason (admin-only visible)
  createdAt: number;                   // Timestamp for first-come-first-served
  swapWithDoctorId?: string;           // For SWAP requests: target doctor
}
```

**Request Types:**
- `UNAVAILABLE`: Doctor cannot work (personal reason, already have another commitment)
- `LEAVE`: Doctor is on approved leave (strongest form of unavailability)
- `SWAP`: Doctor wants to swap shifts with another specific doctor

### ShiftTemplate (Shift Definition)

```typescript
interface ShiftTemplate {
  id: string;                          // 'weekday' or 'weekend'
  name: string;                        // Human-readable name
  startTime: string;                   // HH:MM format (24-hour)
  endTime: string;                     // HH:MM format (24-hour)
  totalHours: number;                  // Total duration (16 for weekday, 24 for weekend)
  isWeekend: boolean;                  // true for Sat/Sun, false for Mon-Fri
}
```

**Built-in Templates:**
```typescript
// Weekday: 16:00 to 08:00 (next day) = 16 hours
{ id: 'weekday', totalHours: 16, isWeekend: false }

// Weekend: 08:00 to 08:00 (next day) = 24 hours  
{ id: 'weekend', totalHours: 24, isWeekend: true }
```

### ScheduledShift (Shift Assignment)

```typescript
interface ScheduledShift {
  id: string;                          // s-YYYY-MM-DD
  date: string;                        // YYYY-MM-DD the shift is assigned
  doctorId: string;                    // Which doctor is assigned
  templateId: string;                  // 'weekday' or 'weekend'
  isPublicHoliday: boolean;            // true if this date is a public holiday
}
```

### Internal Stats Tracking (`stats` object)

During generation, the algorithm maintains a **mutable stats object** for all doctors:

```typescript
stats[doctorId] = {
  totalHours: number;                  // Hours assigned THIS MONTH
  cumulativeHours: number;             // Effective cumulative (adjusted for new joiners)
  actualCumulativeHours: number;       // REAL cumulative (for reporting)
  weekends: number;                    // Weekend shifts THIS MONTH
  cumulativeWeekends: number;          // Total weekend shifts (historical)
  holidays: number;                    // Public holiday hours THIS MONTH
  lastWorkedDay: number;               // Last day (1-31) this doctor worked
  monthsActive: number;                // Months since start date
  isNewJoiner: boolean;                // true if < 2 months active
  workedDays: number[];                // [1, 3, 5, ...] days worked THIS MONTH
}
```

---

## Phase-by-Phase Execution

### Phase 0: Initialization

#### Step 0.1: Calculate Days in Month
```typescript
const daysInMonth = new Date(year, month + 1, 0).getDate()
// Returns 28-31 depending on month/year
```

#### Step 0.2: Extract Approved Requests
```typescript
const approvedRequests = requests.filter(r => r.status === RequestStatus.APPROVED)
```
Only these requests will exclude doctors from shifts.

#### Step 0.3: Calculate Average Cumulative Hours
```typescript
const activeDoctors = doctors.filter(d => (d.cumulativeTotalHours ?? 0) > 0);
const avgCumulativeHours = activeDoctors.length > 0 
  ? activeDoctors.reduce((sum, d) => sum + (d.cumulativeTotalHours ?? 0), 0) / activeDoctors.length
  : 0;
const avgMonthlyHours = avgCumulativeHours > 0 ? avgCumulativeHours / 3 : 400;
```

**Purpose:** Establish a baseline for "expected" hours per month for fairness comparison.

**Default:** If no doctor has any history, assume 400 hours per month as baseline.

#### Step 0.4: Initialize Stats for All Doctors
For each doctor:
1. Calculate how many months they've been active
2. Determine if they're a "new joiner" (< 2 months)
3. Calculate their expected cumulative hours (proportional to months active)
4. Set their effective cumulative (normal cumulative for veterans, proportional for new joiners)

```typescript
const monthsActive = getMonthsActive(doc.startDate, month, year);
const isNewJoiner = monthsActive < 2;
const expectedHours = getExpectedCumulativeHours(avgMonthlyHours, monthsActive);
const effectiveCumulative = isNewJoiner 
  ? Math.max(actualCumulative, expectedHours * 0.8)  // Allow 20% catch-up
  : actualCumulative;
```

**Example:**
- Dr. Alice: Joined 6 months ago, has 2000 cumulative hours
  - `monthsActive = 6`, `isNewJoiner = false`
  - `effectiveCumulative = 2000`
  
- Dr. Bob: Joined 1 month ago, has 50 cumulative hours
  - `monthsActive = 1`, `isNewJoiner = true`  
  - `expectedHours = 400 * 1 = 400` hours
  - `effectiveCumulative = max(50, 400 * 0.8) = 320` hours
  - This allows them to "catch up" without being overworked

#### Step 0.5: Load Public Holidays
```typescript
const saHolidays = getSAPublicHolidays(year, month === 11)
```

Returns array of "YYYY-MM-DD" strings for all South African public holidays for the given year (and next year if it's December).

---

### Phase 1: Day-by-Day Processing Loop

The algorithm processes EACH DAY sequentially from day 1 to daysInMonth.

#### Step 1.1: Determine Day Properties
```typescript
for (let day = 1; day <= daysInMonth; day++) {
  const dateStr = `${year}-${(month + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  // Example: "2025-02-15"
  
  const date = new Date(year, month, day);
  const isWeekend = date.getDay() === 0 || date.getDay() === 6;  // Sunday (0) or Saturday (6)
  const isPH = saHolidays.includes(dateStr);
  const template = isWeekend ? weekendT : weekdayT;  // 24h or 16h shift
}
```

**Variables Set:**
- `dateStr`: Date in YYYY-MM-DD format
- `isWeekend`: Boolean (true for Sat/Sun)
- `isPH`: Boolean (true if public holiday)
- `template`: ShiftTemplate object (defines shift hours)

#### Step 1.2: Calculate Recent Shift Count (Rolling 7-Day Window)
```typescript
const getRecentShifts = (doctorId: string, windowDays: number = 7) => {
  const days = stats[doctorId].workedDays as number[];
  return days.filter(d => day - d >= 0 && day - d < windowDays).length;
};

// Usage: getRecentShifts('doctor-id') returns count of shifts in last 7 days
```

**Example:** If today is March 15 and doctor worked on March 10 and March 12:
- Window covers March 9-15 (7 days backward from March 15)
- March 10 is within window (day - 10 = 5 days ago)
- March 12 is within window (day - 12 = 3 days ago)
- Result: 2 shifts

#### Step 1.3: Identify Unavailable Doctors
```typescript
const unavailable = approvedRequests
  .filter(r => r.date === dateStr && (r.type === RequestType.LEAVE || r.type === RequestType.UNAVAILABLE))
  .map(r => r.doctorId);
```

Creates a list of doctor IDs who cannot work this day due to approved leave/unavailability requests.

---

### Phase 2: Fairness Sorting Function

#### Overview
The `sortByFairness()` function implements **a weighted priority system** that ranks doctors from most fair to least fair. It uses a multi-tier sorting approach where each tier is only considered if previous tiers are tied.

#### Complete Sorting Logic (Tier by Tier)

```typescript
const sortByFairness = (pool: User[]) => {
  pool.sort((a, b) => {
    // TIER 1: Weekend Equity (on weekend days only)
    if (isWeekend) {
      const wDiffCum = (stats[a.id].cumulativeWeekends + stats[a.id].weekends) - 
                       (stats[b.id].cumulativeWeekends + stats[b.id].weekends);
      if (wDiffCum !== 0) return wDiffCum;
    }

    // TIER 2: Public Holiday Equity (on public holiday dates only)
    if (isPH) {
      const phDiff = stats[a.id].holidays - stats[b.id].holidays;
      if (phDiff !== 0) return phDiff;
    }

    // TIER 3: Rolling 7-Day Load
    const recentA = getRecentShifts(a.id);
    const recentB = getRecentShifts(b.id);
    const recentDiff = recentA - recentB;
    if (recentDiff !== 0) return recentDiff;

    // TIER 4: Combined Cumulative + Monthly Hours
    const combinedHoursA = stats[a.id].cumulativeHours + stats[a.id].totalHours;
    const combinedHoursB = stats[b.id].cumulativeHours + stats[b.id].totalHours;
    const hourDiff = combinedHoursA - combinedHoursB;
    if (hourDiff !== 0) return hourDiff;

    // TIER 5: New Joiner Preference
    if (stats[a.id].isNewJoiner !== stats[b.id].isNewJoiner) {
      return stats[a.id].isNewJoiner ? -1 : 1;  // Prefer new joiner
    }

    // TIER 6: Rest Days Tiebreaker
    const daysSinceA = day - stats[a.id].lastWorkedDay;
    const daysSinceB = day - stats[b.id].lastWorkedDay;
    return daysSinceB - daysSinceA;  // More rest = higher priority
  });
};
```

#### Detailed Tier Explanation

**TIER 1: Weekend Equity** (Only for Sat/Sun shifts)
- **What it checks:** Weekend + cumulative weekend shifts
- **Formula:** `(cumulative_weekends_a + this_month_weekends_a) - (cumulative_weekends_b + this_month_weekends_b)`
- **Result:** Most negative = fewest weekends = gets priority
- **Why:** Weekends are prime personal time; distribution should be fair
- **Skipped for:** Weekday assignments

**Example:**
- Dr. Alice: 3 cumulative + 1 this month = 4 total
- Dr. Bob: 3 cumulative + 2 this month = 5 total
- Difference: 4 - 5 = -1
- Dr. Alice wins (fewer weekends)

---

**TIER 2: Public Holiday Equity** (Only on public holiday dates)
- **What it checks:** Public holiday hours this month
- **Formula:** `holidays_a - holidays_b`
- **Result:** Most negative = fewest PH hours = gets priority
- **Why:** PH hours are traditionally fought over; fairness is important
- **Skipped for:** Regular workdays

**Example:**
- Dr. Alice: 0 PH hours assigned so far
- Dr. Bob: 16 PH hours assigned (one 24h weekend on a PH)
- Difference: 0 - 16 = -16
- Dr. Alice wins (fewer PH hours)

---

**TIER 3: Rolling 7-Day Load** (Applied every day)
- **What it checks:** How many shifts in the last 7 days
- **Formula:** `recent_shifts_a - recent_shifts_b`
- **Result:** Lower count = gets priority
- **Why:** Prevents clustering; ensures spread-out assignments
- **Always checked:** This is fundamental to shift distribution

**Example:**
- Dr. Alice: Worked on days [5, 8, 12], today is day 15
  - Recent shifts: days 8, 12 (within 7 days) = 2 shifts
- Dr. Bob: Worked on days [6, 10], today is day 15
  - Recent shifts: only day 10 (within 7 days) = 1 shift
- Difference: 2 - 1 = +1
- Dr. Bob wins (fewer recent shifts)

---

**TIER 4: Combined Cumulative + Monthly Hours**
- **What it checks:** Total hours considering both previous months and this month
- **Formula:** `(cumulative_a + this_month_a) - (cumulative_b + this_month_b)`
- **Result:** Lower total = gets priority
- **Why:** Primary cross-month fairness mechanism
- **Always checked:** This prevents one doctor accumulating excessive hours

**Example:**
- Dr. Alice: 1900 cumulative + 48 this month = 1948 total
- Dr. Bob: 1800 cumulative + 40 this month = 1840 total
- Difference: 1948 - 1840 = +108
- Dr. Bob wins (fewer total hours)

---

**TIER 5: New Joiner Preference**
- **What it checks:** Is one doctor a new joiner and the other isn't?
- **Result:** If different, new joiner gets priority (-1 = first)
- **Why:** New joiners need to integrate and catch up gradually
- **Only used if:** Both doctors have equal cumulative hours

**Example:**
- Dr. Alice: 2 months active, isNewJoiner = true
- Dr. Bob: 6 months active, isNewJoiner = false
- Result: Dr. Alice wins (slightly preferred when tied)

---

**TIER 6: Rest Days Tiebreaker**
- **What it checks:** How many days since last worked
- **Formula:** `(day - lastWorkedDay_b) - (day - lastWorkedDay_a)`
- **Result:** More rest = higher priority
- **Why:** Doctor who rested longer deserves next shift
- **Only used when:** Everything else is identical

**Example:**
- Today is March 15
- Dr. Alice: lastWorkedDay = 12 → 15 - 12 = 3 days rest
- Dr. Bob: lastWorkedDay = 10 → 15 - 10 = 5 days rest
- Difference: 5 - 3 = +2
- Dr. Bob wins (more rest)

---

#### Sorting Result
After sorting, `pool[0]` is the **most fair doctor** to assign the shift to.

---

### Phase 3: Eligibility Filtering & Assignment

#### Step 3.1: Apply Hard Constraints (Create Eligible Pool)
```typescript
let eligible = doctors.filter(doc => 
  !unavailable.includes(doc.id) &&                          // Not on approved leave
  stats[doc.id].lastWorkedDay !== day - 1 &&               // No consecutive shifts
  getRecentShifts(doc.id) < MAX_SHIFTS_PER_7_DAYS          // Not over 7-day cap
);
```

**Three Hard Constraints:**
1. **Approved Leave/Unavailability:** Doctor cannot work
2. **Consecutive Shifts:** Doctor worked yesterday, so cannot work today
3. **7-Day Rolling Cap:** Doctor already worked 2 shifts in last 7 days (cannot work 3rd)

#### Step 3.2: Sort by Fairness
```typescript
sortByFairness(eligible);
```

#### Step 3.3: Assignment (Happy Path)
```typescript
if (eligible.length > 0) {
  const selected = eligible[0];  // Most fair doctor
  shifts.push({
    id: `s-${dateStr}`,
    date: dateStr,
    doctorId: selected.id,
    templateId: isWeekend ? weekendT.id : weekdayT.id,
    isPublicHoliday: isPH
  });

  const sTemplate = isWeekend ? weekendT : weekdayT;
  stats[selected.id].totalHours += sTemplate.totalHours;
  if (isWeekend) stats[selected.id].weekends++;
  if (isPH) stats[selected.id].holidays += sTemplate.totalHours;
  stats[selected.id].lastWorkedDay = day;
  stats[selected.id].workedDays.push(day);
}
```

**State Updates After Assignment:**
- Add ScheduledShift to roster
- Increment cumulative hours for the month
- If weekend: increment weekend count
- If PH: increment holiday hour count
- Update lastWorkedDay
- Push day to workedDays (for rolling window tracking)

---

## Constraint Handling

### What Happens When No Eligible Doctor Exists?

The algorithm implements a **cascading fallback strategy** to ensure a shift is ALWAYS assigned (unless absolutely impossible).

#### Fallback Level 1: Relax 7-Day Cap, Keep Consecutive Rule
```typescript
if (eligible.length === 0) {
  const leaveDoctors = approvedRequests
    .filter(r => r.date === dateStr && r.type === RequestType.LEAVE)
    .map(r => r.doctorId);

  let relaxedCandidates = doctors.filter(doc => 
    !leaveDoctors.includes(doc.id) &&                       // Still exclude LEAVE
    getRecentShifts(doc.id) < MAX_SHIFTS_PER_7_DAYS        // Still keep 7-day cap
  );
```

**What's relaxed:** Consecutive shift rule (can work 2 days in a row if necessary)  
**What's kept:** LEAVE request honored, 7-day cap maintained

#### Fallback Level 2: Relax 7-Day Cap, Allow Consecutive
```typescript
if (relaxedCandidates.length === 0) {
  relaxedCandidates = doctors.filter(doc => !leaveDoctors.includes(doc.id));
}
```

**What's relaxed:** Both 7-day cap AND consecutive shift rule  
**What's kept:** LEAVE requests still honored (hard barrier)

**Why LEAVE is Never Relaxed:**
- LEAVE is an approved absence (typically external commitment)
- Violating it would create legal/HR issues
- UNAVAILABLE can be overridden, but LEAVE cannot

#### Fallback Level 3: Sort and Assign
```typescript
sortByFairness(relaxedCandidates);
eligible = relaxedCandidates;

if (eligible.length > 0) {
  // Assign eligible[0]
  // (State update same as normal path)
}
```

**Result:** A shift is assigned (might be unfair, but it gets filled)

#### No Assignment Possible
```typescript
if (eligible.length === 0) {
  // No shift assigned for this day
  // (Rare scenario: all doctors on LEAVE)
}
```

**When this happens:**
- Entire department is on leave
- OR impossible constraint combination
- Day has no assigned shift (reports will flag this)

---

## Fairness Metrics & Sorting

### Per-Doctor Metrics Calculated

For each doctor, the algorithm tracks:

| Metric | Type | When Updated | Purpose |
|--------|------|--------------|---------|
| `totalHours` | number | After each assignment | Hours THIS MONTH |
| `cumulativeHours` | number | Initialization only | Effective cumulative (adjusted for new joiners) |
| `actualCumulativeHours` | number | Initialization only | Real cumulative from User object |
| `weekends` | number | Weekend assignment | Weekend shifts THIS MONTH |
| `cumulativeWeekends` | number | Initialization only | Total weekend shifts (historical) |
| `holidays` | number | PH assignment | Public holiday hours THIS MONTH |
| `cumulativeHolidayHours` | number | From User object | Total PH hours (historical) |
| `lastWorkedDay` | number | After each assignment | Day number (1-31) last worked |
| `monthsActive` | number | Initialization only | Months since startDate |
| `isNewJoiner` | boolean | Initialization only | true if < 2 months active |
| `workedDays` | number[] | After each assignment | Days worked [1,3,5,7,...] |

### FairnessReport

After generation, a comprehensive report is generated:

```typescript
interface FairnessReport {
  isFair: boolean;                      // true if all warnings empty
  warnings: string[];                   // List of fairness violations
  metrics: FairnessMetric[];            // Per-doctor breakdown
}

interface FairnessMetric {
  doctorId: string;
  totalHours: number;                   // Hours THIS MONTH
  weekendShifts: number;                // Weekend shifts THIS MONTH
  weekdayShifts: number;                // Weekday shifts THIS MONTH
  holidayShifts: number;                // Public holiday shift count
  holidayHours: number;                 // Public holiday hours THIS MONTH
}
```

---

## Post-Generation Validation

### FairnessValidator

After all shifts are assigned, the roster is validated against fairness criteria:

```typescript
validateFairness(doctors, stats, shifts, config): FairnessReport
```

#### Validation Checks

**Check 1: Hour Discrepancy (Page 3 Rule)**
```typescript
const hours = metrics.map(m => m.totalHours);
const maxHourDiff = config?.maxHourDiff ?? 24;  // Default: ≤1 shift (24h)
const max = Math.max(...hours);
const min = Math.min(...hours);

if (max - min > maxHourDiff) {
  warnings.push(`Hour Discrepancy: ${max - min}h difference exceeds limit of ≤1 shift (${maxHourDiff}h).`);
}
```

**Interpretation:**
- Maximum allowed difference: 24 hours (one shift = 16h weekday or 24h weekend)
- If Dr. Alice has 128 hours and Dr. Bob has 160 hours, difference = 32h → **WARNING**
- This check ensures final fairness within acceptable bounds

---

**Check 2: Weekend Imbalance (Page 3 Rule)**
```typescript
const weekends = metrics.map(m => m.weekendShifts);
const maxWeekendDiff = config?.maxWeekendDiff ?? 1;

if (Math.max(...weekends) - Math.min(...weekends) > maxWeekendDiff) {
  warnings.push(`Weekend Imbalance: Difference exceeds limit of ${maxWeekendDiff} shift(s).`);
}
```

**Interpretation:**
- Someone should not do all the weekends
- Difference > 1 triggers warning
- If Dr. C did 4 weekends and Dr. E did 2, difference = 2 → **WARNING**

---

### Warning Generation Logic

```typescript
return {
  isFair: warnings.length === 0,        // true only if no warnings
  warnings,
  metrics
};
```

---

## Variables & State Tracking

### Global Variables

| Variable | Type | Purpose |
|----------|------|---------|
| `daysInMonth` | number | Total days in target month (28-31) |
| `approvedRequests` | Request[] | Only APPROVED requests (LEAVE/UNAVAILABLE) |
| `avgCumulativeHours` | number | Department average cumulative hours |
| `avgMonthlyHours` | number | Calculated as avgCumulative / 3 |
| `shifts` | ScheduledShift[] | Accumulates all assignments (output) |
| `stats` | Record<string, any> | Per-doctor mutable state during generation |
| `weekdayT` | ShiftTemplate | 16-hour night shift template |
| `weekendT` | ShiftTemplate | 24-hour weekend template |
| `saHolidays` | string[] | Public holidays for the year |

### Loop Variables (Per Day)

| Variable | Type | Purpose |
|----------|------|---------|
| `day` | number | Current day (1-daysInMonth) |
| `dateStr` | string | YYYY-MM-DD formatted date |
| `date` | Date | JavaScript Date object for day |
| `isWeekend` | boolean | true for Sat/Sun |
| `isPH` | boolean | true if public holiday |
| `template` | ShiftTemplate | Shift template for the day |
| `unavailable` | string[] | Doctors excluded from this day |
| `eligible` | User[] | Doctors meeting hard constraints |

---

## Edge Cases & Special Handling

### Edge Case 1: New Joiner Effective Cumulative Calculation

**Scenario:** Dr. Xavier joined 1 month ago with 50 actual hours; department average is 400/month.

**Calculation:**
```
monthsActive = 1
isNewJoiner = true
expectedHours = 400 * min(1, 6) = 400
effectiveCumulative = max(50, 400 * 0.8) = max(50, 320) = 320
```

**Interpretation:** 
- Real cumulative: 50 hours (just started)
- Fair comparison: 320 hours (proportional catch-up allowed)
- When sorting, Xavier is treated as having 320 hours, not 50
- This prevents him from getting ALL shifts just because he's new

### Edge Case 2: Public Holiday on Weekend

**Example:** Christmas (Dec 25) falls on Saturday in 2025

**Processing:**
```
isWeekend = true (Saturday)
isPH = true (Christmas)
template = weekendT (24 hours)

// TIER 1: Weekend equity takes priority
// TIER 2: PH equity also applies
// Result: Doctor with fewest weekends AND fewest PH hours wins
```

**Double Equity:** Both weekend priority AND PH priority apply, making this shift highly competitive.

### Edge Case 3: Everyone at 7-Day Cap

**Scenario:** It's day 15, and all 6 doctors have already worked 2 shifts in days 9-14.

**Processing:**
```
eligible = [] (no one under 7-day cap)
relaxedCandidates = [] (still no one under cap)
relaxedCandidates = ALL DOCTORS (except LEAVE) (relax cap)
sortByFairness(relaxedCandidates)
// Assign doctor with combined lowest hours
```

**Result:** Someone works 3 shifts in 7 days (cap relaxed, but still fairness-sorted)

### Edge Case 4: No Eligible Doctor Exists (Entire Department Leave)

**Scenario:** Month is February, all 6 doctors have LEAVE for Feb 14.

**Processing:**
```
unavailable = ['A', 'B', 'C', 'D', 'E', 'F']
eligible = [] (all unavailable)

// Fallback 1
leaveDoctors = ['A', 'B', 'C', 'D', 'E', 'F']
relaxedCandidates = [] (still all on leave)

// Fallback 2
relaxedCandidates = [] (no one left)

// No assignment for Feb 14
shifts for Feb 14 = NONE
```

**Report:** "No doctor available for Feb 14" (admin must manually fix or approve override)

### Edge Case 5: Tiebreaker Chain

**Scenario:** Two doctors are equally fair on all metrics up to Tier 6.

**Example:**
- Dr. Elena: lastWorkedDay = 12
- Dr. Frank: lastWorkedDay = 10
- Today: day 15

**Processing:**
```
daysSinceElena = 15 - 12 = 3
daysSinceFrank = 15 - 10 = 5
difference = 5 - 3 = 2 (positive, so Frank comes first)
```

**Result:** Frank gets priority (more rest)

### Edge Case 6: Consecutive Shifts Required (Fallback)

**Scenario:** Day 15 is the only day left for Dr. Grace to work. She worked day 14. Fallback allows it.

**Processing:**
```
Tier 1 check: stats[Grace].lastWorkedDay === 14 (day - 1)
// Excluded from eligible pool initially

// Fallback 1: Relax consecutive rule
relaxedCandidates includes Grace (7-day cap still OK)
sortByFairness(relaxedCandidates)

// Grace might be highest priority due to low hours
// Assignment: Grace works consecutive days 14-15
```

**Report:** "No consecutive shifts violation detected" (system is tracking it, but allowed via fallback)

---

## Examples & Scenarios

### Scenario 1: Simple February Month

**Setup:**
- 6 doctors: Alice, Bob, Charlie, Diana, Edward, Fiona
- 28 days in February 2025
- No requests approved
- All doctors at equilibrium (similar cumulative hours)

**Expected Pattern:**
```
Day 1 (Sun):  Weekend (24h) → Doctor with fewest historic weekends
Day 2 (Mon):  Weekday (16h)  → Different doctor (not day 1)
Day 3 (Tue):  Weekday (16h)  → Another different doctor
...
Day 7 (Sat):  Weekend (24h) → Doctor with fewest weekends overall
Day 8 (Sun):  Weekend (24h) → Another doctor
```

**Total Hours:**
- Each doctor works: 4 days × 16h + 4 days × 24h = 64 + 96 = 160h
- All equal: **FAIR**

### Scenario 2: New Joiner Takes Priority

**Setup:**
- 3 doctors: Dr. Veteran (2000 cumulative, 6 months active), Dr. Average (1600 cumulative, 4 months active), Dr. New (50 cumulative, 1 month active)
- All other metrics equal on March 1

**Processing:**
```
Veteran cumulative: 2000
Average cumulative: 1600
New cumulative: 50 → effective: max(50, 400 * 0.8 * 1) = 320

TIER 4 (combined hours): 
  Veteran: 2000 + 0 = 2000
  Average: 1600 + 0 = 1600
  New: 320 + 0 = 320 ← LOWEST
  
Result: Dr. New assigned (higher priority)
```

**Output:** New joiner integrated fairly, not dropped into overwork

### Scenario 3: Public Holiday on Weekend

**Setup:**
- December 25, 2025 (Friday)
- 6 doctors: A (0 PH hours,1 weekend), B (16 PH hours, 1 weekend), C (8 PH hours, 2 weekends), ...

**Day 25 Processing:**
```
isWeekend = false (Friday, not weekend per calendar)
isPH = true (Christmas Day)

// TIER 1: Weekday assignment, so weekend equity skipped
// TIER 2: PH equity applies
  A: 0 PH hours ← LOWEST
  B: 16 PH hours
  C: 8 PH hours
  
Result: Dr. A assigned (fewest PH hours)
```

**Wait!** Let me recalculate:
```
Dec 25, 2025 is actually THURSDAY (not weekend)
isWeekend = false
isPH = true

Since not weekend, TIER 1 skipped
Since is PH, TIER 2 applies
A (0 PH) has the fewest → A wins
```

### Scenario 4: Request Conflicts & Fallback with Leave

**Setup:**
- Day 14 requires a shift
- Dr. A: LEAVE (approved)
- Dr. B: UNAVAILABLE (approved)
- Dr. C,D,E: All at 7-day cap (2 shifts in last 7)
- Dr. F: Only doctor under cap

**Processing:**
```
unavailable = [A, B]  // LEAVE + UNAVAILABLE
eligible = [C, D, E, F] minus those with 7-day issue = [F only]

sortByFairness([F])
Result: F assigned even if unfairly loaded

If F was also over-cap:
  relaxedCandidates = [C, D, E, F] (relax 7-day)
  sortByFairness(relaxedCandidates)
  Assign lowest-hours doctor
```

### Scenario 5: Year-End PH Tracking Across Months

**Setup:**
- Dr. G assigned 3 weekend PH shifts in December (total 72 hours)
- `cumulativeHolidayHours` updated to 72
- January is the new month

**Processing:**
```
January assignments start fresh:
  Dr. G: stats[G].holidays = 0 (this month)
  Dr. G: stats[G].cumulativeHolidayHours = 72 (historical)

On Jan 1 (New Year's Day, PH):
  TIER 2 check: holidays_G = 0 (this month counter)
  G appears as having 0 PH hours this month
  BUT cumulativeHolidayHours = 72 informs weighted fairness
  
Result: G might get lower priority in future PH assignments
```

**Critical:** Monthly metrics and cumulative metrics are kept separate:
- Monthly: Used for "this month's fairness within the roster"
- Cumulative: Used for "long-term fairness across months"

---

## Algorithm Pseudocode Summary

```pseudocode
FUNCTION generate(month, year, doctors, requests):
  // Phase 0: Initialize
  daysInMonth = getDaysInMonth(month, year)
  approvedRequests = requests.filterByStatus(APPROVED)
  stats = initializeStatsForAllDoctors(doctors, month, year)
  saHolidays = getSAPublicHolidays(year)
  shifts = []
  
  // Phase 1: Day-by-day loop
  FOR day = 1 TO daysInMonth:
    dateStr = formatDate(year, month, day)
    isWeekend = isDayWeekend(year, month, day)
    isPH = isPublicHoliday(dateStr, saHolidays)
    template = isWeekend ? WEEKEND_24h : WEEKDAY_16h
    
    // Phase 2: Identify unavailable
    unavailable = getUnavailableDoctors(dateStr, approvedRequests)
    
    // Phase 3: Filter eligible doctors
    eligible = doctors.filter(doc => 
      !unavailable.contains(doc) AND
      doc.lastWorkedDay != day-1 AND
      getRecentShifts(doc) < MAX_SHIFTS_7_DAY
    )
    
    // Phase 4: Sort by fairness
    sortByFairness(eligible, isWeekend, isPH, stats)
    
    // Phase 5: Fallback if needed
    IF eligible.isEmpty():
      eligible = fallbackStrategy(unavailable)
    END IF
    
    // Phase 6: Assign
    IF !eligible.isEmpty():
      selected = eligible[0]
      shifts.append(createShift(selected, dateStr, template, isPH))
      updateStats(stats[selected], template, isPH)
    END IF
  END FOR
  
  // Phase 7: Generate report
  report = validateFairness(doctors, stats, shifts)
  
  RETURN {roster: {shifts, month, year}, report}
END FUNCTION
```

---

## Performance Considerations

### Time Complexity
- **Per day:** O(d log d) where d = number of doctors (sorting)
- **Per month:** O(n × d log d) where n = days in month
- **Overall:** O(30 × 6 log 6) ≈ O(180) for typical 6-doctor department

### Space Complexity
- **shifts array:** O(n) = O(30) days × 1 shift per day
- **stats object:** O(d) = O(6) doctors
- **Overall:** O(n + d) = O(36)

### Optimization Notes
- Single pass through the month (cannot preplan all shifts)
- No backtracking (greedy assignment is final)
- Sorting is O(d log d) per day, negligible for d ≤ 10

---

## Summary

The RosterSync roster generation algorithm is a **multi-criteria, cascade-based greedy scheduler** that:

1. **Processes daily** from beginning to end of month
2. **Applies hard constraints** (no consecutive shifts, LEAVE respected, 7-day cap)
3. **Sorts by fairness** using 6-tier weighted priority system
4. **Selects most fair doctor** and updates all tracking statistics
5. **Implements fallbacks** if constraints cannot be met
6. **Validates post-generation** against fairness thresholds
7. **Reports warnings** if fairness criteria violated

**Key Innovations:**
- ✅ Cross-month cumulative fairness tracking
- ✅ New joiner proportional fairness
- ✅ Rolling 7-day window enforcement
- ✅ Weekend and PH equity prioritization
- ✅ Multi-tier sorting with tiebreakers
- ✅ Cascading fallback strategy
- ✅ Comprehensive validation reporting

This approach balances **fairness** with **feasibility**, ensuring a workable roster is generated while maintaining broad equity across the department.
