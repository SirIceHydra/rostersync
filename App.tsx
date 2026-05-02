import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  Role, 
  User, 
  Roster, 
  Request, 
  RequestType, 
  RequestStatus, 
  ScheduledShift,
  FairnessMetric
} from './types';
import { SHIFT_TEMPLATES } from './constants';
import { api, type Department } from './src/api/client';
import { LoginForm } from './src/components/LoginForm';
import { 
  Calendar,
  ShieldCheck,
  BarChart3,
  AlertCircle,
  CheckCircle2,
  Plus,
  LogOut,
  History,
  House,
  Info,
  Users,
  Printer,
  Edit2,
  Trash2,
  X,
  Building2,
  ChevronDown,
  ChevronRight,
  Loader2,
  SlidersHorizontal,
  Menu,
  Archive,
  Link2,
  UserX,
  CircleDashed
} from 'lucide-react';

// --- Production UI Components ---
import { Card } from './src/components/Card';
import { Button } from './src/components/Button';
import { Badge } from './src/components/Badge';
import { RosterPrintSheet } from './src/components/RosterPrintSheet';
import { RosterHistoryView } from './src/components/RosterHistoryView';
import {
  mergeApprovedForCalendar,
  spanCalendarMonths,
  type ApprovedScheduleMarker,
} from './src/utils/scheduleRequestsMerge';

type AppShellView = 'DASHBOARD' | 'ROSTER' | 'ANALYTICS' | 'REQUESTS' | 'DOCTORS' | 'TUNING' | 'ARCHIVE';

