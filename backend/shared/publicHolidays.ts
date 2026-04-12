/**
 * South Africa Public Holidays (official gov.za calendar).
 * When a holiday falls on Sunday, the following Monday is observed.
 * Used for roster fairness: PH hours are tracked longitudinally per plan.
 */

function saPublicHolidaysForYear(year: number): string[] {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const dates: string[] = [];

  // Fixed dates (YYYY-MM-DD)
  const fixed: [number, number, string][] = [
    [1, 1, "New Year's Day"],
    [3, 21, 'Human Rights Day'],
    [4, 27, 'Freedom Day'],
    [5, 1, "Workers' Day"],
    [6, 16, 'Youth Day'],
    [8, 9, "National Women's Day"],
    [9, 24, 'Heritage Day'],
    [12, 16, 'Day of Reconciliation'],
    [12, 25, 'Christmas Day'],
    [12, 26, 'Day of Goodwill'],
  ];

  for (const [month, day, _name] of fixed) {
    const dateStr = `${year}-${pad(month)}-${pad(day)}`;
    dates.push(dateStr);
    // If Sunday, add observed Monday
    const d = new Date(year, month - 1, day);
    if (d.getDay() === 0) {
      const mon = new Date(d);
      mon.setDate(mon.getDate() + 1);
      dates.push(`${mon.getFullYear()}-${pad(mon.getMonth() + 1)}-${pad(mon.getDate())}`);
    }
  }

  // Easter-based: Good Friday & Family Day (Monday after Easter)
  const easter = getEasterSunday(year);
  const goodFriday = new Date(easter);
  goodFriday.setDate(easter.getDate() - 2);
  dates.push(`${goodFriday.getFullYear()}-${pad(goodFriday.getMonth() + 1)}-${pad(goodFriday.getDate())}`);
  const familyDay = new Date(easter);
  familyDay.setDate(easter.getDate() + 1);
  dates.push(`${familyDay.getFullYear()}-${pad(familyDay.getMonth() + 1)}-${pad(familyDay.getDate())}`);

  return dates;
}

function getEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month, day);
}

/** Get all SA public holiday dates for a given year (and optionally adjacent year for cross-year rosters). */
export function getSAPublicHolidays(year: number, includeAdjacentYear?: boolean): string[] {
  const list = saPublicHolidaysForYear(year);
  if (includeAdjacentYear) {
    const other = year === new Date().getFullYear() ? year + 1 : year - 1;
    list.push(...saPublicHolidaysForYear(other));
  }
  return list;
}

/** Check if a date (YYYY-MM-DD) is a SA public holiday. */
export function isSAPublicHoliday(dateStr: string, year?: number): boolean {
  const y = year ?? parseInt(dateStr.slice(0, 4), 10);
  const holidays = getSAPublicHolidays(y);
  return holidays.includes(dateStr);
}
