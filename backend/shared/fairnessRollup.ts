/**
 * Published-roster rollups for fairness: sums FINAL shifts in a department for one calendar year.
 * Used when fairness_history_mode = CALENDAR_YEAR so scheduling "forgets" prior years without deleting data.
 */

export type FairnessYearRollup = {
  totalHours: number;
  weekendShifts: number;
  holidayHours: number;
};

export type DbLike = {
  all: (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;
};

export type FairnessHistoryMode = 'ALL_TIME' | 'CALENDAR_YEAR';

export function normalizeFairnessHistoryMode(
  raw: string | null | undefined
): FairnessHistoryMode {
  return raw === 'CALENDAR_YEAR' ? 'CALENDAR_YEAR' : 'ALL_TIME';
}

/**
 * Aggregate all shifts from published rosters for one department and calendar year.
 * Matches publish-time hour rules: weekend template → 24h, else 16h; PH hours = shift hours if is_public_holiday.
 */
export async function getPublishedYearRollupForDepartment(
  db: DbLike,
  departmentId: string,
  calendarYear: number,
  options?: { excludeRosterId?: string }
): Promise<Map<string, FairnessYearRollup>> {
  const excludeId = options?.excludeRosterId;
  const rows = await db.all(
    excludeId
      ? `SELECT s.doctor_id as doctorId, s.template_id as templateId, s.is_public_holiday as isPublicHoliday
         FROM shifts s
         INNER JOIN rosters r ON r.id = s.roster_id
         WHERE r.department_id = ? AND r.year = ? AND r.status = ? AND r.id != ?`
      : `SELECT s.doctor_id as doctorId, s.template_id as templateId, s.is_public_holiday as isPublicHoliday
         FROM shifts s
         INNER JOIN rosters r ON r.id = s.roster_id
         WHERE r.department_id = ? AND r.year = ? AND r.status = ?`,
    excludeId
      ? [departmentId, calendarYear, 'FINAL', excludeId]
      : [departmentId, calendarYear, 'FINAL']
  );

  const map = new Map<string, FairnessYearRollup>();
  for (const row of rows) {
    const doctorId = String(row.doctorId ?? '');
    if (!doctorId) continue;
    const tid = row.templateId != null ? String(row.templateId) : '';
    const isWeekend = tid.includes('weekend');
    const hours = isWeekend ? 24 : 16;
    const isPh = Boolean(row.isPublicHoliday);
    const phHours = isPh ? hours : 0;

    if (!map.has(doctorId)) {
      map.set(doctorId, { totalHours: 0, weekendShifts: 0, holidayHours: 0 });
    }
    const acc = map.get(doctorId)!;
    acc.totalHours += hours;
    if (isWeekend) acc.weekendShifts += 1;
    acc.holidayHours += phHours;
  }
  return map;
}
