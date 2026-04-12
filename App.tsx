import React, { useState, useEffect } from 'react';
import { 
  Role, 
  User, 
  Roster, 
  Request, 
  RequestType, 
  RequestStatus, 
  ScheduledShift
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
  ChevronDown
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
    // Always generate the NEXT month's roster (planning ahead)
    const { month: targetMonth, year: targetYear } = getTargetMonthYear(1);

    if (!useBackend) {
      // Fallback: use local roster engine
      const { RosterEngine } = await import('./rosterEngine');
      const { roster: newRoster, report } = RosterEngine.generate(targetMonth, targetYear, doctors, requests);
      setRoster(newRoster);
      setFairnessReport(report);
      localStorage.setItem('rs_roster_v2', JSON.stringify(newRoster));
      setSelectedMonthOffset(1);
      return;
    }

    try {
      setLoading(true);
      const { roster: newRoster, report } = await api.generateRoster(targetMonth, targetYear);
      setRoster(newRoster);
      setFairnessReport(report);
      setSelectedMonthOffset(1);
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

      <main className="flex-1 overflow-y-auto p-4 max-w-lg mx-auto w-full space-y-6 animate-in fade-in duration-500">
        {loading && (
          <div className="text-center py-8 text-slate-400 text-xs font-bold">Loading...</div>
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
          />
        )}
        {view === 'ROSTER' && (
          <RosterView 
            roster={roster} 
            report={fairnessReport}
            currentUser={currentUser} 
            doctors={doctors}
            onUpdateShift={handleUpdateShift}
            selectedMonthOffset={selectedMonthOffset}
            onChangeMonth={async (offset) => {
              await loadRosterForOffset(offset);
            }}
          />
        )}
        {view === 'ANALYTICS' && <AnalyticsView report={fairnessReport} doctors={doctors} />}
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
            isAdmin={currentUser.role === Role.ADMIN}
          />
        )}
        {view === 'TUNING' && (
          <TuningView 
            report={fairnessReport}
            doctors={doctors}
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
            <TabItem active={view === 'TUNING'} icon={<BarChart3 size={20} />} label="Tuning" onClick={() => setView('TUNING')} />
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
}> = ({ user, roster, requests, report, doctors, onGenerate, onPublish, onRegenerate, selectedMonthOffset, onChangeMonth, loading }) => {
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
  const todayDisplay = `${fullMonthNames[today.getMonth()].toUpperCase()} ${today.getDate()}`;
  const isPublished = roster?.status === 'FINAL';

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
            <Button onClick={onGenerate} variant="secondary" className="px-3 h-10 text-[10px]" disabled={loading || selectedMonthOffset === 1}>
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
        <Card className="p-4 bg-indigo-600 text-white shadow-lg shadow-indigo-100/50">
          <span className="text-[10px] font-black uppercase opacity-60 tracking-widest">Active Cycle</span>
          <div className="mt-2">
            <div className="text-2xl font-black">{displayMonth}</div>
            <div className="flex items-center gap-2 mt-1">
               <Badge color={roster?.status === 'FINAL' ? 'green' : 'yellow'}>{roster?.status || 'EMPTY'}</Badge>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-white border-slate-200">
          <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Public Review</span>
          <div className="mt-2">
            <div className="text-2xl font-black text-slate-900">{pendingCount}</div>
            <div className="text-[9px] font-bold text-amber-500 mt-1 uppercase tracking-tighter">Unresolved Requests</div>
          </div>
        </Card>
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
                <Card className="p-4 bg-white border-slate-200">
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">My Next Shift</span>
                  <div className="mt-2">
                    {nextShift ? (
                      <>
                        <div className="text-lg font-black text-slate-900">
                          {new Date(nextShift.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </div>
                        <div className="text-[9px] font-bold text-slate-500 mt-1 uppercase tracking-tighter">
                          {SHIFT_TEMPLATES.find(t => t.id === nextShift.templateId)?.name}
                          {nextShift.isPublicHoliday ? ' • Public Holiday' : ''}
                        </div>
                      </>
                    ) : (
                      <div className="text-sm font-bold text-slate-400">No more shifts this month</div>
                    )}
                  </div>
                </Card>
                <Card className="p-4 bg-white border-slate-200">
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">My Hours ({displayMonth})</span>
                  <div className="mt-2">
                    <div className="text-2xl font-black text-slate-900">{myHours}h</div>
                    <div className="text-[9px] font-bold text-slate-500 mt-1 uppercase tracking-tighter">
                      {myMetric?.weekendShifts ?? 0} weekends • {myMetric?.holidayShifts ?? 0} PH
                    </div>
                  </div>
                </Card>
              </>
            );
          })()}
        </div>
      )}

      {/* Transparency: Department PH totals (plan: everyone can see everyone's PH) */}
      {doctors.length > 0 && (
        <Card className="p-4 bg-slate-50 border-slate-100">
          <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Department PH Totals (Calendar Year)</span>
          <div className="mt-2 flex flex-wrap gap-3">
            {doctors.slice(0, 8).map(d => (
              <span key={d.id} className="text-[11px] font-bold text-slate-600">
                {d.name?.split(' ').pop() ?? d.id}: <span className="text-slate-900">{(d.cumulativeHolidayHours ?? 0)}h</span>
              </span>
            ))}
            {doctors.length > 8 && <span className="text-[10px] text-slate-400 font-bold">+{doctors.length - 8} more</span>}
          </div>
        </Card>
      )}

      {isAdmin && report?.warnings?.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-4 animate-in slide-in-from-top-4">
          <AlertCircle className="text-amber-600 shrink-0" size={20} />
          <div>
            <h3 className="text-[10px] font-black text-amber-900 uppercase tracking-widest">Fairness Violations</h3>
            <ul className="mt-1 space-y-1">
              {report.warnings.map((w: string, i: number) => (
                <li key={i} className="text-[10px] text-amber-700 font-bold leading-relaxed">• {w}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <Card>
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-tight">Today's Assignments</h3>
          <span className="text-[9px] text-slate-400 font-bold">{todayDisplay}</span>
        </div>
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
                <Badge color={s.isPublicHoliday ? 'red' : 'indigo'}>{t?.totalHours}H</Badge>
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
  onUpdateShift: (shiftId: string, doctorId: string) => void;
  selectedMonthOffset: 0 | 1;
  onChangeMonth: (offset: 0 | 1) => void;
}> = ({ roster, report, currentUser, doctors, onUpdateShift, selectedMonthOffset, onChangeMonth }) => {
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
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">
              No roster generated for this month yet
            </p>
            {isAdmin && (
              <p className="text-slate-300 text-[10px] font-bold mt-2">
                Use "NEW DRAFT" or "REGENERATE" to create one
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

    for (let i = 0; i < firstDayOfMonth; i++) {
      currentWeek.push(null);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${rosterYear}-${(rosterMonth + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
      const shift = roster.shifts.find(s => s.date === dateStr) || null;
      currentWeek.push(shift);

      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }

    while (currentWeek.length < 7 && currentWeek.length > 0) {
      currentWeek.push(null);
    }
    if (currentWeek.length > 0) {
      weeks.push(currentWeek);
    }

    const getDoctorName = (doctorId: string) => {
      const doctor = doctors.find(d => d.id === doctorId);
      return doctor?.name || 'Unassigned';
    };

    const getShiftInfo = (shift: ScheduledShift | null) => {
      if (!shift) return null;
      return SHIFT_TEMPLATES.find(t => t.id === shift.templateId);
    };

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-slate-900">
            {fullMonthNames[rosterMonth]} {rosterYear}
          </h2>
          {roster.status === 'FINAL' && <Badge color="green">FINALIZED</Badge>}
        </div>

        <Card className="overflow-hidden">
          <div className="w-full">
            <table className="w-full border-collapse table-fixed">
              <thead>
                <tr className="bg-slate-50">
                  {dayNames.map(day => (
                    <th 
                      key={day}
                      className="p-3 text-[10px] font-black text-slate-600 uppercase tracking-widest border-b border-slate-200 text-center"
                    >
                      {day}
                    </th>
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

                      return (
                        <td
                          key={dayIdx}
                          className={`p-2 align-top border-r border-slate-100 last:border-r-0 ${
                            day < 1 || day > daysInMonth ? 'bg-slate-50' : 'bg-white'
                          } ${isToday ? 'ring-2 ring-indigo-500' : ''}`}
                        >
                          {day >= 1 && day <= daysInMonth && (
                            <>
                              <div className={`text-xs font-black mb-1 ${isToday ? 'text-indigo-600' : 'text-slate-400'}`}>
                                {day}
                              </div>
                              {shift && shiftInfo && (
                                <div
                                  className={`p-2 rounded-lg text-[9px] font-bold transition-all ${
                                    isMyShift 
                                      ? 'bg-indigo-600 text-white' 
                                      : shift.isPublicHoliday 
                                      ? 'bg-rose-100 text-rose-700' 
                                      : 'bg-slate-100 text-slate-700'
                                  }`}
                                >
                                  <div className="font-black">{getDoctorName(shift.doctorId).split(' ').pop()}</div>
                                  <div className="text-[8px] opacity-75 mt-0.5">
                                    {shiftInfo.name}
                                  </div>
                                  <div className="text-[8px] opacity-60 mt-0.5">
                                    {shiftInfo.totalHours}H
                                  </div>
                                </div>
                              )}
                              {!shift && day >= 1 && day <= daysInMonth && (
                                <div className="text-[8px] text-slate-300 font-bold">No shift</div>
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

        <div className="flex items-center gap-4 text-[9px] font-bold text-slate-500">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-indigo-600"></div>
            <span>Your Shift</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-rose-100"></div>
            <span>Public Holiday</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded ring-2 ring-indigo-500"></div>
            <span>Today</span>
          </div>
        </div>

        {/* Everyone's hours (plan: all doctors can see everyone's total hours) */}
        {report && report.metrics?.length > 0 && (
          <Card className="mt-4 p-4 bg-slate-50/50">
            <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Everyone&apos;s Hours — {fullMonthNames[rosterMonth]} {rosterYear}</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[10px] font-bold">
              {report.metrics.map((m: any) => {
                const doc = doctors.find(d => d.id === m.doctorId);
                const isMe = doc?.id === currentUser.id;
                return (
                  <div key={m.doctorId} className={`flex justify-between items-center p-2 rounded-lg ${isMe ? 'bg-indigo-100 text-indigo-800' : 'bg-white text-slate-700'}`}>
                    <span>{doc?.name?.split(' ').pop() ?? m.doctorId}</span>
                    <span>{m.totalHours}h {m.weekendShifts}W {m.holidayShifts}PH</span>
                  </div>
                );
              })}
            </div>
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

const AnalyticsView: React.FC<{ report: any; doctors: User[] }> = ({ report, doctors }) => {
  if (!report) return <div className="py-20 text-center text-slate-400 text-xs font-bold uppercase tracking-widest">Generate Roster to view Fairness Data</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Transparency</h1>
        <p className="text-slate-500 text-xs font-medium mt-1">Full department audit trail. Everyone can see total hours and public holiday totals (plan).</p>
      </div>

      <Card>
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Workload Equity Index</h3>
          <Badge color="indigo">Target: &plusmn;1 Shift</Badge>
        </div>
        <div className="p-5 space-y-6">
          {report.metrics?.map((m: any) => {
            const doc = doctors.find(d => d.id === m.doctorId);
            const percentage = (m.totalHours / 120) * 100;
            return (
              <div key={m.doctorId} className="space-y-2">
                <div className="flex items-center justify-between text-xs font-black uppercase">
                  <span className="text-slate-700 tracking-tight">{doc?.name}</span>
                  <span className="text-slate-900">{m.totalHours}H</span>
                </div>
                <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                   <div 
                    className={`h-full transition-all duration-700 ${m.totalHours > 96 ? 'bg-amber-500' : 'bg-indigo-600'}`} 
                    style={{ width: `${Math.min(100, percentage)}%` }} 
                   />
                </div>
                <div className="flex gap-4 text-[9px] font-black text-slate-400 uppercase tracking-tighter">
                   <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 bg-rose-400 rounded-full" /> Weekends: {m.weekendShifts}</span>
                   <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 bg-indigo-400 rounded-full" /> Holidays: {m.holidayShifts}</span>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
          <h3 className="text-[10px] font-black uppercase tracking-widest">PH Priority Ledger</h3>
          <Info size={14} className="opacity-40" />
        </div>
        <p className="px-4 py-2 text-[10px] text-slate-500 font-bold bg-slate-50 border-b border-slate-100">
          Public holiday hours are tracked over the calendar year. Algorithm prefers assigning PH to those with fewer cumulative PH hours.
        </p>
        <table className="w-full text-left">
          <thead className="text-[9px] font-black text-slate-400 uppercase bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="px-5 py-3">Doctor</th>
              <th className="px-5 py-3">This Month PH</th>
              <th className="px-5 py-3">Total PH Hours (Year)</th>
              <th className="px-5 py-3 text-right">Queue</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {[...doctors]
              .sort((a, b) => (a.cumulativeHolidayHours ?? 0) - (b.cumulativeHolidayHours ?? 0))
              .map(doc => {
                const metric = report.metrics?.find((m: any) => m.doctorId === doc.id);
                const monthPHHours = metric?.holidayHours ?? (metric ? (metric.holidayShifts * 24) : 0); // use holidayHours when available
                return (
                  <tr key={doc.id} className="text-[11px] font-bold text-slate-700">
                    <td className="px-5 py-4">{doc.name}</td>
                    <td className="px-5 py-4 font-black">{metric?.holidayShifts ?? 0} shifts ({monthPHHours}h)</td>
                    <td className="px-5 py-4 font-black">{(doc.cumulativeHolidayHours ?? 0)}h</td>
                    <td className="px-5 py-4 text-right">
                      <Badge color={(doc.cumulativeHolidayHours ?? 0) === 0 ? 'green' : 'slate'}>
                        {(doc.cumulativeHolidayHours ?? 0) === 0 ? 'LOWEST' : 'TRACKED'}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </Card>

      <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 text-[10px] font-bold text-amber-800">
        <span className="font-black uppercase tracking-widest">Requests:</span> First-come, first-served. When conflicts arise, the doctor who requested first gets priority; admin approves or rejects to complete the roster.
      </div>
    </div>
  );
};

const TuningView: React.FC<{ report: any; doctors: User[] }> = ({ report, doctors }) => {
  const [hourLimit, setHourLimit] = useState<number>(24);
  const [weekendLimit, setWeekendLimit] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        setLoading(true);
        const settings = await api.getFairnessSettings();
        setHourLimit(settings.hourLimit);
        setWeekendLimit(settings.weekendLimit);
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
      await api.updateFairnessSettings(hourLimit, weekendLimit);
      setSaveMessage('Settings saved successfully!');
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (error: any) {
      setSaveMessage(`Failed to save: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (!report || !report.metrics) {
    return (
      <div className="py-20 text-center text-slate-400 text-xs font-bold uppercase tracking-widest">
        Generate a roster to see balance metrics.
      </div>
    );
  }

  const metrics: FairnessMetric[] = report.metrics;
  const hours = metrics.map(m => m.totalHours);
  const weekends = metrics.map(m => m.weekendShifts);
  const hourDiff = hours.length ? Math.max(...hours) - Math.min(...hours) : 0;
  const weekendDiff = weekends.length ? Math.max(...weekends) - Math.min(...weekends) : 0;

  const hourOk = hourDiff <= hourLimit;
  const weekendOk = weekendDiff <= weekendLimit;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Balance Tuning</h1>
        <p className="text-slate-500 text-xs font-medium mt-1">
          Configure fairness thresholds that control when warnings appear. The algorithm uses these to balance workloads.
        </p>
      </div>

      {/* How tracking works */}
      <Card className="p-5 bg-slate-50 border-slate-100">
        <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">How Hours & PH Are Tracked</h3>
        <ul className="space-y-2 text-[11px] text-slate-600 leading-relaxed">
          <li><strong>This month (above):</strong> Hours and PH hours come from the current roster. Each shift has a template (weekday 16h, weekend 24h). PH = public holiday; those hours are counted and shown as &quot;PH (Xh)&quot;.</li>
          <li><strong>Cumulative (year):</strong> When you <strong>publish</strong> a roster, each doctor&apos;s <code className="bg-white px-1 rounded">cumulative_total_hours</code>, <code className="bg-white px-1 rounded">cumulative_weekend_shifts</code>, and <code className="bg-white px-1 rounded">cumulative_holiday_hours</code> are updated in the database. That feeds fairness for future rosters and appears on Staff and Analytics.</li>
          <li><strong>If you see 0h for PH:</strong> Either this month&apos;s report now shows PH hours correctly (X PH (Yh)). Or &quot;Total PH Hours (Year)&quot; is 0 because the roster was published before this tracking existed — use <strong>Sync cumulative</strong> below to recompute from all published rosters.</li>
        </ul>
        <div className="mt-4">
          <Button
            variant="secondary"
            className="text-[10px]"
            onClick={async () => {
              try {
                const r = await api.syncCumulative();
                setSaveMessage(r.message || 'Cumulative stats synced.');
                setTimeout(() => setSaveMessage(null), 4000);
              } catch (e: any) {
                setSaveMessage(e.message || 'Sync failed');
              }
            }}
          >
            Sync cumulative from all published rosters
          </Button>
        </div>
      </Card>

      {/* Algorithm Overview Card */}
      <Card className="p-5 bg-indigo-50/50 border-indigo-100">
        <h3 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-3">How The Algorithm Works</h3>
        <div className="space-y-2 text-[11px] text-slate-600 leading-relaxed">
          <p><span className="font-bold text-slate-800">Cross-Month Fairness:</span> The system tracks cumulative hours and weekend shifts across all published rosters. If Dr. A worked extra last month, they'll be prioritized for fewer shifts this month.</p>
          <p><span className="font-bold text-slate-800">New Joiner Protection:</span> Doctors who recently joined aren't penalized for having fewer historical hours. The algorithm calculates their "expected" hours based on tenure and gradually integrates them.</p>
          <p><span className="font-bold text-slate-800">Weekend Priority:</span> On weekends, the algorithm first equalizes weekend shift counts before considering total hours, ensuring fair weekend distribution.</p>
          <p><span className="font-bold text-slate-800">Leave Respect:</span> Absolute leave requests are never violated. Soft preferences (unavailable) are respected when possible but may be overridden if no alternatives exist.</p>
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Threshold Settings</h3>
          <Button onClick={handleSave} variant="primary" className="px-3 h-8 text-[10px]" disabled={saving || loading}>
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
        {saveMessage && (
          <div className={`p-2 rounded-lg text-[10px] font-bold ${saveMessage.includes('success') ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
            {saveMessage}
          </div>
        )}
        {loading && (
          <div className="text-center py-4 text-slate-400 text-xs font-bold">Loading settings...</div>
        )}
        {!loading && (
          <div className="space-y-5">
            <div className="p-4 bg-slate-50 rounded-xl">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
                <span>Max Hour Difference</span>
                <span className="text-indigo-600">{hourLimit}h</span>
              </div>
              <input
                type="range"
                min={0}
                max={64}
                step={8}
                value={hourLimit}
                onChange={e => setHourLimit(Number(e.target.value))}
                className="w-full mt-2"
              />
              <div className="flex justify-between items-center mt-2">
                <p className={`text-[10px] font-bold ${hourOk ? 'text-emerald-600' : 'text-amber-600'}`}>
                  Current diff: {hourDiff}h — {hourOk ? 'Within limit' : 'Exceeds limit'}
                </p>
              </div>
              <div className="mt-3 p-3 bg-white rounded-lg border border-slate-100">
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  <span className="font-bold text-slate-700">What this means:</span> Maximum allowed difference in total monthly hours between any two doctors. A weekday shift is 16h, weekend is 24h. Setting this to 24h means at most one shift difference is acceptable.
                </p>
                <p className="text-[10px] text-slate-500 leading-relaxed mt-2">
                  <span className="font-bold text-slate-700">Lower value:</span> Stricter fairness — warnings appear sooner, useful for teams expecting near-perfect balance.
                </p>
                <p className="text-[10px] text-slate-500 leading-relaxed mt-1">
                  <span className="font-bold text-slate-700">Higher value:</span> More flexibility — allows natural variation due to leave requests or odd doctor counts. Recommended for teams with varying availability.
                </p>
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
                <span>Max Weekend Shift Difference</span>
                <span className="text-indigo-600">{weekendLimit}</span>
              </div>
              <input
                type="range"
                min={0}
                max={3}
                step={1}
                value={weekendLimit}
                onChange={e => setWeekendLimit(Number(e.target.value))}
                className="w-full mt-2"
              />
              <div className="flex justify-between items-center mt-2">
                <p className={`text-[10px] font-bold ${weekendOk ? 'text-emerald-600' : 'text-amber-600'}`}>
                  Current diff: {weekendDiff} — {weekendOk ? 'Within limit' : 'Exceeds limit'}
                </p>
              </div>
              <div className="mt-3 p-3 bg-white rounded-lg border border-slate-100">
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  <span className="font-bold text-slate-700">What this means:</span> Maximum allowed difference in weekend shift counts per month. Weekends are tracked separately because they're often more disruptive (24h shifts, family time).
                </p>
                <p className="text-[10px] text-slate-500 leading-relaxed mt-2">
                  <span className="font-bold text-slate-700">Value of 1:</span> Most strict — each doctor should have roughly the same weekend count (e.g., if 4 doctors and 8 weekends, expect ~2 each).
                </p>
                <p className="text-[10px] text-slate-500 leading-relaxed mt-1">
                  <span className="font-bold text-slate-700">Value of 2-3:</span> More relaxed — allows one doctor to have 1-2 more weekends if unavoidable due to leave requests.
                </p>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Edge Cases Card */}
      <Card className="p-5">
        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Edge Cases Handled</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[10px]">
          <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-100">
            <span className="font-bold text-emerald-700 block mb-1">New Joiners</span>
            <span className="text-emerald-600">Won't be overloaded to "catch up" — algorithm adjusts expectations based on start date.</span>
          </div>
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
            <span className="font-bold text-blue-700 block mb-1">Extended Leave</span>
            <span className="text-blue-600">Cumulative tracking means doctors returning from leave won't be overwhelmed.</span>
          </div>
          <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
            <span className="font-bold text-amber-700 block mb-1">All Unavailable</span>
            <span className="text-amber-600">If all doctors have soft unavailability, system relaxes constraints (but never hard leave).</span>
          </div>
          <div className="p-3 bg-purple-50 rounded-lg border border-purple-100">
            <span className="font-bold text-purple-700 block mb-1">Odd Numbers</span>
            <span className="text-purple-600">Uneven doctor counts or month lengths are handled gracefully with slight imbalance allowed.</span>
          </div>
        </div>
      </Card>

      <Card>
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Per Doctor Metrics</h3>
        </div>
        <div className="divide-y divide-slate-50">
          {metrics.map(m => {
            const doc = doctors.find(d => d.id === m.doctorId);
            return (
              <div key={m.doctorId} className="p-4 flex items-center justify-between text-xs">
                <div>
                  <div className="font-black text-slate-900">{doc?.name || m.doctorId}</div>
                  <div className="text-[10px] text-slate-500 font-bold mt-1">
                    {m.weekdayShifts} weekday • {m.weekendShifts} weekend • {m.holidayShifts} PH ({m.holidayHours ?? 0}h)
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-black text-slate-900">{m.totalHours}h total</div>
                  {(m.holidayHours ?? 0) > 0 && (
                    <div className="text-[10px] font-bold text-rose-600">{(m.holidayHours ?? 0)}h PH</div>
                  )}
                </div>
              </div>
            );
          })}
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
                  <option value={RequestType.UNAVAILABLE}>Partially Unavailable</option>
                  <option value={RequestType.LEAVE}>Full Leave (Absolute)</option>
                  <option value={RequestType.SWAP}>Shift Swap Request</option>
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
                       <Badge color={req.type === RequestType.LEAVE ? 'red' : 'indigo'}>{req.type}</Badge>
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
  isAdmin: boolean;
}> = ({ doctors, onAdd, onDelete, isAdmin }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [email, setEmail] = useState('');

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

      <p className="text-[10px] text-slate-500 font-bold">All doctors can see everyone&apos;s total hours and public holiday totals (plan: transparency).</p>

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
                <div className="flex gap-3 mt-2 text-[10px] font-bold text-slate-600">
                  <span>Total hours: <span className="text-slate-900">{(doc.cumulativeTotalHours ?? 0)}h</span></span>
                  <span>PH hours: <span className="text-slate-900">{(doc.cumulativeHolidayHours ?? 0)}h</span></span>
                  <span>Weekends: <span className="text-slate-900">{(doc.cumulativeWeekendShifts ?? 0)}</span></span>
                </div>
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
