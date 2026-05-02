
export enum Role {
  ADMIN = 'ADMIN',
  DOCTOR = 'DOCTOR'
}

export enum RequestType {
  UNAVAILABLE = 'UNAVAILABLE',
  SWAP = 'SWAP',
  LEAVE = 'LEAVE',
  PREFERRED_WORK = 'PREFERRED_WORK',  // Doctor requests to be assigned on this day
  POST_CALL_OFF = 'POST_CALL_OFF'    // Doctor requests this day OFF (e.g. for personal commitments
                                      // or recovery). Algorithm tries to give them the day BEFORE
                                      // (the call day) so they're naturally post-call.
}

export enum RequestStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED'
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** True when this record is an admin-created placeholder with no real account yet. */
  isPlaceholder?: boolean;
  /** Set once a placeholder has been linked to a real doctor account. */
  linkedUserId?: string;
  firm: string;
  cumulativeHolidayHours: number;
  cumulativeTotalHours?: number;      // Total hours worked across all published months
  cumulativeWeekendShifts?: number;   // Weekend shifts across all published months
  startDate?: number;                  // When the doctor joined (timestamp)
  /**
   * Admin-set onboarding mode for new joiners.
   *  - IMMEDIATE   : full strength from day one (no protection at all)
   *  - STAGGERED   : compete fairly using team-median cumulative as a fair-share floor (default)
   *  - NEXT_MONTH  : zero shifts in the joining month, full strength from the next month
   *
   * Legacy databases used 'IMMEDIATE' | 'NEXT_MONTH'. STAGGERED is now the recommended default
   * because it places the new joiner mid-pack rather than artificially lighter or heavier.
   */
  workloadStartMode?: 'IMMEDIATE' | 'STAGGERED' | 'NEXT_MONTH';
  /** Department setting echoed on each doctor row from GET /doctors */
  fairnessHistoryMode?: 'ALL_TIME' | 'CALENDAR_YEAR';
  /** When fairness uses calendar-year window, year those scheduling totals are for */
  schedulingYear?: number;
  /** All-time published totals (only set when fairnessHistoryMode is CALENDAR_YEAR) */
  lifetimeTotalHours?: number;
  lifetimeWeekendShifts?: number;
  lifetimeHolidayHours?: number;
  schedulingTotalHours?: number;
  schedulingWeekendShifts?: number;
  schedulingHolidayHours?: number;
}

export interface ShiftTemplate {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  totalHours: number;
  isWeekend: boolean;
}

export interface ScheduledShift {
  id: string;
  date: string; // YYYY-MM-DD
  doctorId: string;
  templateId: string;
  isPublicHoliday: boolean;
}

export interface Roster {
  id: string;
  month: number; // 0-11
  year: number;
  status: 'DRAFT' | 'FINAL';
  shifts: ScheduledShift[];
  createdAt: number;
}

export interface Request {
  id: string;
  doctorId: string;
  type: RequestType;
  date: string;
  status: RequestStatus;
  reason?: string; // Admin-only viewable
  createdAt: number; // For first-come-first-served priority
  swapWithDoctorId?: string;
}

export interface FairnessMetric {
  doctorId: string;
  totalHours: number;
  weekendShifts: number;
  weekdayShifts: number;
  holidayShifts: number;
  /** PH hours this month (from roster shifts). */
  holidayHours: number;
}

export interface FairnessReport {
  isFair: boolean;
  warnings: string[];
  metrics: FairnessMetric[];
  unassignedDays: string[]; // Days where no eligible doctor could be found (requires manual assignment)
}
