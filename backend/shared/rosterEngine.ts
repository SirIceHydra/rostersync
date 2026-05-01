import {
  User,
  Roster,
  ScheduledShift,
  Request,
  RequestType,
  RequestStatus,
  FairnessReport,
  FairnessMetric
} from './types.js';
import { SHIFT_TEMPLATES } from './constants.js';
import { getSAPublicHolidays } from './publicHolidays.js';

/**
 * Calculate how many months a doctor has been active in the system.
 * Used to determine if they're a "new joiner" who shouldn't be penalized.
 */
function getMonthsActive(startDate: number | undefined, currentMonth: number, currentYear: number): number {
  if (!startDate) return 12; // Assume veteran if no start date
  const start = new Date(startDate);
  const current = new Date(currentYear, currentMonth, 1);
  const monthsDiff = (current.getFullYear() - start.getFullYear()) * 12 + (current.getMonth() - start.getMonth());
  return Math.max(0, monthsDiff);
}

/**
 * Median of a numeric array. Returns 0 for empty input.
 * Used as a fairness floor for new joiners — placing them mid-pack so they compete
 * neither artificially harder (overloaded) nor artificially softer (underloaded).
 */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Resolve config flag aliases.
 * The engine prefers the new `minRestDays` slider but accepts the legacy boolean
 * `allowConsecutiveShifts` toggle for backwards compatibility.
 *  - allowConsecutiveShifts === true  → minRestDays = 0 (consecutive shifts allowed)
 *  - allowConsecutiveShifts === false → minRestDays = 1 (no consecutive — default)
 */
function resolveMinRestDays(config?: { minRestDays?: number; allowConsecutiveShifts?: boolean }): number {
  if (config?.minRestDays !== undefined && config.minRestDays !== null) {
    return Math.max(0, Math.floor(config.minRestDays));
  }
  if (config?.allowConsecutiveShifts === true) return 0;
  if (config?.allowConsecutiveShifts === false) return 1;
  return 1; // sensible default: at least 1 day off between shifts
}

/**
 * Post-generation swap optimiser.
 *
 * The greedy daily-assignment pass is excellent at respecting hard constraints and
 * producing a valid roster, but it can leave some doctors with 24h more than others
 * simply because of tiebreaker order (rest-days).  This pass iterates over the
 * (maxHours doctor) → (minHours doctor) pairs and tries to reassign a single
 * WEEKDAY shift from the over-loaded doctor to the under-loaded one while keeping:
 *   - Min rest days between shifts (configurable; default 1 = no consecutive)
 *   - The rolling 7-day shift cap
 *   - Approved LEAVE / UNAVAILABLE / POST_CALL_OFF for the receiving doctor
 *
 * Only weekday shifts are moved so that weekend equity determined by the main
 * algorithm is preserved.  The pass runs until max-min ≤ threshold or no valid
 * swap exists.
 */
