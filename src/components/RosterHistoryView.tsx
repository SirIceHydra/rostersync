import React, { useCallback, useEffect, useState } from 'react';
import { Role } from '../../types';
import type { Request, Roster, User } from '../../types';
import { api } from '../api/client';
import { mergeApprovedForCalendar, monthRangeIso } from '../utils/scheduleRequestsMerge';
import { Card } from './Card';
import { Button } from './Button';
import { Badge } from './Badge';
import { RosterPrintSheet } from './RosterPrintSheet';
import { Calendar, Loader2, Printer } from 'lucide-react';

export type ArchiveEntry = {
  year: number;
  month: number;
  rosterId: string | null;
  status: string | null;
  updatedAt: number | null;
  /** Set when a draft exists but the viewer is not an admin. */
  hint?: 'draft';
};

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const RosterHistoryView: React.FC<{
  useBackend: boolean;
  doctors: User[];
  requests: Request[];
  departmentName: string;
  currentUser: User;
  onOpenInRoster: (year: number, month: number) => void | Promise<void>;
}> = ({ useBackend, doctors, requests, departmentName, currentUser }) => {
  const [entries, setEntries] = useState<ArchiveEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [printPayload, setPrintPayload] = useState<{ roster: Roster; report: any; printRequests?: Request[] } | null>(null);
  const [printBusy, setPrintBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!useBackend) {
      setEntries([]);
      setLoading(false);
      setErr('Connect to the server to browse past rosters.');
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const { entries: e } = await api.getRosterArchive(6);
      setEntries(e ?? []);
    } catch (e: any) {
      setErr(e?.message || 'Could not load archive');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [useBackend]);

  useEffect(() => {
    void load();
  }, [load]);

  const handlePrint = async (year: number, month: number) => {
    const key = `${year}-${month}`;
    setPrintBusy(key);
    setPrintPayload(null);
    try {
      if (!useBackend) return;
      const roster = await api.getRoster(year, month).catch(() => null);
      if (!roster) return;
      let report: any = null;
      try {
        report = await api.getFairnessReport(year, month);
      } catch {
        /* optional for PDF */
      }
      let printRequests: Request[] | undefined;
      if (currentUser.role !== Role.ADMIN) {
        const { start, end } = monthRangeIso(year, month);
        try {
          const { entries } = await api.getApprovedSchedule(start, end);
          printRequests = mergeApprovedForCalendar(requests, entries ?? []);
        } catch {
          printRequests = mergeApprovedForCalendar(requests, []);
        }
      }
      setPrintPayload({ roster, report, printRequests });
      requestAnimationFrame(() => {
        window.print();
        window.setTimeout(() => setPrintPayload(null), 800);
      });
    } finally {
      setPrintBusy(null);
    }
  };

  const isAdmin = currentUser.role === Role.ADMIN;

  return (
    <div className="space-y-6">
      <div className="no-print">
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Past rosters</h1>
        <p className="text-[10px] font-bold text-slate-500 mt-1.5 leading-relaxed max-w-lg">
          Last six calendar months for your department. Published rosters are visible to everyone; drafts stay admin-only.
        </p>
      </div>

      {!useBackend && (
        <Card className="no-print p-4 border border-amber-100 bg-amber-50/50">
          <p className="text-[11px] font-bold text-amber-800">Offline mode: archive needs the live server.</p>
        </Card>
      )}

      {err && (
        <Card className="no-print p-4 border border-rose-100 bg-rose-50/40">
          <p className="text-[11px] font-bold text-rose-800 leading-relaxed">{err}</p>
          <p className="text-[10px] text-rose-700/90 font-bold mt-2 leading-relaxed">
            Check that the API gateway is running on port 4000, you are signed in, and a department is selected.
          </p>
          <div className="mt-3">
            <Button type="button" variant="secondary" className="text-[10px]" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        </Card>
      )}

      {loading && (
        <div className="no-print flex items-center justify-center py-16 gap-2 text-slate-500">
          <Loader2 className="animate-spin" size={22} />
          <span className="text-xs font-bold">Loading…</span>
        </div>
      )}

      {!loading && !err && entries.length === 0 && useBackend && (
        <Card className="no-print p-6 border border-slate-200 bg-white text-center">
          <p className="text-[11px] font-bold text-slate-700">No roster rows in the last six months yet.</p>
          <p className="text-[10px] text-slate-500 font-bold mt-2 leading-relaxed max-w-md mx-auto">
            After an admin generates and publishes a month, it will appear here.
          </p>
          <div className="mt-4">
            <Button type="button" variant="secondary" className="text-[10px]" onClick={() => void load()}>
              Refresh
            </Button>
          </div>
        </Card>
      )}

      {!loading && entries.length > 0 && (
        <div className="no-print space-y-2">
          {entries.map((e) => {
            const label = `${MONTH_NAMES[e.month]} ${e.year}`;
            const hasFinal = e.status === 'FINAL' && e.rosterId;
            const hasDraftAdmin = isAdmin && e.status === 'DRAFT' && e.rosterId;
            const downloadable = hasFinal || hasDraftAdmin;
            const inPrep = e.hint === 'draft';

            return (
              <Card key={`${e.year}-${e.month}`} className="overflow-hidden">
                <div className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                      <Calendar size={18} aria-hidden />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-black text-slate-900">{label}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        {!e.rosterId && !inPrep && <Badge color="slate">No roster</Badge>}
                        {inPrep && <Badge color="yellow">In preparation</Badge>}
                        {hasFinal && <Badge color="green">Published</Badge>}
                        {hasDraftAdmin && <Badge color="yellow">Draft</Badge>}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    {downloadable && (
                      <Button
                        variant="secondary"
                        className="min-h-11 text-[10px] touch-manipulation"
                        type="button"
                        disabled={printBusy === `${e.year}-${e.month}`}
                        onClick={() => void handlePrint(e.year, e.month)}
                      >
                        <Printer size={14} aria-hidden />
                        {printBusy === `${e.year}-${e.month}` ? 'Preparing…' : 'Download PDF'}
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {printPayload && (
        <RosterPrintSheet
          roster={printPayload.roster}
          doctors={doctors}
          requests={printPayload.printRequests ?? requests}
          departmentName={departmentName}
          report={printPayload.report}
        />
      )}
    </div>
  );
};
