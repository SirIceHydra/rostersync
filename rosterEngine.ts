
import { 
  User, 
  Roster, 
  ScheduledShift, 
  Request, 
  RequestType, 
  RequestStatus, 
  FairnessReport, 
  FairnessMetric,
  ShiftTemplate 
} from './types';
import { SHIFT_TEMPLATES } from './constants';
import { getSAPublicHolidays } from './publicHolidays';

// Hard-ish cap: how many calls/shifts a doctor should do in any rolling 7-day window
const MAX_SHIFTS_PER_7_DAYS = 2;

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
 * Calculate expected cumulative hours for a doctor based on months active.
 * New joiners should have proportionally lower expected hours.
 */
function getExpectedCumulativeHours(
  avgMonthlyHours: number, 
  monthsActive: number,
  maxMonthsTracked: number = 6
): number {
  const effectiveMonths = Math.min(monthsActive, maxMonthsTracked);
  return avgMonthlyHours * effectiveMonths;
}

export const RosterEngine = {
  /**
   * Generates a monthly roster following Page 3-4 fairness rules.
   * 
   * FAIRNESS ALGORITHM:
   * 1. Considers cumulative hours from previous months (cross-month fairness)
   * 2. Handles new joiners fairly - they aren't penalized for having fewer hours
   * 3. Prioritizes weekend equity on weekend days
   * 4. Respects public holiday longitudinal tracking
   * 5. Never assigns consecutive shifts
   * 6. Always assigns someone (relaxes soft constraints if needed, but never hard LEAVE)
   */
  generate(
    month: number, 
    year: number, 
    doctors: User[], 
    requests: Request[],
    config?: { maxHourDiff?: number; maxWeekendDiff?: number }
  ): { roster: Roster; report: FairnessReport } {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const shifts: ScheduledShift[] = [];
    
    // 1. Filter Approved Requests
    const approvedRequests = requests.filter(r => r.status === RequestStatus.APPROVED);

    // Calculate average cumulative hours for fairness baseline (for new joiner handling)
    const activeDoctors = doctors.filter(d => (d.cumulativeTotalHours ?? 0) > 0);
    const avgCumulativeHours = activeDoctors.length > 0 
      ? activeDoctors.reduce((sum, d) => sum + (d.cumulativeTotalHours ?? 0), 0) / activeDoctors.length
      : 0;
    const avgMonthlyHours = avgCumulativeHours > 0 ? avgCumulativeHours / 3 : 400; // ~3 months average

    // 2. Track assignments for constraints/fairness
    // Include cumulative stats from previous months for cross-month fairness
    const stats = doctors.reduce((acc, doc) => {
      const monthsActive = getMonthsActive(doc.startDate, month, year);
      const isNewJoiner = monthsActive < 2; // Less than 2 months = new joiner
      
      // For new joiners, calculate their "fair baseline" to not penalize them
      // They should catch up gradually, not be overworked immediately
      const expectedHours = getExpectedCumulativeHours(avgMonthlyHours, monthsActive);
      const actualCumulative = doc.cumulativeTotalHours ?? 0;
      
      // "Effective cumulative" - for new joiners, use their proportional expected
      // This prevents them from being assigned all shifts just because they have fewer hours
      const effectiveCumulative = isNewJoiner 
        ? Math.max(actualCumulative, expectedHours * 0.8) // Allow slight catch-up
        : actualCumulative;
      
      acc[doc.id] = { 
        totalHours: 0,                                    // This month's hours
        cumulativeHours: effectiveCumulative,             // Effective cumulative for fairness
        actualCumulativeHours: actualCumulative,          // Real cumulative for reporting
        weekends: 0,                                      // This month's weekends
        cumulativeWeekends: doc.cumulativeWeekendShifts ?? 0, // Historical weekends
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

    const saHolidays = getSAPublicHolidays(year, month === 11);

    // 3. Daily Loop
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${(month + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
      const date = new Date(year, month, day);
      const isWeekend = date.getDay() === 0 || date.getDay() === 6;
      const isPH = saHolidays.includes(dateStr);
      const template = isWeekend ? weekendT : weekdayT; // Weekends 24h, weekdays 16h

      const getRecentShifts = (doctorId: string, windowDays: number = 7) => {
        const days = stats[doctorId].workedDays as number[];
        return days.filter(d => day - d >= 0 && day - d < windowDays).length;
      };

      // Rule: Identify unavailable doctors
      const unavailable = approvedRequests
        .filter(r => r.date === dateStr && (r.type === RequestType.LEAVE || r.type === RequestType.UNAVAILABLE))
        .map(r => r.doctorId);

      const sortByFairness = (pool: User[]) => {
        pool.sort((a, b) => {
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

      // Rule: Apply Hard Constraints (Page 3)
      let eligible = doctors.filter(doc => 
        !unavailable.includes(doc.id) && 
        stats[doc.id].lastWorkedDay !== day - 1 && // No consecutive shifts
        getRecentShifts(doc.id) < MAX_SHIFTS_PER_7_DAYS // No more than N shifts in any rolling 7 days
      );

      // Rule: Sort by Fairness Metrics (Page 3-4)
      sortByFairness(eligible);

      // Fallback: if no fully eligible doctor (e.g. everyone is unavailable or at the weekly cap),
      // relax constraints but still respect absolute LEAVE requests. We try to keep the weekly
      // cap, but if that still yields nobody we allow breaking it to ensure someone is assigned.
      if (eligible.length === 0) {
        const leaveDoctors = approvedRequests
          .filter(r => r.date === dateStr && r.type === RequestType.LEAVE)
          .map(r => r.doctorId);

        let relaxedCandidates = doctors.filter(doc => 
          !leaveDoctors.includes(doc.id) &&
          getRecentShifts(doc.id) < MAX_SHIFTS_PER_7_DAYS
        );

        // As an absolute last resort, if everyone is at the weekly cap, relax that cap but
        // continue to respect LEAVE.
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
      }
    }

    const report = this.validateFairness(doctors, stats, shifts, config);

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
   * Validates roster against the discrepancy rules on Page 3.
   */
  validateFairness(
    doctors: User[],
    stats: any,
    shifts: ScheduledShift[],
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
      
      // Page 3 Rule: ≤1 regular shift difference (avg shift is 16-24h)
      if (max - min > maxHourDiff) {
        warnings.push(`Hour Discrepancy: ${max - min}h difference exceeds the fair limit of ≤1 shift (${maxHourDiff}h).`);
      }

      const weekends = metrics.map(m => m.weekendShifts);
      if (Math.max(...weekends) - Math.min(...weekends) > maxWeekendDiff) {
        warnings.push(`Weekend Imbalance: Weekend shifts are not split equally among available doctors (limit ${maxWeekendDiff}).`);
      }
    }

    return {
      isFair: warnings.length === 0,
      warnings,
      metrics
    };
  }
};
