import React, { useMemo } from 'react';
import { CalendarCheck, Sun, Moon, Briefcase, Star } from 'lucide-react';
import { Card } from './Card';
import { SHIFT_TEMPLATES } from '../../constants';
import { Roster, Request, User, RequestType, RequestStatus } from '../../types';

interface Props {
  roster: Roster | null;
  currentUser: User;
  requests: Request[];
}

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function ShiftIcon({ templateId }: { templateId: string }) {
  if (templateId.includes('night') || templateId.includes('evening')) {
    return <Moon size={15} className="text-indigo-400 shrink-0" />;
  }
  if (templateId.includes('weekend') || templateId.includes('wknd')) {
    return <Star size={15} className="text-amber-400 shrink-0" />;
  }
  return <Sun size={15} className="text-amber-500 shrink-0" />;
}

function RequestBadge({ type }: { type: RequestType }) {
  const labels: Record<RequestType, { label: string; cls: string }> = {
    [RequestType.LEAVE]: { label: 'Leave', cls: 'bg-rose-50 text-rose-600 border-rose-200' },
    [RequestType.UNAVAILABLE]: { label: 'Unavail.', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
    [RequestType.SWAP]: { label: 'Swap', cls: 'bg-violet-50 text-violet-600 border-violet-200' },
    [RequestType.PREFERRED_WORK]: { label: 'Preferred', cls: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
    [RequestType.POST_CALL_OFF]: { label: 'Post-call', cls: 'bg-orange-50 text-orange-600 border-orange-200' },
  };
  const { label, cls } = labels[type] ?? { label: type, cls: 'bg-slate-100 text-slate-500 border-slate-200' };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border ${cls}`}>
      {label}
    </span>
  );
}

export const MyScheduleView: React.FC<Props> = ({ roster, currentUser, requests }) => {
  const myShifts = useMemo(() => {
    if (!roster) return [];
    return roster.shifts
      .filter(s => s.doctorId === currentUser.id)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [roster, currentUser.id]);

  const approvedRequests = useMemo(() => {
    if (!roster) return new Map<string, Request[]>();
    const map = new Map<string, Request[]>();
    const year = roster.year;
    const month = roster.month; // 0-indexed
    requests
      .filter(r => r.doctorId === currentUser.id && r.status === RequestStatus.APPROVED)
      .filter(r => {
        const d = new Date(r.date);
        return d.getFullYear() === year && d.getMonth() === month;
      })
      .forEach(r => {
        const list = map.get(r.date) ?? [];
        list.push(r);
        map.set(r.date, list);
      });
    return map;
  }, [requests, currentUser.id, roster]);

  // Dates with approved requests but no shift (e.g. leave)
  const requestOnlyDates = useMemo(() => {
    if (!roster) return [];
    const shiftDates = new Set(myShifts.map(s => s.date));
    return Array.from(approvedRequests.keys())
      .filter(d => !shiftDates.has(d))
      .sort();
  }, [myShifts, approvedRequests, roster]);

  if (!roster) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-slate-400 text-sm">
        No roster loaded yet.
      </div>
    );
  }

  const monthLabel = `${MONTH_NAMES[roster.month]} ${roster.year}`;
  const totalHours = myShifts.reduce((sum, s) => {
    const t = SHIFT_TEMPLATES.find(t => t.id === s.templateId);
    return sum + (t?.totalHours ?? 0);
  }, 0);
  const weekendCount = myShifts.filter(s => {
    const t = SHIFT_TEMPLATES.find(t => t.id === s.templateId);
    return t?.isWeekend;
  }).length;
  const phCount = myShifts.filter(s => s.isPublicHoliday).length;

  const allEntries: { date: string; isShift: boolean }[] = [
    ...myShifts.map(s => ({ date: s.date, isShift: true })),
    ...requestOnlyDates.map(d => ({ date: d, isShift: false })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 pb-28">
      <div className="max-w-lg mx-auto px-4 pt-6 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
            <CalendarCheck size={20} className="text-indigo-600" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold text-slate-900 leading-tight">My Shifts</h1>
            <p className="text-xs text-slate-500 font-medium">{monthLabel}</p>
          </div>
        </div>

        {/* Summary chips */}
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-sm">
            <Briefcase size={13} className="text-indigo-500" />
            <span className="text-xs font-bold text-slate-700">{myShifts.length} shift{myShifts.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-sm">
            <Sun size={13} className="text-amber-500" />
            <span className="text-xs font-bold text-slate-700">{totalHours}h total</span>
          </div>
          {weekendCount > 0 && (
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-sm">
              <Star size={13} className="text-amber-400" />
              <span className="text-xs font-bold text-slate-700">{weekendCount} weekend</span>
            </div>
          )}
          {phCount > 0 && (
            <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 shadow-sm">
              <Star size={13} className="text-amber-500" />
              <span className="text-xs font-bold text-amber-700">{phCount} public holiday</span>
            </div>
          )}
        </div>

        {/* Shift list */}
        {allEntries.length === 0 ? (
          <Card className="p-6 text-center text-slate-400 text-sm">
            No shifts assigned to you this month.
          </Card>
        ) : (
          <div className="space-y-2">
            {allEntries.map(({ date, isShift }) => {
              const d = new Date(date + 'T00:00:00');
              const dayName = DAY_NAMES[d.getDay()];
              const dayNum = d.getDate();
              const shift = isShift ? myShifts.find(s => s.date === date) : null;
              const template = shift ? SHIFT_TEMPLATES.find(t => t.id === shift.templateId) : null;
              const reqs = approvedRequests.get(date) ?? [];
              const isWeekend = d.getDay() === 0 || d.getDay() === 6;

              return (
                <Card key={date} className={`p-0 overflow-hidden ${shift?.isPublicHoliday ? 'border-amber-300' : ''}`}>
                  <div className="flex items-stretch">
                    {/* Date column */}
                    <div className={`flex flex-col items-center justify-center px-3.5 py-3 min-w-[52px] ${
                      shift?.isPublicHoliday
                        ? 'bg-amber-50'
                        : isWeekend
                        ? 'bg-indigo-50'
                        : 'bg-slate-50'
                    }`}>
                      <span className={`text-[10px] font-bold uppercase tracking-wider ${isWeekend ? 'text-indigo-400' : 'text-slate-400'}`}>
                        {dayName}
                      </span>
                      <span className="text-xl font-extrabold text-slate-800 leading-tight">{dayNum}</span>
                      {shift?.isPublicHoliday && (
                        <span className="text-[9px] font-bold text-amber-600 uppercase tracking-wide leading-none mt-0.5">PH</span>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 px-4 py-3 flex flex-col justify-center gap-1">
                      {template ? (
                        <div className="flex items-center gap-2">
                          <ShiftIcon templateId={shift!.templateId} />
                          <span className="text-sm font-bold text-slate-800">{template.name}</span>
                          <span className="text-xs text-slate-500 font-medium">
                            {template.startTime}–{template.endTime}
                          </span>
                        </div>
                      ) : !isShift ? (
                        <span className="text-xs text-slate-400 italic">No shift</span>
                      ) : null}

                      {reqs.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {reqs.map(r => <RequestBadge key={r.id} type={r.type} />)}
                        </div>
                      )}
                    </div>

                    {/* Hours pill */}
                    {template && (
                      <div className="flex items-center pr-4">
                        <span className="text-xs font-extrabold text-indigo-600 bg-indigo-50 rounded-full px-2 py-1">
                          {template.totalHours}h
                        </span>
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
