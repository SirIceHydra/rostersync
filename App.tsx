import React, { useState, useEffect } from 'react';
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
  SlidersHorizontal
} from 'lucide-react';

// --- Production UI Components ---
import { Card } from './src/components/Card';
import { Button } from './src/components/Button';
import { Badge } from './src/components/Badge';

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
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="w-14 h-14 bg-indigo-600 rounded-2xl mx-auto flex items-center justify-center shadow-lg mb-4">
            <Building2 className="text-white" size={28} />
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Join a department</h1>
          <p className="text-slate-500 text-xs font-bold mt-2 uppercase tracking-wider">
            Enter the department code from your admin or team
          </p>
        </div>
        <Card className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700 font-bold">
                {error}
              </div>
            )}
            {success && !error && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 font-bold">
                {success}
              </div>
            )}
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">
                Department code
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold uppercase tracking-widest outline-none ring-indigo-500 focus:ring-2"
                placeholder="e.g. ABC12XYZ"
                maxLength={12}
                autoFocus
              />
            </div>
            <Button type="submit" variant="primary" className="w-full py-3" disabled={loading}>
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
  const [view, setView] = useState<'DASHBOARD' | 'ROSTER' | 'ANALYTICS' | 'REQUESTS' | 'DOCTORS' | 'TUNING'>('DASHBOARD');
  const [roster, setRoster] = useState<Roster | null>(null);
  const [requests, setRequests] = useState<Request[]>([]);
  const [doctors, setDoctors] = useState<User[]>([]);
  const [fairnessReport, setFairnessReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [useBackend, setUseBackend] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [selectedMonthOffset, setSelectedMonthOffset] = useState<0 | 1>(0); // 0 = this month, 1 = next month
  const [departmentDropdownOpen, setDepartmentDropdownOpen] = useState(false);

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
        await loadData();
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
    if (savedReqs) setRequests(JSON.parse(savedReqs));
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

  const loadRosterForOffset = async (offset: 0 | 1) => {
    if (!useBackend) return;
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
    } catch (error: any) {
      setApiError(error.message);
      console.error('Failed to load roster:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadData = async () => {
    if (!useBackend) return;
    try {
      setLoading(true);
      const [doctorsData, requestsData, joinReqData] = await Promise.all([
        api.getDoctors().catch(() => []),
        api.getRequests().catch(() => []),
        currentUser?.role === Role.ADMIN ? api.getJoinRequests().catch(() => ({ requests: [] })) : Promise.resolve({ requests: [] as any[] })
      ]);
      setDoctors(doctorsData);
      setRequests(requestsData);
      if (currentUser?.role === Role.ADMIN) {
        setJoinRequests(joinReqData.requests || []);
      }

      // Load this month's roster by default
      await loadRosterForOffset(0);
    } catch (error: any) {
      setApiError(error.message);
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

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
        await loadData();
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
        await loadData();
      } else {
        api.setDepartmentId(null);
      }
    } catch (error: any) {
      throw new Error(error.message || 'Registration failed');
    }
  };

  const handleJoinDepartmentSuccess = async () => {
    const { departments: depts } = await api.getDepartments();
    setDepartments(depts || []);
    if ((depts?.length ?? 0) > 0) {
      api.setDepartmentId(depts[0].id);
      await loadData();
    }
  };

  const handleSwitchDepartment = async (dept: Department) => {
    api.setDepartmentId(dept.id);
    setDepartmentDropdownOpen(false);
    await loadData();
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

  const handleRegenerateSelected = async () => {
    const offset = selectedMonthOffset;
    const { month: targetMonth, year: targetYear } = getTargetMonthYear(offset);

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
        swapWithDoctorId: req.swapWithDoctorId
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

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans select-none pb-20">
      {apiError && (
        <div className="bg-amber-50 border-b border-amber-200 p-3 text-center">
          <p className="text-xs font-bold text-amber-700">{apiError}</p>
          <button onClick={() => setApiError(null)} className="text-xs text-amber-600 mt-1">Dismiss</button>
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
      <header className="bg-white border-b border-slate-200 p-4 sticky top-0 z-40 flex items-center justify-between safe-top no-print">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shadow-sm shrink-0">
            <ShieldCheck className="text-white" size={18} />
          </div>
          <div className="min-w-0">
            <h2 className="text-xs font-black text-slate-900 uppercase tracking-tight">RosterSync</h2>
            <div className="flex items-center gap-1.5 flex-wrap">
              {departments.length > 1 ? (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setDepartmentDropdownOpen(!departmentDropdownOpen)}
                    className="flex items-center gap-1 text-[9px] font-bold text-slate-500 uppercase tracking-tighter hover:text-indigo-600"
                  >
                    <Building2 size={12} />
                    {currentDepartment?.name || currentDepartment?.code || 'Department'}
                    <ChevronDown size={12} className={departmentDropdownOpen ? 'rotate-180' : ''} />
                  </button>
                  {departmentDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setDepartmentDropdownOpen(false)} aria-hidden />
                      <div className="absolute left-0 top-full mt-1 py-1 bg-white border border-slate-200 rounded-xl shadow-lg z-40 min-w-[160px]">
                        {departments.map((d) => (
                          <button
                            key={d.id}
                            type="button"
                            onClick={() => handleSwitchDepartment(d)}
                            className={`block w-full text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wider ${d.id === api.getDepartmentId() ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}
                          >
                            {d.name || d.code}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">
                  {currentDepartment?.name || currentDepartment?.code || ''}
                </span>
              )}
              {currentUser.role === Role.ADMIN && currentDepartment?.code && (
                <button
                  type="button"
                  onClick={() => handleCopyDepartmentCode(currentDepartment.code)}
                  className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-[8px] font-black text-indigo-700 uppercase tracking-widest border border-indigo-100"
                >
                  Code: {currentDepartment.code}
                  <span className="text-[9px] underline">Copy</span>
                </button>
              )}
              <span className="text-[9px] text-slate-400 font-bold">• {currentUser.name}</span>
            </div>
          </div>
        </div>
        <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-rose-500 transition-colors shrink-0">
          <LogOut size={20} />
        </button>
      </header>

      <main className="relative flex-1 overflow-y-auto p-4 max-w-lg mx-auto w-full space-y-6 animate-in fade-in duration-500">
        {loading && (
          <div
            className="absolute inset-0 z-40 flex flex-col items-center justify-start pt-28 bg-white/55 backdrop-blur-[2px] transition-opacity duration-200"
            aria-busy="true"
            aria-live="polite"
          >
            <div className="flex flex-col items-center gap-3 rounded-2xl bg-white/95 px-6 py-5 shadow-lg border border-slate-100">
              <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
              <p className="text-[11px] font-bold text-slate-600 text-center max-w-[200px]">
                Updating roster and fairness summary…
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
            requests={requests}
            onUpdateShift={handleUpdateShift}
            selectedMonthOffset={selectedMonthOffset}
            onChangeMonth={async (offset) => {
              await loadRosterForOffset(offset);
            }}
          />
        )}
        {view === 'ANALYTICS' && (
          <AnalyticsView
            report={fairnessReport}
            doctors={doctors}
            roster={roster}
            requests={requests}
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
          />
        )}
        {view === 'TUNING' && (
          <TuningView 
            report={fairnessReport}
            doctors={doctors}
            roster={roster}
          />
        )}
      </main>

      <nav className="bg-white border-t border-slate-200 flex justify-around items-center px-1 py-3 fixed bottom-0 left-0 right-0 z-50 safe-bottom shadow-[0_-4px_12px_rgba(0,0,0,0.03)] no-print">
        <TabItem active={view === 'DASHBOARD'} icon={<History size={20} />} label="Home" onClick={() => setView('DASHBOARD')} />
        <TabItem active={view === 'ROSTER'} icon={<Calendar size={20} />} label="Roster" onClick={() => setView('ROSTER')} />
        <TabItem active={view === 'ANALYTICS'} icon={<BarChart3 size={20} />} label="Metrics" onClick={() => setView('ANALYTICS')} />
        <TabItem active={view === 'REQUESTS'} icon={<AlertCircle size={20} />} label="Requests" onClick={() => setView('REQUESTS')} />
        {currentUser.role === Role.ADMIN && (
          <>
            <TabItem active={view === 'DOCTORS'} icon={<Users size={20} />} label="Staff" onClick={() => setView('DOCTORS')} />
            <TabItem active={view === 'TUNING'} icon={<SlidersHorizontal size={20} />} label="Balance" onClick={() => setView('TUNING')} />
          </>
        )}
      </nav>
    </div>
  );
}

const TabItem: React.FC<{ active: boolean; icon: React.ReactNode; label: string; onClick: () => void }> = ({ active, icon, label, onClick }) => (
  <button onClick={onClick} className={`flex flex-col items-center gap-1 w-1/5 transition-all ${active ? 'text-indigo-600' : 'text-slate-400'}`}>
    <div className={`p-1 rounded-lg ${active ? 'bg-indigo-50' : ''}`}>{icon}</div>
    <span className="text-[8px] font-black uppercase tracking-widest">{label}</span>
  </button>
);

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
      `They have more total on-call history than the team average. This month they get a slightly lighter share so the group evens out over time.`
    );
  } else if (cumHours > 0 && cumHours < avgCum * 0.95) {
    tag = 'catchingUpLow';
    tagLabel = 'Heavier month (catching up)';
    lines.push(
      `They have less total on-call history than the team average. This month they pick up a bit more so everyone converges toward fairness.`
    );
  } else if (cumHours > 0) {
    tag = 'normal';
    tagLabel = 'Typical share';
    lines.push(`Their past workload is close to the team average, so this month looks like a normal share.`);
  } else {
    tag = 'normal';
    tagLabel = 'Typical share';
    lines.push(`Published running totals are still sparse for them, so this month follows the same balancing rules as the rest of the team.`);
  }

  // 2. Weekend reasoning
  if (metric.weekendShifts > 0) {
    if (cumWeekends < avgCumWeekends - 1) {
      lines.push(`They have fewer past weekend shifts than most of the team, so weekend duty tilted toward them this month.`);
    } else {
      lines.push(`Weekend shifts are capped so one person cannot take every Saturday or Sunday.`);
    }
  } else if (metric.weekendShifts === 0 && monthHours > 0) {
    if (cumWeekends > avgCumWeekends + 1) {
      lines.push(`No weekend duty this month — they already carry more weekend history than average.`);
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
      lines.push(`They had fewer public-holiday hours on record than most colleagues, so they were a natural pick for a holiday shift.`);
    } else if (preferred.length > 0) {
      lines.push(`They asked to work specific dates, and those requests were approved — including a public holiday where it applied.`);
    } else {
      lines.push(`They are covering ${metric.holidayHours} hours on a public holiday this month.`);
    }
  } else if (cumPH > avgCumPH * 1.2) {
    lines.push(`No public-holiday shift this month — they already have more holiday duty on record than average.`);
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
  const isPublished = roster?.status === 'FINAL';
  const go = onNavigate ?? (() => {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Overview</h1>
          {/* Month Toggle */}
          <div className="flex bg-slate-100 rounded-xl p-1">
            <button
              onClick={() => onChangeMonth(0)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                selectedMonthOffset === 0 
                  ? 'bg-white text-indigo-600 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              This Month
            </button>
            <button
              onClick={() => onChangeMonth(1)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                selectedMonthOffset === 1 
                  ? 'bg-white text-indigo-600 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Next Month
            </button>
          </div>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Button onClick={onRegenerate} variant="secondary" className="px-3 h-10 text-[10px]" disabled={loading || !roster || isPublished}>
              <History size={14} /> REGENERATE
            </Button>
            <Button onClick={onGenerate} variant="secondary" className="px-3 h-10 text-[10px]" disabled={loading}>
              <Plus size={14} /> NEW DRAFT
            </Button>
            {roster && roster.status === 'DRAFT' && (
              <Button onClick={onPublish} variant="success" className="px-3 h-10 text-[10px]" disabled={loading}>
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
            <div className="flex items-start justify-between gap-2">
              <span className="text-[10px] font-black uppercase opacity-60 tracking-widest">Active cycle</span>
              <ChevronRight size={18} className="opacity-50 group-hover:opacity-90 shrink-0" aria-hidden />
            </div>
            <div className="mt-2">
              <div className="text-2xl font-black">{displayMonth}</div>
              <div className="flex items-center gap-2 mt-1">
                 <Badge color={roster?.status === 'FINAL' ? 'green' : 'yellow'}>{roster?.status || 'EMPTY'}</Badge>
              </div>
              <p className="text-[9px] font-bold opacity-70 mt-2">Open full calendar</p>
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
              <div className="text-2xl font-black text-slate-900">{pendingCount}</div>
              <div className="text-[9px] font-bold text-amber-500 mt-1 uppercase tracking-tighter">Awaiting review</div>
              <p className="text-[9px] font-bold text-slate-400 mt-2">Manage time-off & preferences</p>
            </div>
          </Card>
        </button>
      </div>

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
                      <div className="text-2xl font-black text-slate-900">{myHours} hrs</div>
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
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Holiday hours this year (team)</span>
              <ChevronRight size={18} className="text-slate-300 group-hover:text-indigo-500 shrink-0" aria-hidden />
            </div>
            <div className="mt-2 flex flex-wrap gap-3">
              {doctors.slice(0, 8).map(d => (
                <span key={d.id} className="text-[11px] font-bold text-slate-600">
                  {d.name?.split(' ').pop() ?? d.id}: <span className="text-slate-900">{(d.cumulativeHolidayHours ?? 0)} hrs</span>
                </span>
              ))}
              {doctors.length > 8 && <span className="text-[10px] text-slate-400 font-bold">+{doctors.length - 8} more</span>}
            </div>
            <p className="text-[9px] font-bold text-slate-400 mt-2">See full transparency view</p>
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
  requests: Request[];
  onUpdateShift: (shiftId: string, doctorId: string) => void;
  selectedMonthOffset: 0 | 1;
  onChangeMonth: (offset: 0 | 1) => void;
}> = ({ roster, report, currentUser, doctors, requests, onUpdateShift, selectedMonthOffset, onChangeMonth }) => {
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
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const selectedShifts = roster?.shifts.filter(s => new Date(s.date).getDate() === selectedDay) || [];
  const isAdmin = currentUser.role === Role.ADMIN;

  const handlePrint = () => window.print();

  // Calendar View Component
  const CalendarView = () => {
    const fullMonthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
      'July', 'August', 'September', 'October', 'November', 'December'];
    
    if (!roster) {
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black text-slate-900">
              {fullMonthNames[rosterMonth]} {rosterYear}
            </h2>
          </div>
          <Card className="p-12 text-center">
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">No roster generated for this month yet</p>
            {isAdmin && <p className="text-slate-300 text-[10px] font-bold mt-2">Use "NEW DRAFT" or "REGENERATE" to create one</p>}
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

    // Build a lookup: dateStr → approved requests for that date
    const requestsByDate: Record<string, Request[]> = {};
    for (const req of requests) {
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
          <div className="w-full">
            <table className="w-full border-collapse table-fixed">
              <thead>
                <tr className="bg-slate-50">
                  {dayNames.map(day => (
                    <th key={day} className="p-3 text-[10px] font-black text-slate-600 uppercase tracking-widest border-b border-slate-200 text-center">{day}</th>
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
                          className={`p-1.5 align-top border-r border-slate-100 last:border-r-0 ${
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
                              {shift && shiftInfo && (
                                <div
                                  className={`p-1.5 rounded-lg text-[9px] font-bold transition-all ${
                                    isMyShift 
                                      ? 'bg-indigo-600 text-white' 
                                      : shift.isPublicHoliday 
                                      ? 'bg-rose-100 text-rose-700 ring-1 ring-rose-200'
                                      : 'bg-slate-100 text-slate-700'
                                  }`}
                                  title={`${getDoctorName(shift.doctorId)} — ${shiftInfo.name}, ${shiftInfo.totalHours} hrs${shift.isPublicHoliday ? ' (public holiday)' : ''}`}
                                >
                                  <div className="font-black leading-tight">{getDoctorName(shift.doctorId).split(' ').pop()}</div>
                                  <div className="text-[8px] opacity-70 mt-0.5 leading-tight">{shiftInfo.name}</div>
                                  <div className="text-[8px] opacity-55 leading-tight">{shiftInfo.totalHours} hrs</div>
                                  {shift.isPublicHoliday && <div className="text-[7px] font-black opacity-80 mt-0.5">Holiday</div>}
                                </div>
                              )}
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
          <Card className="mt-4 p-4 bg-gradient-to-br from-indigo-50 to-white border border-indigo-100">
            <div className="flex items-center gap-2 mb-3">
              <Info size={14} className="text-indigo-500" />
              <h4 className="text-[10px] font-black text-indigo-700 uppercase tracking-widest">How this roster was built</h4>
            </div>
            <div className="text-[10px] text-slate-600 font-bold space-y-2 leading-relaxed">
              <p><span className="text-indigo-700">1. Non-negotiables:</span> approved full leave always wins. Rest between shifts and how many nights someone can do in a week follow your department settings.</p>
              <p><span className="text-indigo-700">2. Weekends:</span> no one is allowed to take every weekend in a month — caps keep Saturday and Sunday duty shared.</p>
              <p><span className="text-indigo-700">3. Who goes first:</span> honour approved &quot;prefer to work&quot; days, then balance weekend counts, then spread public-holiday duty fairly across the year, then lean toward people who have been on call less recently.</p>
              <p><span className="text-indigo-700">4. New starters:</span> they are lined up with a normal share of the load unless an admin chooses &quot;start next month&quot; or &quot;full pace from day one.&quot;</p>
              <p><span className="text-indigo-700">5. Evening out the month:</span> if two people are far apart on weeknight hours, the scheduler may swap who covers which weekday — up to the limit you set under <strong>Balance</strong> — without removing someone&apos;s agreed &quot;prefer to work&quot; day.</p>
            </div>
          </Card>
        )}

        {/* Everyone's hours with per-doctor reasoning */}
        {report && report.metrics?.length > 0 && (
          <Card className="mt-4 p-4 bg-slate-50/50">
            <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">
              Everyone&apos;s hours — {fullMonthNames[rosterMonth]} {rosterYear}
            </h4>
            <div className="space-y-2 text-[10px] font-bold">
              {(report.metrics as any[])
                .sort((a, b) => b.totalHours - a.totalHours)
                .map((m: any) => {
                const doc = doctors.find(d => d.id === m.doctorId);
                if (!doc) return null;
                const isMe = doc.id === currentUser.id;
                const summaryLine = formatHoursSummaryLine(m);
                const reasoning = buildDoctorReasoning(doc, m, doctors, requests.filter(r => r.status === RequestStatus.APPROVED), rosterMonth, rosterYear);
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Roster</h1>
          <div className="inline-flex bg-slate-100 rounded-xl p-1 gap-1 text-[10px] font-black">
            <button
              onClick={() => onChangeMonth(0)}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                selectedMonthOffset === 0 ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'
              }`}
            >
              This Month
            </button>
            <button
              onClick={() => onChangeMonth(1)}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                selectedMonthOffset === 1 ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'
              }`}
            >
              Next Month
            </button>
          </div>
        </div>
        <div className="flex gap-2">
          <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
            <button
              onClick={() => setViewMode('calendar')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${
                viewMode === 'calendar' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'
              }`}
            >
              Calendar
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${
                viewMode === 'list' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'
              }`}
            >
              List
            </button>
          </div>
          <Button onClick={handlePrint} variant="secondary" className="px-3 h-10 text-[10px]">
            <Printer size={14} /> EXPORT PDF
          </Button>
        </div>
      </div>

      {viewMode === 'calendar' ? (
        <CalendarView />
      ) : (
        <>
          {isAdmin && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl px-3 py-2 text-[9px] font-bold text-indigo-700">
              Tip: tap a day below, then use <span className="underline">REASSIGN</span> on a card to swap doctors.
            </div>
          )}
          <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-hide snap-x">
            {days.map(d => (
              <button 
                key={d} 
                onClick={() => setSelectedDay(d)}
                className={`flex-shrink-0 w-12 h-18 rounded-2xl flex flex-col items-center justify-center transition-all snap-center border-2 ${
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
                    <div className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl ${isMe ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                          {getInitials(doc?.name || doc?.id, '?')}
                        </div>
                        <div>
                          <div className="text-base font-black text-slate-900 leading-none">{doc?.name || 'Unassigned'}</div>
                          <div className="text-[10px] text-slate-500 font-bold mt-1.5 uppercase tracking-tighter">{t?.startTime} - {t?.endTime}</div>
                        </div>
                      </div>
                      <div className="text-right flex flex-col items-end gap-2">
                        <Badge color={s.isPublicHoliday ? 'red' : 'indigo'}>{t?.name}</Badge>
                        {isAdmin && roster?.status === 'DRAFT' && (
                          <button 
                            onClick={() => setEditingShiftId(editingShiftId === s.id ? null : s.id)}
                            className="text-[9px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-1 hover:underline"
                          >
                            <Edit2 size={10} /> REASSIGN
                          </button>
                        )}
                      </div>
                    </div>
                  </Card>

                  {editingShiftId === s.id && (
                    <div className="bg-slate-100 rounded-2xl p-4 animate-in slide-in-from-top-2">
                       <p className="text-[8px] font-black text-slate-400 uppercase mb-2">Select Replacement Doctor:</p>
                       <div className="grid grid-cols-2 gap-2">
                         {doctors.map(d => (
                           <button 
                            key={d.id}
                            onClick={() => {
                              onUpdateShift(s.id, d.id);
                              setEditingShiftId(null);
                            }}
                            className={`p-2 text-[10px] font-bold border rounded-lg transition-colors ${d.id === s.doctorId ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border-slate-200'}`}
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
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Transparency</h1>
        <div className="inline-flex bg-slate-100 rounded-xl p-1 gap-1 text-[10px] font-black">
          <button onClick={() => onChangeMonth(0)} className={`px-3 py-1.5 rounded-lg transition-all ${selectedMonthOffset === 0 ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>This Month</button>
          <button onClick={() => onChangeMonth(1)} className={`px-3 py-1.5 rounded-lg transition-all ${selectedMonthOffset === 1 ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>Next Month</button>
        </div>
      </div>
      <div className="py-20 text-center text-slate-400 text-xs font-bold uppercase tracking-widest">No roster for {monthNames[monthIdx]} {yearIdx} yet — generate one first</div>
    </div>
  );

  const approvedRequests = requests.filter(r => r.status === RequestStatus.APPROVED);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Transparency</h1>
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

      <Card className="p-4 bg-gradient-to-br from-indigo-50 to-white border border-indigo-100">
        <div className="flex items-center gap-2 mb-3">
          <Info size={14} className="text-indigo-500" />
          <h4 className="text-[10px] font-black text-indigo-700 uppercase tracking-widest">How the roster is built</h4>
        </div>
        <ol className="text-[10px] text-slate-600 font-bold space-y-1.5 leading-relaxed list-decimal pl-4">
          <li><span className="text-indigo-700">Safety first:</span> full leave is never ignored. Rest gaps and weekly caps follow your department settings.</li>
          <li><span className="text-indigo-700">Weekends:</span> monthly caps stop one person from taking every Saturday or Sunday.</li>
          <li><span className="text-indigo-700">Fair order:</span> honour &quot;prefer to work&quot; days, respect post-call preferences where possible, balance weekend counts, spread public-holiday duty across the year, then favour people with lighter recent history.</li>
          <li><span className="text-indigo-700">New starters:</span> they get a normal share of the month unless an admin chooses a gentler start or a later first month.</li>
          <li><span className="text-indigo-700">Last pass:</span> weekday swaps may nudge hours between people who are high or low versus the team average, without breaking preferred work days or approved unavailability.</li>
        </ol>
      </Card>

      <Card>
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Workload Equity — Why each doctor got their shifts</h3>
          <Badge color="indigo">Strive for even share</Badge>
        </div>
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
                    <div className="flex gap-4 text-[9px] font-bold text-slate-500 normal-case tracking-normal mt-2">
                      <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 bg-rose-400 rounded-full" /> Weekends this month: {m.weekendShifts}</span>
                      <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 bg-indigo-400 rounded-full" /> Holiday shifts: {m.holidayShifts ?? 0} ({m.holidayHours ?? 0} hrs)</span>
                      <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 bg-slate-400 rounded-full" /> Total history: {doc.cumulativeTotalHours ?? 0} hrs, {doc.cumulativeWeekendShifts ?? 0} weekend{(doc.cumulativeWeekendShifts ?? 0) !== 1 ? 's' : ''}</span>
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
          <span className="opacity-40 inline-flex" title="Who has the lightest public-holiday history this year — they are usually next in line when a holiday shift must be filled.">
            <Info size={14} />
          </span>
        </div>
        <p className="px-4 py-2 text-[10px] text-slate-500 font-bold bg-slate-50 border-b border-slate-100">
          Public-holiday hours add up over the calendar year. When several people could cover a holiday, the scheduler leans toward those with fewer holiday hours so far.
        </p>
        <table className="w-full text-left">
          <thead className="text-[9px] font-black text-slate-400 uppercase bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="px-5 py-3">Doctor</th>
              <th className="px-5 py-3">This month</th>
              <th className="px-5 py-3">Year to date (hrs)</th>
              <th className="px-5 py-3 text-right">Standing</th>
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
                  <tr key={doc.id} className="text-[11px] font-bold text-slate-700">
                    <td className="px-5 py-4">{doc.name}</td>
                    <td className="px-5 py-4 font-black">{n} {shiftWord} ({monthPHHours} hrs)</td>
                    <td className="px-5 py-4 font-black">{(doc.cumulativeHolidayHours ?? 0)} hrs</td>
                    <td className="px-5 py-4 text-right">
                      <Badge color={(doc.cumulativeHolidayHours ?? 0) === 0 ? 'green' : 'slate'}>
                        {(doc.cumulativeHolidayHours ?? 0) === 0 ? 'Highest priority' : 'In rotation'}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
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

const TuningView: React.FC<{ report: any; doctors: User[]; roster: Roster | null }> = ({ report, doctors, roster }) => {
  const [hourLimit, setHourLimit] = useState<number>(24);
  const [weekendLimit, setWeekendLimit] = useState<number>(1);
  const [maxShiftsPer7Days, setMaxShiftsPer7Days] = useState<number>(2);
  const [minRestDays, setMinRestDays] = useState<number>(1);
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
      } catch (error) {
        console.warn('Could not load fairness settings, using defaults');
      } finally {
        setLoading(false);
      }
    };
    loadSettings();
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      setSaveMessage(null);
      await api.updateFairnessSettings({
        hourLimit,
        weekendLimit,
        maxShiftsPer7Days,
        minRestDays,
      });
      setSaveMessage('Saved. The next roster you generate will use these rules.');
      setTimeout(() => setSaveMessage(null), 4000);
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

  const hourOk = hourDiff <= hourLimit;
  const weekendOk = weekendDiff <= weekendLimit;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Balance settings</h1>
        <p className="text-slate-500 text-xs font-medium mt-1 leading-relaxed">
          These controls change <strong>how strict</strong> the schedule is and <strong>when you get a heads-up</strong>. They apply the next time someone runs <strong>New draft</strong> or <strong>Regenerate</strong>.
          The live numbers under each slider describe <strong>{rosterPeriodLabel}</strong> only — one calendar month, not year-to-date totals.
          To set how a <strong>new colleague</strong> enters the rota (first month vs full pace), use <strong>Staff</strong> — that choice is per person, not here.
        </p>
      </div>

      <Card className="p-5 bg-slate-50 border-slate-100">
        <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Year-to-date totals (after publish)</h3>
        <ul className="space-y-2 text-[11px] text-slate-600 leading-relaxed">
          <li>When a roster is <strong>published</strong>, each person&apos;s running on-call hours, weekend count, and public-holiday hours are saved for the year. Those figures help the next month feel fair.</li>
          <li>If something looks out of date, use <strong>Rebuild yearly totals</strong> to recalculate from every published month.</li>
        </ul>
        <div className="mt-4">
          <Button
            variant="secondary"
            className="text-[10px]"
            onClick={async () => {
              try {
                const r = await api.syncCumulative();
                setSaveMessage(r.message || 'Yearly totals updated.');
                setTimeout(() => setSaveMessage(null), 4000);
              } catch (e: any) {
                setSaveMessage(e.message || 'Could not rebuild totals.');
              }
            }}
          >
            Rebuild yearly totals from published rosters
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
          <Button onClick={handleSave} variant="primary" className="px-3 h-8 text-[10px]" disabled={saving || loading}>
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
                onChange={e => setHourLimit(Number(e.target.value))}
                className="w-full mt-2"
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
                onChange={e => setWeekendLimit(Number(e.target.value))}
                className="w-full mt-2"
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
                onChange={e => setMinRestDays(Number(e.target.value))}
                className="mt-2 w-full text-[11px] font-bold text-slate-800 bg-white border border-slate-200 rounded-lg px-3 py-2"
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
                onChange={e => setMaxShiftsPer7Days(Number(e.target.value))}
                className="mt-2 w-full text-[11px] font-bold text-slate-800 bg-white border border-slate-200 rounded-lg px-3 py-2"
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
            They are given a normal share of the month instead of being buried or left out purely because their history is short.
          </div>
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
            <span className="font-bold text-blue-800 block mb-1">Long leave</span>
            People coming back are not automatically handed an unfair overload the first month.
          </div>
          <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
            <span className="font-bold text-amber-900 block mb-1">Many “prefer not” days</span>
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
          <p className="text-[9px] text-slate-500 font-bold mt-1">Snapshot for {rosterPeriodLabel} — badges describe workload shape, not clinical roles.</p>
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
                          <span title="They have more total on-call history than average, so this month is intentionally a bit lighter."
                            className="text-[8px] bg-slate-100 text-slate-500 border border-slate-200 px-1.5 py-0.5 rounded-full">
                            Lighter month (high history)
                          </span>
                        )}
                        {isCatchingUp && (
                          <span title="They have less total on-call history than average, so this month picks up a bit more."
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
                        {cumHours > 0 && <span className="text-slate-400">history: {cumHours} hrs, {cumWeekends} weekend{cumWeekends !== 1 ? 's' : ''}</span>}
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
          <div><span className="text-slate-600">Lighter month (high history)</span> means their running total is above average, so the scheduler eases off. <span className="text-amber-700">Heavier month (catching up)</span> is the opposite.</div>
          <div><span className="text-blue-700">New starter — fair share</span> lines them up with a normal month. <span className="text-emerald-700">Full pace from week one</span> is when an admin wants them treated like a long-time colleague immediately.</div>
        </div>
      </Card>
    </div>
  );
};

const RequestsView: React.FC<{ 
  user: User; 
  requests: Request[]; 
  onAdd: (r: Request) => void; 
  onStatusChange: (id: string, s: RequestStatus) => void;
  doctors: User[];
}> = ({ user, requests, onAdd, onStatusChange, doctors }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState({ date: new Date().toISOString().split('T')[0], type: RequestType.UNAVAILABLE, reason: '' });
  const isAdmin = user.role === Role.ADMIN;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAdd({
      id: Math.random().toString(36).substr(2, 9),
      doctorId: user.id,
      type: formData.type,
      date: formData.date,
      status: RequestStatus.PENDING,
      reason: formData.reason,
      createdAt: Date.now()
    });
    setIsAdding(false);
    setFormData({ date: new Date().toISOString().split('T')[0], type: RequestType.UNAVAILABLE, reason: '' });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Public Requests</h1>
        {!isAdding && (
          <Button onClick={() => setIsAdding(true)} variant="primary" className="h-10 px-4 text-xs">
            <Plus size={16} /> SUBMIT
          </Button>
        )}
      </div>

      {isAdding && (
        <Card className="p-5 border-2 border-indigo-600 animate-in zoom-in-95">
          <form onSubmit={handleSubmit} className="space-y-4">
            <h4 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">New Leave/Preference</h4>
            <div className="grid grid-cols-2 gap-3">
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

      <p className="text-[10px] text-slate-500 font-bold">All requests are public. First-come, first-served; earlier requests get priority when the roster is built.</p>

      <div className="space-y-4">
        {requests.sort((a,b) => b.createdAt - a.createdAt).map(req => {
          const doc = doctors.find(d => d.id === req.doctorId);
          const sameDateCount = requests.filter(r => r.date === req.date).length;
          const hasConflict = sameDateCount > 1;
          return (
            <Card key={req.id} className={hasConflict ? 'border-amber-200 bg-amber-50/30' : ''}>
              <div className="p-4 flex items-start justify-between">
                <div className="flex gap-4">
                  <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center font-black text-slate-500 border border-slate-200">
                    {getInitials(doc?.name || doc?.id, '?')}
                  </div>
                  <div>
                    <div className="text-sm font-black text-slate-900 tracking-tight">{doc?.name || 'Unknown'}</div>
                    <div className="text-[9px] text-slate-400 font-bold uppercase mt-0.5 tracking-tighter">
                      Requested at: {new Date(req.createdAt).toLocaleDateString()} {new Date(req.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                       <Badge color={
                         req.type === RequestType.LEAVE ? 'red' :
                         req.type === RequestType.UNAVAILABLE ? 'yellow' :
                         req.type === RequestType.PREFERRED_WORK ? 'green' :
                         req.type === RequestType.POST_CALL_OFF ? 'indigo' :
                         'indigo'
                       }>{req.type}</Badge>
                       <span className="text-[11px] font-bold text-slate-600">For: {new Date(req.date).toLocaleDateString()}</span>
                       {hasConflict && (
                         <span className="text-[9px] font-black text-amber-600 uppercase">Same date: {sameDateCount} requests — admin may need to choose</span>
                       )}
                    </div>
                    {isAdmin && req.reason && (
                      <div className="mt-3 bg-indigo-50/50 p-3 rounded-xl border border-indigo-100 text-[10px] font-medium text-indigo-700">
                        <span className="font-black uppercase opacity-60 block mb-1">Confidential Context:</span>
                        "{req.reason}"
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-3">
                  <Badge color={req.status === RequestStatus.APPROVED ? 'green' : req.status === RequestStatus.PENDING ? 'yellow' : 'red'}>
                    {req.status}
                  </Badge>
                  {isAdmin && req.status === RequestStatus.PENDING && (
                    <div className="flex gap-2">
                      <button onClick={() => onStatusChange(req.id, RequestStatus.APPROVED)} className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 transition-colors hover:bg-emerald-100"><CheckCircle2 size={18} /></button>
                      <button onClick={() => onStatusChange(req.id, RequestStatus.REJECTED)} className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100 transition-colors hover:bg-rose-100"><X size={18} /></button>
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
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Queue is currently empty</p>
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
  onRefresh?: () => Promise<void>;
  isAdmin: boolean;
}> = ({ doctors, onAdd, onDelete, onRefresh, isAdmin }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [email, setEmail] = useState('');
  const [pacingSavingId, setPacingSavingId] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAdd({
      id: '',
      name: '',
      email,
      role: Role.DOCTOR,
      firm: '',
      cumulativeHolidayHours: 0
    });
    setIsAdding(false);
    setEmail('');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Staffing</h1>
        {isAdmin && !isAdding && (
          <Button onClick={() => setIsAdding(true)} variant="primary" className="h-10 px-4 text-xs">
            <Plus size={16} /> ADD DOCTOR
          </Button>
        )}
      </div>

      {isAdding && (
        <Card className="p-5 border-2 border-indigo-600 animate-in zoom-in-95">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Doctor email (registered)</label>
              <input 
                type="email" 
                required 
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none ring-indigo-500 focus:ring-2" 
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="doctor@med.com"
              />
            </div>
            <p className="text-[9px] text-slate-400">
              The doctor must have already created an account with this email. If we can&apos;t find them, we&apos;ll show an error.
            </p>
            <div className="flex gap-2">
              <Button className="flex-1" type="submit">ADD DOCTOR TO DEPARTMENT</Button>
              <Button variant="secondary" onClick={() => setIsAdding(false)} type="button">CANCEL</Button>
            </div>
          </form>
        </Card>
      )}

      <p className="text-[10px] text-slate-500 font-bold">Everyone in the department can see the same running totals — it keeps coverage decisions open and fair.</p>

      <div className="grid gap-3">
        {doctors.map(doc => (
          <Card key={doc.id} className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center font-black text-slate-600 border border-slate-100 uppercase">
                {getInitials(doc.name || doc.id, '?')}
              </div>
              <div>
                <div className="text-sm font-black text-slate-900 leading-none">{doc.name}</div>
                <div className="text-[9px] text-slate-400 font-bold mt-1 uppercase tracking-tighter">Assigned: {doc.firm}</div>
                <div className="flex gap-3 mt-2 text-[10px] font-bold text-slate-600 flex-wrap">
                  <span>Total hours (year): <span className="text-slate-900">{(doc.cumulativeTotalHours ?? 0)} hrs</span></span>
                  <span>Holiday hours (year): <span className="text-slate-900">{(doc.cumulativeHolidayHours ?? 0)} hrs</span></span>
                  <span>Weekends: <span className="text-slate-900">{(doc.cumulativeWeekendShifts ?? 0)}</span></span>
                </div>
                {isAdmin && (
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
              <button 
                onClick={() => onDelete(doc.id)}
                className="p-2 text-slate-300 hover:text-rose-500 transition-colors"
              >
                <Trash2 size={16} />
              </button>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
};
