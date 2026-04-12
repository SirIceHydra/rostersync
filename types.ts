
export enum Role {
  ADMIN = 'ADMIN',
  DOCTOR = 'DOCTOR'
}

export enum RequestType {
  UNAVAILABLE = 'UNAVAILABLE',
  SWAP = 'SWAP',
  LEAVE = 'LEAVE'
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
  firm: string;
  cumulativeHolidayHours: number;
  cumulativeTotalHours?: number;      // Total hours worked across all published months
  cumulativeWeekendShifts?: number;   // Weekend shifts across all published months
  startDate?: number;                  // When the doctor joined (timestamp)
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
}
