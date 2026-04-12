
import { ShiftTemplate, User, Role } from './types';

export const SHIFT_TEMPLATES: ShiftTemplate[] = [
  {
    id: 'weekday',
    name: 'Regular Night',
    startTime: '16:00',
    endTime: '08:00',
    totalHours: 16,
    isWeekend: false,
  },
  {
    id: 'weekend',
    name: 'Weekend 24h',
    startTime: '08:00',
    endTime: '08:00',
    totalHours: 24,
    isWeekend: true,
  }
];

// Public holidays - can be extended for multiple years
export const PUBLIC_HOLIDAYS_2025 = [
  '2025-01-01', // New Year's Day
  '2025-02-14', // Test scenario holiday
  '2025-03-21', // Human Rights Day (example)
  '2025-12-25', // Christmas
  '2026-01-01', // New Year's Day
  '2026-01-27', // Test scenario - today (for demo)
  '2026-12-25', // Christmas
];

// Test Doctors from Page 6-9 Scenario
export const TEST_DOCTORS: User[] = [
  { id: 'A', name: 'Dr. Alice', email: 'alice@med.com', role: Role.DOCTOR, firm: 'Team Red', cumulativeHolidayHours: 0 },
  { id: 'B', name: 'Dr. Bob', email: 'bob@med.com', role: Role.DOCTOR, firm: 'Team Blue', cumulativeHolidayHours: 16 },
  { id: 'C', name: 'Dr. Charlie', email: 'charlie@med.com', role: Role.DOCTOR, firm: 'Team Red', cumulativeHolidayHours: 0 },
  { id: 'D', name: 'Dr. Diana', email: 'diana@med.com', role: Role.DOCTOR, firm: 'Team Blue', cumulativeHolidayHours: 24 },
  { id: 'E', name: 'Dr. Edward', email: 'edward@med.com', role: Role.DOCTOR, firm: 'Team Green', cumulativeHolidayHours: 0 },
  { id: 'F', name: 'Dr. Fiona', email: 'fiona@med.com', role: Role.DOCTOR, firm: 'Team Green', cumulativeHolidayHours: 8 },
];

export const ADMIN_USER: User = {
  id: 'admin-1',
  name: 'Senior MO Admin',
  email: 'admin@med.com',
  role: Role.ADMIN,
  firm: 'Dept HQ',
  cumulativeHolidayHours: 0,
};
