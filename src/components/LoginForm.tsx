import React, { useState } from 'react';
import { Mail, Lock, User, Building } from 'lucide-react';
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
        await onRegister({
          email,
          password,
          name,
          role,
          firm: firm || undefined,
          departmentName: role === Role.ADMIN ? departmentName || undefined : undefined,
        });
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden bg-slate-50">
      <div className="hs-blob w-40 h-40 -top-10 -right-10 bg-indigo-100 opacity-50" style={{ animationDelay: '0s' }} />
      <div className="hs-blob w-32 h-32 bottom-16 -left-10 bg-amber-100 opacity-40" style={{ animationDelay: '2.5s' }} />

      <div className="w-full max-w-md space-y-8 relative z-10">
        <div className="text-center">
          <div className="mx-auto mb-6 flex justify-center">
            <img
              src="/rostersync-lockup-color.svg"
              alt="RosterSync"
              width={400}
              height={88}
              className="h-14 sm:h-16 w-auto max-w-[min(100%,320px)] object-contain"
            />
          </div>
          <p className="rs-overline text-slate-500">Dept. roster management</p>
        </div>

        <Card className="p-6">
          <div className="flex w-full gap-1 p-1 mb-6 rounded-[var(--rs-r-lg)] bg-slate-100" role="tablist" aria-label="Auth mode">
            <button
              type="button"
              role="tab"
              aria-selected={isLogin}
              onClick={() => setIsLogin(true)}
              className={`flex-1 min-h-11 rounded-[var(--rs-r-md)] px-4 text-sm font-semibold transition-shadow ${
                isLogin ? 'bg-white text-slate-900 shadow-[var(--rs-shadow-xs)]' : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              Login
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={!isLogin}
              onClick={() => setIsLogin(false)}
              className={`flex-1 min-h-11 rounded-[var(--rs-r-md)] px-4 text-sm font-semibold transition-shadow ${
                !isLogin ? 'bg-white text-slate-900 shadow-[var(--rs-shadow-xs)]' : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              Register
            </button>
          </div>

          {error && (
            <div className="rs-alert rs-alert--danger mb-4" role="alert">
              <div className="rs-alert-body text-sm font-semibold">{error}</div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <>
                <div className="rs-field">
                  <label className="rs-label uppercase tracking-widest text-[10px] text-slate-500" htmlFor="reg-name">
                    Full name
                  </label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} strokeWidth={2} />
                    <input
                      id="reg-name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="rs-input rs-input--leading-icon font-medium"
                      placeholder="Dr. John Smith"
                      required={!isLogin}
                    />
                  </div>
                </div>

                <div className="rs-field">
                  <label className="rs-label uppercase tracking-widest text-[10px] text-slate-500" htmlFor="reg-role">
                    Role
                  </label>
                  <select
                    id="reg-role"
                    value={role}
                    onChange={(e) => setRole(e.target.value as Role)}
                    className="rs-select font-medium"
                  >
                    <option value={Role.DOCTOR}>Doctor</option>
                    <option value={Role.ADMIN}>Admin (Medical Officer)</option>
                  </select>
                </div>

                {role === Role.ADMIN && (
                  <div className="rs-field">
                    <label className="rs-label uppercase tracking-widest text-[10px] text-slate-500" htmlFor="reg-dept">
                      Department name (optional)
                    </label>
                    <div className="relative">
                      <Building className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} strokeWidth={2} />
                      <input
                        id="reg-dept"
                        type="text"
                        value={departmentName}
                        onChange={(e) => setDepartmentName(e.target.value)}
                        className="rs-input rs-input--leading-icon font-medium"
                        placeholder="e.g. Emergency Medicine"
                      />
                    </div>
                    <p className="rs-caption mt-1">A unique code will be generated for your department; share it so doctors can join.</p>
                  </div>
                )}

                {role === Role.DOCTOR && (
                  <div className="rs-field">
                    <label className="rs-label uppercase tracking-widest text-[10px] text-slate-500" htmlFor="reg-firm">
                      Firm / team (optional)
                    </label>
                    <div className="relative">
                      <Building className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} strokeWidth={2} />
                      <input
                        id="reg-firm"
                        type="text"
                        value={firm}
                        onChange={(e) => setFirm(e.target.value)}
                        className="rs-input rs-input--leading-icon font-medium"
                        placeholder="Team Red"
                      />
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="rs-field">
              <label className="rs-label uppercase tracking-widest text-[10px] text-slate-500" htmlFor="login-email">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} strokeWidth={2} />
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="rs-input rs-input--leading-icon font-medium"
                  placeholder="doctor@med.com"
                  required
                />
              </div>
            </div>

            <div className="rs-field">
              <label className="rs-label uppercase tracking-widest text-[10px] text-slate-500" htmlFor="login-password">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} strokeWidth={2} />
                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="rs-input rs-input--leading-icon font-medium"
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
              </div>
            </div>

            <Button type="submit" variant="primary" className="w-full !min-h-[52px] text-base" disabled={loading}>
              {loading ? 'Please wait…' : isLogin ? 'Login' : 'Create account'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
};
