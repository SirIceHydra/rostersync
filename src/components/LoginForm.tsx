import React, { useState } from 'react';
import { ShieldCheck, Mail, Lock, User, Building } from 'lucide-react';
import { Button } from './Button';
import { Card } from './Card';
import { Role } from '../../types';

interface LoginFormProps {
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (data: { email: string; password: string; name: string; role: string; firm?: string; departmentName?: string }) => Promise<void>;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onLogin, onRegister }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>(Role.DOCTOR);
  const [firm, setFirm] = useState('');
  const [departmentName, setDepartmentName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        await onLogin(email, password);
      } else {
        if (!name || !email || !password) {
          setError('Please fill in all required fields');
          return;
        }
        await onRegister({ email, password, name, role, firm: firm || undefined, departmentName: role === Role.ADMIN ? (departmentName || undefined) : undefined });
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl mx-auto flex items-center justify-center shadow-xl shadow-indigo-100 mb-6">
            <ShieldCheck className="text-white" size={32} />
          </div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">RosterSync</h1>
          <p className="text-slate-500 font-medium mt-2 tracking-tight uppercase text-[10px] font-bold">
            Dept. Roster Management MVP
          </p>
        </div>

        <Card className="p-6">
          <div className="flex gap-2 mb-6 bg-slate-100 rounded-xl p-1">
            <button
              onClick={() => setIsLogin(true)}
              className={`flex-1 py-2 rounded-lg text-sm font-black transition-all ${
                isLogin ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'
              }`}
            >
              Login
            </button>
            <button
              onClick={() => setIsLogin(false)}
              className={`flex-1 py-2 rounded-lg text-sm font-black transition-all ${
                !isLogin ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'
              }`}
            >
              Register
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700 font-bold">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">
                    Full Name
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none ring-indigo-500 focus:ring-2"
                      placeholder="Dr. John Smith"
                      required={!isLogin}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">
                    Role
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as Role)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none ring-indigo-500 focus:ring-2"
                  >
                    <option value={Role.DOCTOR}>Doctor</option>
                    <option value={Role.ADMIN}>Admin (Medical Officer)</option>
                  </select>
                </div>

                {role === Role.ADMIN && (
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">
                      Department name (optional)
                    </label>
                    <div className="relative">
                      <Building className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input
                        type="text"
                        value={departmentName}
                        onChange={(e) => setDepartmentName(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none ring-indigo-500 focus:ring-2"
                        placeholder="e.g. Emergency Medicine"
                      />
                    </div>
                    <p className="text-[9px] text-slate-400 mt-1">A unique code will be generated for your department; share it so doctors can join.</p>
                  </div>
                )}

                {role === Role.DOCTOR && (
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">
                      Firm/Team (Optional)
                    </label>
                    <div className="relative">
                      <Building className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input
                        type="text"
                        value={firm}
                        onChange={(e) => setFirm(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none ring-indigo-500 focus:ring-2"
                        placeholder="Team Red"
                      />
                    </div>
                  </div>
                )}
              </>
            )}

            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none ring-indigo-500 focus:ring-2"
                  placeholder="doctor@med.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none ring-indigo-500 focus:ring-2"
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              className="w-full py-4"
              disabled={loading}
            >
              {loading ? 'Please wait...' : isLogin ? 'Login' : 'Create Account'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
};