function optimizeFairness(
  shifts: ScheduledShift[],
  stats: Record<string, any>,
  doctors: User[],
  config?: { maxHourDiff?: number; maxShiftsPer7Days?: number; minRestDays?: number; allowConsecutiveShifts?: boolean },
  approvedRequests: Request[] = []
): void {
  const maxHourDiff = config?.maxHourDiff ?? 24;
  const maxShiftsPer7Days = config?.maxShiftsPer7Days ?? 2;
  const minRestDays = resolveMinRestDays(config);

  const weekdayTemplate = SHIFT_TEMPLATES.find(t => !t.isWeekend);
  if (!weekdayTemplate) return;
  const weekdayTemplateId = weekdayTemplate.id;
  const weekdayHours = weekdayTemplate.totalHours;

  const maxIterations = doctors.length * 6;

  // Pre-compute exclusion sets per doctor based on approved requests.
  // POST_CALL_OFF and UNAVAILABLE/LEAVE all block the doctor from receiving a shift on that day.
  const blockedByDoctor: Record<string, Set<string>> = {};
  for (const req of approvedRequests) {
    if (
      req.type === RequestType.LEAVE ||
      req.type === RequestType.UNAVAILABLE ||
      req.type === RequestType.POST_CALL_OFF
    ) {
      if (!blockedByDoctor[req.doctorId]) blockedByDoctor[req.doctorId] = new Set();
      blockedByDoctor[req.doctorId].add(req.date);
    }
  }

  // Never reassign a shift that was originally a PREFERRED_WORK or POST_CALL_OFF call-day request —
  // the doctor specifically requested that day (or the day before their off-day).
  const preferredDates = new Set(
    approvedRequests
      .filter(r => r.type === RequestType.PREFERRED_WORK)
      .map(r => r.date)
  );
  // POST_CALL_OFF day X means the doctor wanted a call on X-1; protect X-1 too.
  const postCallProtectedDates = new Set<string>();
  for (const req of approvedRequests) {
    if (req.type !== RequestType.POST_CALL_OFF) continue;
    const d = new Date(req.date);
    d.setDate(d.getDate() - 1);
    const yyyy = d.getFullYear();
    const mm = (d.getMonth() + 1).toString().padStart(2, '0');
    const dd = d.getDate().toString().padStart(2, '0');
    postCallProtectedDates.add(`${yyyy}-${mm}-${dd}`);
  }

  function getWorkedDays(doctorId: string): number[] {
    return shifts
      .filter(s => s.doctorId === doctorId)
      .map(s => parseInt(s.date.split('-')[2], 10))
      .sort((a, b) => a - b);
  }

  function violatesMinRest(workedDays: number[], day: number): boolean {
    if (minRestDays === 0) return false;
    return workedDays.some(d => Math.abs(d - day) <= minRestDays && d !== day);
  }

  /**
   * Returns true if adding `dayToAdd` to `workedDays` would cause any rolling
   * 7-day window to exceed `maxShiftsPer7Days`.  We anchor windows at every
   * existing (and new) shift day so no window is missed.
   */
  function hasRollingWindowViolation(workedDays: number[], dayToAdd: number): boolean {
    const allDays = [...workedDays, dayToAdd].sort((a, b) => a - b);
    for (const anchor of allDays) {
      const count = allDays.filter(d => d >= anchor && d < anchor + 7).length;
      if (count > maxShiftsPer7Days) return true;
    }
    return false;
  }

  for (let iter = 0; iter < maxIterations; iter++) {
    const maxHours = Math.max(...doctors.map(d => stats[d.id].totalHours));
    const minHours = Math.min(...doctors.map(d => stats[d.id].totalHours));

    // Strict less-than: when max-min equals the threshold we are at the legal
    // boundary but should still try to improve since a single 16h weekday swap
    // can often reduce it further without violating any hard constraints.
    if (maxHours - minHours < maxHourDiff) break;

    const maxDoc = doctors.find(d => stats[d.id].totalHours === maxHours)!;
    const minDoc = doctors.find(d => stats[d.id].totalHours === minHours)!;

    // Attempt to move a weekday shift (lowest impact on weekend equity) from
    // the most-loaded to the least-loaded doctor. Skip protected days.
    const candidateShifts = shifts.filter(
      s => s.doctorId === maxDoc.id &&
           s.templateId === weekdayTemplateId &&
           !preferredDates.has(s.date) &&
           !postCallProtectedDates.has(s.date)
    );

    let improved = false;

    for (const shift of candidateShifts) {
      const day = parseInt(shift.date.split('-')[2], 10);

      // Receiving doctor must not already be working this day
      if (shifts.some(s => s.doctorId === minDoc.id && s.date === shift.date)) continue;

      // Receiving doctor must not be on approved LEAVE / UNAVAILABLE / POST_CALL_OFF
      if (blockedByDoctor[minDoc.id]?.has(shift.date)) continue;

      const minDocDays = getWorkedDays(minDoc.id);

      // Min-rest constraint for receiving doctor
      if (violatesMinRest(minDocDays, day)) continue;

      // Rolling 7-day cap for receiving doctor
      if (hasRollingWindowViolation(minDocDays, day)) continue;

      // Reassign the shift
      shift.doctorId = minDoc.id;
      stats[maxDoc.id].totalHours -= weekdayHours;
      stats[minDoc.id].totalHours += weekdayHours;

      improved = true;
      break;
    }

    if (!improved) break;
  }
}


