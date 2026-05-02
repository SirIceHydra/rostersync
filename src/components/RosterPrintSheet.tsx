import React from 'react';
import { RequestType, RequestStatus, ScheduledShift } from '../../types';
import type { Roster, Request, User } from '../../types';
import { SHIFT_TEMPLATES } from '../../constants';

/** Print/PDF-only: full roster calendar + day-by-day detail (not the interactive app chrome). */
export const RosterPrintSheet: React.FC<{
  roster: Roster;
  doctors: User[];
  requests: Request[];
  departmentName: string;
  report: any;
}> = ({ roster, doctors, requests, departmentName, report }) => {
  const monthFull = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const daysInMonth = new Date(roster.year, roster.month + 1, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  const dateStr = (day: number) => `${roster.year}-${pad(roster.month + 1)}-${pad(day)}`;

  const docName = (id: string) => doctors.find((d) => d.id === id)?.name ?? 'Unassigned';
  const shiftTpl = (s: ScheduledShift) => {
    const t = SHIFT_TEMPLATES.find((x) => x.id === s.templateId);
    if (t) return t;
    if (s.templateId?.includes('weekend')) return SHIFT_TEMPLATES.find((x) => x.isWeekend) ?? SHIFT_TEMPLATES[0];
    return SHIFT_TEMPLATES.find((x) => !x.isWeekend) ?? SHIFT_TEMPLATES[0];
  };

  const approvedByDate: Record<string, Request[]> = {};
  for (const r of requests) {
    if (r.status !== RequestStatus.APPROVED) continue;
    if (!approvedByDate[r.date]) approvedByDate[r.date] = [];
    approvedByDate[r.date].push(r);
  }

  const reqTypeShort = (t: RequestType) => {
    if (t === RequestType.LEAVE) return 'Leave';
    if (t === RequestType.UNAVAILABLE) return 'Unavailable';
    if (t === RequestType.PREFERRED_WORK) return 'Pref. work';
    if (t === RequestType.POST_CALL_OFF) return 'Post-call off';
    if (t === RequestType.SWAP) return 'Swap';
    return t;
  };

  const firstDow = new Date(roster.year, roster.month, 1).getDay();
  const cells: ({ day: number } | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d });
  while (cells.length % 7 !== 0) cells.push(null);

  const printed = new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  const warnLines: string[] = Array.isArray(report?.warnings) ? report.warnings.filter((w: unknown) => typeof w === 'string') : [];

  const cellStyle: React.CSSProperties = {
    border: '1px solid var(--rs-slate-200)',
    verticalAlign: 'top',
    padding: '4px 5px',
    width: '14.28%',
    minHeight: '72px',
    fontSize: '8.5pt',
    lineHeight: 1.25,
  };

  return (
    <div className="print-only roster-print-sheet" style={{ fontFamily: 'var(--rs-font-body)', color: 'var(--rs-ink)' }}>
      <header style={{ borderBottom: '2px solid var(--rs-ink)', paddingBottom: '8px', marginBottom: '10px' }}>
        <div style={{ fontFamily: 'var(--rs-font-display)', fontSize: '16pt', fontWeight: 800, letterSpacing: '-0.02em' }}>
          Roster — {monthFull[roster.month]} {roster.year}
        </div>
        <div style={{ fontSize: '10pt', fontWeight: 700, marginTop: '4px', color: 'var(--rs-slate-700)' }}>{departmentName}</div>
        <div style={{ fontSize: '9pt', marginTop: '6px', fontWeight: 700 }}>
          Status: <span style={{ textTransform: 'uppercase' }}>{roster.status === 'FINAL' ? 'Published / final' : 'Draft'}</span>
          <span style={{ marginLeft: '12px', color: 'var(--rs-slate-500)', fontWeight: 600 }}>Printed {printed}</span>
        </div>
      </header>

      <section style={{ marginBottom: '14px' }}>
        <h2 style={{ fontSize: '10pt', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>Calendar</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <thead>
            <tr>
              {dow.map((d) => (
                <th key={d} style={{ ...cellStyle, background: 'var(--rs-slate-100)', fontWeight: 800, fontSize: '8pt', textAlign: 'center', minHeight: 'auto' }}>
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: Math.ceil(cells.length / 7) }, (_, row) => (
              <tr key={row}>
                {cells.slice(row * 7, row * 7 + 7).map((c, col) => {
                  if (!c) return <td key={col} style={{ ...cellStyle, background: 'var(--rs-slate-50)' }} />;
                  const ds = dateStr(c.day);
                  const sh = roster.shifts.find((s) => s.date === ds);
                  const tpl = sh ? shiftTpl(sh) : null;
                  const rq = approvedByDate[ds] ?? [];
                  return (
                    <td key={col} style={cellStyle}>
                      <div style={{ fontWeight: 900, fontSize: '9pt', marginBottom: '3px' }}>{c.day}</div>
                      {sh && tpl ? (
                        <div style={{ fontWeight: 700 }}>
                          <div>{docName(sh.doctorId)}</div>
                          <div style={{ fontWeight: 600, color: 'var(--rs-slate-700)', fontSize: '8pt' }}>
                            {tpl.name} · {tpl.totalHours}h{sh.isPublicHoliday ? ' · PH' : ''}
                          </div>
                        </div>
                      ) : (
                        <div style={{ color: 'var(--rs-slate-500)', fontSize: '8pt', fontStyle: 'italic' }}>No shift</div>
                      )}
                      {rq.length > 0 && (
                        <ul style={{ margin: '4px 0 0', paddingLeft: '14px', fontSize: '7.5pt', color: 'var(--rs-slate-900)' }}>
                          {rq.map((r) => (
                            <li key={r.id}>
                              {docName(r.doctorId)}: {reqTypeShort(r.type)}
                              {r.reason ? ` — ${r.reason}` : ''}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 style={{ fontSize: '10pt', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>Day list (detail)</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8.5pt' }}>
          <thead>
            <tr style={{ background: 'var(--rs-slate-100)' }}>
              {['Date', 'Weekday', 'On-call', 'Shift', 'Hrs', 'PH', 'Approved requests & notes'].map((h) => (
                <th key={h} style={{ border: '1px solid var(--rs-slate-200)', padding: '5px 6px', textAlign: 'left', fontWeight: 800 }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const ds = dateStr(day);
              const wd = dow[new Date(roster.year, roster.month, day).getDay()];
              const sh = roster.shifts.find((s) => s.date === ds);
              const tpl = sh ? shiftTpl(sh) : null;
              const rq = approvedByDate[ds] ?? [];
              const notes = rq
                .map((r) => `${docName(r.doctorId)}: ${reqTypeShort(r.type)}${r.reason ? ` (${r.reason})` : ''}`)
                .join(' · ');
              return (
                <tr key={ds}>
                  <td style={{ border: '1px solid var(--rs-slate-200)', padding: '4px 6px', fontWeight: 700 }}>{ds}</td>
                  <td style={{ border: '1px solid var(--rs-slate-200)', padding: '4px 6px' }}>{wd}</td>
                  <td style={{ border: '1px solid var(--rs-slate-200)', padding: '4px 6px' }}>{sh ? docName(sh.doctorId) : '—'}</td>
                  <td style={{ border: '1px solid var(--rs-slate-200)', padding: '4px 6px' }}>{tpl?.name ?? '—'}</td>
                  <td style={{ border: '1px solid var(--rs-slate-200)', padding: '4px 6px' }}>{tpl ? String(tpl.totalHours) : '—'}</td>
                  <td style={{ border: '1px solid var(--rs-slate-200)', padding: '4px 6px' }}>{sh?.isPublicHoliday ? 'Yes' : ''}</td>
                  <td style={{ border: '1px solid var(--rs-slate-200)', padding: '4px 6px', fontSize: '8pt', color: 'var(--rs-slate-900)' }}>{notes || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {warnLines.length > 0 && (
        <section style={{ marginTop: '12px', fontSize: '8pt', color: 'var(--rs-slate-700)' }}>
          <div style={{ fontWeight: 800, marginBottom: '4px' }}>Scheduler notes</div>
          <ul style={{ margin: 0, paddingLeft: '18px' }}>
            {warnLines.slice(0, 12).map((w, i) => (
              <li key={i} style={{ marginBottom: '2px' }}>
                {w}
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer style={{ marginTop: '14px', paddingTop: '8px', borderTop: '1px solid var(--rs-slate-200)', fontSize: '7.5pt', color: 'var(--rs-slate-500)' }}>
        RosterSync — shareable roster export. On-call assignments and approved time-off notes are shown as recorded in the system.
      </footer>
    </div>
  );
};
