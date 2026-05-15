import React, { useCallback, useEffect, useState } from 'react';
import { CreditCard, Building2, Loader2, CheckCircle2 } from 'lucide-react';
import { Card } from './Card';
import { Button } from './Button';
import { Role } from '../../types';
import type { User } from '../../types';
import { api } from '../api/client';
import { openPaystackCheckout } from '../lib/paystackCheckout';

type BillingPlan = {
  planCode: string;
  name: string;
  amount: number;
  currency: string;
  interval: string;
};

function formatPlanAmount(amount: number, currency: string): string {
  const major = amount / 100;
  try {
    return new Intl.NumberFormat('en-ZA', { style: 'currency', currency }).format(major);
  } catch {
    return `${currency} ${major.toFixed(2)}`;
  }
}

function formatInterval(interval: string): string {
  const map: Record<string, string> = {
    hourly: 'hour',
    daily: 'day',
    weekly: 'week',
    monthly: 'month',
    quarterly: 'quarter',
    biannually: '6 months',
    annually: 'year',
  };
  return map[interval] ?? interval;
}

export const SubscriptionView: React.FC<{
  currentUser: User;
  departmentName?: string;
}> = ({ currentUser, departmentName }) => {
  const isAdmin = currentUser.role === Role.ADMIN;
  const [plan, setPlan] = useState<BillingPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(isAdmin);
  const [planError, setPlanError] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState(false);

  const loadPlan = useCallback(async () => {
    if (!isAdmin) return;
    setPlanLoading(true);
    setPlanError(null);
    try {
      const data = await api.getBillingPlan();
      setPlan(data);
    } catch (e: unknown) {
      setPlan(null);
      setPlanError(e instanceof Error ? e.message : 'Could not load plan');
    } finally {
      setPlanLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void loadPlan();
  }, [loadPlan]);

  const handleSubscribe = async () => {
    setCheckoutError(null);
    setCheckoutLoading(true);
    try {
      const { accessCode } = await api.initializeSubscription();
      openPaystackCheckout({
        accessCode,
        onSuccess: () => {
          setSubscribed(true);
          setCheckoutLoading(false);
        },
        onCancel: () => setCheckoutLoading(false),
      });
    } catch (e: unknown) {
      setCheckoutError(e instanceof Error ? e.message : 'Could not start checkout');
      setCheckoutLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="rs-h2 text-slate-900 tracking-tight">Subscription</h2>
        <p className="text-xs font-bold text-slate-500 mt-1 uppercase tracking-wider">
          {departmentName ? `${departmentName} · ` : ''}
          {isAdmin ? 'Department billing' : 'Your department plan'}
        </p>
      </div>

      {isAdmin ? (
        <Card className="p-6 space-y-5">
          {planLoading && (
            <div className="flex items-center justify-center gap-2 py-8 text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin text-indigo-600" aria-hidden />
              <span className="text-xs font-bold">Loading plan…</span>
            </div>
          )}

          {!planLoading && planError && (
            <div className="rs-alert rs-alert--danger" role="alert">
              <div className="rs-alert-body text-sm font-semibold">{planError}</div>
              <Button variant="secondary" className="mt-3" onClick={() => void loadPlan()}>
                Try again
              </Button>
            </div>
          )}

          {!planLoading && !planError && plan && (
            <>
              <div className="flex items-start gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                  <CreditCard size={24} strokeWidth={2} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-slate-900">{plan.name}</p>
                  <p className="text-xs font-semibold text-slate-500 mt-1">
                    {formatPlanAmount(plan.amount, plan.currency)} per {formatInterval(plan.interval)}
                  </p>
                  <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase tracking-widest">
                    Billed to {currentUser.email}
                  </p>
                </div>
              </div>

              {subscribed ? (
                <div className="rs-alert rs-alert--success flex items-start gap-2" role="status">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" aria-hidden />
                  <div className="rs-alert-body text-sm font-semibold">
                    Payment received. Your department subscription should activate shortly once Paystack confirms it.
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-xs font-semibold text-slate-500 leading-relaxed">
                    Subscribe this department to RosterSync. You&apos;ll complete payment securely in Paystack, then billing renews each{' '}
                    {formatInterval(plan.interval)}.
                  </p>
                  {checkoutError && (
                    <div className="rs-alert rs-alert--danger" role="alert">
                      <div className="rs-alert-body text-sm font-semibold">{checkoutError}</div>
                    </div>
                  )}
                  <Button
                    variant="primary"
                    className="w-full py-3.5"
                    disabled={checkoutLoading}
                    onClick={() => void handleSubscribe()}
                  >
                    {checkoutLoading ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                        Opening checkout…
                      </span>
                    ) : (
                      'Subscribe now'
                    )}
                  </Button>
                </>
              )}
            </>
          )}
        </Card>
      ) : (
        <Card className="p-6">
          <div className="flex flex-col items-center text-center gap-4 py-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
              <CreditCard size={28} strokeWidth={2} aria-hidden />
            </span>
            <div>
              <p className="text-sm font-black text-slate-800">Managed by your admin</p>
              <p className="text-xs font-semibold text-slate-500 mt-2 max-w-sm leading-relaxed">
                Subscription and billing are set up by your department admin. Contact them if you have questions about your plan.
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500">
              <Building2 size={12} aria-hidden />
              Admin only
            </span>
          </div>
        </Card>
      )}
    </div>
  );
};