export const RosterEngine = {
  /**
   * Generates a monthly roster following fairness rules.
   *
   * FAIRNESS ALGORITHM:
   * 1. Considers cumulative hours from previous months (cross-month fairness)
   * 2. Handles new joiners with team-median fair-share floor (no over- or under-loading)
   * 3. Prioritises weekend equity on weekend days
   * 4. Respects public holiday longitudinal tracking
   * 5. Enforces configurable minimum rest between shifts (minRestDays slider)
   * 6. Respects approved PREFERRED_WORK requests (doctor guaranteed priority on requested day)
   * 7. Respects approved POST_CALL_OFF requests (off on day X, prefers being on call day X-1)
   * 8. Configurable rolling 7-day shift cap (admin slider)
   * 9. Flags unassigned days and weekend off-request conflicts for admin review
   */
  generate(
    month: number,
    year: number,
    doctors: User[],
    requests: Request[],
    config?: {
      maxHourDiff?: number;
      maxWeekendDiff?: number;
      /** Max shifts a doctor can work in any rolling 7-day window. Admin slider. Default: 2 */
      maxShiftsPer7Days?: number;
      /**
       * Minimum number of days between shifts for the same doctor. Admin slider.
       *  - 0 = consecutive shifts allowed (use for very short-staffed depts only)
       *  - 1 = at least 1 day apart, i.e. no two shifts on consecutive days (default)
       *  - 2 = at least 2 days between shifts (stricter, well-staffed depts)
       */
      minRestDays?: number;
      /** Legacy boolean toggle. true → minRestDays=0; false → minRestDays=1. Use minRestDays for new code. */
      allowConsecutiveShifts?: boolean;
    }
  ): { roster: Roster; report: FairnessReport } {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const shifts: ScheduledShift[] = [];
    const unassignedDays: string[] = [];

    const maxShiftsPer7Days = config?.maxShiftsPer7Days ?? 2;
    const minRestDays = resolveMinRestDays(config);

    // 1. Filter Approved Requests
    const approvedRequests = requests.filter(r => r.status === RequestStatus.APPROVED);

    // ---- FAIRNESS BASELINE ----
    // For sorting purposes a "new joiner" needs a fair-share placeholder so they neither
    // win every priority sort (would get all shifts) nor lose every one (would get none).
    // We use the TEAM MEDIAN of cumulative hours as the floor, because the median is
    // robust to outliers (admins with 1500h, returnees with 0h) and represents
    // "the typical doctor on this team."  Veterans use their actual cumulative — no floor
    // is applied — so genuinely-low-cumulative veterans (e.g. doctor returning from leave)
    // can catch up naturally while the per-month shift cap prevents over-loading.
    const veteranCumulatives = doctors
      .map(d => d.cumulativeTotalHours ?? 0)
      .filter(v => v > 0);
    const veteranWeekendCumulatives = doctors
      .map(d => d.cumulativeWeekendShifts ?? 0)
      .filter(v => v > 0);
    const teamMedianHours = median(veteranCumulatives);
    const teamMedianWeekends = median(veteranWeekendCumulatives);

    // Per-month shift cap: no doctor can receive more than fair share + 1 shifts.
    // Prevents a single doctor from dominating even when they consistently rank first.
    const maxShiftsThisMonth = Math.ceil(daysInMonth / Math.max(doctors.length, 1)) + 1;

    // 2. Track assignments for constraints/fairness
    const stats = doctors.reduce((acc, doc) => {
      const monthsActive = getMonthsActive(doc.startDate, month, year);
      const actualCumulative = doc.cumulativeTotalHours ?? 0;
      const actualCumulativeWeekends = doc.cumulativeWeekendShifts ?? 0;

      // Determine joiner status STRICTLY from startDate when available.
      // A doctor with monthsActive < 1 truly started this month or last month → new joiner.
      // If startDate is missing (legacy data), fall back to "cum=0 while team has history" heuristic.
      const hasStartDate = typeof doc.startDate === 'number' && doc.startDate > 0;
      const isFreshJoiner = hasStartDate
        ? monthsActive < 2
        : actualCumulative === 0 && teamMedianHours > 50;

      // Resolve workload start mode (default STAGGERED for fairness; legacy NEXT_MONTH still honoured).
      const mode = doc.workloadStartMode ?? 'STAGGERED';

      // Skip-this-month flag: NEXT_MONTH mode + joining month means zero shifts this month.
      const skipThisMonth = isFreshJoiner && mode === 'NEXT_MONTH' && monthsActive < 1;

      // IMMEDIATE bypasses any new-joiner protection.
      const applyNewJoinerFloor = isFreshJoiner && mode !== 'IMMEDIATE';

      // Effective cumulative for sorting.
      // - applyNewJoinerFloor=true → floor at team median (mid-pack, fair share)
      // - otherwise → use actual cumulative (catch-up logic kicks in naturally)
      const effectiveCumulative = applyNewJoinerFloor
        ? Math.max(actualCumulative, teamMedianHours)
        : actualCumulative;
      const effectiveCumulativeWeekends = applyNewJoinerFloor
        ? Math.max(actualCumulativeWeekends, Math.floor(teamMedianWeekends))
        : actualCumulativeWeekends;

      acc[doc.id] = {
        totalHours: 0,
        cumulativeHours: effectiveCumulative,
        actualCumulativeHours: actualCumulative,
        weekends: 0,
        cumulativeWeekends: effectiveCumulativeWeekends,
        holidays: doc.cumulativeHolidayHours,
        lastWorkedDay: -2,
        monthsActive,
        isNewJoiner: isFreshJoiner,
        workloadMode: mode,
        skipThisMonth,
        workedDays: [] as number[]
      };
      return acc;
    }, {} as Record<string, any>);

    const weekdayT = SHIFT_TEMPLATES.find(t => !t.isWeekend)!;
    const weekendT = SHIFT_TEMPLATES.find(t => t.isWeekend)!;

    // Pre-calculate total weekend days in month so we can compute each doctor's
    // "expected" weekend count.  This lets us penalise weekend-heavy doctors during
    // weekday-shift sorting, preventing "double loading" (2 weekends + many weekdays).
    let totalWeekendDaysInMonth = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const wd = new Date(year, month, d).getDay();
      if (wd === 0 || wd === 6) totalWeekendDaysInMonth++;
    }
    const expectedWeekendsPerDoctor = totalWeekendDaysInMonth / Math.max(doctors.length, 1);
    // Extra hours a doctor gains per "excess" weekend they hold versus the expected count.
    // Used as a soft penalty in TIER 4 to balance hours across the month.
    const weekendExcessPenaltyPerShift = weekendT.totalHours - weekdayT.totalHours; // 24-16 = 8

    // SA public holidays for this year (and next if Dec roster)
    const saHolidays = getSAPublicHolidays(year, month === 11);

    // Build POST_CALL_OFF preference map: for each doctor, the set of dates they want to be
    // ON CALL (i.e. day = X-1 where X is their requested off-day).
    const postCallPreferenceByDoctor: Record<string, Set<string>> = {};
    for (const req of approvedRequests) {
      if (req.type !== RequestType.POST_CALL_OFF) continue;
      const offDate = new Date(req.date);
      offDate.setDate(offDate.getDate() - 1);
      const yyyy = offDate.getFullYear();
      const mm = (offDate.getMonth() + 1).toString().padStart(2, '0');
      const dd = offDate.getDate().toString().padStart(2, '0');
      const callDate = `${yyyy}-${mm}-${dd}`;
      if (!postCallPreferenceByDoctor[req.doctorId]) postCallPreferenceByDoctor[req.doctorId] = new Set();
      postCallPreferenceByDoctor[req.doctorId].add(callDate);
    }

    // 3. Daily Loop
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${(month + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
      const date = new Date(year, month, day);
      const isWeekend = date.getDay() === 0 || date.getDay() === 6;
      const isPH = saHolidays.includes(dateStr);

      const getRecentShifts = (doctorId: string, windowDays: number = 7) => {
        const days = stats[doctorId].workedDays as number[];
        return days.filter(d => day - d >= 0 && day - d < windowDays).length;
      };

      // Identify doctors unavailable due to LEAVE / UNAVAILABLE / POST_CALL_OFF.
      // POST_CALL_OFF on date X means the doctor is OFF on X (treated like UNAVAILABLE).
      const unavailable = approvedRequests
        .filter(r =>
          r.date === dateStr &&
          (r.type === RequestType.LEAVE || r.type === RequestType.UNAVAILABLE || r.type === RequestType.POST_CALL_OFF)
        )
        .map(r => r.doctorId);

      // Identify doctors with an approved PREFERRED_WORK request for today.
      // These doctors get guaranteed top priority in assignment (still subject to hard constraints).
      const preferredWorkers = approvedRequests
        .filter(r => r.date === dateStr && r.type === RequestType.PREFERRED_WORK)
        .map(r => r.doctorId);

      // Identify doctors who would benefit from being post-call: they requested OFF tomorrow.
      // We softly prefer assigning them today's shift so the OFF day naturally comes after a call.
      const postCallCallDayDoctors = doctors
        .filter(d => postCallPreferenceByDoctor[d.id]?.has(dateStr))
        .map(d => d.id);

      const sortByFairness = (pool: User[]) => {
        pool.sort((a, b) => {
          // Approved PREFERRED_WORK requests are highest priority — doctor guaranteed first pick
          const aPreferred = preferredWorkers.includes(a.id);
          const bPreferred = preferredWorkers.includes(b.id);
          if (aPreferred !== bPreferred) return aPreferred ? -1 : 1;

          // POST_CALL_OFF call-day preference: if doctor wants off TOMORROW, prefer to give them
          // today's shift so OFF naturally falls post-call.  Ranks just below PREFERRED_WORK.
          const aPostCall = postCallCallDayDoctors.includes(a.id);
          const bPostCall = postCallCallDayDoctors.includes(b.id);
          if (aPostCall !== bPostCall) return aPostCall ? -1 : 1;

          // For weekend days, FIRST equalize weekend counts (cumulative + this month)
          if (isWeekend) {
            const wDiffCum = (stats[a.id].cumulativeWeekends + stats[a.id].weekends) -
                             (stats[b.id].cumulativeWeekends + stats[b.id].weekends);
            if (wDiffCum !== 0) return wDiffCum;
          }

          // Public Holiday priority (longitudinal PH hours)
          if (isPH) {
            const phDiff = stats[a.id].holidays - stats[b.id].holidays;
            if (phDiff !== 0) return phDiff;
          }

          // Rolling 7-day load: prefer doctors with fewer recent shifts
          const recentA = getRecentShifts(a.id);
          const recentB = getRecentShifts(b.id);
          const recentDiff = recentA - recentB;
          if (recentDiff !== 0) return recentDiff;

          // Combined hours: cumulative + this month (for cross-month fairness).
          // On weekday assignments we apply a soft penalty for doctors who already
          // hold more weekends than the expected average.  This prevents a doctor
          // from accumulating both excess weekends AND excess weekdays in the same
          // month ("double loading"), and naturally steers weekdays toward doctors
          // who have done fewer weekend shifts so far this month.
          const combinedHoursA = stats[a.id].cumulativeHours + stats[a.id].totalHours;
          const combinedHoursB = stats[b.id].cumulativeHours + stats[b.id].totalHours;
          let adjustedA = combinedHoursA;
          let adjustedB = combinedHoursB;
          if (!isWeekend) {
            const excessWeekendsA = Math.max(0, stats[a.id].weekends - expectedWeekendsPerDoctor);
            const excessWeekendsB = Math.max(0, stats[b.id].weekends - expectedWeekendsPerDoctor);
            adjustedA += excessWeekendsA * weekendExcessPenaltyPerShift;
            adjustedB += excessWeekendsB * weekendExcessPenaltyPerShift;
          }
          const hourDiff = adjustedA - adjustedB;
          if (hourDiff !== 0) return hourDiff;

          // Tiebreaker: prefer doctor with more days since last shift (rest / days apart).
          // We deliberately do NOT have a "prefer new joiner" tiebreaker any more — the
          // team-median fair-share floor already places new joiners mid-pack, so an extra
          // preference here would tip them into being over-loaded vs. veterans.
          const daysSinceA = day - stats[a.id].lastWorkedDay;
          const daysSinceB = day - stats[b.id].lastWorkedDay;
          return daysSinceB - daysSinceA; // more rest first
        });
      };

      const monthlyShiftCount = (doc: User) => (stats[doc.id].workedDays as number[]).length;

      // Min-rest constraint check.  minRestDays = 0 disables this entirely.
      const violatesMinRest = (doc: User): boolean => {
        if (minRestDays === 0) return false;
        const last = stats[doc.id].lastWorkedDay;
        if (last < 0) return false;
        return (day - last) <= minRestDays;
      };

      // Hard per-month weekend cap: no single doctor may take more than ceil(totalWeekendDays /
      // doctors.length) + 1 weekend shifts in one month.  Without this a doctor with very low
      // cumulative weekends (e.g. IMMEDIATE new joiner) would win every weekend sort and
      // monopolise all Saturdays or Sundays, creating a 5-weekends-vs-0 imbalance.
      const maxWeekendsThisMonth = Math.ceil(totalWeekendDaysInMonth / Math.max(doctors.length, 1)) + 1;

      // Apply hard constraints.
      // skipThisMonth: NEXT_MONTH mode for joining month — doctor not eligible at all.
      // PREFERRED_WORK is explicitly requested and granted by admin → doctor bypasses
      // soft caps (min-rest, rolling 7-day, monthly, weekend) so they actually receive
      // the day they requested.  Only LEAVE/UNAVAILABLE/POST_CALL_OFF on this same day
      // can still block them (those are absolute constraints).
      const isPreferredFor = (doc: User) => preferredWorkers.includes(doc.id);
      let eligible = doctors.filter(doc =>
        !unavailable.includes(doc.id) &&
        (
          isPreferredFor(doc) ||
          (
            !stats[doc.id].skipThisMonth &&
            !violatesMinRest(doc) &&
            getRecentShifts(doc.id) < maxShiftsPer7Days &&
            monthlyShiftCount(doc) < maxShiftsThisMonth &&
            (!isWeekend || stats[doc.id].weekends < maxWeekendsThisMonth)
          )
        )
      );

      sortByFairness(eligible);

      // Fallback: if no fully eligible doctor, relax constraints progressively.
      // Always respect absolute LEAVE.  POST_CALL_OFF and UNAVAILABLE relax before LEAVE.
      // skipThisMonth (NEXT_MONTH mode) is also relaxed before resorting to a LEAVE-only pool,
      // because a brand-new doctor working one shift is preferable to leaving a day unassigned.
      if (eligible.length === 0) {
        const leaveDoctors = approvedRequests
          .filter(r => r.date === dateStr && r.type === RequestType.LEAVE)
          .map(r => r.doctorId);

        // Level 1: allow consecutive shifts + relax UNAVAILABLE/POST_CALL_OFF, keep all caps + skipThisMonth
        let relaxedCandidates = doctors.filter(doc =>
          !stats[doc.id].skipThisMonth &&
          !leaveDoctors.includes(doc.id) &&
          getRecentShifts(doc.id) < maxShiftsPer7Days &&
          monthlyShiftCount(doc) < maxShiftsThisMonth &&
          (!isWeekend || stats[doc.id].weekends < maxWeekendsThisMonth)
        );

        // Level 2: also relax rolling 7-day cap, keep monthly cap + weekend cap + skipThisMonth
        if (relaxedCandidates.length === 0) {
          relaxedCandidates = doctors.filter(doc =>
            !stats[doc.id].skipThisMonth &&
            !leaveDoctors.includes(doc.id) &&
            monthlyShiftCount(doc) < maxShiftsThisMonth &&
            (!isWeekend || stats[doc.id].weekends < maxWeekendsThisMonth)
          );
        }

        // Level 3: relax weekend cap too (extreme shortage), keep skipThisMonth
        if (relaxedCandidates.length === 0) {
          relaxedCandidates = doctors.filter(doc =>
            !stats[doc.id].skipThisMonth &&
            !leaveDoctors.includes(doc.id) &&
            monthlyShiftCount(doc) < maxShiftsThisMonth
          );
        }

        // Level 4: also relax NEXT_MONTH protection — better to use a new joiner than leave the day empty
        if (relaxedCandidates.length === 0) {
          relaxedCandidates = doctors.filter(doc =>
            !leaveDoctors.includes(doc.id) &&
            monthlyShiftCount(doc) < maxShiftsThisMonth
          );
        }

        // Last resort: relax all caps — only respect absolute LEAVE
        if (relaxedCandidates.length === 0) {
          relaxedCandidates = doctors.filter(doc => !leaveDoctors.includes(doc.id));
        }

        sortByFairness(relaxedCandidates);
        eligible = relaxedCandidates;
      }

      if (eligible.length > 0) {
        const selected = eligible[0];
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
        (stats[selected.id].workedDays as number[]).push(day);
      } else {
        // Entire department is on approved LEAVE — flag for admin (HOD) review
        unassignedDays.push(dateStr);
      }
    }

    // Post-generation optimisation: try to tighten hour equity by reassigning
    // weekday shifts between the most- and least-loaded doctors.
    // Pass approvedRequests so PREFERRED_WORK and POST_CALL_OFF days are protected.
    optimizeFairness(shifts, stats, doctors, config, approvedRequests);

    const report = this.validateFairness(doctors, stats, shifts, approvedRequests, unassignedDays, config);

    return {
      roster: {
        id: `roster-${year}-${month}`,
        month,
        year,
        status: 'DRAFT',
        shifts,
        createdAt: Date.now()
      },
      report
    };
  },

  /**
   * Validates roster fairness and generates warnings for admin/HOD review.
   * Checks: hour discrepancy, weekend imbalance, unassigned days, and weekend off-request conflicts.
   */
  validateFairness(
    doctors: User[],
    stats: any,
    shifts: ScheduledShift[],
    approvedRequests: Request[],
    unassignedDays: string[],
    config?: { maxHourDiff?: number; maxWeekendDiff?: number }
  ): FairnessReport {
    const warnings: string[] = [];
    const weekendT = SHIFT_TEMPLATES.find(t => t.isWeekend);
    const weekdayT = SHIFT_TEMPLATES.find(t => !t.isWeekend);
    const metrics: FairnessMetric[] = doctors.map(d => {
      const doctorPHShifts = shifts.filter(s => s.doctorId === d.id && s.isPublicHoliday);
      const holidayHours = doctorPHShifts.reduce((sum, s) => {
        const t = s.templateId === (weekendT?.id ?? 'weekend') ? weekendT : weekdayT;
        return sum + (t?.totalHours ?? (s.templateId === 'weekend' ? 24 : 16));
      }, 0);
      return {
        doctorId: d.id,
        totalHours: stats[d.id].totalHours,
        weekendShifts: stats[d.id].weekends,
        weekdayShifts: shifts.filter(s => s.doctorId === d.id && !SHIFT_TEMPLATES.find(t => t.id === s.templateId)?.isWeekend).length,
        holidayShifts: doctorPHShifts.length,
        holidayHours
      };
    });

    const hours = metrics.map(m => m.totalHours);
    const maxHourDiff = config?.maxHourDiff ?? 24;
    const maxWeekendDiff = config?.maxWeekendDiff ?? 1;
    if (hours.length > 0) {
      const max = Math.max(...hours);
      const min = Math.min(...hours);

      if (max - min > maxHourDiff) {
        warnings.push(`Hour Discrepancy: ${max - min}h difference exceeds the fair limit of ≤1 shift (${maxHourDiff}h).`);
      }

      // Smarter weekend imbalance check.
      //
      // With N weekend slots distributed among D doctors, the smallest possible spread is
      // determined by integer arithmetic: `ceil(N/D) - floor(N/D)` (either 0 or 1).
      // If the actual spread merely matches this mathematical minimum, do NOT warn — it's
      // physically impossible to do better.  Only warn when the actual spread exceeds BOTH
      // the configured threshold AND the math minimum.
      const totalWeekendShifts = shifts.filter(s => weekendT && s.templateId === weekendT.id).length;
      const docCount = Math.max(doctors.length, 1);
      const mathMinSpread = totalWeekendShifts > 0
        ? Math.ceil(totalWeekendShifts / docCount) - Math.floor(totalWeekendShifts / docCount)
        : 0;
      const allowedSpread = Math.max(maxWeekendDiff, mathMinSpread);
      const weekends = metrics.map(m => m.weekendShifts);
      const actualWeekendSpread = weekends.length > 0 ? Math.max(...weekends) - Math.min(...weekends) : 0;
      if (actualWeekendSpread > allowedSpread) {
        warnings.push(
          `Weekend Imbalance: spread is ${actualWeekendSpread} (limit ${allowedSpread}, ` +
          `math minimum ${mathMinSpread}). Consider rebalancing.`
        );
      }

      // Check public holiday hour imbalance.
      // Doctors who work multiple PH shifts while others work none should be flagged
      // so the HOD is aware. Threshold: >1 shift (>16h) difference in PH hours this month.
      const phHours = metrics.map(m => m.holidayHours);
      const phDoctors = metrics.filter(m => m.holidayHours > 0);
      if (phDoctors.length > 0 && metrics.length > phDoctors.length) {
        const maxPH = Math.max(...phHours);
        if (maxPH > 24) {
          warnings.push(`Public Holiday Imbalance: One or more doctors have accumulated ${maxPH}h of public holiday shifts this month while others have none. Review if this reflects cumulative fairness.`);
        }
      }
    }

    // Flag unassigned days for HOD review
    for (const dateStr of unassignedDays) {
      warnings.push(`Unassigned Day: ${dateStr} — all doctors are on approved leave. Manual assignment required.`);
    }

    // Detect weekend off-request conflicts: multiple doctors requested the same weekend day off.
    // Flag these so admin can present the conflict to the doctors involved.
    const weekendOffByDate: Record<string, string[]> = {};
    for (const req of approvedRequests) {
      if (
        req.type !== RequestType.LEAVE &&
        req.type !== RequestType.UNAVAILABLE &&
        req.type !== RequestType.POST_CALL_OFF
      ) continue;
      const d = new Date(req.date);
      if (d.getDay() === 0 || d.getDay() === 6) {
        if (!weekendOffByDate[req.date]) weekendOffByDate[req.date] = [];
        weekendOffByDate[req.date].push(req.doctorId);
      }
    }
    for (const [date, doctorIds] of Object.entries(weekendOffByDate)) {
      if (doctorIds.length > 1) {
        warnings.push(`Weekend Conflict on ${date}: ${doctorIds.length} doctors requested the same day off — admin review required.`);
      }
    }

    return {
      isFair: warnings.length === 0,
      warnings,
      metrics,
      unassignedDays
    };
  }
};
