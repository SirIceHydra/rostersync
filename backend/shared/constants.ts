import { ShiftTemplate, User, Role } from './types.js';

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

export const PUBLIC_HOLIDAYS_2025 = [
  '2025-01-01', // New Year's Day
  '2025-02-14', // Test scenario holiday
  '2025-03-21', // Human Rights Day (example)
  '2025-12-25', // Christmas
  '2026-01-01', // New Year's Day
  '2026-01-27', // Test scenario - today (for demo)
  '2026-12-25', // Christmas
];
