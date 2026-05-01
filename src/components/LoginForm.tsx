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
    <div className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden" style={{background: 'linear-gradient(160deg, #FAF8F6 0%, #FFF3E8 50%, #FAF8F6 100%)'}}>
      {/* Decorative blobs */}
      <div className="hs-blob w-40 h-40 -top-10 -right-10" style={{background: '#F47C20', animationDelay: '0s'}} />
      <div className="hs-blob w-28 h-28 bottom-20 -left-8" style={{background: '#4A90D9', animationDelay: '2s'}} />
      <div className="hs-blob w-20 h-20 top-1/3 -left-6" style={{background: '#F5C842', animationDelay: '4s'}} />
      <div className="hs-blob w-16 h-16 bottom-32 right-4" style={{background: '#8B6BF5', animationDelay: '1s'}} />

      <div className="w-full max-w-md space-y-8 relative z-10">
        <div className="text-center">
          <div className="w-20 h-20 mx-auto flex items-center justify-center mb-6 relative">
            <div className="absolute inset-0 rounded-full opacity-20" style={{background: '#F47C20', transform: 'scale(1.3)'}} />
            <div className="w-20 h-20 rounded-full flex items-center justify-center shadow-lg" style={{background: '#F47C20'}}>
              <ShieldCheck className="text-white" size={36} />
            </div>
          </div>
          <h1 className="text-4xl font-black tracking-tight" style={{color: '#1A1410'}}>RosterSync</h1>
          <p className="font-bold mt-2 text-xs" style={{color: '#A09488', letterSpacing: '0.12em'}}>
            Dept. Roster Management
          </p>
        </div>

        <Card className="p-6">
          <div className="flex gap-2 mb-6 p-1 rounded-2xl" style={{background: '#F0EDE9'}}>
            <button
              onClick={() => setIsLogin(true)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-extrabold transition-all ${
                isLogin ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'
              }`}
            >
              Login
            </button>
            <button
              onClick={() => setIsLogin(false)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-extrabold transition-all ${
                !isLogin ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'
              }`}
            >
              Register
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-sm text-rose-700 font-bold">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">
                    Full Name
                  </label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 text-sm font-bold outline-none"
                      placeholder="Dr. John Smith"
                      required={!isLogin}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">
                    Role
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as Role)}
                    className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 text-sm font-bold outline-none"
                  >
                    <option value={Role.DOCTOR}>Doctor</option>
                    <option value={Role.ADMIN}>Admin (Medical Officer)</option>
                  </select>
                </div>

                {role === Role.ADMIN && (
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">
                      Department name (optional)
                    </label>
                    <div className="relative">
                      <Building className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                      <input
                        type="text"
                        value={departmentName}
                        onChange={(e) => setDepartmentName(e.target.value)}
                        className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 text-sm font-bold outline-none"
                        placeholder="e.g. Emergency Medicine"
                      />
                    </div>
                    <p className="text-[9px] text-slate-400 mt-1.5 font-semibold">A unique code will be generated for your department; share it so doctors can join.</p>
                  </div>
                )}

                {role === Role.DOCTOR && (
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">
                      Firm/Team (Optional)
                    </label>
                    <div className="relative">
                      <Building className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                      <input
                        type="text"
                        value={firm}
                        onChange={(e) => setFirm(e.target.value)}
                        className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 text-sm font-bold outline-none"
                        placeholder="Team Red"
                      />
                    </div>
                  </div>
                )}
              </>
            )}

            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 text-sm font-bold outline-none"
                  placeholder="doctor@med.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 text-sm font-bold outline-none"
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              className="w-full py-4 text-base"
              disabled={loading}
            >
              {loading ? 'Please wait…' : isLogin ? 'Login' : 'Create Account'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
};
