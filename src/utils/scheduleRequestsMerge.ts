import type { Request } from '../../types';
import { RequestStatus, RequestType } from '../../types';

export type ApprovedScheduleMarker = { date: string; type: string; doctorId: string };

/** Team-wide approved markers (no reasons) merged with this user’s full request rows; own rows win on key clash. */
export function mergeApprovedForCalendar(ownRequests: Request[], markers: ApprovedScheduleMarker[]): Request[] {
  const map = new Map<string, Request>();
  for (const m of markers) {
    const k = `${m.date}|${m.doctorId}|${m.type}`;
    map.set(k, {
      id: `sched-${k.replace(/\|/g, '-')}`,
      doctorId: m.doctorId,
      type: m.type as RequestType,
      date: m.date,
      status: RequestStatus.APPROVED,
      createdAt: 0,
    });
  }
  for (const r of ownRequests) {
    if (r.status !== RequestStatus.APPROVED) continue;
    const k = `${r.date}|${r.doctorId}|${r.type}`;
    map.set(k, r);
  }
  return Array.from(map.values());
}

export function monthRangeIso(year: number, monthIndex0: number): { start: string; end: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const start = `${year}-${pad(monthIndex0 + 1)}-01`;
  const last = new Date(year, monthIndex0 + 1, 0).getDate();
  const end = `${year}-${pad(monthIndex0 + 1)}-${pad(last)}`;
  return { start, end };
}

export function spanCalendarMonths(slots: { year: number; month: number }[]): { start: string; end: string } {
  if (slots.length === 0) return { start: '1970-01-01', end: '1970-01-01' };
  const ranges = slots.map((s) => monthRangeIso(s.year, s.month));
  let start = ranges[0].start;
  let end = ranges[0].end;
  for (const r of ranges) {
    if (r.start < start) start = r.start;
    if (r.end > end) end = r.end;
  }
  return { start, end };
}
