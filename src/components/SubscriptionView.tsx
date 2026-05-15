import React from 'react';
import { CreditCard, Building2 } from 'lucide-react';
import { Card } from './Card';
import { Role } from '../../types';
import type { User } from '../../types';

export const SubscriptionView: React.FC<{
  currentUser: User;
  departmentName?: string;
}> = ({ currentUser, departmentName }) => {
  const isAdmin = currentUser.role === Role.ADMIN;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="rs-h2 text-slate-900 tracking-tight">Subscription</h2>
        <p className="text-xs font-bold text-slate-500 mt-1 uppercase tracking-wider">
          {departmentName ? `${departmentName} · ` : ''}
          {isAdmin ? 'Department billing' : 'Your department plan'}
        </p>
      </div>

      <Card className="p-6">
        <div className="flex flex-col items-center text-center gap-4 py-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
            <CreditCard size={28} strokeWidth={2} aria-hidden />
          </span>
          <div>
            <p className="text-sm font-black text-slate-800">Billing coming soon</p>
            <p className="text-xs font-semibold text-slate-500 mt-2 max-w-sm leading-relaxed">
              {isAdmin
                ? 'Manage your department subscription, invoices, and payment method here once billing is enabled.'
                : 'Subscription and billing are managed by your department admin. Contact them if you have questions about your plan.'}
            </p>
          </div>
          {isAdmin && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500">
              <Building2 size={12} aria-hidden />
              Admin only
            </span>
          )}
        </div>
      </Card>
    </div>
  );
};