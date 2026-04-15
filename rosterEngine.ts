
import {
  User,
  Roster,
  ScheduledShift,
  Request,
  RequestType,
  RequestStatus,
  FairnessReport,
  FairnessMetric
} from './types';
import { SHIFT_TEMPLATES } from './constants';
import { getSAPublicHolidays } from './publicHolidays';

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


export const RosterEngine = {
  /**
   * Generates a monthly roster following fairness rules.
   *
   * FAIRNESS ALGORITHM:
   * 1. Considers cumulative hours from previous months (cross-month fairness)
   * 2. Handles new joiners fairly based on their workloadStartMode setting
   * 3. Prioritizes weekend equity on weekend days
   * 4. Respects public holiday longitudinal tracking
   * 5. Enforces configurable minimum rest between shifts (no-consecutive-shifts toggle)
   * 6. Respects approved PREFERRED_WORK requests (doctor guaranteed priority on requested day)
   * 7. Configurable rolling 7-day shift cap (admin slider)
   * 8. Flags unassigned days and weekend off-request conflicts for admin review
   */
  generate(
    month: number,
    year: number,
    doctors: User[],
    requests: Request[],
    config?: {
      maxHourDiff?: number;
      maxWeekendDiff?: number;
      /** Max shifts a doctor can work in any rolling 7-day window. Admin-configurable slider. Default: 2 */
      maxShiftsPer7Days?: number;
      /** If false (default), consecutive shifts are blocked. If true, admin has disabled the no-consecutive-shifts rule. */
      allowConsecutiveShifts?: boolean;
    }
  ): { roster: Roster; report: FairnessReport } {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const shifts: ScheduledShift[] = [];
    const unassignedDays: string[] = [];

    const maxShiftsPer7Days = config?.maxShiftsPer7Days ?? 2;
    const allowConsecutiveShifts = config?.allowConsecutiveShifts ?? false;

    // 1. Filter Approved Requests
    const approvedRequests = requests.filter(r => r.status === RequestStatus.APPROVED);

    // Calculate average cumulative stats across doctors who have any history.
    // Used as a fairness baseline for new/effectively-new joiners.
    const activeDoctors = doctors.filter(d => (d.cumulativeTotalHours ?? 0) > 0);
    const avgCumulativeHours = activeDoctors.length > 0
      ? activeDoctors.reduce((sum, d) => sum + (d.cumulativeTotalHours ?? 0), 0) / activeDoctors.length
      : 0;
    const avgCumulativeWeekends = activeDoctors.length > 0
      ? activeDoctors.reduce((sum, d) => sum + (d.cumulativeWeekendShifts ?? 0), 0) / activeDoctors.length
      : 0;
    const avgMonthlyHours = avgCumulativeHours > 0 ? avgCumulativeHours / 3 : 400; // ~3 months average

    // Per-month shift cap: no doctor can receive more than fair share + 1 shifts.
    // This prevents a single doctor from dominating even when they consistently rank first in the sort.
    const maxShiftsThisMonth = Math.ceil(daysInMonth / Math.max(doctors.length, 1)) + 1;

    // 2. Track assignments for constraints/fairness
    // Include cumulative stats from previous months for cross-month fairness
    const stats = doctors.reduce((acc, doc) => {
      const monthsActive = getMonthsActive(doc.startDate, month, year);
      const actualCumulative = doc.cumulativeTotalHours ?? 0;
      const actualCumulativeWeekends = doc.cumulativeWeekendShifts ?? 0;

      // Bug fix: also catch doctors who have been in the system for months but somehow have
      // zero cumulative hours (e.g. joined but no roster was published while they were active).
      // Without this, they would win every priority sort and take all shifts.
      const isEffectivelyNew = actualCumulative === 0 && avgCumulativeHours > 50;

      // New joiner protection is bypassed when admin sets workloadStartMode to IMMEDIATE
      const isNewJoiner = (monthsActive < 2 || isEffectivelyNew) && doc.workloadStartMode !== 'IMMEDIATE';

      // Compute effective cumulative hours and weekends for priority sorting.
      // For new/effectively-new joiners: raise floor to ~80% of group average so they compete
      // normally and get a slight catch-up bonus — but NOT all shifts in one month.
      // For veterans: cap the compensation floor so they don't receive all shifts in one month
      // just because they happened to have fewer hours than peers.
      let effectiveCumulative: number;
      let effectiveCumulativeWeekends: number;

      if (isNewJoiner) {
        effectiveCumulative = Math.max(actualCumulative, avgCumulativeHours * 0.8);
        effectiveCumulativeWeekends = Math.max(actualCumulativeWeekends, Math.floor(avgCumulativeWeekends * 0.8));
      } else {
        // Veterans: floor at (group average − one month) so the maximum gap closed per month
        // is roughly one month's worth of shifts, not the entire lifetime deficit.
        const maxCompensationFloor = Math.max(0, avgCumulativeHours - avgMonthlyHours);
        effectiveCumulative = Math.max(actualCumulative, maxCompensationFloor);
        effectiveCumulativeWeekends = actualCumulativeWeekends;
      }

      acc[doc.id] = {
        totalHours: 0,                                        // This month's hours
        cumulativeHours: effectiveCumulative,                 // Effective cumulative for fairness
        actualCumulativeHours: actualCumulative,              // Real cumulative for reporting
        weekends: 0,                                          // This month's weekends
        cumulativeWeekends: effectiveCumulativeWeekends,      // Effective historical weekends
        holidays: doc.cumulativeHolidayHours,
        lastWorkedDay: -2,
        monthsActive,
        isNewJoiner,
        workedDays: [] as number[]                        // Days worked this month (for rolling 7-day fairness)
      };
      return acc;
    }, {} as Record<string, any>);

    const weekdayT = SHIFT_TEMPLATES.find(t => !t.isWeekend)!;
    const weekendT = SHIFT_TEMPLATES.find(t => t.isWeekend)!;

    // SA public holidays for this year (and next if Dec roster)
    const saHolidays = getSAPublicHolidays(year, month === 11);

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

      // Identify doctors unavailable due to LEAVE or UNAVAILABLE requests
      const unavailable = approvedRequests
        .filter(r => r.date === dateStr && (r.type === RequestType.LEAVE || r.type === RequestType.UNAVAILABLE))
        .map(r => r.doctorId);

      // Identify doctors with an approved PREFERRED_WORK request for today.
      // These doctors get guaranteed top priority in assignment (still subject to hard constraints).
      const preferredWorkers = approvedRequests
        .filter(r => r.date === dateStr && r.type === RequestType.PREFERRED_WORK)
        .map(r => r.doctorId);

      const sortByFairness = (pool: User[]) => {
        pool.sort((a, b) => {
          // Approved PREFERRED_WORK requests are highest priority — doctor guaranteed first pick
          const aPreferred = preferredWorkers.includes(a.id);
          const bPreferred = preferredWorkers.includes(b.id);
          if (aPreferred !== bPreferred) return aPreferred ? -1 : 1;

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

          // Combined hours: cumulative + this month (for cross-month fairness)
          const combinedHoursA = stats[a.id].cumulativeHours + stats[a.id].totalHours;
          const combinedHoursB = stats[b.id].cumulativeHours + stats[b.id].totalHours;
          const hourDiff = combinedHoursA - combinedHoursB;
          if (hourDiff !== 0) return hourDiff;

          // Tiebreaker: prefer newer joiners slightly (help them integrate)
          if (stats[a.id].isNewJoiner !== stats[b.id].isNewJoiner) {
            return stats[a.id].isNewJoiner ? -1 : 1;
          }

          // Tiebreaker: prefer doctor with more days since last shift (rest / days apart)
          const daysSinceA = day - stats[a.id].lastWorkedDay;
          const daysSinceB = day - stats[b.id].lastWorkedDay;
          return daysSinceB - daysSinceA; // more rest first
        });
      };

      const monthlyShiftCount = (doc: User) => (stats[doc.id].workedDays as number[]).length;

      // Apply hard constraints.
      // When allowConsecutiveShifts is false (default), consecutive shifts are blocked.
      // When true, admin has disabled this protection and consecutive shifts are freely allowed.
      // The per-month cap (maxShiftsThisMonth) prevents any single doctor from dominating.
      let eligible = doctors.filter(doc =>
        !unavailable.includes(doc.id) &&
        (allowConsecutiveShifts || stats[doc.id].lastWorkedDay !== day - 1) &&
        getRecentShifts(doc.id) < maxShiftsPer7Days &&
        monthlyShiftCount(doc) < maxShiftsThisMonth
      );

      sortByFairness(eligible);

      // Fallback: if no fully eligible doctor, relax constraints progressively.
      // Always respect absolute LEAVE. UNAVAILABLE is relaxed first, then other caps.
      if (eligible.length === 0) {
        const leaveDoctors = approvedRequests
          .filter(r => r.date === dateStr && r.type === RequestType.LEAVE)
          .map(r => r.doctorId);

        // Level 1: allow consecutive shifts + UNAVAILABLE, keep rolling 7-day cap + monthly cap
        let relaxedCandidates = doctors.filter(doc =>
          !leaveDoctors.includes(doc.id) &&
          getRecentShifts(doc.id) < maxShiftsPer7Days &&
          monthlyShiftCount(doc) < maxShiftsThisMonth
        );

        // Level 2: also relax rolling 7-day cap, keep monthly cap
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

      const weekends = metrics.map(m => m.weekendShifts);
      if (Math.max(...weekends) - Math.min(...weekends) > maxWeekendDiff) {
        warnings.push(`Weekend Imbalance: Weekend shifts are not split equally among available doctors (limit ${maxWeekendDiff}).`);
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
      if (req.type !== RequestType.LEAVE && req.type !== RequestType.UNAVAILABLE) continue;
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