// --- Join Department (user logged in but has no department) ---
function JoinDepartmentView(props: {
  onSuccess: () => Promise<void>;
  onLogout: () => void;
}) {
  const { onSuccess, onLogout } = props;
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!code.trim()) {
      setError('Enter your department code');
      return;
    }
    setLoading(true);
    try {
      const result = await api.joinDepartment(code.trim());
      if (result.alreadyMember) {
        setSuccess('You already belong to this department. Loading it now…');
        await onSuccess();
      } else {
        setSuccess('Request sent to department admin. You will see the department once they approve.');
      }
    } catch (err: any) {
      setError(err.message || 'Invalid or expired code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden bg-slate-50">
      <div className="hs-blob w-32 h-32 -top-8 -right-8 bg-indigo-100 opacity-60" style={{ animationDelay: '0s' }} />
      <div className="hs-blob w-24 h-24 bottom-24 -left-6 bg-amber-100 opacity-50" style={{ animationDelay: '2s' }} />

      <div className="w-full max-w-md space-y-6 relative z-10">
        <div className="text-center">
          <div className="mx-auto mb-5 flex justify-center">
            <img
              src="/rostersync-lockup-color.svg"
              alt="RosterSync"
              width={400}
              height={88}
              className="h-12 w-auto sm:h-14 md:h-16 max-w-[min(100%,280px)] object-contain object-left"
            />
          </div>
          <h1 className="rs-h2 text-slate-900 tracking-tight">Join a department</h1>
          <p className="text-slate-500 text-xs font-bold mt-2 uppercase tracking-wider">
            Enter the department code from your admin or team
          </p>
        </div>
        <Card className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rs-alert rs-alert--danger" role="alert">
                <div className="rs-alert-body text-sm font-semibold">{error}</div>
              </div>
            )}
            {success && !error && (
              <div className="rs-alert rs-alert--success" role="status">
                <div className="rs-alert-body text-sm font-semibold">{success}</div>
              </div>
            )}
            <div className="rs-field">
              <label className="rs-label uppercase tracking-widest text-[10px] text-slate-500" htmlFor="join-dept-code">
                Department code
              </label>
              <input
                id="join-dept-code"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="rs-input font-semibold uppercase tracking-widest"
                placeholder="e.g. ABC12XYZ"
                maxLength={12}
                autoFocus
              />
            </div>
            <Button type="submit" variant="primary" className="w-full py-3.5" disabled={loading}>
              {loading ? 'Joining…' : 'Join department'}
            </Button>
          </form>
        </Card>
        <div className="text-center">
          <button onClick={onLogout} className="text-slate-400 text-xs font-bold hover:text-slate-600 flex items-center gap-2 mx-auto">
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Main Application Entry ---

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [newDepartmentCode, setNewDepartmentCode] = useState<string | null>(null); // Shown after admin register
  const [joinRequests, setJoinRequests] = useState<{ id: string; userId: string; email: string; name: string; createdAt: number }[]>([]);
  const [view, setView] = useState<AppShellView>('DASHBOARD');
  const [roster, setRoster] = useState<Roster | null>(null);
  const [requests, setRequests] = useState<Request[]>([]);
  /** Approved dept-wide markers without reasons (doctors only); admins leave this empty. */
  const [publicApprovedMarkers, setPublicApprovedMarkers] = useState<ApprovedScheduleMarker[]>([]);
  const [doctors, setDoctors] = useState<User[]>([]);
  const [fairnessReport, setFairnessReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [useBackend, setUseBackend] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [infoBanner, setInfoBanner] = useState<string | null>(null);
  const [selectedMonthOffset, setSelectedMonthOffset] = useState<0 | 1>(0); // 0 = this month, 1 = next month
  /** When set, main roster/analytics data is for this calendar month (from Past rosters). */
  const [historicalRosterLock, setHistoricalRosterLock] = useState<{ year: number; month: number } | null>(null);
  const [departmentDropdownOpen, setDepartmentDropdownOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const lastQuietMarkerFetchAtRef = useRef(0);
  /** Skip one view-based marker fetch after initial load (roster load already populated markers). */
  const skipInitialViewMarkerRefreshRef = useRef(true);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileNavOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileNavOpen]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileNavOpen]);

  // Check if backend is available and load user
  useEffect(() => {
    const token = api.getToken();
    if (token) {
      loadUserFromToken();
    } else {
      loadFromLocalStorage();
    }
  }, []);

  const loadUserFromToken = async () => {
    try {
      const { user, departments: depts } = await api.verify();
      setCurrentUser(user);
      setDepartments(depts || []);
      if ((depts?.length ?? 0) > 0) {
        const savedId = api.getDepartmentId();
        const valid = savedId && depts.some((d: Department) => d.id === savedId);
        api.setDepartmentId(valid ? savedId : depts[0].id);
        await loadData({ user, fromAuth: true });
      }
    } catch (error) {
      console.warn('Backend not available, using localStorage fallback');
      setUseBackend(false);
      api.setToken(null);
      api.setDepartmentId(null);
      loadFromLocalStorage();
    }
  };

  const loadFromLocalStorage = () => {
    const savedUser = localStorage.getItem('rs_user');
    if (savedUser) {
      setCurrentUser(JSON.parse(savedUser));
    }
    const savedDocs = localStorage.getItem('rs_doctors_v2');
    const savedRoster = localStorage.getItem('rs_roster_v2');
    const savedReqs = localStorage.getItem('rs_requests_v2');
    if (savedDocs) setDoctors(JSON.parse(savedDocs));
    if (savedReqs) {
      let reqs = JSON.parse(savedReqs) as Request[];
      const u = savedUser ? (JSON.parse(savedUser) as User) : null;
      if (u && u.role !== Role.ADMIN && u.id) {
        reqs = reqs.filter((r) => r.doctorId === u.id);
      }
      setRequests(reqs);
    }
    if (savedRoster) setRoster(JSON.parse(savedRoster));
  };

  const getTargetMonthYear = (offset: 0 | 1) => {
    const now = new Date();
    const baseMonth = now.getMonth();
    const baseYear = now.getFullYear();
    const month = (baseMonth + offset) % 12;
    const year = baseYear + (baseMonth + offset >= 12 ? 1 : 0);
    return { month, year };
  };

  const refreshPublicApprovedSchedule = useCallback(
    async (forUser: User | null, historicalLock: { year: number; month: number } | null) => {
      if (!useBackend || !forUser || forUser.role === Role.ADMIN) {
        setPublicApprovedMarkers([]);
        return;
      }
      try {
        const m0 = getTargetMonthYear(0);
        const m1 = getTargetMonthYear(1);
        const slots = [m0, m1];
        if (historicalLock) slots.push(historicalLock);
        const { start, end } = spanCalendarMonths(slots);
        const { entries } = await api.getApprovedSchedule(start, end);
        setPublicApprovedMarkers(entries ?? []);
      } catch {
        setPublicApprovedMarkers([]);
      }
    },
    [useBackend]
  );

  const loadRosterForOffset = async (offset: 0 | 1, actingUserOverride?: User | null) => {
    if (!useBackend) return;
    setHistoricalRosterLock(null);
    try {
      setLoading(true);
      const { month, year } = getTargetMonthYear(offset);
      const rosterData = await api.getRoster(year, month).catch(() => null);
      setSelectedMonthOffset(offset);

      if (rosterData) {
        setRoster(rosterData);
        try {
          const report = await api.getFairnessReport(year, month);
          setFairnessReport(report);
        } catch (e) {
          console.warn('Could not load fairness report');
          setFairnessReport(null);
        }
      } else {
        setRoster(null);
        setFairnessReport(null);
      }

      try {
        const doctorsData = await api.getDoctors(year);
        setDoctors(doctorsData);
      } catch {
        /* keep existing doctors list */
      }
      await refreshPublicApprovedSchedule(actingUserOverride ?? currentUser, null);
    } catch (error: any) {
      setApiError(error.message);
      console.error('Failed to load roster:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadRosterForYearMonth = async (year: number, month: number, actingUserOverride?: User | null) => {
    if (!useBackend) return;
    try {
      setLoading(true);
      setHistoricalRosterLock({ year, month });
      const rosterData = await api.getRoster(year, month).catch(() => null);
      if (rosterData) {
        setRoster(rosterData);
        try {
          const report = await api.getFairnessReport(year, month);
          setFairnessReport(report);
        } catch {
          setFairnessReport(null);
        }
      } else {
        setRoster(null);
        setFairnessReport(null);
      }
      try {
        const doctorsData = await api.getDoctors(year).catch(() => []);
        setDoctors(doctorsData);
      } catch {
        /* keep */
      }
      await refreshPublicApprovedSchedule(actingUserOverride ?? currentUser, { year, month });
    } catch (error: any) {
      setApiError(error.message);
      console.error('Failed to load roster for', year, month, error);
    } finally {
      setLoading(false);
    }
  };

  const loadData = async (opts?: { user?: User | null; fromAuth?: boolean }) => {
    if (!opts?.fromAuth && !useBackend) return;
    const actingUser = opts?.user ?? currentUser;
    try {
      setLoading(true);
      const initialYear = getTargetMonthYear(0).year;
      const [doctorsData, requestsData, joinReqData] = await Promise.all([
        api.getDoctors(initialYear).catch(() => []),
        api.getRequests().catch(() => []),
        actingUser?.role === Role.ADMIN ? api.getJoinRequests().catch(() => ({ requests: [] })) : Promise.resolve({ requests: [] as any[] })
      ]);
      setDoctors(doctorsData);
      setRequests(requestsData);
      if (actingUser?.role === Role.ADMIN) {
        setJoinRequests(joinReqData.requests || []);
      }

      // Load this month's roster by default
      await loadRosterForOffset(0, actingUser ?? null);
    } catch (error: any) {
      setApiError(error.message);
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const calendarApprovedRequests = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === Role.ADMIN) {
      return requests.filter((r) => r.status === RequestStatus.APPROVED);
    }
    return mergeApprovedForCalendar(requests, publicApprovedMarkers);
  }, [currentUser, requests, publicApprovedMarkers]);

  /** Quiet refetch for doctors: same range as roster markers (no full roster reload). */
  const refreshDoctorApprovedMarkersQuiet = useCallback(async () => {
    await refreshPublicApprovedSchedule(currentUser, historicalRosterLock);
  }, [refreshPublicApprovedSchedule, currentUser, historicalRosterLock]);

  useEffect(() => {
    if (!useBackend || !currentUser || currentUser.role === Role.ADMIN) return;
    const debounceMs = 450;
    const maybeRefresh = () => {
      const now = Date.now();
      if (now - lastQuietMarkerFetchAtRef.current < debounceMs) return;
      lastQuietMarkerFetchAtRef.current = now;
      void refreshDoctorApprovedMarkersQuiet();
    };
    const onWindowFocus = () => maybeRefresh();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') maybeRefresh();
    };
    window.addEventListener('focus', onWindowFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onWindowFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [useBackend, currentUser, refreshDoctorApprovedMarkersQuiet]);

  useEffect(() => {
    if (!useBackend || !currentUser || currentUser.role === Role.ADMIN) return;
    if (view !== 'ROSTER' && view !== 'ANALYTICS' && view !== 'DASHBOARD') return;
    if (skipInitialViewMarkerRefreshRef.current) {
      skipInitialViewMarkerRefreshRef.current = false;
      return;
    }
    void refreshDoctorApprovedMarkersQuiet();
  }, [view, useBackend, currentUser, refreshDoctorApprovedMarkersQuiet]);

  const handleLogin = async (email: string, password: string) => {
    try {
      const { user, token, departments: depts } = await api.login(email, password);
      api.setToken(token);
      setCurrentUser(user);
      setDepartments(depts || []);
      setNewDepartmentCode(null);
      localStorage.setItem('rs_user', JSON.stringify(user));
      setUseBackend(true);
      if ((depts?.length ?? 0) > 0) {
        const savedId = api.getDepartmentId();
        const valid = savedId && depts.some((d: Department) => d.id === savedId);
        api.setDepartmentId(valid ? savedId : depts[0].id);
        await loadData({ user, fromAuth: true });
      } else {
        api.setDepartmentId(null);
      }
    } catch (error: any) {
      throw new Error(error.message || 'Login failed');
    }
  };

  const handleRegister = async (data: { email: string; password: string; name: string; role: string; firm?: string; departmentName?: string }) => {
    try {
      const { user, token, department, departments: depts } = await api.register(data);
      api.setToken(token);
      setCurrentUser(user);
      setDepartments(depts || []);
      localStorage.setItem('rs_user', JSON.stringify(user));
      setUseBackend(true);
      if (user.role === 'ADMIN' && department) {
        api.setDepartmentId(department.id);
        setNewDepartmentCode(department.code);
        await loadData({ user, fromAuth: true });
      } else {
        api.setDepartmentId(null);
      }
    } catch (error: any) {
      throw new Error(error.message || 'Registration failed');
    }
  };

  const handleJoinDepartmentSuccess = async () => {
    const { user } = await api.verify();
    setCurrentUser(user);
    const { departments: depts } = await api.getDepartments();
    setDepartments(depts || []);
    if ((depts?.length ?? 0) > 0) {
      api.setDepartmentId(depts[0].id);
      await loadData({ user, fromAuth: true });
    }
  };

  const handleSwitchDepartment = async (dept: Department) => {
    api.setDepartmentId(dept.id);
    setDepartmentDropdownOpen(false);
    await loadData({ fromAuth: true });
  };

  const handleLogout = () => {
    api.setToken(null);
    api.setDepartmentId(null);
    setCurrentUser(null);
    setDepartments([]);
    setNewDepartmentCode(null);
    setJoinRequests([]);
    localStorage.removeItem('rs_user');
    setRoster(null);
    setRequests([]);
    setDoctors([]);
    setFairnessReport(null);
    setPublicApprovedMarkers([]);
    skipInitialViewMarkerRefreshRef.current = true;
  };

  const handleCopyDepartmentCode = async (code?: string | null) => {
    if (!code) return;
    try {
      await navigator.clipboard?.writeText(code);
      setApiError('Department code copied to clipboard');
      setTimeout(() => setApiError(null), 2000);
    } catch {
      setApiError('Could not copy code – please copy manually');
      setTimeout(() => setApiError(null), 2000);
    }
  };

  useEffect(() => {
    if (!infoBanner) return;
    const t = window.setTimeout(() => setInfoBanner(null), 5000);
    return () => window.clearTimeout(t);
  }, [infoBanner]);

  const handleRegenerateSelected = async () => {
    const offset = selectedMonthOffset;
    const { month: targetMonth, year: targetYear } = getTargetMonthYear(offset);
    const wasFinal = roster?.status === 'FINAL';

    if (!useBackend) {
      const { RosterEngine } = await import('./rosterEngine');
      const { roster: newRoster, report } = RosterEngine.generate(targetMonth, targetYear, doctors, requests);
      const out = wasFinal ? { ...newRoster, status: 'FINAL' as const } : newRoster;
      setRoster(out);
      setFairnessReport(report);
      localStorage.setItem('rs_roster_v2', JSON.stringify(out));
      if (wasFinal) setInfoBanner('Roster updated. If hours changed, run sync on Balance.');
      return;
    }

    try {
      setLoading(true);
      const { roster: newRoster, report } = await api.generateRoster(targetMonth, targetYear);
      setRoster(newRoster);
      setFairnessReport(report);
      if (wasFinal) setInfoBanner('Roster updated. If hours changed, run sync on Balance.');
    } catch (error: any) {
      setApiError(error.message);
      console.error('Failed to regenerate roster:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAutoGenerate = async () => {
    const { month: targetMonth, year: targetYear } = getTargetMonthYear(selectedMonthOffset);

    if (!useBackend) {
      const { RosterEngine } = await import('./rosterEngine');
      const { roster: newRoster, report } = RosterEngine.generate(targetMonth, targetYear, doctors, requests);
      setRoster(newRoster);
      setFairnessReport(report);
      localStorage.setItem('rs_roster_v2', JSON.stringify(newRoster));
      return;
    }

    try {
      setLoading(true);
      const { roster: newRoster, report } = await api.generateRoster(targetMonth, targetYear);
      setRoster(newRoster);
      setFairnessReport(report);
    } catch (error: any) {
      setApiError(error.message);
      console.error('Failed to generate roster:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddRequest = async (req: Request) => {
    if (!useBackend) {
      const updated = [...requests, req];
      setRequests(updated);
      localStorage.setItem('rs_requests_v2', JSON.stringify(updated));
      return;
    }

    try {
      const newReq = await api.createRequest({
        type: req.type,
        date: req.date,
        reason: req.reason,
        swapWithDoctorId: req.swapWithDoctorId,
        doctorId: req.doctorId !== currentUser?.id ? req.doctorId : undefined,
      });
      setRequests([...requests, newReq]);
    } catch (error: any) {
      setApiError(error.message);
      console.error('Failed to create request:', error);
    }
  };

  const handleStatusChange = async (id: string, status: RequestStatus) => {
    if (!useBackend) {
      const updated = requests.map(r => r.id === id ? { ...r, status } : r);
      setRequests(updated);
      localStorage.setItem('rs_requests_v2', JSON.stringify(updated));
      return;
    }

    try {
      await api.updateRequestStatus(id, status);
      setRequests(requests.map(r => r.id === id ? { ...r, status } : r));
    } catch (error: any) {
      setApiError(error.message);
      console.error('Failed to update request:', error);
    }
  };

  const handleUpdateShift = async (shiftId: string, doctorId: string) => {
    if (!roster) return;

    if (!useBackend) {
      const updatedShifts = roster.shifts.map(s => s.id === shiftId ? { ...s, doctorId } : s);
      const updatedRoster = { ...roster, shifts: updatedShifts };
      setRoster(updatedRoster);
      localStorage.setItem('rs_roster_v2', JSON.stringify(updatedRoster));
      return;
    }

    try {
      await api.updateShift(roster.id, shiftId, doctorId);
      const updatedShifts = roster.shifts.map(s => s.id === shiftId ? { ...s, doctorId } : s);
      setRoster({ ...roster, shifts: updatedShifts });
    } catch (error: any) {
      setApiError(error.message);
      console.error('Failed to update shift:', error);
    }
  };

  const handleAddDoctor = async (doc: User) => {
    if (!useBackend) {
      const updated = [...doctors, doc];
      setDoctors(updated);
      localStorage.setItem('rs_doctors_v2', JSON.stringify(updated));
      return;
    }

    try {
      const newDoc = await api.addUserByEmail(doc.email);
      setDoctors([...doctors, newDoc]);
    } catch (error: any) {
      setApiError(error.message);
      console.error('Failed to add doctor:', error);
    }
  };

  const handleDeleteDoctor = async (id: string) => {
    if (!useBackend) {
      const updated = doctors.filter(d => d.id !== id);
      setDoctors(updated);
      localStorage.setItem('rs_doctors_v2', JSON.stringify(updated));
      return;
    }

    try {
      await api.deleteUser(id);
      setDoctors(doctors.filter(d => d.id !== id));
    } catch (error: any) {
      setApiError(error.message);
      console.error('Failed to delete doctor:', error);
    }
  };

  const handleAddPlaceholder = async (name: string, firm: string) => {
    try {
      const newDoc = await api.addPlaceholder(name, firm);
      setDoctors(prev => [...prev, newDoc]);
    } catch (error: any) {
      setApiError(error.message);
    }
  };

  const handleLinkPlaceholder = async (placeholderId: string, realUserId: string) => {
    try {
      const updated = await api.linkPlaceholder(placeholderId, realUserId);
      setDoctors(prev => prev.map(d => d.id === placeholderId ? updated : d).filter(d => d.id !== placeholderId));
      const fresh = await api.getDoctors().catch(() => null);
      if (fresh) setDoctors(fresh);
    } catch (error: any) {
      setApiError(error.message);
    }
  };

  const handlePublish = async () => {
    if (!roster) return;

    if (!useBackend) {
      const updated = { ...roster, status: 'FINAL' as const };
      setRoster(updated);
      localStorage.setItem('rs_roster_v2', JSON.stringify(updated));
      return;
    }

    try {
      await api.publishRoster(roster.id);
      setRoster({ ...roster, status: 'FINAL' });
      setInfoBanner('Published.');
    } catch (error: any) {
      setApiError(error.message);
      console.error('Failed to publish roster:', error);
    }
  };

  // Show login form if no user
  if (!currentUser) {
    return <LoginForm onLogin={handleLogin} onRegister={handleRegister} />;
  }

  // User is logged in but has no department yet — must join with a code
  if (departments.length === 0 && !api.getDepartmentId()) {
    return (
      <JoinDepartmentView
        onSuccess={async () => {
          // For new joins we now create a pending request; keep the user on this screen.
        }}
        onLogout={handleLogout}
      />
    );
  }

  // Ensure we have a selected department when we have departments (e.g. after refresh)
  if (departments.length > 0 && !api.getDepartmentId()) {
    api.setDepartmentId(departments[0].id);
  }

  const currentDepartment = departments.find(d => d.id === api.getDepartmentId()) || departments[0];

  const isDeptAdmin = currentUser.role === Role.ADMIN;
  /** Space for fixed bottom bar (3 shortcuts on mobile, full bar md+) */
  const mainBottomPad = 'pb-[calc(5.35rem+env(safe-area-inset-bottom,0px))]';

  const goNav = (v: AppShellView) => {
    const restoreRoster = historicalRosterLock !== null && v !== 'ROSTER';
    setView(v);
    setMobileNavOpen(false);
    setDepartmentDropdownOpen(false);
    if (restoreRoster && useBackend) {
      void loadRosterForOffset(selectedMonthOffset);
    }
  };

  type ShellNavIcon = React.ComponentType<{ size?: number | string; strokeWidth?: number | string; className?: string; 'aria-hidden'?: boolean }>;
  const drawerLinks: { view: AppShellView; label: string; Icon: ShellNavIcon }[] = isDeptAdmin
    ? [
        { view: 'DASHBOARD', label: 'Home', Icon: House },
        { view: 'ROSTER', label: 'Roster', Icon: Calendar },
        { view: 'ANALYTICS', label: 'Metrics', Icon: BarChart3 },
        { view: 'REQUESTS', label: 'Requests', Icon: AlertCircle },
        { view: 'DOCTORS', label: 'Staff', Icon: Users },
        { view: 'TUNING', label: 'Balance', Icon: SlidersHorizontal },
        { view: 'ARCHIVE', label: 'Past rosters', Icon: Archive },
      ]
    : [
        { view: 'DASHBOARD', label: 'Home', Icon: House },
        { view: 'ROSTER', label: 'Roster', Icon: Calendar },
        { view: 'ANALYTICS', label: 'Metrics', Icon: BarChart3 },
        { view: 'TUNING', label: 'Balance', Icon: SlidersHorizontal },
        { view: 'REQUESTS', label: 'Requests', Icon: AlertCircle },
        { view: 'ARCHIVE', label: 'Past rosters', Icon: Archive },
      ];

  return (
    <div className={`min-h-dvh min-h-screen bg-slate-50 flex flex-col font-sans select-none ${mainBottomPad}`}>
      {apiError && (
        <div className="bg-amber-50 border-b border-amber-200 p-3 text-center">
          <p className="text-xs font-bold text-amber-700">{apiError}</p>
          <button type="button" onClick={() => setApiError(null)} className="text-xs text-amber-600 mt-1 touch-manipulation min-h-[44px] px-3 inline-flex items-center justify-center rounded-xl">
            Dismiss
          </button>
        </div>
      )}
      {infoBanner && (
        <div className="bg-slate-100 border-b border-slate-200 px-3 py-2.5 text-center">
          <p className="text-[11px] font-bold text-slate-600">{infoBanner}</p>
          <button type="button" onClick={() => setInfoBanner(null)} className="text-[10px] font-bold text-slate-500 mt-1 touch-manipulation min-h-[40px] px-2">
            Dismiss
          </button>
        </div>
      )}
      {!useBackend && (
        <div className="bg-slate-100 border-b border-slate-200 p-2 text-center">
          <p className="text-[10px] font-bold text-slate-600">Running in offline mode (localStorage)</p>
        </div>
      )}

      {newDepartmentCode && (
        <div className="bg-indigo-50 border-b border-indigo-100 p-3 flex items-center justify-between gap-2 no-print">
          <div className="flex items-center gap-2 min-w-0">
            <Building2 className="text-indigo-600 shrink-0" size={18} />
            <p className="text-[10px] font-bold text-indigo-800 truncate">
              Your department code: <span className="font-black uppercase tracking-widest">{newDepartmentCode}</span> — share with your team to join
            </p>
          </div>
          <button onClick={() => setNewDepartmentCode(null)} className="p-1.5 text-indigo-400 hover:text-indigo-600 shrink-0">
            <X size={16} />
          </button>
        </div>
      )}
      <header
        className="bg-white border-b border-slate-200 px-3 py-2.5 sm:px-4 sm:py-3 md:px-6 md:py-3.5 sticky top-0 z-40 flex min-h-[3.25rem] sm:min-h-14 items-center gap-2 sm:gap-3 md:gap-6 safe-top no-print"
        style={{ boxShadow: 'var(--rs-shadow-sm)' }}
      >
        <div className="flex h-full min-h-[2.75rem] items-center gap-2 sm:gap-3 shrink-0">
          <button
            type="button"
            className="md:hidden shrink-0 -ml-0.5 p-2.5 rounded-2xl text-slate-800 hover:bg-slate-100 active:bg-slate-200 touch-manipulation transition-colors self-center"
            aria-expanded={mobileNavOpen}
            aria-controls="mobile-nav-drawer"
            aria-label="Open navigation menu"
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu size={22} strokeWidth={2.25} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => goNav('DASHBOARD')}
            className="inline-flex shrink-0 items-center justify-center self-center rounded-xl md:rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 touch-manipulation transition-opacity hover:opacity-90 active:opacity-80 py-0.5"
            aria-label="Go to home overview"
          >
            <img
              src="/rostersync-lockup-color.svg"
              alt=""
              width={200}
              height={44}
              className="pointer-events-none h-[1.65rem] w-auto sm:h-7 md:h-8 max-w-[140px] sm:max-w-[180px] object-contain object-left align-middle"
            />
          </button>
        </div>

        <div className="flex-1 min-w-0 flex flex-col items-center justify-center gap-1 md:gap-1.5 self-stretch py-0.5 md:px-4 overflow-hidden">
          <div className="flex w-full min-w-0 items-center justify-center gap-x-2 gap-y-1 sm:gap-x-3 md:gap-x-5 lg:gap-x-8 md:max-w-4xl md:mx-auto flex-wrap">
            {departments.length > 1 ? (
              <div className="relative max-w-full min-w-0 flex justify-center">
                <button
                  type="button"
                  onClick={() => setDepartmentDropdownOpen(!departmentDropdownOpen)}
                  className="flex max-w-full min-w-0 items-center gap-1.5 text-[10px] sm:text-[11px] md:text-xs font-bold text-slate-600 uppercase tracking-tight md:tracking-wide hover:text-indigo-600 text-center"
                >
                  <Building2 size={14} className="shrink-0 text-slate-400" />
                  <span className="truncate">{currentDepartment?.name || currentDepartment?.code || 'Department'}</span>
                  <ChevronDown size={14} className={`shrink-0 text-slate-400 ${departmentDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                {departmentDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setDepartmentDropdownOpen(false)} aria-hidden />
                    <div className="absolute left-1/2 top-full z-40 mt-1 min-w-[180px] max-w-[min(90vw,280px)] -translate-x-1/2 rounded-[var(--rs-r-lg)] border border-slate-200 bg-white py-1 shadow-md">
                      {departments.map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => handleSwitchDepartment(d)}
                          className={`block w-full px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider sm:text-[11px] ${d.id === api.getDepartmentId() ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}
                        >
                          {d.name || d.code}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <span className="min-w-0 max-w-full shrink truncate text-center text-[10px] font-bold uppercase tracking-tight text-slate-600 sm:text-[11px] md:max-w-xl md:text-xs md:tracking-wide">
                {currentDepartment?.name || currentDepartment?.code || ''}
              </span>
            )}
            {currentUser.role === Role.ADMIN && currentDepartment?.code && (
              <button
                type="button"
                onClick={() => handleCopyDepartmentCode(currentDepartment.code)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-[8px] font-black uppercase tracking-widest text-indigo-700 sm:text-[9px] md:px-3 md:py-1.5 md:text-[10px]"
              >
                <span className="hidden sm:inline">Code:</span>
                <span className="sm:hidden">Code</span> {currentDepartment.code}
                <span className="text-[9px] underline sm:text-[10px]">Copy</span>
              </button>
            )}
            <span className="hidden sm:inline min-w-0 max-w-[14rem] md:max-w-xs shrink truncate text-[10px] font-bold text-slate-500 md:text-xs">
              <span className="text-slate-300 md:mr-1.5">•</span>
              {currentUser.name}
            </span>
          </div>
        </div>

        <div className="shrink-0 flex min-h-[2.75rem] items-center justify-center self-stretch pl-0.5 md:pl-2">
          <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-rose-500 transition-colors touch-manipulation self-center" type="button" aria-label="Sign out">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-[100] md:hidden" role="dialog" aria-modal="true" aria-labelledby="mobile-nav-drawer-title" id="mobile-nav-drawer">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/45 backdrop-blur-[2px] touch-manipulation"
            aria-label="Close menu"
            onClick={() => setMobileNavOpen(false)}
          />
          <div
            className="absolute top-0 left-0 bottom-0 flex w-[min(88vw,300px)] flex-col bg-white shadow-2xl border-r border-slate-100"
            style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 shrink-0">
              <span id="mobile-nav-drawer-title" className="text-[11px] font-black uppercase tracking-widest text-slate-500">
                Menu
              </span>
              <button
                type="button"
                className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 touch-manipulation"
                aria-label="Close menu"
                onClick={() => setMobileNavOpen(false)}
              >
                <X size={20} />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto overscroll-contain py-2 px-2 space-y-1" aria-label="All pages">
              {drawerLinks.map(({ view: v, label, Icon }) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => goNav(v)}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-left text-sm font-black transition-colors touch-manipulation ${
                    view === v ? 'bg-indigo-50 text-indigo-800 ring-1 ring-indigo-100' : 'text-slate-800 hover:bg-slate-50 active:bg-slate-100'
                  }`}
                >
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${view === v ? 'bg-white shadow-sm text-indigo-600' : 'bg-slate-100 text-slate-600'}`}>
                    <Icon size={20} strokeWidth={2} aria-hidden />
                  </span>
                  <span>{label}</span>
                </button>
              ))}
            </nav>
            <p className="px-4 py-3 text-[9px] font-bold text-slate-400 leading-relaxed border-t border-slate-100 shrink-0" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
              Home, Roster &amp; Requests stay at the bottom for quick access.
            </p>
          </div>
        </div>
      )}

      <main className="relative flex-1 overflow-y-auto overflow-x-hidden touch-pan-y px-3 py-4 sm:px-5 sm:py-5 max-w-lg md:max-w-rs md:px-10 mx-auto w-full min-w-0 space-y-5 animate-in fade-in duration-500 pb-24 md:pb-20">
        {loading && (
          <div
            className="no-print absolute inset-0 z-40 flex flex-col items-center justify-start pt-28 bg-white/55 backdrop-blur-[2px] transition-opacity duration-200"
            aria-busy="true"
            aria-live="polite"
          >
            <div className="flex flex-col items-center gap-3 rounded-[var(--rs-r-xl)] bg-white/95 px-8 py-6 border border-slate-200 shadow-md">
              <Loader2 className="w-9 h-9 text-indigo-600 animate-spin" />
              <p className="text-xs font-bold text-slate-500 text-center max-w-[200px]">
                Updating roster…
              </p>
            </div>
          </div>
        )}
        {view === 'DASHBOARD' && (
          <DashboardView 
            user={currentUser} 
            roster={roster} 
            requests={requests} 
            report={fairnessReport}
            doctors={doctors}
            onGenerate={handleAutoGenerate}
            onPublish={handlePublish}
            onRegenerate={handleRegenerateSelected}
            selectedMonthOffset={selectedMonthOffset}
            onChangeMonth={async (offset) => {
              await loadRosterForOffset(offset);
            }}
            loading={loading}
            onNavigate={(v) => setView(v)}
          />
        )}
        {view === 'ROSTER' && (
          <RosterView 
            roster={roster} 
            report={fairnessReport}
            currentUser={currentUser} 
            doctors={doctors}
            calendarApprovedRequests={calendarApprovedRequests}
            onUpdateShift={handleUpdateShift}
            selectedMonthOffset={selectedMonthOffset}
            onChangeMonth={async (offset) => {
              await loadRosterForOffset(offset);
            }}
            departmentName={currentDepartment?.name || currentDepartment?.code || 'Department'}
            viewingHistoricalRoster={historicalRosterLock !== null}
            onExitHistoricalRoster={() => void loadRosterForOffset(0)}
          />
        )}
        {view === 'ARCHIVE' && (
          <RosterHistoryView
            useBackend={useBackend}
            doctors={doctors}
            requests={requests}
            departmentName={currentDepartment?.name || currentDepartment?.code || 'Department'}
            currentUser={currentUser}
            onOpenInRoster={async (year, month) => {
              await loadRosterForYearMonth(year, month, currentUser);
              setView('ROSTER');
            }}
          />
        )}
        {view === 'ANALYTICS' && (
          <AnalyticsView
            report={fairnessReport}
            doctors={doctors}
            roster={roster}
            requests={calendarApprovedRequests}
            currentUser={currentUser}
            selectedMonthOffset={selectedMonthOffset}
            onChangeMonth={async (offset) => { await loadRosterForOffset(offset); }}
            onNavigate={(v) => setView(v)}
          />
        )}
        {view === 'REQUESTS' && (
          <RequestsView 
            user={currentUser} 
            requests={requests} 
            onAdd={handleAddRequest} 
            onStatusChange={handleStatusChange} 
            doctors={doctors}
          />
        )}
        {view === 'DOCTORS' && (
          <DoctorsView
            doctors={doctors}
            onAdd={handleAddDoctor}
            onDelete={handleDeleteDoctor}
            onAddPlaceholder={handleAddPlaceholder}
            onLinkPlaceholder={handleLinkPlaceholder}
            onRefresh={async () => {
              if (!useBackend) return;
              try {
                const doctorsData = await api.getDoctors().catch(() => []);
                setDoctors(doctorsData);
              } catch {
                /* ignore */
              }
            }}
            isAdmin={currentUser.role === Role.ADMIN}
            useBackend={useBackend}
          />
        )}
        {view === 'TUNING' && (
          <TuningView 
            report={fairnessReport}
            doctors={doctors}
            roster={roster}
            isAdmin={currentUser.role === Role.ADMIN}
            onFairnessSettingsSaved={() => loadRosterForOffset(selectedMonthOffset)}
          />
        )}
      </main>

      <nav
        className="bg-white border-t border-slate-200 fixed bottom-0 left-0 right-0 z-50 no-print w-full"
        style={{ boxShadow: '0 -4px 24px rgba(244,124,32,0.08)' }}
        aria-label="Quick navigation"
      >
        {/* Mobile: 3 primary tabs — rest live in the hamburger drawer */}
        <div className="flex md:hidden flex-row justify-around items-stretch w-full pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]">
          <TabItem active={view === 'DASHBOARD'} icon={<House size={20} />} label="Home" onClick={() => goNav('DASHBOARD')} />
          <TabItem active={view === 'ROSTER'} icon={<Calendar size={20} />} label="Roster" onClick={() => goNav('ROSTER')} />
          <TabItem active={view === 'REQUESTS'} icon={<AlertCircle size={20} />} label="Requests" onClick={() => goNav('REQUESTS')} />
        </div>

        {/* md+: full tab bar */}
        {isDeptAdmin ? (
          <div className="hidden md:flex flex-row justify-around items-stretch w-full py-2.5 px-2 pb-[max(0.35rem,env(safe-area-inset-bottom,0px))]">
            <TabItem active={view === 'DASHBOARD'} icon={<House size={19} />} label="Home" onClick={() => goNav('DASHBOARD')} />
            <TabItem active={view === 'ROSTER'} icon={<Calendar size={19} />} label="Roster" onClick={() => goNav('ROSTER')} />
            <TabItem active={view === 'ANALYTICS'} icon={<BarChart3 size={19} />} label="Metrics" onClick={() => goNav('ANALYTICS')} />
            <TabItem active={view === 'REQUESTS'} icon={<AlertCircle size={19} />} label="Requests" onClick={() => goNav('REQUESTS')} />
            <TabItem active={view === 'DOCTORS'} icon={<Users size={19} />} label="Staff" onClick={() => goNav('DOCTORS')} />
            <TabItem active={view === 'TUNING'} icon={<SlidersHorizontal size={19} />} label="Balance" onClick={() => goNav('TUNING')} />
            <TabItem active={view === 'ARCHIVE'} icon={<Archive size={19} />} label="Past" onClick={() => goNav('ARCHIVE')} />
          </div>
        ) : (
          <div className="hidden md:flex flex-row justify-around items-stretch w-full py-2 px-1 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]">
            <TabItem active={view === 'DASHBOARD'} icon={<House size={19} />} label="Home" onClick={() => goNav('DASHBOARD')} />
            <TabItem active={view === 'ROSTER'} icon={<Calendar size={19} />} label="Roster" onClick={() => goNav('ROSTER')} />
            <TabItem active={view === 'ANALYTICS'} icon={<BarChart3 size={19} />} label="Metrics" onClick={() => goNav('ANALYTICS')} />
            <TabItem active={view === 'TUNING'} icon={<SlidersHorizontal size={19} />} label="Balance" onClick={() => goNav('TUNING')} />
            <TabItem active={view === 'REQUESTS'} icon={<AlertCircle size={19} />} label="Requests" onClick={() => goNav('REQUESTS')} />
            <TabItem active={view === 'ARCHIVE'} icon={<Archive size={19} />} label="Past" onClick={() => goNav('ARCHIVE')} />
          </div>
        )}
      </nav>
    </div>
  );
}

const TabItem: React.FC<{
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}> = ({ active, icon, label, onClick }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-0.5 flex-1 min-w-0 min-h-[52px] md:min-h-[48px] py-2 md:py-1.5 touch-manipulation transition-colors ${active ? 'text-indigo-600' : 'text-slate-400'}`}
    >
      <div className={`rounded-2xl shrink-0 transition-all p-1 md:p-1.5 ${active ? 'bg-indigo-50' : ''}`}>{icon}</div>
      <span className="text-[10px] font-extrabold uppercase tracking-wide text-center leading-tight px-1 line-clamp-1 w-full">
        {label}
      </span>
    </button>
  );
};

// --- View Sub-Components ---

const getInitials = (name?: string | null, fallback: string = '?') => {
  if (!name) return fallback;
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
};

/** Plain-language date for banners (e.g. "Saturday, 16 May 2026") */
function formatFriendlyDateFromIso(iso: string): string {
  const [y, mo, d] = iso.split('-').map(s => parseInt(s, 10));
  if (!y || !mo || !d) return iso;
  return new Date(y, mo - 1, d).toLocaleDateString('en-ZA', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

/**
 * Some warnings refer to a single calendar day — only show them when viewing that month
 * (e.g. don't show a May weekend clash while browsing June).
 */
function rosterWarningAppliesToMonth(warning: string, rosterMonth: number, rosterYear: number): boolean {
  let m = warning.match(/Weekend Conflict on (\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const y = parseInt(m[1], 10);
    const month = parseInt(m[2], 10) - 1;
    return y === rosterYear && month === rosterMonth;
  }
  m = warning.match(/Unassigned Day:\s*(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const y = parseInt(m[1], 10);
    const month = parseInt(m[2], 10) - 1;
    return y === rosterYear && month === rosterMonth;
  }
  return true;
}

/** Turn engine messages into short, non-technical copy for doctors and admins */
function humanizeFairnessWarning(warning: string): string {
  if (warning.startsWith('Weekend Imbalance:')) {
    return 'Weekend duty is uneven this month: some people have more Saturday or Sunday shifts than others. Skim the calendar to see if that feels fair for your team.';
  }
  if (warning.startsWith('Weekend Conflict on')) {
    const iso = warning.match(/(\d{4}-\d{2}-\d{2})/)?.[1];
    const when = iso ? formatFriendlyDateFromIso(iso) : 'that date';
    return `Time-off clash: more than one person is approved off on ${when}. Someone still needs to cover the shift — an admin should decide.`;
  }
  if (warning.startsWith('Hour Discrepancy:')) {
    return 'The gap between the busiest and lightest doctor this month is wider than your fairness setting allows.';
  }
  if (warning.startsWith('Public Holiday Imbalance:')) {
    return 'Public holiday shifts are uneven: one person has noticeably more holiday duty than others this month.';
  }
  if (warning.startsWith('Unassigned Day:')) {
    const iso = warning.match(/(\d{4}-\d{2}-\d{2})/)?.[1];
    const when = iso ? formatFriendlyDateFromIso(iso) : 'a day';
    return `No one could be rostered on ${when} — often everyone is on leave. Please assign someone manually.`;
  }
  return warning;
}

function getRosterWarningsForView(
  warnings: string[] | undefined,
  rosterMonth: number,
  rosterYear: number
): string[] {
  if (!warnings?.length) return [];
  return warnings
    .filter(w => rosterWarningAppliesToMonth(w, rosterMonth, rosterYear))
    .map(humanizeFairnessWarning);
}

/** Department fairness window (from API on doctor rows); `schedulingYear` falls back to roster year when missing. */
function fairnessHistoryContext(doctors: User[], rosterYear?: number) {
  const mode = doctors[0]?.fairnessHistoryMode ?? 'ALL_TIME';
  const schedulingYear = doctors[0]?.schedulingYear ?? rosterYear;
  return { mode, schedulingYear, isCalendarYear: mode === 'CALENDAR_YEAR' };
}

/** Compact summary next to each name in "Everyone's hours" */
function formatHoursSummaryLine(m: { totalHours: number; weekendShifts: number; holidayHours?: number }): string {
  const wk = m.weekendShifts === 0
    ? 'no weekends'
    : `${m.weekendShifts} weekend${m.weekendShifts > 1 ? 's' : ''}`;
  const hol = (m.holidayHours ?? 0) > 0 ? `${m.holidayHours} holiday hrs` : 'no holiday shifts';
  return `${m.totalHours} hrs · ${wk} · ${hol}`;
}

/**
 * Builds a human-readable explanation for why a doctor received their workload this month.
 * Considers cumulative history, leave/unavailable requests, preferred-work, and new-joiner status.
 */
function buildDoctorReasoning(
  doc: User,
  metric: { totalHours: number; weekendShifts: number; holidayHours?: number; holidayShifts?: number; weekdayShifts?: number },
  doctors: User[],
  approvedRequests: Request[],
  monthIdx: number,
  year: number
): { lines: string[]; tag: 'restingHigh' | 'catchingUpLow' | 'newJoinerFair' | 'newJoinerSkipped' | 'immediate' | 'normal'; tagLabel: string } {
  const lines: string[] = [];
  const cumHours = doc.cumulativeTotalHours ?? 0;
  const cumWeekends = doc.cumulativeWeekendShifts ?? 0;
  const cumPH = doc.cumulativeHolidayHours ?? 0;
  const windowIsYear = doc.fairnessHistoryMode === 'CALENDAR_YEAR';
  const hoursWindow = windowIsYear ? 'this calendar year' : 'across every published month so far';
  const weekendWindow = windowIsYear ? 'this calendar year' : 'in the record overall';
  const phOnRecord = windowIsYear ? 'public-holiday hours this year' : 'public-holiday hours on record';

  // Team mean (over doctors with any history) and median (more robust to outliers).
  const veteranCum = doctors.map(d => d.cumulativeTotalHours ?? 0).filter(v => v > 0);
  const avgCum = veteranCum.length > 0 ? veteranCum.reduce((a, b) => a + b, 0) / veteranCum.length : 0;
  const avgCumWeekends = doctors.length > 0 ? doctors.reduce((s, d) => s + (d.cumulativeWeekendShifts ?? 0), 0) / doctors.length : 0;
  const avgCumPH = doctors.length > 0 ? doctors.reduce((s, d) => s + (d.cumulativeHolidayHours ?? 0), 0) / doctors.length : 0;

  // Approved requests for this doctor this month
  const monthPrefix = `${year}-${(monthIdx + 1).toString().padStart(2, '0')}-`;
  const myReqs = approvedRequests.filter(r => r.doctorId === doc.id && r.date.startsWith(monthPrefix));
  const leaves = myReqs.filter(r => r.type === RequestType.LEAVE).map(r => r.date.slice(8));
  const unavailable = myReqs.filter(r => r.type === RequestType.UNAVAILABLE).map(r => r.date.slice(8));
  const preferred = myReqs.filter(r => r.type === RequestType.PREFERRED_WORK).map(r => r.date.slice(8));
  const postCallOff = myReqs.filter(r => r.type === RequestType.POST_CALL_OFF).map(r => r.date.slice(8));

  // Tenure from start date (calendar months, same logic as engine)
  const monthsActive = doc.startDate
    ? Math.max(0, (year - new Date(doc.startDate).getFullYear()) * 12 + (monthIdx - new Date(doc.startDate).getMonth()))
    : 12;
  // Treat as "new starter" if very little published history OR still in first ~2 roster months
  const isFreshJoiner = monthsActive < 2 || (cumHours === 0 && (doc.cumulativeWeekendShifts ?? 0) === 0);

  const monthHours = metric.totalHours;
  const mode = doc.workloadStartMode ?? 'STAGGERED';

  // 1. Categorise the doctor — short tags for the list; details stay in expandable lines
  let tag: 'restingHigh' | 'catchingUpLow' | 'newJoinerFair' | 'newJoinerSkipped' | 'immediate' | 'normal' = 'normal';
  let tagLabel = '';

  if (isFreshJoiner && mode === 'NEXT_MONTH' && monthHours === 0) {
    tag = 'newJoinerSkipped';
    tagLabel = 'Starts rostering next month';
    lines.push(`This doctor is set to begin on-call duty next month, so they have no shifts this month on purpose.`);
  } else if (isFreshJoiner && mode === 'IMMEDIATE') {
    tag = 'immediate';
    tagLabel = 'Full pace from week one';
    lines.push(`They are rostered like an established team member right away (${monthHours} hours this month).`);
  } else if (isFreshJoiner && mode === 'STAGGERED') {
    tag = 'newJoinerFair';
    tagLabel = 'New starter — fair share';
    lines.push(
      `They are not treated as having "zero history forever." The scheduler lines them up with a typical team member’s workload so they are not overloaded or left with all the quiet weeks.`
    );
  } else if (cumHours > 0 && cumHours > avgCum * 1.05) {
    tag = 'restingHigh';
    tagLabel = 'Lighter month (high history)';
    lines.push(
      `They have more on-call hours logged ${hoursWindow} than the team average. This month they get a slightly lighter share so the group evens out over time.`
    );
  } else if (cumHours > 0 && cumHours < avgCum * 0.95) {
    tag = 'catchingUpLow';
    tagLabel = 'Heavier month (catching up)';
    lines.push(
      `They have fewer on-call hours logged ${hoursWindow} than the team average. This month they pick up a bit more so everyone converges toward fairness.`
    );
  } else if (cumHours > 0) {
    tag = 'normal';
    tagLabel = 'Typical share';
    lines.push(
      `Their workload ${hoursWindow} is close to the team average, so this month looks like a normal share.`
    );
  } else {
    tag = 'normal';
    tagLabel = 'Typical share';
    lines.push(`Published running totals are still sparse for them, so this month follows the same balancing rules as the rest of the team.`);
  }

  // 2. Weekend reasoning
  if (metric.weekendShifts > 0) {
    if (cumWeekends < avgCumWeekends - 1) {
      lines.push(
        `They have fewer weekend shifts ${weekendWindow} than most of the team, so weekend duty tilted toward them this month.`
      );
    } else {
      lines.push(`Weekend shifts are capped so one person cannot take every Saturday or Sunday.`);
    }
  } else if (metric.weekendShifts === 0 && monthHours > 0) {
    if (cumWeekends > avgCumWeekends + 1) {
      lines.push(
        `No weekend duty this month — they already carry more weekend shifts ${weekendWindow} than average.`
      );
    } else if (unavailable.some(d => {
      const dt = new Date(year, monthIdx, parseInt(d, 10));
      return dt.getDay() === 0 || dt.getDay() === 6;
    })) {
      lines.push(`They asked to be unavailable on weekend dates that fell in this month.`);
    }
  }

  // 3. Public holiday reasoning
  if ((metric.holidayHours ?? 0) > 0) {
    if (cumPH < avgCumPH * 0.7) {
      lines.push(
        `They had fewer ${phOnRecord} than most colleagues, so they were a natural pick for a holiday shift.`
      );
    } else if (preferred.length > 0) {
      lines.push(`They asked to work specific dates, and those requests were approved — including a public holiday where it applied.`);
    } else {
      lines.push(`They are covering ${metric.holidayHours} hours on a public holiday this month.`);
    }
  } else if (cumPH > avgCumPH * 1.2) {
    lines.push(
      windowIsYear
        ? `No public-holiday shift this month — they already have more holiday hours logged this year than average.`
        : `No public-holiday shift this month — they already have more holiday duty on record than average.`
    );
  }

  // 4. Approved requests (plain language)
  if (leaves.length > 0) {
    lines.push(`Approved leave on day${leaves.length > 1 ? 's' : ''} ${leaves.join(', ')} — they are never rostered on those days.`);
  }
  if (unavailable.length > 0) {
    lines.push(`They marked some dates as unavailable. The scheduler avoids those days when it can, unless the whole team is short.`);
  }
  if (preferred.length > 0) {
    lines.push(`They asked to work on day${preferred.length > 1 ? 's' : ''} ${preferred.join(', ')} — those requests were honoured where possible.`);
  }
  if (postCallOff.length > 0) {
    lines.push(`They need specific days fully off and prefer to be on call the day before when possible — the scheduler tries to match that pattern.`);
  }

  return { lines, tag, tagLabel };
}

const DashboardView: React.FC<{ 
  user: User; 
  roster: Roster | null; 
  requests: Request[]; 
  report: any; 
  doctors: User[];
  onGenerate: () => void;
  onPublish: () => void;
  onRegenerate: () => void;
  selectedMonthOffset: 0 | 1;
  onChangeMonth: (offset: 0 | 1) => void;
  loading?: boolean;
  onNavigate?: (view: 'ROSTER' | 'ANALYTICS' | 'REQUESTS') => void;
}> = ({ user, roster, requests, report, doctors, onGenerate, onPublish, onRegenerate, selectedMonthOffset, onChangeMonth, loading, onNavigate }) => {
  const isAdmin = user.role === Role.ADMIN;
  const pendingCount = requests.filter(r => r.status === RequestStatus.PENDING).length;
  
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fullMonthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  
  // Calculate target month/year from offset
  const getTargetMonthYear = (offset: 0 | 1) => {
    const baseMonth = today.getMonth();
    const baseYear = today.getFullYear();
    const month = (baseMonth + offset) % 12;
    const year = baseYear + (baseMonth + offset >= 12 ? 1 : 0);
    return { month, year };
  };
  const targetMY = getTargetMonthYear(selectedMonthOffset);
  const displayMonth = roster ? `${monthNames[roster.month]} ${roster.year}` : `${monthNames[targetMY.month]} ${targetMY.year}`;
  const warnMonth = roster?.month ?? targetMY.month;
  const warnYear = roster?.year ?? targetMY.year;
  const dashboardWarnings = getRosterWarningsForView(report?.warnings, warnMonth, warnYear);
  const todayDisplay = `${fullMonthNames[today.getMonth()].toUpperCase()} ${today.getDate()}`;
  const go = onNavigate ?? (() => {});
  const fh = fairnessHistoryContext(doctors, warnYear);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <h1 className="rs-h2 text-slate-900 tracking-tight">Overview</h1>
          {/* Month Toggle */}
          <div className="flex bg-slate-100 rounded-2xl p-1 gap-0.5">
            <button
              type="button"
              onClick={() => onChangeMonth(0)}
              className={`px-3 sm:px-4 py-2 sm:py-2.5 min-h-10 rounded-xl text-[10px] font-extrabold uppercase tracking-wider transition-all touch-manipulation ${
                selectedMonthOffset === 0
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <span className="sm:hidden">This</span>
              <span className="hidden sm:inline">This Month</span>
            </button>
            <button
              type="button"
              onClick={() => onChangeMonth(1)}
              className={`px-3 sm:px-4 py-2 sm:py-2.5 min-h-10 rounded-xl text-[10px] font-extrabold uppercase tracking-wider transition-all touch-manipulation ${
                selectedMonthOffset === 1
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <span className="sm:hidden">Next</span>
              <span className="hidden sm:inline">Next Month</span>
            </button>
          </div>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={onRegenerate}
              variant="secondary"
              className="px-3 min-h-11 text-[10px] touch-manipulation shrink-0"
              disabled={loading || !roster}
            >
              <History size={14} /> REGENERATE
            </Button>
            <Button onClick={onGenerate} variant="secondary" className="px-3 min-h-11 text-[10px] touch-manipulation shrink-0" disabled={loading}>
              <Plus size={14} /> NEW DRAFT
            </Button>
            {roster && roster.status === 'DRAFT' && (
              <Button onClick={onPublish} variant="success" className="px-3 min-h-11 text-[10px] touch-manipulation shrink-0" disabled={loading}>
                <ShieldCheck size={14} /> PUBLISH
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => go('ROSTER')}
          className="text-left rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-indigo-600"
        >
          <Card className="p-4 bg-indigo-600 text-white shadow-lg shadow-indigo-100/50 h-full cursor-pointer hover:bg-indigo-500/95 transition-colors group">
            <div className="flex items-start justify-between gap-2 text-white">
              <span className="text-[10px] font-black uppercase text-white/60 tracking-widest">Active cycle</span>
              <ChevronRight size={18} className="text-white/50 group-hover:text-white/90 shrink-0" aria-hidden />
            </div>
            <div className="mt-2 min-w-0 text-white">
              <div className="text-2xl font-black font-display truncate text-white">{displayMonth}</div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge
                  color={roster?.status === 'FINAL' ? 'green' : !roster && !isAdmin ? 'slate' : 'yellow'}
                  className="border border-white/25 !bg-white/15 !text-white shadow-none"
                >
                  {!isAdmin && !roster
                    ? 'NOT PUBLISHED'
                    : roster?.status === 'FINAL'
                      ? 'FINAL'
                      : roster?.status || 'EMPTY'}
                </Badge>
              </div>
              <p className="text-[9px] font-bold text-white/80 mt-2">Open full calendar</p>
            </div>
          </Card>
        </button>
        <button
          type="button"
          onClick={() => go('REQUESTS')}
          className="text-left rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
        >
          <Card className="p-4 bg-white border-slate-200 h-full cursor-pointer hover:border-indigo-200 hover:shadow-md transition-all group">
            <div className="flex items-start justify-between gap-2">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Requests</span>
              <ChevronRight size={18} className="text-slate-300 group-hover:text-indigo-500 shrink-0" aria-hidden />
            </div>
            <div className="mt-2">
              <div className="text-2xl font-black font-display text-slate-900">{pendingCount}</div>
              <div className="text-[9px] font-bold text-amber-500 mt-1 uppercase tracking-tighter">
                {isAdmin ? 'Awaiting review' : 'Your requests pending'}
              </div>
              <p className="text-[9px] font-bold text-slate-400 mt-2">
                {isAdmin ? 'Manage team time-off & preferences' : 'Your time-off & preferences'}
              </p>
            </div>
          </Card>
        </button>
      </div>

      {!isAdmin && !roster && !loading && (
        <Card className="p-4 border-indigo-100 bg-indigo-50/80">
          <p className="text-[10px] font-bold text-indigo-900 leading-relaxed">
            <strong>No published roster for {displayMonth} yet.</strong> Draft schedules are only visible to admins until someone publishes. Shifts and team summaries for this month will show up here once it&apos;s final.
          </p>
        </Card>
      )}

      {!isAdmin && (
        <details className="rounded-3xl border border-slate-200 bg-white overflow-hidden group">
          <summary className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer list-none flex items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
            <span className="text-left">How rostering works (team members)</span>
            <ChevronDown size={14} className="text-slate-400 group-open:rotate-180 transition-transform shrink-0" aria-hidden />
          </summary>
          <div className="px-4 pb-4 pt-0 text-[10px] text-slate-600 font-bold leading-relaxed space-y-2 border-t border-slate-50">
            <p>
              <strong className="text-slate-800">Published vs draft:</strong> you only see a month after an admin publishes it. While it&apos;s still a draft, they can change the plan — your requests are still used when they build it.
            </p>
            <p>
              <strong className="text-slate-800">"Full pace from week one":</strong> an admin-only choice under <strong>Staff → First months on the rota</strong> for a named doctor. It tells the scheduler to treat a new colleague like an established teammate right away (no eased onboarding). Most people stay on <strong>standard</strong> pacing unless the department explicitly needs full load from month one.
            </p>
          </div>
        </details>
      )}

      {/* Doctor POV: My next shift + My hours this month */}
      {!isAdmin && roster && (
        <div className="grid grid-cols-2 gap-4">
          {(() => {
            const myShifts = roster.shifts.filter(s => s.doctorId === user.id).sort((a, b) => a.date.localeCompare(b.date));
            const nextShift = myShifts.find(s => s.date >= todayStr);
            const myMetric = report?.metrics?.find((m: any) => m.doctorId === user.id);
            const myHours = myMetric?.totalHours ?? 0;
            return (
              <>
                <button
                  type="button"
                  onClick={() => go('ROSTER')}
                  className="text-left rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                >
                  <Card className="p-4 bg-white border-slate-200 h-full cursor-pointer hover:border-indigo-100 hover:shadow-md transition-all group">
                    <div className="flex items-start justify-between gap-1">
                      <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">My next shift</span>
                      <ChevronRight size={16} className="text-slate-300 group-hover:text-indigo-500 shrink-0" aria-hidden />
                    </div>
                    <div className="mt-2">
                      {nextShift ? (
                        <>
                          <div className="text-lg font-black text-slate-900">
                            {new Date(nextShift.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </div>
                          <div className="text-[9px] font-bold text-slate-500 mt-1 uppercase tracking-tighter">
                            {SHIFT_TEMPLATES.find(t => t.id === nextShift.templateId)?.name}
                            {nextShift.isPublicHoliday ? ' • Public holiday' : ''}
                          </div>
                        </>
                      ) : (
                        <div className="text-sm font-bold text-slate-400">No more shifts this month</div>
                      )}
                    </div>
                  </Card>
                </button>
                <button
                  type="button"
                  onClick={() => go('ROSTER')}
                  className="text-left rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                >
                  <Card className="p-4 bg-white border-slate-200 h-full cursor-pointer hover:border-indigo-100 hover:shadow-md transition-all group">
                    <div className="flex items-start justify-between gap-1">
                      <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">My hours ({displayMonth})</span>
                      <ChevronRight size={16} className="text-slate-300 group-hover:text-indigo-500 shrink-0" aria-hidden />
                    </div>
                    <div className="mt-2">
                      <div className="text-2xl font-black font-display text-slate-900">{myHours} hrs</div>
                      <div className="text-[9px] font-bold text-slate-500 mt-1 uppercase tracking-tighter">
                        {myMetric?.weekendShifts ?? 0} weekend{(myMetric?.weekendShifts ?? 0) !== 1 ? 's' : ''} • {myMetric?.holidayShifts ?? 0} holiday shift{(myMetric?.holidayShifts ?? 0) !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </Card>
                </button>
              </>
            );
          })()}
        </div>
      )}

      {/* Snapshot of year-to-date holiday hours — links to full Transparency view */}
      {doctors.length > 0 && (
        <button
          type="button"
          onClick={() => go('ANALYTICS')}
          className="w-full text-left rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
        >
          <Card className="p-4 bg-slate-50 border-slate-100 cursor-pointer hover:border-indigo-100 hover:shadow-md transition-all group h-full">
            <div className="flex items-start justify-between gap-2">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
                {fh.isCalendarYear && fh.schedulingYear != null
                  ? `Holiday on-call — ${fh.schedulingYear} window (team)`
                  : 'Holiday on-call — full record (team)'}
              </span>
              <ChevronRight size={18} className="text-slate-300 group-hover:text-indigo-500 shrink-0" aria-hidden />
            </div>
            {fh.isCalendarYear && (
              <p className="text-[9px] font-bold text-slate-500 mt-1.5 leading-relaxed">
                Counts published holiday duty in <strong>{fh.schedulingYear}</strong> — same basis as the scheduler. All-time lines live under <strong>Staff</strong>.
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-3">
              {doctors.slice(0, 8).map(d => (
                <span key={d.id} className="text-[11px] font-bold text-slate-600">
                  {d.name?.split(' ').pop() ?? d.id}: <span className="text-slate-900">{(d.cumulativeHolidayHours ?? 0)} hrs</span>
                </span>
              ))}
              {doctors.length > 8 && <span className="text-[10px] text-slate-400 font-bold">+{doctors.length - 8} more</span>}
            </div>
            <p className="text-[9px] font-bold text-slate-400 mt-2">Open Transparency for the full holiday ledger</p>
          </Card>
        </button>
      )}

      {isAdmin && dashboardWarnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-4 animate-in slide-in-from-top-4">
          <AlertCircle className="text-amber-600 shrink-0" size={20} />
          <div>
            <h3 className="text-[10px] font-black text-amber-900 uppercase tracking-widest">Heads-up for this month</h3>
            <ul className="mt-1 space-y-1">
              {dashboardWarnings.map((w: string, i: number) => (
                <li key={i} className="text-[10px] text-amber-700 font-bold leading-relaxed">• {w}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <Card className="overflow-hidden">
        <button
          type="button"
          onClick={() => go('ROSTER')}
          className="w-full p-4 border-b border-slate-100 flex items-center justify-between text-left hover:bg-slate-50/80 transition-colors group"
        >
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-tight">Today&apos;s assignments</h3>
          <span className="flex items-center gap-1 text-[9px] text-slate-400 font-bold">
            {todayDisplay}
            <ChevronRight size={14} className="text-slate-300 group-hover:text-indigo-500" aria-hidden />
          </span>
        </button>
        <div className="divide-y divide-slate-50">
          {roster?.shifts.filter(s => s.date === todayStr).map(s => {
            const doc = doctors.find(d => d.id === s.doctorId);
            const t = SHIFT_TEMPLATES.find(temp => temp.id === s.templateId);
            return (
              <div key={s.id} className="p-4 flex items-center justify-between bg-white">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center font-black text-slate-600 border border-slate-100">
                    {getInitials(doc?.name || doc?.id, '?')}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-900">{doc?.name || 'Unassigned'}</div>
                    <div className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">{t?.name} • Firm {doc?.firm}</div>
                  </div>
                </div>
                <Badge color={s.isPublicHoliday ? 'red' : 'indigo'}>{t?.totalHours} hrs</Badge>
              </div>
            );
          })}
          {(!roster || roster.shifts.filter(s => s.date === todayStr).length === 0) && (
            <div className="p-12 text-center text-slate-300 text-[10px] font-black uppercase tracking-widest">No shifts today</div>
          )}
        </div>
      </Card>
    </div>
  );
};

const RosterView: React.FC<{ 
  roster: Roster | null; 
  report: any;
  currentUser: User; 
  doctors: User[];
  /** Approved-only: full rows for admins; merged public markers + own rows for doctors (no other people’s reasons). */
  calendarApprovedRequests: Request[];
  onUpdateShift: (shiftId: string, doctorId: string) => void;
  selectedMonthOffset: 0 | 1;
  onChangeMonth: (offset: 0 | 1) => void;
  departmentName: string;
  viewingHistoricalRoster?: boolean;
  onExitHistoricalRoster?: () => void;
}> = ({ roster, report, currentUser, doctors, calendarApprovedRequests, onUpdateShift, selectedMonthOffset, onChangeMonth, departmentName, viewingHistoricalRoster, onExitHistoricalRoster }) => {
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('calendar');
  const today = new Date();
  // Calculate month/year from offset if roster is null
  const getTargetMonthYear = (offset: 0 | 1) => {
    const baseMonth = today.getMonth();
    const baseYear = today.getFullYear();
    const month = (baseMonth + offset) % 12;
    const year = baseYear + (baseMonth + offset >= 12 ? 1 : 0);
    return { month, year };
  };
  const targetMonthYear = getTargetMonthYear(selectedMonthOffset);
  const rosterMonth = roster?.month ?? targetMonthYear.month;
  const rosterYear = roster?.year ?? targetMonthYear.year;
  const daysInMonth = new Date(rosterYear, rosterMonth + 1, 0).getDate();
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthAbbr = monthNames[rosterMonth];
  
  const initialDay = (today.getMonth() === rosterMonth && today.getFullYear() === rosterYear) ? today.getDate() : 1;
  const [selectedDay, setSelectedDay] = useState(initialDay);
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [calendarEditingShiftId, setCalendarEditingShiftId] = useState<string | null>(null);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  useEffect(() => {
    setEditingShiftId(null);
    setCalendarEditingShiftId(null);
  }, [selectedMonthOffset, roster?.id, roster?.month, roster?.year, viewMode]);

  const selectedShifts = roster?.shifts.filter(s => new Date(s.date).getDate() === selectedDay) || [];
  const isAdmin = currentUser.role === Role.ADMIN;

  const handlePrint = () => window.print();

  // Calendar View Component
  const CalendarView = () => {
    const fullMonthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
      'July', 'August', 'September', 'October', 'November', 'December'];
    const fh = fairnessHistoryContext(doctors, rosterYear);

    if (!roster) {
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black text-slate-900">
              {fullMonthNames[rosterMonth]} {rosterYear}
            </h2>
          </div>
          <Card className="p-8 sm:p-12 text-center">
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">
              {isAdmin ? 'No roster generated for this month yet' : 'No published roster to show yet'}
            </p>
            {isAdmin && <p className="text-slate-300 text-[10px] font-bold mt-2">Use &quot;NEW DRAFT&quot; or &quot;REGENERATE&quot; to create one</p>}
            {!isAdmin && (
              <p className="text-slate-500 text-[10px] font-bold mt-3 normal-case max-w-sm mx-auto leading-relaxed">
                If your admin is still working on this month, you&apos;ll see it here after they publish. Drafts stay private to admins.
              </p>
            )}
          </Card>
        </div>
      );
    }

    const firstDayOfMonth = new Date(rosterYear, rosterMonth, 1).getDay();
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const weeks: (ScheduledShift | null)[][] = [];
    let currentWeek: (ScheduledShift | null)[] = [];
    for (let i = 0; i < firstDayOfMonth; i++) currentWeek.push(null);
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${rosterYear}-${(rosterMonth + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
      const shift = roster.shifts.find(s => s.date === dateStr) || null;
      currentWeek.push(shift);
      if (currentWeek.length === 7) { weeks.push(currentWeek); currentWeek = []; }
    }
    while (currentWeek.length < 7 && currentWeek.length > 0) currentWeek.push(null);
    if (currentWeek.length > 0) weeks.push(currentWeek);

    const getDoctorName = (doctorId: string) => doctors.find(d => d.id === doctorId)?.name || 'Unassigned';
    const getShiftInfo = (shift: ScheduledShift | null) => {
      if (!shift) return null;
      // Support both 'weekend'/'weekday' (backend) and 'weekend-24h'/'weekday-16h' (frontend)
      const t = SHIFT_TEMPLATES.find(t => t.id === shift.templateId);
      if (t) return t;
      if (shift.templateId?.includes('weekend')) return SHIFT_TEMPLATES.find(t => t.isWeekend) ?? null;
      return SHIFT_TEMPLATES.find(t => !t.isWeekend) ?? null;
    };

    // Build a lookup: dateStr → approved requests for that date (team-wide types/names; reasons only on own rows for doctors)
    const requestsByDate: Record<string, Request[]> = {};
    for (const req of calendarApprovedRequests) {
      if (req.status === RequestStatus.APPROVED) {
        if (!requestsByDate[req.date]) requestsByDate[req.date] = [];
        requestsByDate[req.date].push(req);
      }
    }

    const rosterWarningsForCalendar = getRosterWarningsForView(report?.warnings, rosterMonth, rosterYear);
    const conflictDates = new Set<string>();
    if (report?.warnings) {
      for (const w of report.warnings as string[]) {
        if (!rosterWarningAppliesToMonth(w, rosterMonth, rosterYear)) continue;
        const m = w.match(/Weekend Conflict on (\d{4}-\d{2}-\d{2})/);
        if (m) conflictDates.add(m[1]);
      }
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-slate-900">{fullMonthNames[rosterMonth]} {rosterYear}</h2>
          {roster.status === 'FINAL' && <Badge color="green">FINALIZED</Badge>}
        </div>
        {isAdmin && roster && (
          <p className="text-[9px] font-bold text-slate-500">Tap an assignment to change the doctor.</p>
        )}

        {rosterWarningsForCalendar.length > 0 && (
          <div className="space-y-1">
            {rosterWarningsForCalendar.map((w, i) => (
              <div key={i} className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-[10px] font-bold text-amber-800">
                <AlertCircle size={12} className="shrink-0 mt-0.5 text-amber-500" />
                <span>{w}</span>
              </div>
            ))}
          </div>
        )}

        <Card className="overflow-hidden">
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[300px] border-collapse table-fixed">
              <thead>
                <tr className="bg-slate-50">
                  {dayNames.map(day => (
                    <th key={day} className="p-1 sm:p-2 text-[9px] sm:text-[10px] font-black text-slate-600 uppercase tracking-tight sm:tracking-widest border-b border-slate-200 text-center">{day}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {weeks.map((week, weekIdx) => (
                  <tr key={weekIdx} className="border-b border-slate-100 last:border-b-0">
                    {week.map((shift, dayIdx) => {
                      const day = weekIdx * 7 + dayIdx - firstDayOfMonth + 1;
                      const isToday = new Date().toDateString() === new Date(rosterYear, rosterMonth, day).toDateString();
                      const shiftInfo = getShiftInfo(shift);
                      const isMyShift = shift?.doctorId === currentUser.id;
                      const dateStr = `${rosterYear}-${(rosterMonth + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
                      const dayRequests = day >= 1 && day <= daysInMonth ? (requestsByDate[dateStr] ?? []) : [];
                      const hasLeave = dayRequests.some(r => r.type === RequestType.LEAVE);
                      const hasUnavail = dayRequests.some(r => r.type === RequestType.UNAVAILABLE);
                      const hasPrefWork = dayRequests.some(r => r.type === RequestType.PREFERRED_WORK);
                      const hasPostCallOff = dayRequests.some(r => r.type === RequestType.POST_CALL_OFF);
                      const hasConflict = conflictDates.has(dateStr);
                      const leaveNames = dayRequests.filter(r => r.type === RequestType.LEAVE).map(r => getDoctorName(r.doctorId).split(' ').pop()).join(', ');
                      const unavailNames = dayRequests.filter(r => r.type === RequestType.UNAVAILABLE).map(r => getDoctorName(r.doctorId).split(' ').pop()).join(', ');
                      const prefNames = dayRequests.filter(r => r.type === RequestType.PREFERRED_WORK).map(r => getDoctorName(r.doctorId).split(' ').pop()).join(', ');
                      const postCallNames = dayRequests.filter(r => r.type === RequestType.POST_CALL_OFF).map(r => getDoctorName(r.doctorId).split(' ').pop()).join(', ');

                      return (
                        <td
                          key={dayIdx}
                          className={`p-1 align-top border-r border-slate-100 last:border-r-0 min-w-0 min-h-[3.5rem] ${
                            day < 1 || day > daysInMonth ? 'bg-slate-50' : 'bg-white'
                          } ${isToday ? 'ring-2 ring-inset ring-indigo-500' : ''} ${hasConflict ? 'bg-amber-50' : ''}`}
                        >
                          {day >= 1 && day <= daysInMonth && (
                            <>
                              <div className="flex items-center justify-between mb-1">
                                <span className={`text-xs font-black ${isToday ? 'text-indigo-600' : 'text-slate-400'}`}>{day}</span>
                                {/* Request indicator dots */}
                                <div className="flex gap-0.5">
                                  {hasConflict && <span title="Weekend conflict: multiple doctors requested this day off" className="text-[8px]">⚠️</span>}
                                  {hasPrefWork && <span title={`Preferred work: ${prefNames}`} className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />}
                                  {hasUnavail && <span title={`Unavailable: ${unavailNames}`} className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />}
                                  {hasLeave && <span title={`On leave: ${leaveNames}`} className="w-1.5 h-1.5 rounded-full bg-rose-400 inline-block" />}
                                  {hasPostCallOff && <span title={`Post-call off: ${postCallNames}`} className="w-1.5 h-1.5 rounded-full bg-purple-500 inline-block" />}
                                </div>
                              </div>
                              {shift && shiftInfo && (isAdmin && roster ? (
                                <button
                                  type="button"
                                  onClick={() => setCalendarEditingShiftId(calendarEditingShiftId === shift.id ? null : shift.id)}
                                  className={`w-full rounded-md sm:rounded-lg text-left font-bold transition-all min-h-[2.5rem] min-w-0 overflow-hidden p-1.5 sm:p-2 touch-manipulation active:opacity-90 ${
                                    isMyShift
                                      ? 'bg-indigo-600 text-white'
                                      : shift.isPublicHoliday
                                        ? 'bg-rose-100 text-rose-700 ring-1 ring-rose-200'
                                        : 'bg-slate-100 text-slate-700'
                                  } ${calendarEditingShiftId === shift.id ? 'ring-2 ring-indigo-500 ring-offset-1' : ''}`}
                                  title="Change doctor"
                                  aria-pressed={calendarEditingShiftId === shift.id}
                                >
                                  <div className="text-[9px] sm:text-[10px] font-black leading-tight truncate" title={getDoctorName(shift.doctorId)}>
                                    {getDoctorName(shift.doctorId).split(' ').pop()}
                                  </div>
                                  <div className="text-[8px] sm:text-[9px] opacity-70 mt-0.5 leading-tight truncate">{shiftInfo.totalHours}h{shift.isPublicHoliday ? ' · PH' : ''}</div>
                                </button>
                              ) : (
                                <div
                                  className={`p-1.5 sm:p-2 rounded-md sm:rounded-lg font-bold min-w-0 overflow-hidden ${
                                    isMyShift
                                      ? 'bg-indigo-600 text-white'
                                      : shift.isPublicHoliday
                                        ? 'bg-rose-100 text-rose-700 ring-1 ring-rose-200'
                                        : 'bg-slate-100 text-slate-700'
                                  }`}
                                  title={`${getDoctorName(shift.doctorId)} — ${shiftInfo.name}, ${shiftInfo.totalHours} hrs${shift.isPublicHoliday ? ' (public holiday)' : ''}`}
                                >
                                  <div className="text-[9px] sm:text-[10px] font-black leading-tight truncate" title={getDoctorName(shift.doctorId)}>
                                    {getDoctorName(shift.doctorId).split(' ').pop()}
                                  </div>
                                  <div className="text-[8px] sm:text-[9px] opacity-70 mt-0.5 leading-tight truncate">{shiftInfo.totalHours}h{shift.isPublicHoliday ? ' · PH' : ''}</div>
                                </div>
                              ))}
                              {!shift && day >= 1 && day <= daysInMonth && (
                                <div className="text-[8px] text-slate-300 font-bold italic">No shift</div>
                              )}
                            </>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {isAdmin && roster && calendarEditingShiftId && (
          <Card className="p-4 border-2 border-indigo-200 bg-indigo-50/40">
            {(() => {
              const sh = roster.shifts.find((s) => s.id === calendarEditingShiftId);
              if (!sh) return null;
              const cur = doctors.find((d) => d.id === sh.doctorId);
              return (
                <>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2">
                    Reassign {new Date(sh.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} — {cur?.name ?? 'Unassigned'}
                  </p>
                  <p className="text-[8px] font-bold text-slate-500 mb-3">Choose replacement doctor</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {doctors.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => {
                          onUpdateShift(sh.id, d.id);
                          setCalendarEditingShiftId(null);
                        }}
                        className={`rounded-xl border px-3 py-3.5 min-h-[48px] text-left text-[11px] sm:text-xs font-bold transition-colors touch-manipulation ${
                          d.id === sh.doctorId ? 'border-indigo-500 bg-indigo-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-100'
                        }`}
                      >
                        {d.name}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="mt-3 w-full min-h-11 rounded-xl text-[10px] font-black uppercase text-slate-500 hover:bg-slate-100 touch-manipulation"
                    onClick={() => setCalendarEditingShiftId(null)}
                  >
                    Cancel
                  </button>
                </>
              );
            })()}
          </Card>
        )}

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 text-[9px] font-bold text-slate-500">
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-indigo-600" /><span>Your Shift</span></div>
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-rose-100 ring-1 ring-rose-200" /><span>Public Holiday</span></div>
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded ring-2 ring-indigo-500" /><span>Today</span></div>
          <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /><span>Preferred Work request</span></div>
          <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-amber-400" /><span>Unavailable request</span></div>
          <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-rose-400" /><span>Leave</span></div>
          <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-purple-500" /><span>Post-Call Off</span></div>
          <div className="flex items-center gap-1.5"><span className="text-[10px]">⚠️</span><span>Weekend conflict</span></div>
        </div>

        {/* How this roster was generated — algorithm explainer */}
        {report && report.metrics?.length > 0 && (
          <Card className="mt-4 p-4 bg-indigo-50 border border-indigo-100">
            <div className="flex items-center gap-2 mb-3">
              <Info size={14} className="text-indigo-500" />
              <h4 className="text-[10px] font-black text-indigo-700 uppercase tracking-widest">How this roster was built</h4>
            </div>
            <div className="text-[10px] text-slate-600 font-bold space-y-2 leading-relaxed">
              <p><span className="text-indigo-700">1. Non-negotiables:</span> approved full leave always wins. Rest between shifts and how many nights someone can do in a week follow your department settings.</p>
              <p><span className="text-indigo-700">2. Weekends:</span> no one is allowed to take every weekend in a month — caps keep Saturday and Sunday duty shared.</p>
              <p>
                <span className="text-indigo-700">3. Who goes first:</span> honour approved &quot;prefer to work&quot; days, then balance weekend counts, then spread public-holiday duty fairly, then tilt toward people who have carried{' '}
                {fh.isCalendarYear ? (
                  <>
                    a lighter share <strong>in the current calendar year</strong> (see <strong>Balance</strong>; the full published record is still kept).
                  </>
                ) : (
                  <>less of the load <strong>across all published months</strong>.</>
                )}
              </p>
              <p><span className="text-indigo-700">4. New starters:</span> they are lined up with a normal share of the load unless an admin chooses &quot;start next month&quot; or &quot;full pace from day one.&quot;</p>
              <p>
                <span className="text-indigo-700">5. Evening out the month:</span> if two people are far apart on weeknight hours, the scheduler may swap who covers which weekday — up to the limit you set under <strong>Balance</strong> — without removing someone&apos;s agreed &quot;prefer to work&quot; day. The swap logic compares people against the team average for the{' '}
                {fh.isCalendarYear && fh.schedulingYear != null ? (
                  <strong>{fh.schedulingYear}</strong>
                ) : (
                  <>full published record</>
                )}
                .
              </p>
            </div>
          </Card>
        )}

        {/* Everyone's hours with per-doctor reasoning */}
        {report && report.metrics?.length > 0 && (
          <Card className="mt-4 p-4 bg-slate-50/50">
            <h4 className={`text-[10px] font-black text-slate-500 uppercase tracking-widest ${fh.isCalendarYear ? 'mb-1' : 'mb-3'}`}>
              Everyone&apos;s hours — {fullMonthNames[rosterMonth]} {rosterYear}
            </h4>
            {fh.isCalendarYear && fh.schedulingYear != null && (
              <p className="text-[9px] text-slate-500 font-bold mb-3 leading-relaxed">
                Explanations use the <strong>{fh.schedulingYear}</strong> scheduling window (same as Balance). All-time totals are on <strong>Staff</strong>.
              </p>
            )}
            <div className="space-y-2 text-[10px] font-bold">
              {(report.metrics as any[])
                .sort((a, b) => b.totalHours - a.totalHours)
                .map((m: any) => {
                const doc = doctors.find(d => d.id === m.doctorId);
                if (!doc) return null;
                const isMe = doc.id === currentUser.id;
                const summaryLine = formatHoursSummaryLine(m);
                const reasoning = buildDoctorReasoning(doc, m, doctors, calendarApprovedRequests.filter(r => r.status === RequestStatus.APPROVED), rosterMonth, rosterYear);
                const tagColors: Record<string, string> = {
                  restingHigh:       'bg-slate-200 text-slate-600',
                  catchingUpLow:     'bg-amber-100 text-amber-700',
                  newJoinerFair:     'bg-blue-100 text-blue-700',
                  newJoinerSkipped:  'bg-blue-50 text-blue-600',
                  immediate:         'bg-emerald-100 text-emerald-700',
                  normal:            'bg-slate-100 text-slate-500',
                };
                return (
                  <details key={m.doctorId} className={`rounded-lg border transition-[box-shadow] duration-200 open:shadow-sm ${isMe ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-100'}`}>
                    <summary className="flex items-center justify-between p-2 cursor-pointer list-none gap-2 [&::-webkit-details-marker]:hidden">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <ChevronDown size={10} className="text-slate-400 shrink-0 transition-transform group-open:rotate-180" />
                        <span className={`font-black truncate ${isMe ? 'text-indigo-800' : 'text-slate-700'}`}>{doc.name?.split(' ').pop() ?? 'Team member'}</span>
                        {reasoning.tagLabel && (
                          <span className={`text-[8px] px-1.5 py-0.5 rounded-full whitespace-nowrap ${tagColors[reasoning.tag]}`}>{reasoning.tagLabel}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 text-right">
                        <span className={`text-[9px] font-bold max-w-[140px] leading-tight ${m.totalHours === 0 ? 'text-slate-300' : isMe ? 'text-indigo-800' : 'text-slate-600'}`}>
                          {summaryLine}
                        </span>
                      </div>
                    </summary>
                    {reasoning.lines.length > 0 && (
                      <div className="px-3 pb-3 pt-1 space-y-1 text-[10px] text-slate-600 font-medium border-t border-slate-100">
                        {reasoning.lines.map((line, i) => (
                          <p key={i} className="leading-relaxed">• {line}</p>
                        ))}
                      </div>
                    )}
                  </details>
                );
              })}
            </div>
            <p className="text-[9px] text-slate-400 mt-3 font-bold">
              Tap a name for a short explanation of this month&apos;s share.
            </p>
          </Card>
        )}
      </div>
    );
  };

  return (
    <>
    <div className="space-y-6 no-print">
      {viewingHistoricalRoster && roster && (
        <Card className="p-3.5 border border-indigo-100 bg-indigo-50/40 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] font-bold text-indigo-900">
            Archive: <span className="font-black">{monthAbbr} {roster.year}</span>
            {roster.status === 'FINAL' ? <span className="text-indigo-600"> · published</span> : <span className="text-indigo-600"> · draft</span>}
          </p>
          <Button variant="secondary" className="min-h-11 text-[10px] touch-manipulation shrink-0" type="button" onClick={() => onExitHistoricalRoster?.()}>
            Back to this &amp; next month
          </Button>
        </Card>
      )}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="rs-h2 text-slate-900 tracking-tight">Roster</h1>
          {!viewingHistoricalRoster ? (
            <div className="inline-flex bg-slate-100 rounded-xl p-1 gap-1 text-[10px] font-black">
              <button
                type="button"
                onClick={() => onChangeMonth(0)}
                className={`px-4 py-2.5 min-h-11 rounded-lg transition-all touch-manipulation ${
                  selectedMonthOffset === 0 ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'
                }`}
              >
                This Month
              </button>
              <button
                type="button"
                onClick={() => onChangeMonth(1)}
                className={`px-4 py-2.5 min-h-11 rounded-lg transition-all touch-manipulation ${
                  selectedMonthOffset === 1 ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'
                }`}
              >
                Next Month
              </button>
            </div>
          ) : (
            <p className="text-[10px] font-bold text-slate-500">Use Past rosters to pick another month.</p>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
            <button
              type="button"
              onClick={() => setViewMode('calendar')}
              className={`px-4 py-2.5 min-h-11 rounded-lg text-[10px] font-black transition-all touch-manipulation ${
                viewMode === 'calendar' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'
              }`}
            >
              Calendar
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`px-4 py-2.5 min-h-11 rounded-lg text-[10px] font-black transition-all touch-manipulation ${
                viewMode === 'list' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'
              }`}
            >
              List
            </button>
          </div>
          <Button onClick={handlePrint} variant="secondary" className="px-3 min-h-11 text-[10px] touch-manipulation shrink-0">
            <Printer size={14} /> EXPORT PDF
          </Button>
        </div>
      </div>

      {viewMode === 'calendar' ? (
        <CalendarView />
      ) : (
        <>
          {isAdmin && roster && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl px-3 py-2 text-[9px] font-bold text-indigo-700">
              Pick a day, then <span className="underline">REASSIGN</span> on the card.
            </div>
          )}
          <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-hide snap-x">
            {days.map(d => (
              <button 
                type="button"
                key={d} 
                onClick={() => setSelectedDay(d)}
                className={`flex-shrink-0 min-w-[3rem] w-14 min-h-[3.25rem] rounded-2xl flex flex-col items-center justify-center transition-all snap-center border-2 touch-manipulation active:scale-[0.98] ${
                  selectedDay === d ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' : 'bg-white border-slate-100 text-slate-400'
                }`}
              >
                <span className="text-[8px] font-black uppercase opacity-60">{monthAbbr}</span>
                <span className="text-lg font-black">{d}</span>
              </button>
            ))}
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Assignments: {monthAbbr} {selectedDay}</h3>
              {roster?.status === 'FINAL' && <Badge color="green">FINALIZED</Badge>}
            </div>

            {selectedShifts.map(s => {
              const doc = doctors.find(d => d.id === s.doctorId);
              const t = SHIFT_TEMPLATES.find(tmp => tmp.id === s.templateId);
              const isMe = doc?.id === currentUser.id;
              return (
                <div key={s.id} className="space-y-2">
                  <Card className={isMe ? 'border-2 border-indigo-600 ring-4 ring-indigo-50/50' : ''}>
                    <div className="p-4 flex items-center justify-between gap-2 min-w-0">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-11 h-11 shrink-0 rounded-2xl flex items-center justify-center font-black text-lg ${isMe ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                          {getInitials(doc?.name || doc?.id, '?')}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm sm:text-base font-black text-slate-900 leading-none truncate">{doc?.name || 'Unassigned'}</div>
                          <div className="text-[10px] text-slate-500 font-bold mt-1.5 uppercase tracking-tighter">{t?.startTime} - {t?.endTime}</div>
                        </div>
                      </div>
                      <div className="shrink-0 flex flex-col items-end gap-2">
                        <Badge color={s.isPublicHoliday ? 'red' : 'indigo'}>{t?.name}</Badge>
                        {isAdmin && roster && (
                          <button
                            type="button"
                            onClick={() => setEditingShiftId(editingShiftId === s.id ? null : s.id)}
                            className="min-h-10 px-2 rounded-xl text-[9px] font-black text-indigo-600 uppercase tracking-widest inline-flex items-center justify-center gap-1 ring-1 ring-indigo-200 bg-indigo-50/80 touch-manipulation active:bg-indigo-100"
                          >
                            <Edit2 size={10} aria-hidden /> REASSIGN
                          </button>
                        )}
                      </div>
                    </div>
                  </Card>

                  {editingShiftId === s.id && (
                    <div className="bg-slate-100 rounded-2xl p-4 animate-in slide-in-from-top-2">
                       <p className="text-[8px] font-black text-slate-400 uppercase mb-2">Select replacement</p>
                       <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                         {doctors.map(d => (
                           <button 
                            type="button"
                            key={d.id}
                            onClick={() => {
                              onUpdateShift(s.id, d.id);
                              setEditingShiftId(null);
                            }}
                            className={`min-h-12 px-3 py-3 text-left text-[11px] sm:text-xs font-bold border rounded-xl transition-colors touch-manipulation active:opacity-90 ${d.id === s.doctorId ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                           >
                             {d.name}
                           </button>
                         ))}
                       </div>
                    </div>
                  )}
                </div>
              );
            })}
            {selectedShifts.length === 0 && (
              <div className="p-12 text-center text-slate-300 text-[10px] font-black uppercase tracking-widest">No shifts on this day</div>
            )}
          </div>
        </>
      )}
    </div>
    {roster && (
      <RosterPrintSheet roster={roster} doctors={doctors} requests={calendarApprovedRequests} departmentName={departmentName} report={report} />
    )}
    </>
  );
};

const AnalyticsView: React.FC<{
  report: any;
  doctors: User[];
  roster: Roster | null;
  requests: Request[];
  currentUser: User;
  selectedMonthOffset: 0 | 1;
  onChangeMonth: (offset: 0 | 1) => void;
  onNavigate?: (view: 'REQUESTS' | 'ROSTER') => void;
}> = ({ report, doctors, roster, requests, currentUser, selectedMonthOffset, onChangeMonth, onNavigate }) => {
  const today = new Date();
  const baseMonth = today.getMonth();
  const baseYear = today.getFullYear();
  const monthIdx = (baseMonth + selectedMonthOffset) % 12;
  const yearIdx = baseYear + (baseMonth + selectedMonthOffset >= 12 ? 1 : 0);
  const viewMonth = roster?.month ?? monthIdx;
  const viewYear = roster?.year ?? yearIdx;
  const analyticsWarnings = getRosterWarningsForView(report?.warnings, viewMonth, viewYear);
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  if (!report) return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="rs-h2 text-slate-900 tracking-tight">Transparency</h1>
        <div className="inline-flex bg-slate-100 rounded-xl p-1 gap-1 text-[10px] font-black">
          <button onClick={() => onChangeMonth(0)} className={`px-3 py-1.5 rounded-lg transition-all ${selectedMonthOffset === 0 ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>This Month</button>
          <button onClick={() => onChangeMonth(1)} className={`px-3 py-1.5 rounded-lg transition-all ${selectedMonthOffset === 1 ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>Next Month</button>
        </div>
      </div>
      <div className="py-20 text-center text-slate-400 text-xs font-bold uppercase tracking-widest px-4 max-w-md mx-auto leading-relaxed">
        No transparency data for {monthNames[monthIdx]} {yearIdx} yet.
        <span className="block mt-3 normal-case text-[10px] font-medium text-slate-500">
          {currentUser.role !== Role.ADMIN
            ? 'Ask your admin to publish this month, or pick a month that’s already final.'
            : 'Generate or publish a roster for this month first.'}
        </span>
      </div>
    </div>
  );

  const approvedRequests = requests.filter(r => r.status === RequestStatus.APPROVED);
  const fhT = fairnessHistoryContext(doctors, viewYear);
  const schedYear = fhT.schedulingYear ?? viewYear;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="rs-h2 text-slate-900 tracking-tight">Transparency</h1>
          <p className="text-slate-500 text-xs font-medium mt-1">{monthNames[monthIdx]} {yearIdx} — who worked what, and plain-language notes for each person.</p>
        </div>
        <div className="inline-flex bg-slate-100 rounded-xl p-1 gap-1 text-[10px] font-black">
          <button onClick={() => onChangeMonth(0)} className={`px-3 py-1.5 rounded-lg transition-all ${selectedMonthOffset === 0 ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>This Month</button>
          <button onClick={() => onChangeMonth(1)} className={`px-3 py-1.5 rounded-lg transition-all ${selectedMonthOffset === 1 ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>Next Month</button>
        </div>
      </div>

      {analyticsWarnings.length > 0 && (
        <div className="space-y-1">
          {analyticsWarnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-[10px] font-bold text-amber-800">
              <AlertCircle size={12} className="shrink-0 mt-0.5 text-amber-500" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      <Card className="p-4 bg-indigo-50 border border-indigo-100">
        <div className="flex items-center gap-2 mb-3">
          <Info size={14} className="text-indigo-500" />
          <h4 className="text-[10px] font-black text-indigo-700 uppercase tracking-widest">How the roster is built</h4>
        </div>
        <ol className="text-[10px] text-slate-600 font-bold space-y-1.5 leading-relaxed list-decimal pl-4">
          <li><span className="text-indigo-700">Safety first:</span> full leave is never ignored. Rest gaps and weekly caps follow your department settings.</li>
          <li><span className="text-indigo-700">Weekends:</span> monthly caps stop one person from taking every Saturday or Sunday.</li>
          <li>
            <span className="text-indigo-700">Fair order:</span> honour &quot;prefer to work&quot; days, respect post-call preferences where possible, balance weekend counts, spread public-holiday duty across the year, then tilt toward people who have carried{' '}
            {fhT.isCalendarYear ? (
              <>
                a lighter share in <strong>{schedYear}</strong> (see <strong>Balance</strong> — the full published record is still kept).
              </>
            ) : (
              <>less of the load <strong>across all published months</strong>.</>
            )}
          </li>
          <li><span className="text-indigo-700">New starters:</span> they get a normal share of the month unless an admin chooses a gentler start or a later first month.</li>
          <li>
            <span className="text-indigo-700">Last pass:</span> weekday swaps may nudge hours between people who are high or low versus the team average for the{' '}
            {fhT.isCalendarYear ? (
              <strong>{schedYear}</strong>
            ) : (
              <>full published record</>
            )}
            , without breaking preferred work days or approved unavailability.
          </li>
        </ol>
      </Card>

      <Card>
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Workload Equity — Why each doctor got their shifts</h3>
          <Badge color="indigo">Strive for even share</Badge>
        </div>
        {fhT.isCalendarYear && (
          <p className="px-5 pt-4 text-[10px] text-slate-500 font-bold leading-relaxed">
            Numbers below match the <strong>{schedYear}</strong> scheduling window (same as Balance &quot;this calendar year&quot;). All-time totals stay on the <strong>Staff</strong> screen.
          </p>
        )}
        <div className="p-5 space-y-3">
          {(report.metrics as any[])
            ?.slice()
            .sort((a, b) => b.totalHours - a.totalHours)
            .map((m: any) => {
              const doc = doctors.find(d => d.id === m.doctorId);
              if (!doc) return null;
              const percentage = (m.totalHours / 120) * 100;
              const reasoning = buildDoctorReasoning(doc, m, doctors, approvedRequests, viewMonth, viewYear);
              const isMe = doc.id === currentUser.id;
              const tagColors: Record<string, string> = {
                restingHigh:       'bg-slate-200 text-slate-600 border-slate-300',
                catchingUpLow:     'bg-amber-100 text-amber-700 border-amber-200',
                newJoinerFair:     'bg-blue-100 text-blue-700 border-blue-200',
                newJoinerSkipped:  'bg-blue-50 text-blue-600 border-blue-100',
                immediate:         'bg-emerald-100 text-emerald-700 border-emerald-200',
                normal:            'bg-slate-100 text-slate-500 border-slate-200',
              };
              return (
                <details key={m.doctorId} className={`group rounded-xl border transition-[box-shadow,background-color] duration-200 open:shadow-sm ${isMe ? 'border-indigo-200 bg-indigo-50/30' : 'border-slate-100 bg-white hover:bg-slate-50/50'}`}>
                  <summary className="p-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                    <div className="flex items-center justify-between text-xs font-black gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <ChevronDown size={12} className="text-slate-400 shrink-0 transition-transform group-open:rotate-180" />
                        <span className={`uppercase tracking-tight truncate ${isMe ? 'text-indigo-800' : 'text-slate-700'}`}>{doc.name}</span>
                        {reasoning.tagLabel && (
                          <span className={`text-[8px] px-1.5 py-0.5 rounded-full whitespace-nowrap border font-bold normal-case ${tagColors[reasoning.tag]}`}>{reasoning.tagLabel}</span>
                        )}
                      </div>
                      <span className={`shrink-0 ${m.totalHours > 96 ? 'text-amber-600' : 'text-slate-900'}`}>{m.totalHours} hrs</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden mt-2">
                      <div className={`h-full transition-all duration-700 ${m.totalHours > 96 ? 'bg-amber-500' : 'bg-indigo-600'}`}
                           style={{ width: `${Math.min(100, percentage)}%` }} />
                    </div>
                    <div className="flex flex-col gap-1 text-[9px] font-bold text-slate-500 normal-case tracking-normal mt-2">
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 bg-rose-400 rounded-full" /> Weekends this month: {m.weekendShifts}</span>
                        <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 bg-indigo-400 rounded-full" /> Holiday shifts: {m.holidayShifts ?? 0} ({m.holidayHours ?? 0} hrs)</span>
                        <span className="flex items-center gap-1">
                          <div className="w-1.5 h-1.5 bg-slate-400 rounded-full" />
                          {doc.fairnessHistoryMode === 'CALENDAR_YEAR' ? (
                            <>Published in {schedYear}: {doc.cumulativeTotalHours ?? 0} hrs, {doc.cumulativeWeekendShifts ?? 0} weekend{(doc.cumulativeWeekendShifts ?? 0) !== 1 ? 's' : ''}</>
                          ) : (
                            <>Total published history: {doc.cumulativeTotalHours ?? 0} hrs, {doc.cumulativeWeekendShifts ?? 0} weekend{(doc.cumulativeWeekendShifts ?? 0) !== 1 ? 's' : ''}</>
                          )}
                        </span>
                      </div>
                      {doc.fairnessHistoryMode === 'CALENDAR_YEAR' &&
                        doc.lifetimeTotalHours !== undefined && (
                        <span className="text-slate-400 font-semibold pl-2.5 border-l-2 border-slate-200">
                          All-time record: {doc.lifetimeTotalHours} hrs · {doc.lifetimeWeekendShifts ?? 0} w/e
                        </span>
                      )}
                    </div>
                  </summary>
                  {reasoning.lines.length > 0 && (
                    <div className="px-3 pb-3 pt-1 space-y-1.5 text-[10px] text-slate-600 font-medium border-t border-slate-100">
                      {reasoning.lines.map((line, i) => (
                        <p key={i} className="leading-relaxed flex gap-2">
                          <span className="text-indigo-400 shrink-0">▸</span>
                          <span>{line}</span>
                        </p>
                      ))}
                    </div>
                  )}
                </details>
              );
            })}
        </div>
      </Card>

      <Card>
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
          <h3 className="text-[10px] font-black uppercase tracking-widest">Holiday duty ledger</h3>
          <span
            className="opacity-40 inline-flex"
            title={
              fhT.isCalendarYear
                ? `Who has the fewest public-holiday on-call hours published in ${schedYear} — they are usually next in line when a holiday shift must be filled.`
                : 'Who has the lightest public-holiday record overall — they are usually next in line when a holiday shift must be filled.'
            }
          >
            <Info size={14} />
          </span>
        </div>
        <p className="px-4 py-2 text-[10px] text-slate-500 font-bold bg-slate-50 border-b border-slate-100">
          {fhT.isCalendarYear ? (
            <>
              <strong>Scheduling window:</strong> the &quot;Published&quot; column counts holiday on-call from final rosters in{' '}
              <strong>{schedYear}</strong> — matching what the scheduler uses. All-time totals still appear on <strong>Staff</strong>.
            </>
          ) : (
            <>
              Public-holiday on-call hours add up from every <strong>published</strong> month for the full record. When several people could cover a holiday, the scheduler leans toward those with fewer holiday hours recorded so far.
            </>
          )}
        </p>
        <div className="overflow-x-auto">
        <table className="w-full text-left min-w-[280px]">
          <thead className="text-[9px] font-black text-slate-400 uppercase bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="px-2 sm:px-5 py-3 whitespace-nowrap">Doctor</th>
              <th className="px-2 sm:px-5 py-3 whitespace-nowrap">This month</th>
              <th className="hidden sm:table-cell px-2 sm:px-5 py-3">
                {fhT.isCalendarYear ? `Published in ${schedYear} (hrs)` : 'Published history (hrs)'}
              </th>
              <th className="px-2 sm:px-5 py-3 text-right whitespace-nowrap">Standing</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {[...doctors]
              .sort((a, b) => (a.cumulativeHolidayHours ?? 0) - (b.cumulativeHolidayHours ?? 0))
              .map(doc => {
                const metric = report.metrics?.find((m: any) => m.doctorId === doc.id);
                const monthPHHours = metric?.holidayHours ?? (metric ? (metric.holidayShifts * 24) : 0);
                const n = metric?.holidayShifts ?? 0;
                const shiftWord = n === 1 ? 'shift' : 'shifts';
                return (
                  <tr key={doc.id} className="text-[10px] sm:text-[11px] font-bold text-slate-700">
                    <td className="px-2 sm:px-5 py-3 sm:py-4 max-w-[100px] sm:max-w-[120px] break-words">{doc.name}</td>
                    <td className="px-2 sm:px-5 py-3 sm:py-4 font-black whitespace-nowrap">{n} {shiftWord}<span className="hidden sm:inline"> ({monthPHHours} hrs)</span></td>
                    <td className="hidden sm:table-cell px-2 sm:px-5 py-3 sm:py-4 font-black whitespace-nowrap">{(doc.cumulativeHolidayHours ?? 0)} hrs</td>
                    <td className="px-2 sm:px-5 py-3 sm:py-4 text-right align-middle whitespace-nowrap">
                      {(doc.cumulativeHolidayHours ?? 0) === 0 ? (
                        <Badge
                          color="green"
                          noWrap
                          title="Fewest public-holiday hours on record — usually next in line when PH cover is needed"
                        >
                          Due next
                        </Badge>
                      ) : (
                        <Badge
                          color="slate"
                          noWrap
                          title="Holiday hours on record — in normal rotation with the team"
                        >
                          Queued
                        </Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
        </div>
        <p className="px-4 py-2.5 text-[9px] font-bold text-slate-500 bg-slate-50 border-t border-slate-100 leading-relaxed">
          <span className="font-black uppercase tracking-wider text-slate-400">Standing — </span>
          <strong className="text-slate-700">Due next</strong>: lightest PH history on this column, usually chosen next when a holiday shift needs cover.{' '}
          <strong className="text-slate-700">Queued</strong>: in normal rotation with the team. Tags also have a short tooltip.
        </p>
      </Card>

      <button
        type="button"
        onClick={() => onNavigate?.('REQUESTS')}
        className="w-full text-left rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2"
      >
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 text-[10px] font-bold text-amber-800 hover:border-amber-200 transition-colors group">
          <span className="font-black uppercase tracking-widest">Requests</span>
          <span className="block mt-1 leading-relaxed">
            First in, first considered. When two people need the same day off, the earlier request is treated as the tie-breaker; an admin still approves or declines to finish the roster.
          </span>
          <span className="inline-flex items-center gap-1 mt-2 text-indigo-600 font-black text-[9px] uppercase tracking-wider">
            Open requests <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" aria-hidden />
          </span>
        </div>
      </button>
    </div>
  );
};

const TuningView: React.FC<{
  report: any;
  doctors: User[];
  roster: Roster | null;
  /** When false, department rules are shown read-only (doctors can still see sliders and explanations). */
  isAdmin: boolean;
  onFairnessSettingsSaved?: () => void | Promise<void>;
}> = ({ report, doctors, roster, isAdmin, onFairnessSettingsSaved }) => {
  const [hourLimit, setHourLimit] = useState<number>(24);
  const [weekendLimit, setWeekendLimit] = useState<number>(1);
  const [maxShiftsPer7Days, setMaxShiftsPer7Days] = useState<number>(2);
  const [minRestDays, setMinRestDays] = useState<number>(1);
  const [fairnessHistoryMode, setFairnessHistoryMode] = useState<'ALL_TIME' | 'CALENDAR_YEAR'>('ALL_TIME');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        setLoading(true);
        const settings = await api.getFairnessSettings();
        setHourLimit(settings.hourLimit);
        setWeekendLimit(settings.weekendLimit);
        setMaxShiftsPer7Days(settings.maxShiftsPer7Days ?? 2);
        setMinRestDays(settings.minRestDays ?? 1);
        setFairnessHistoryMode(settings.fairnessHistoryMode ?? 'ALL_TIME');
      } catch (error) {
        console.warn('Could not load fairness settings, using defaults');
      } finally {
        setLoading(false);
      }
    };
    loadSettings();
  }, []);

  const handleSave = async () => {
    if (!isAdmin) return;
    try {
      setSaving(true);
      setSaveMessage(null);
      await api.updateFairnessSettings({
        hourLimit,
        weekendLimit,
        maxShiftsPer7Days,
        minRestDays,
        fairnessHistoryMode,
      });
      setSaveMessage('Saved. The next roster you generate will use these rules.');
      setTimeout(() => setSaveMessage(null), 4000);
      await onFairnessSettingsSaved?.();
    } catch (error: any) {
      setSaveMessage(`Could not save: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (!report || !report.metrics) {
    return (
      <div className="py-20 text-center text-slate-400 text-xs font-bold uppercase tracking-widest px-4">
        Open or generate a month first — balance settings need a roster to compare against.
      </div>
    );
  }

  const metrics: FairnessMetric[] = report.metrics;
  const hours = metrics.map(m => m.totalHours);
  const weekends = metrics.map(m => m.weekendShifts);
  const hourDiff = hours.length ? Math.max(...hours) - Math.min(...hours) : 0;
  const weekendDiff = weekends.length ? Math.max(...weekends) - Math.min(...weekends) : 0;
  const minH = hours.length ? Math.min(...hours) : 0;
  const maxH = hours.length ? Math.max(...hours) : 0;
  const minW = weekends.length ? Math.min(...weekends) : 0;
  const maxW = weekends.length ? Math.max(...weekends) : 0;

  const shortName = (doc?: User) => doc?.name?.split(' ').pop() ?? 'Team member';
  const namesAtHour = (h: number) =>
    metrics.filter(m => m.totalHours === h).map(m => shortName(doctors.find(d => d.id === m.doctorId))).join(', ');
  const namesAtWeekend = (w: number) =>
    metrics.filter(m => m.weekendShifts === w).map(m => shortName(doctors.find(d => d.id === m.doctorId))).join(', ');

  const monthLabels = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const rosterPeriodLabel = roster ? `${monthLabels[roster.month]} ${roster.year}` : 'the roster month on screen';
  const fhActive = fairnessHistoryContext(doctors, roster?.year);
  const calendarYearExample = fhActive.schedulingYear ?? roster?.year ?? new Date().getFullYear();

  const hourOk = hourDiff <= hourLimit;
  const weekendOk = weekendDiff <= weekendLimit;

  return (
    <div className="space-y-6">
      {!isAdmin && (
        <Card className="p-4 border border-indigo-100 bg-indigo-50/90">
          <p className="text-[11px] font-bold text-indigo-900 leading-relaxed">
            <strong>View only.</strong> Balance rules are set by a department admin. If something looks off, ask them to adjust limits or regenerate the draft — you still see the same numbers and guidance they use.
          </p>
        </Card>
      )}
      <div>
        <h1 className="rs-h2 text-slate-900 tracking-tight">Balance settings</h1>
        <p className="text-slate-500 text-xs font-medium mt-1 leading-relaxed">
          These controls change <strong>how strict</strong> the schedule is and <strong>when you get a heads-up</strong>. They apply the next time someone runs <strong>New draft</strong> or <strong>Regenerate</strong>.
          The live numbers under each slider describe <strong>{rosterPeriodLabel}</strong> only — one calendar month, not the published workload the scheduler uses when deciding who is ahead or behind.
          {fhActive.isCalendarYear && fhActive.schedulingYear != null ? (
            <> For this department that workload is currently scoped to <strong>{fhActive.schedulingYear}</strong> (see <strong>Past nights</strong> below).</>
          ) : (
            <> By default that workload is the <strong>full published record</strong>; you can switch to "this calendar year only" under <strong>Past nights</strong>.</>
          )}
          {' '}To set how a <strong>new colleague</strong> enters the rota (first month vs full pace), use <strong>Staff</strong> — that choice is per person, not here.
        </p>
      </div>

      <Card className="p-5 border-indigo-100 bg-white shadow-sm">
        <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Past nights — what counts when building the next draft?</h3>
        <p className="text-[11px] text-slate-600 leading-relaxed">
          <strong>Publishing</strong> always adds that month to each person&apos;s <strong>permanent record</strong> (nothing is deleted). This choice only changes how much of that record the scheduler <strong>looks at</strong> when deciding who is &quot;due&quot; or &quot;owed&quot; a lighter month.
        </p>
        <div className="mt-4 grid gap-3">
          <button
            type="button"
            disabled={!isAdmin}
            onClick={() => setFairnessHistoryMode('ALL_TIME')}
            className={`text-left p-4 rounded-xl border-2 transition-all ${
              fairnessHistoryMode === 'ALL_TIME'
                ? 'border-indigo-500 bg-indigo-50/80 shadow-sm'
                : 'border-slate-100 bg-slate-50/50 hover:border-slate-200'
            } ${!isAdmin ? 'opacity-80 cursor-not-allowed' : ''}`}
          >
            <div className="text-[11px] font-black text-slate-900">Full history (recommended for steady teams)</div>
            <p className="text-[10px] text-slate-600 mt-1.5 leading-relaxed">
              Every published month, across all years, influences the next draft. Someone who carried more in the past is more likely to get a lighter stretch now — true long-run fairness.
            </p>
          </button>
          <button
            type="button"
            disabled={!isAdmin}
            onClick={() => setFairnessHistoryMode('CALENDAR_YEAR')}
            className={`text-left p-4 rounded-xl border-2 transition-all ${
              fairnessHistoryMode === 'CALENDAR_YEAR'
                ? 'border-indigo-500 bg-indigo-50/80 shadow-sm'
                : 'border-slate-100 bg-slate-50/50 hover:border-slate-200'
            } ${!isAdmin ? 'opacity-80 cursor-not-allowed' : ''}`}
          >
            <div className="text-[11px] font-black text-slate-900">This calendar year only (fresh start each January)</div>
            <p className="text-[10px] text-slate-600 mt-1.5 leading-relaxed">
              For rosters in <strong>{calendarYearExample}</strong>, only published months in <strong>{calendarYearExample}</strong> count toward who is ahead or behind. Last year&apos;s work stays on the record for viewing, but it won&apos;t tilt who gets the next night. In January, everyone starts even for scheduling until you publish the first month.
            </p>
          </button>
        </div>
        <p className="text-[9px] text-slate-400 font-bold mt-3">
          Tip: switch modes anytime — save below, then regenerate. Staff and Transparency show both the scheduling window and all-time totals when &quot;this year only&quot; is on.
        </p>
      </Card>

      <Card className="p-5 bg-slate-50 border-slate-100">
        <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Permanent record (after publish)</h3>
        <ul className="space-y-2 text-[11px] text-slate-600 leading-relaxed">
          <li>Each <strong>publish</strong> still adds hours, weekends, and holiday on-call to the numbers stored on each profile — that is the <strong>all-time</strong> audit trail.</li>
          <li><strong>Rebuild from published rosters</strong> recalculates those stored totals from every final roster in the system. Use it if something looks wrong after an import or an old bug. It does not remove shifts; it only fixes the stored sums.</li>
        </ul>
        <div className="mt-4">
          <Button
            variant="secondary"
            className="text-[10px]"
            disabled={!isAdmin}
            onClick={async () => {
              if (!isAdmin) return;
              try {
                const r = await api.syncCumulative();
                setSaveMessage(r.message || 'Permanent totals recalculated.');
                setTimeout(() => setSaveMessage(null), 4000);
              } catch (e: any) {
                setSaveMessage(e.message || 'Could not rebuild totals.');
              }
            }}
          >
            Rebuild stored totals from all published rosters
          </Button>
        </div>
      </Card>

      <Card className="p-5 bg-indigo-50/50 border-indigo-100">
        <h3 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-3">What you will notice</h3>
        <ul className="space-y-2 text-[11px] text-slate-600 leading-relaxed list-disc pl-4">
          <li><strong>Gentler or stricter balance:</strong> tighter numbers mean you see amber banners sooner if one person has many more nights than someone else in the same month.</li>
          <li><strong>Weekend spread:</strong> controls how many extra Saturday or Sunday blocks one person can have compared with the quietest colleague before you are nudged to review.</li>
          <li><strong>Rest between nights:</strong> larger gaps mean people get more breathing room; the smallest setting is only for teams that are very short-staffed.</li>
          <li><strong>Busy weeks:</strong> caps how many on-call nights someone can carry in any rolling week so nobody stacks too many shifts together.</li>
          <li><strong>Approved full leave</strong> is never overwritten. If the whole team is off, a day may still need a manual decision.</li>
        </ul>
      </Card>

      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Department rules</h3>
          <Button onClick={handleSave} variant="primary" className="px-3 h-8 text-[10px]" disabled={saving || loading || !isAdmin}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
        {saveMessage && (
          <div className={`p-2 rounded-lg text-[10px] font-bold ${saveMessage.includes('Could not') || saveMessage.includes('Failed') ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
            {saveMessage}
          </div>
        )}
        {loading && (
          <div className="text-center py-4 text-slate-400 text-xs font-bold">Loading your department&apos;s saved rules…</div>
        )}
        {!loading && (
          <div className="space-y-5">
            <div className="p-4 bg-slate-50 rounded-xl">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 gap-2">
                <span>Monthly hours spread (same calendar month)</span>
                <span className="text-indigo-600 shrink-0">Allow up to {hourLimit} hrs gap</span>
              </div>
              <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">
                We compare the <strong>busiest</strong> and <strong>lightest</strong> on-call totals for <strong>{rosterPeriodLabel}</strong> only. The slider is how many hours apart those two people can be before you get a review banner. The scheduler also tries to narrow big gaps on weeknights after the first pass, up to this same ceiling.
              </p>
              <p className="text-[10px] font-bold text-slate-600 mt-2">
                Right now: lightest {minH} hrs ({namesAtHour(minH)}) · busiest {maxH} hrs ({namesAtHour(maxH)}) · <span className={hourOk ? 'text-emerald-600' : 'text-amber-600'}>gap {hourDiff} hrs {hourOk ? '(within your setting)' : '(above your setting)'}</span>
              </p>
              <input
                type="range"
                min={0}
                max={64}
                step={8}
                value={hourLimit}
                disabled={!isAdmin}
                onChange={e => setHourLimit(Number(e.target.value))}
                className="w-full mt-2 disabled:opacity-50"
              />
              <div className="mt-3 p-3 bg-white rounded-lg border border-slate-100 text-[10px] text-slate-500 leading-relaxed space-y-1.5">
                <p><span className="font-bold text-slate-700">Tighter (smaller number):</span> you want everyone&apos;s monthly hours almost the same — expect more reminders when leave or holidays skew the month.</p>
                <p><span className="font-bold text-slate-700">Looser (larger number):</span> you accept a wider spread when the team is uneven or many people are away.</p>
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 gap-2">
                <span>Weekend nights spread (same calendar month)</span>
                <span className="text-indigo-600 shrink-0">Allow +{weekendLimit} extra weekend(s)</span>
              </div>
              <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">
                Counts only Saturday or Sunday on-call blocks in <strong>{rosterPeriodLabel}</strong>. The slider is how many <em>extra</em> weekend shifts one person may have compared with whoever has the fewest before a review banner appears.
              </p>
              <p className="text-[10px] font-bold text-slate-600 mt-2">
                Right now: fewest {minW} ({namesAtWeekend(minW)}) · most {maxW} ({namesAtWeekend(maxW)}) · <span className={weekendOk ? 'text-emerald-600' : 'text-amber-600'}>gap {weekendDiff} {weekendOk ? '(within your setting)' : '(above your setting)'}</span>
              </p>
              <input
                type="range"
                min={0}
                max={3}
                step={1}
                value={weekendLimit}
                disabled={!isAdmin}
                onChange={e => setWeekendLimit(Number(e.target.value))}
                className="w-full mt-2 disabled:opacity-50"
              />
              <div className="mt-3 p-3 bg-white rounded-lg border border-slate-100 text-[10px] text-slate-500 leading-relaxed space-y-1.5">
                <p><span className="font-bold text-slate-700">0–1:</span> weekend duty should look almost even.</p>
                <p><span className="font-bold text-slate-700">2–3:</span> allows a heavier weekend month for a few people when leave makes perfect balance impossible.</p>
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl">
              <label className="block text-[11px] font-bold text-slate-700" htmlFor="rest-between">
                Minimum clear days between on-call nights
              </label>
              <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                <strong>When it matters:</strong> every time a new shift is placed. Larger values give more recovery time; <strong>0</strong> allows back-to-back nights and should only be used when you are critically short.
              </p>
              <select
                id="rest-between"
                value={minRestDays}
                disabled={!isAdmin}
                onChange={e => setMinRestDays(Number(e.target.value))}
                className="mt-2 w-full text-[11px] font-bold text-slate-800 bg-white border border-slate-200 rounded-lg px-3 py-2 disabled:opacity-50"
              >
                <option value={0}>0 — back-to-back nights allowed (emergency staffing only)</option>
                <option value={1}>1 — at least one clear day between nights (recommended)</option>
                <option value={2}>2 — two clear days between nights</option>
                <option value={3}>3 — three clear days (gentler pace)</option>
              </select>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl">
              <label className="block text-[11px] font-bold text-slate-700" htmlFor="shifts-per-week">
                Most on-call nights in any seven-day stretch
              </label>
              <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                <strong>When it matters:</strong> while the month is being built, using a rolling week window so nobody stacks too many nights in a row.
              </p>
              <select
                id="shifts-per-week"
                value={maxShiftsPer7Days}
                disabled={!isAdmin}
                onChange={e => setMaxShiftsPer7Days(Number(e.target.value))}
                className="mt-2 w-full text-[11px] font-bold text-slate-800 bg-white border border-slate-200 rounded-lg px-3 py-2 disabled:opacity-50"
              >
                <option value={1}>1 — at most one night per rolling week (strict)</option>
                <option value={2}>2 — up to two nights in a busy week (usual default)</option>
                <option value={3}>3 — up to three when the service is under pressure</option>
              </select>
            </div>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Situations you might see</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[10px] leading-relaxed text-slate-600">
          <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-100">
            <span className="font-bold text-emerald-800 block mb-1">New colleagues</span>
            They are given a normal share of the month instead of being buried or left out purely because their published workload in the{' '}
            {fhActive.isCalendarYear && fhActive.schedulingYear != null ? (
              <strong>{fhActive.schedulingYear}</strong>
            ) : (
              <>full record</>
            )}{' '}
            still looks thin.
          </div>
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
            <span className="font-bold text-blue-800 block mb-1">Long leave</span>
            People coming back are not automatically handed an unfair overload the first month.
          </div>
          <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
            <span className="font-bold text-amber-900 block mb-1">Many "prefer not" days</span>
            If several people mark the same dates, the schedule may still need someone — you may see a heads-up to decide manually.
          </div>
          <div className="p-3 bg-purple-50 rounded-lg border border-purple-100">
            <span className="font-bold text-purple-900 block mb-1">Small or odd-sized teams</span>
            Perfect symmetry is not always possible; looser balance settings reduce noise while you still cover the service.
          </div>
        </div>
      </Card>

      <Card>
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">This month by person</h3>
          <p className="text-[9px] text-slate-500 font-bold mt-1">
            Snapshot for {rosterPeriodLabel} — badges describe workload shape, not clinical roles.
            {fhActive.isCalendarYear && fhActive.schedulingYear != null ? (
              <> "High / low history" lines compare <strong>{fhActive.schedulingYear}</strong> published totals; all-time stays on <strong>Staff</strong>.</>
            ) : (
              <> "High / low history" uses the <strong>full published record</strong>.</>
            )}
          </p>
        </div>
        <div className="divide-y divide-slate-50">
          {(() => {
            const veteranCumList = doctors.map(d => d.cumulativeTotalHours ?? 0).filter(v => v > 0);
            const avgCum = veteranCumList.length > 0 ? veteranCumList.reduce((a, b) => a + b, 0) / veteranCumList.length : 0;
            return metrics.map(m => {
              const doc = doctors.find(d => d.id === m.doctorId);
              const cumHours = doc?.cumulativeTotalHours ?? 0;
              const cumWeekends = doc?.cumulativeWeekendShifts ?? 0;
              const mode = doc?.workloadStartMode ?? 'STAGGERED';

              const isCumZero = cumHours === 0;
              const isImmediate = mode === 'IMMEDIATE';
              const isNewJoinerSkipped = isCumZero && mode === 'NEXT_MONTH';
              const isNewJoinerFair = isCumZero && mode === 'STAGGERED';
              const isRestingHigh = !isCumZero && avgCum > 0 && cumHours > avgCum * 1.05;
              const isCatchingUp = !isCumZero && avgCum > 0 && cumHours < avgCum * 0.95;

              return (
                <div key={m.doctorId} className="p-4 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-slate-900">{doc?.name ?? 'Team member'}</span>
                        {isRestingHigh && (
                          <span
                            title={
                              fhActive.isCalendarYear && fhActive.schedulingYear != null
                                ? `More on-call hours logged in ${fhActive.schedulingYear} than average — this month is intentionally a bit lighter.`
                                : 'More on-call hours in the full published record than average — this month is intentionally a bit lighter.'
                            }
                            className="text-[8px] bg-slate-100 text-slate-500 border border-slate-200 px-1.5 py-0.5 rounded-full">
                            Lighter month (high history)
                          </span>
                        )}
                        {isCatchingUp && (
                          <span
                            title={
                              fhActive.isCalendarYear && fhActive.schedulingYear != null
                                ? `Fewer on-call hours logged in ${fhActive.schedulingYear} than average — this month picks up a bit more.`
                                : 'Fewer on-call hours in the full published record than average — this month picks up a bit more.'
                            }
                            className="text-[8px] bg-amber-50 text-amber-700 border border-amber-100 px-1.5 py-0.5 rounded-full">
                            Heavier month (catching up)
                          </span>
                        )}
                        {isNewJoinerFair && (
                          <span title="New starter: scheduled like a typical team member so they are not stuck with all the quiet or all the busy weeks."
                            className="text-[8px] bg-blue-100 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded-full">
                            New starter — fair share
                          </span>
                        )}
                        {isNewJoinerSkipped && (
                          <span title="Begins on-call duty next month by admin choice."
                            className="text-[8px] bg-blue-50 text-blue-600 border border-blue-100 px-1.5 py-0.5 rounded-full">
                            Starts rostering next month
                          </span>
                        )}
                        {isImmediate && m.totalHours > 0 && (
                          <span title="Rostered at full team pace from the first week."
                            className="text-[8px] bg-emerald-50 text-emerald-600 border border-emerald-100 px-1.5 py-0.5 rounded-full">
                            Full pace from week one
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 font-bold mt-1 flex gap-3 flex-wrap">
                        <span>{m.weekdayShifts} weekday</span>
                        <span>{m.weekendShifts} weekend</span>
                        {(m.holidayHours ?? 0) > 0 && <span className="text-rose-600">{(m.holidayHours ?? 0)} hrs holiday</span>}
                        {cumHours > 0 && (
                          <span className="text-slate-400">
                            {fhActive.isCalendarYear && fhActive.schedulingYear != null ? (
                              <>
                                in {fhActive.schedulingYear}: {cumHours} hrs, {cumWeekends} weekend{cumWeekends !== 1 ? 's' : ''}
                                {doc?.lifetimeTotalHours !== undefined && (
                                  <span className="text-slate-400">
                                    {' '}
                                    · all-time {doc.lifetimeTotalHours} hrs
                                  </span>
                                )}
                              </>
                            ) : (
                              <>published record: {cumHours} hrs, {cumWeekends} weekend{cumWeekends !== 1 ? 's' : ''}</>
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`text-sm font-black ${m.totalHours === 0 ? 'text-slate-300' : 'text-slate-900'}`}>{m.totalHours} hrs this month</div>
                      {(m.holidayHours ?? 0) > 0 && (
                        <div className="text-[10px] font-bold text-rose-600">{(m.holidayHours ?? 0)} hrs holiday</div>
                      )}
                    </div>
                  </div>
                </div>
              );
            });
          })()}
        </div>
        <div className="p-3 bg-slate-50 text-[9px] text-slate-400 font-bold border-t border-slate-100 space-y-1">
          <div>
            <span className="text-slate-600">Lighter month (high history)</span>{' '}
            {fhActive.isCalendarYear && fhActive.schedulingYear != null ? (
              <>means their <strong>{fhActive.schedulingYear}</strong> published total is above average, so the scheduler eases off.</>
            ) : (
              <>means their running total in the full published record is above average, so the scheduler eases off.</>
            )}{' '}
            <span className="text-amber-700">Heavier month (catching up)</span> is the opposite.
          </div>
          <div><span className="text-blue-700">New starter — fair share</span> lines them up with a normal month. <span className="text-emerald-700">Full pace from week one</span> is when an admin wants them treated like a long-time colleague immediately.</div>
        </div>
      </Card>
    </div>
  );
};

/** Human-readable request type (never raw enum like POST_CALL_OFF). */
function requestTypeLabel(type: string): string {
  switch (type) {
    case RequestType.LEAVE:
      return 'Full leave';
    case RequestType.UNAVAILABLE:
      return 'Prefer not on call';
    case RequestType.PREFERRED_WORK:
      return 'Prefer to work';
    case RequestType.POST_CALL_OFF:
      return 'Post-call day off';
    case RequestType.SWAP:
      return 'Swap request';
    default:
      return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

function requestStatusLabel(status: string): string {
  switch (status) {
    case RequestStatus.PENDING:
      return 'Pending';
    case RequestStatus.APPROVED:
      return 'Approved';
    case RequestStatus.REJECTED:
      return 'Rejected';
    default:
      return status.replace(/_/g, ' ');
  }
}

function statusRank(status: RequestStatus): number {
  if (status === RequestStatus.PENDING) return 0;
  if (status === RequestStatus.REJECTED) return 1;
  return 2;
}

type RequestTimeFilter = 'this_month' | 'next_month' | 'rolling_90' | 'all';

function requestMatchesTimeFilter(req: Request, filter: RequestTimeFilter): boolean {
  if (filter === 'all') return true;
  const [y, m, day] = req.date.split('-').map((n) => parseInt(n, 10));
  if (!y || !m || !day) return true;
  const forDate = new Date(y, m - 1, day);
  const now = new Date();
  const startThis = new Date(now.getFullYear(), now.getMonth(), 1);
  const endThis = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const startNext = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const endNext = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59, 999);
  if (filter === 'this_month') return forDate >= startThis && forDate <= endThis;
  if (filter === 'next_month') return forDate >= startNext && forDate <= endNext;
  if (filter === 'rolling_90') {
    const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const min = new Date(t0);
    min.setDate(min.getDate() - 90);
    const max = new Date(t0);
    max.setDate(max.getDate() + 90);
    return forDate >= min && forDate <= max;
  }
  return true;
}

const RequestsView: React.FC<{ 
  user: User; 
  requests: Request[]; 
  onAdd: (r: Request) => void; 
  onStatusChange: (id: string, s: RequestStatus) => void;
  doctors: User[];
}> = ({ user, requests, onAdd, onStatusChange, doctors }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState({ date: new Date().toISOString().split('T')[0], type: RequestType.UNAVAILABLE, reason: '', forDoctorId: '' });
  const [timeFilter, setTimeFilter] = useState<RequestTimeFilter>('this_month');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'resolved'>('all');
  const isAdmin = user.role === Role.ADMIN;

  const filteredSorted = useMemo(() => {
    const filtered = requests.filter((r) => {
      if (!requestMatchesTimeFilter(r, timeFilter)) return false;
      if (statusFilter === 'pending' && r.status !== RequestStatus.PENDING) return false;
      if (statusFilter === 'resolved' && r.status === RequestStatus.PENDING) return false;
      return true;
    });
    return filtered.sort((a, b) => {
      const ra = statusRank(a.status);
      const rb = statusRank(b.status);
      if (ra !== rb) return ra - rb;
      return b.createdAt - a.createdAt;
    });
  }, [requests, timeFilter, statusFilter]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const targetDoctorId = isAdmin && formData.forDoctorId ? formData.forDoctorId : user.id;
    onAdd({
      id: Math.random().toString(36).substr(2, 9),
      doctorId: targetDoctorId,
      type: formData.type,
      date: formData.date,
      status: RequestStatus.PENDING,
      reason: formData.reason,
      createdAt: Date.now()
    });
    setIsAdding(false);
    setFormData({ date: new Date().toISOString().split('T')[0], type: RequestType.UNAVAILABLE, reason: '', forDoctorId: '' });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="rs-h2 text-slate-900 tracking-tight">Requests</h1>
          <p className="text-[10px] font-bold text-slate-500 mt-1">
            {isAdmin
              ? 'Team queue: pending items first. Default view is this month (by the date requested).'
              : 'Your requests only — other doctors’ notes stay private. Pending first; default is this month.'}
          </p>
        </div>
        {!isAdding && (
          <Button onClick={() => setIsAdding(true)} variant="primary" className="min-h-11 px-4 text-xs touch-manipulation shrink-0">
            <Plus size={16} /> New request
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 shrink-0">When (for date)</span>
        <div className="flex flex-wrap gap-2">
          {(
            [
              { id: 'this_month' as const, label: 'This month' },
              { id: 'next_month' as const, label: 'Next month' },
              { id: 'rolling_90' as const, label: '±90 days' },
              { id: 'all' as const, label: 'All' },
            ] as const
          ).map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTimeFilter(id)}
              className={`min-h-10 rounded-xl px-3.5 text-[10px] font-black uppercase tracking-wide touch-manipulation transition-colors ${
                timeFilter === id ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="hidden sm:inline text-slate-200">|</span>
        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 shrink-0">Status</span>
        <div className="flex flex-wrap gap-2">
          {(
            [
              { id: 'all' as const, label: 'All' },
              { id: 'pending' as const, label: isAdmin ? 'Pending approval' : 'Pending' },
              { id: 'resolved' as const, label: 'Done' },
            ] as const
          ).map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setStatusFilter(id)}
              className={`min-h-10 rounded-xl px-3.5 text-[10px] font-black uppercase tracking-wide touch-manipulation transition-colors ${
                statusFilter === id ? 'bg-slate-800 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {isAdmin && statusFilter === 'pending' && (
        <p className="text-[10px] font-bold text-slate-600 leading-relaxed max-w-2xl">
          Use <strong>Approve</strong> or <strong>Decline</strong> on each card so the roster builder can treat the request as locked in or set aside. That includes soft &ldquo;prefer not&rdquo; days — declining does not delete the request; it tells the scheduler the preference was not accepted for that run.
        </p>
      )}

      {isAdding && (
        <Card className="p-5 border-2 border-indigo-600 animate-in zoom-in-95">
          <form onSubmit={handleSubmit} className="space-y-4">
            <h4 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">New Leave/Preference</h4>
            {isAdmin && (
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">For doctor</label>
                <select
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none ring-indigo-500 focus:ring-2"
                  value={formData.forDoctorId}
                  onChange={e => setFormData({ ...formData, forDoctorId: e.target.value })}
                >
                  <option value="">Myself ({user.name})</option>
                  {doctors.filter(d => d.id !== user.id).map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Type</label>
                <select
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none ring-indigo-500 focus:ring-2"
                  value={formData.type}
                  onChange={e => setFormData({...formData, type: e.target.value as RequestType})}
                >
                  <option value={RequestType.UNAVAILABLE}>Prefer not to be on call (soft — may still be needed)</option>
                  <option value={RequestType.LEAVE}>Full leave (never rostered this day)</option>
                  <option value={RequestType.PREFERRED_WORK}>Prefer to work this day</option>
                  <option value={RequestType.POST_CALL_OFF}>Need this day off after a night — place me the night before if possible</option>
                  <option value={RequestType.SWAP}>Ask to swap with someone</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Date</label>
                <input 
                  type="date" 
                  required 
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none ring-indigo-500 focus:ring-2" 
                  value={formData.date}
                  onChange={e => setFormData({...formData, date: e.target.value})}
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Admin Note (Confidential)</label>
              <textarea 
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium min-h-[80px] outline-none ring-indigo-500 focus:ring-2" 
                placeholder="Brief explanation for the MO..."
                value={formData.reason}
                onChange={e => setFormData({...formData, reason: e.target.value})}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button className="flex-1" type="submit">CONFIRM PUBLIC REQUEST</Button>
              <Button variant="secondary" onClick={() => setIsAdding(false)} type="button">CANCEL</Button>
            </div>
          </form>
        </Card>
      )}

      <p className="text-[10px] text-slate-500 font-bold leading-relaxed">
        Requests are visible to your department. When building the roster, earlier submissions and clearer dates help avoid clashes.
      </p>

      {filteredSorted.length > 0 && (
        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
          Showing {filteredSorted.length} of {requests.length}
        </p>
      )}

      <div className="space-y-4">
        {filteredSorted.map((req) => {
          const doc = doctors.find(d => d.id === req.doctorId);
          const sameDateCount = requests.filter(r => r.date === req.date).length;
          const hasConflict = sameDateCount > 1;
          return (
            <Card key={req.id} className={hasConflict ? 'border-amber-200 bg-amber-50/30' : ''}>
              <div className="p-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex gap-3 min-w-0">
                  <div className="w-11 h-11 shrink-0 rounded-xl bg-slate-50 flex items-center justify-center font-black text-slate-500 border border-slate-200 text-sm">
                    {getInitials(doc?.name || doc?.id, '?')}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-black text-slate-900 tracking-tight">{doc?.name || 'Unknown'}</div>
                    <div className="text-[9px] text-slate-400 font-bold mt-0.5 tracking-tight">
                      Submitted {new Date(req.createdAt).toLocaleDateString()} · {new Date(req.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                       <Badge color={
                         req.type === RequestType.LEAVE ? 'red' :
                         req.type === RequestType.UNAVAILABLE ? 'yellow' :
                         req.type === RequestType.PREFERRED_WORK ? 'green' :
                         req.type === RequestType.POST_CALL_OFF ? 'indigo' :
                         'indigo'
                       }>{requestTypeLabel(req.type)}</Badge>
                       <span className="text-[11px] font-bold text-slate-600">For {new Date(req.date + 'T12:00:00').toLocaleDateString()}</span>
                       {hasConflict && (
                         <span className="text-[9px] font-black text-amber-600 uppercase">Same day: {sameDateCount} requests</span>
                       )}
                    </div>
                    {isAdmin && req.reason && (
                      <div className="mt-3 bg-indigo-50/50 p-3 rounded-xl border border-indigo-100 text-[10px] font-medium text-indigo-700">
                        <span className="font-black uppercase opacity-60 block mb-1">Note (team)</span>
                        <span className="italic">&ldquo;{req.reason}&rdquo;</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-3 shrink-0 border-t border-slate-100 pt-3 sm:border-t-0 sm:pt-0">
                  <Badge color={req.status === RequestStatus.APPROVED ? 'green' : req.status === RequestStatus.PENDING ? 'yellow' : 'red'}>
                    {requestStatusLabel(req.status)}
                  </Badge>
                  {isAdmin && req.status === RequestStatus.PENDING && (
                    <div className="flex gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => onStatusChange(req.id, RequestStatus.APPROVED)}
                        className="min-h-10 px-3 rounded-xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-wide border border-emerald-700 shadow-sm hover:bg-emerald-700 touch-manipulation active:scale-[0.98]"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => onStatusChange(req.id, RequestStatus.REJECTED)}
                        className="min-h-10 px-3 rounded-xl bg-white text-rose-700 text-[10px] font-black uppercase tracking-wide border border-rose-200 hover:bg-rose-50 touch-manipulation active:scale-[0.98]"
                      >
                        Decline
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
        {requests.length === 0 && (
          <div className="py-20 text-center bg-white rounded-3xl border border-slate-200">
            <Info className="mx-auto text-slate-200 mb-2" size={32} />
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">No requests yet</p>
          </div>
        )}
        {requests.length > 0 && filteredSorted.length === 0 && (
          <div className="py-14 text-center bg-white rounded-3xl border border-dashed border-slate-200">
            <p className="text-[11px] font-bold text-slate-500 px-4">Nothing matches these filters. Try &ldquo;All&rdquo; dates or a different status.</p>
          </div>
        )}
      </div>
    </div>
  );
};

const DoctorsView: React.FC<{
  doctors: User[];
  onAdd: (d: User) => void;
  onDelete: (id: string) => void;
  onAddPlaceholder?: (name: string, firm: string) => Promise<void>;
  onLinkPlaceholder?: (placeholderId: string, realUserId: string) => Promise<void>;
  onRefresh?: () => Promise<void>;
  isAdmin: boolean;
  useBackend?: boolean;
}> = ({ doctors, onAdd, onDelete, onAddPlaceholder, onLinkPlaceholder, onRefresh, isAdmin, useBackend }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [addMode, setAddMode] = useState<'email' | 'placeholder'>('email');
  const [email, setEmail] = useState('');
  const [placeholderName, setPlaceholderName] = useState('');
  const [placeholderFirm, setPlaceholderFirm] = useState('');
  const [pacingSavingId, setPacingSavingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [unlinkedDoctors, setUnlinkedDoctors] = useState<Array<{ id: string; name: string; email: string; firm: string }>>([]);
  const [selectedRealUserId, setSelectedRealUserId] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAdd({ id: '', name: '', email, role: Role.DOCTOR, firm: '', cumulativeHolidayHours: 0 });
    setIsAdding(false);
    setEmail('');
  };

  const handlePlaceholderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onAddPlaceholder?.(placeholderName, placeholderFirm);
    setIsAdding(false);
    setPlaceholderName('');
    setPlaceholderFirm('');
  };

  const openLinkModal = async (placeholderId: string) => {
    setLinkingId(placeholderId);
    setSelectedRealUserId('');
    if (useBackend) {
      try {
        const rows = await api.getUnlinkedDoctors();
        setUnlinkedDoctors(rows);
      } catch {
        setUnlinkedDoctors([]);
      }
    }
  };

  const handleLink = async () => {
    if (!linkingId || !selectedRealUserId) return;
    setLinkBusy(true);
    try {
      await onLinkPlaceholder?.(linkingId, selectedRealUserId);
      setLinkingId(null);
    } finally {
      setLinkBusy(false);
    }
  };

  const confirmDeleteDoc = doctors.find(d => d.id === confirmDeleteId);
  const linkingDoc = doctors.find(d => d.id === linkingId);

  return (
    <div className="space-y-6">
      {/* Delete confirmation modal */}
      {confirmDeleteId && confirmDeleteDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4">
          <Card className="w-full max-w-sm p-6 space-y-4 animate-in zoom-in-95">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center shrink-0">
                <UserX size={18} className="text-rose-600" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900">Remove doctor?</h3>
                <p className="text-[10px] text-slate-500 font-bold mt-1 leading-relaxed">
                  <strong>{confirmDeleteDoc.name}</strong> will be removed from the department. Their shift history remains in published rosters.
                </p>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => { onDelete(confirmDeleteId); setConfirmDeleteId(null); }}
                className="flex-1 min-h-10 rounded-xl bg-rose-600 text-white text-[10px] font-black uppercase tracking-wide hover:bg-rose-700 transition-colors touch-manipulation"
              >
                Yes, remove
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                className="flex-1 min-h-10 rounded-xl bg-slate-100 text-slate-700 text-[10px] font-black uppercase tracking-wide hover:bg-slate-200 transition-colors touch-manipulation"
              >
                Cancel
              </button>
            </div>
          </Card>
        </div>
      )}

      {/* Link placeholder modal */}
      {linkingId && linkingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4">
          <Card className="w-full max-w-sm p-6 space-y-4 animate-in zoom-in-95">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
                <Link2 size={18} className="text-indigo-600" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900">Link placeholder</h3>
                <p className="text-[10px] text-slate-500 font-bold mt-1 leading-relaxed">
                  Link <strong>{linkingDoc.name}</strong> to a doctor who has created their account. Their shift history and hours will transfer to the real account.
                </p>
              </div>
            </div>
            {unlinkedDoctors.length === 0 ? (
              <p className="text-[10px] text-slate-500 font-bold bg-slate-50 p-3 rounded-xl">
                No unlinked doctor accounts found. Ask the doctor to sign up first — they do not need to join the department beforehand.
              </p>
            ) : (
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Select account to link</label>
                <select
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none ring-indigo-500 focus:ring-2"
                  value={selectedRealUserId}
                  onChange={e => setSelectedRealUserId(e.target.value)}
                >
                  <option value="">Choose a doctor…</option>
                  {unlinkedDoctors.map(d => (
                    <option key={d.id} value={d.id}>{d.name} — {d.email}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!selectedRealUserId || linkBusy}
                onClick={() => void handleLink()}
                className="flex-1 min-h-10 rounded-xl bg-indigo-600 text-white text-[10px] font-black uppercase tracking-wide hover:bg-indigo-700 disabled:opacity-40 transition-colors touch-manipulation"
              >
                {linkBusy ? 'Linking…' : 'Link account'}
              </button>
              <button
                type="button"
                onClick={() => setLinkingId(null)}
                className="flex-1 min-h-10 rounded-xl bg-slate-100 text-slate-700 text-[10px] font-black uppercase tracking-wide hover:bg-slate-200 transition-colors touch-manipulation"
              >
                Cancel
              </button>
            </div>
          </Card>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h1 className="rs-h2 text-slate-900 tracking-tight">Staffing</h1>
        {isAdmin && !isAdding && (
          <Button onClick={() => setIsAdding(true)} variant="primary" className="h-10 px-4 text-xs touch-manipulation">
            <Plus size={16} /> ADD DOCTOR
          </Button>
        )}
      </div>

      {isAdding && (
        <Card className="p-5 border-2 border-indigo-600 animate-in zoom-in-95">
          {/* Mode toggle */}
          <div className="flex gap-1 p-1 bg-slate-100 rounded-xl mb-4">
            <button
              type="button"
              onClick={() => setAddMode('email')}
              className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide transition-colors touch-manipulation ${addMode === 'email' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}
            >
              Has an account
            </button>
            <button
              type="button"
              onClick={() => setAddMode('placeholder')}
              className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide transition-colors touch-manipulation ${addMode === 'placeholder' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}
            >
              No account yet
            </button>
          </div>

          {addMode === 'email' ? (
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Doctor email (registered)</label>
                <input
                  type="email"
                  required
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none ring-indigo-500 focus:ring-2"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="doctor@hospital.com"
                />
              </div>
              <p className="text-[9px] text-slate-400 leading-relaxed">
                The doctor must have already created an account. If the email isn&apos;t found, an error will appear.
              </p>
              <div className="flex gap-2">
                <Button className="flex-1" type="submit">Add to department</Button>
                <Button variant="secondary" onClick={() => setIsAdding(false)} type="button">Cancel</Button>
              </div>
            </form>
          ) : (
            <form onSubmit={e => void handlePlaceholderSubmit(e)} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Full name</label>
                  <input
                    type="text"
                    required
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none ring-indigo-500 focus:ring-2"
                    value={placeholderName}
                    onChange={e => setPlaceholderName(e.target.value)}
                    placeholder="Dr Jane Smith"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Firm (optional)</label>
                  <input
                    type="text"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none ring-indigo-500 focus:ring-2"
                    value={placeholderFirm}
                    onChange={e => setPlaceholderFirm(e.target.value)}
                    placeholder="Firm A"
                  />
                </div>
              </div>
              <p className="text-[9px] text-slate-400 leading-relaxed">
                Creates a roster slot with no login. When this doctor signs up later, use <strong>Link account</strong> on their card to merge their history.
              </p>
              <div className="flex gap-2">
                <Button className="flex-1" type="submit">Add placeholder</Button>
                <Button variant="secondary" onClick={() => setIsAdding(false)} type="button">Cancel</Button>
              </div>
            </form>
          )}
        </Card>
      )}

      <p className="text-[10px] text-slate-500 font-bold">
        Everyone sees the same published numbers — it keeps coverage decisions open and fair.
        {doctors[0]?.fairnessHistoryMode === 'CALENDAR_YEAR' ? (
          <> When Balance uses "this calendar year only," each row shows that <strong>scheduling window</strong> plus the unchanged <strong>all-time</strong> audit line.</>
        ) : (
          <> Totals here are the full published record the scheduler uses unless your admin switches the window under Balance.</>
        )}
      </p>

      <div className="grid gap-3">
        {doctors.map(doc => (
          <Card key={doc.id} className={`p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${doc.isPlaceholder ? 'border-dashed border-slate-300 bg-slate-50/60' : ''}`}>
            <div className="flex items-start gap-4 min-w-0 flex-1">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black border uppercase shrink-0 ${doc.isPlaceholder ? 'bg-white border-slate-200 text-slate-400' : 'bg-slate-50 border-slate-100 text-slate-600'}`}>
                {doc.isPlaceholder
                  ? <CircleDashed size={18} className="text-slate-400" />
                  : getInitials(doc.name || doc.id, '?')
                }
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="text-sm font-black text-slate-900 leading-snug break-words">{doc.name}</div>
                  {doc.isPlaceholder && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-200 text-slate-500 text-[8px] font-black uppercase tracking-wide">
                      <CircleDashed size={9} /> Unverified
                    </span>
                  )}
                </div>
                <div className="text-[9px] text-slate-400 font-bold mt-1 uppercase tracking-tighter">Assigned: {doc.firm || '—'}</div>
                {!doc.isPlaceholder && (
                  <div className="flex gap-3 mt-2 text-[10px] font-bold text-slate-600 flex-wrap">
                    {doc.fairnessHistoryMode === 'CALENDAR_YEAR' && doc.lifetimeTotalHours !== undefined ? (
                      <>
                        <span>
                          For scheduling ({doc.schedulingYear ?? '…'}):{' '}
                          <span className="text-slate-900">{doc.cumulativeTotalHours ?? 0} hrs</span>,{' '}
                          {doc.cumulativeWeekendShifts ?? 0} w/e, {doc.cumulativeHolidayHours ?? 0} hol hrs
                        </span>
                        <span className="text-slate-500 font-bold">
                          All-time: {doc.lifetimeTotalHours} hrs · {doc.lifetimeWeekendShifts ?? 0} w/e · {doc.lifetimeHolidayHours ?? 0} hol hrs
                        </span>
                      </>
                    ) : (
                      <>
                        <span>Total on-call: <span className="text-slate-900">{doc.cumulativeTotalHours ?? 0} hrs</span></span>
                        <span>Holiday: <span className="text-slate-900">{doc.cumulativeHolidayHours ?? 0} hrs</span></span>
                        <span>Weekends: <span className="text-slate-900">{doc.cumulativeWeekendShifts ?? 0}</span></span>
                      </>
                    )}
                  </div>
                )}
                {doc.isPlaceholder && (
                  <p className="text-[9px] text-slate-400 font-bold mt-2 leading-relaxed">
                    Roster slot only — no login. Use <strong>Link account</strong> once this doctor signs up.
                  </p>
                )}
                {isAdmin && !doc.isPlaceholder && (
                  <div className="mt-3 space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">First months on the rota</label>
                    <select
                      className="w-full max-w-md p-2 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-800"
                      value={doc.workloadStartMode ?? 'STAGGERED'}
                      disabled={pacingSavingId === doc.id}
                      onChange={async (e) => {
                        const workloadStartMode = e.target.value as User['workloadStartMode'];
                        setPacingSavingId(doc.id);
                        try {
                          await api.patchUser(doc.id, { workloadStartMode: workloadStartMode as string });
                          await onRefresh?.();
                        } catch (err) {
                          console.error(err);
                        } finally {
                          setPacingSavingId(null);
                        }
                      }}
                    >
                      <option value="STAGGERED">Standard — normal share from their first month</option>
                      <option value="IMMEDIATE">Full pace from week one</option>
                      <option value="NEXT_MONTH">No on-call in their joining month; start next month</option>
                    </select>
                  </div>
                )}
              </div>
            </div>
            {isAdmin && (
              <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                {doc.isPlaceholder && (
                  <button
                    type="button"
                    onClick={() => void openLinkModal(doc.id)}
                    className="flex items-center gap-1.5 min-h-9 px-3 rounded-xl bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase tracking-wide border border-indigo-200 hover:bg-indigo-100 transition-colors touch-manipulation"
                    aria-label={`Link ${doc.name} to a real account`}
                  >
                    <Link2 size={13} /> Link
                  </button>
                )}
                <button
                  onClick={() => setConfirmDeleteId(doc.id)}
                  className="p-2 text-slate-300 hover:text-rose-500 transition-colors touch-manipulation"
                  type="button"
                  aria-label={`Remove ${doc.name} from department`}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
};
