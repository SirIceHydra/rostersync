import React, { useCallback, useEffect, useState } from 'react';
import { CreditCard, Building2, Loader2, CheckCircle2 } from 'lucide-react';
import { Card } from './Card';
import { Button } from './Button';
import { Role } from '../../types';
import type { User } from '../../types';
import { api } from '../api/client';
import { openPaystackCheckout } from '../lib/paystackCheckout';

type BillingPlan = {
  id: string;
  slug: string | null;
  planCode: string;
  name: string;
  description: string | null;
  amount: number;
  currency: string;
  interval: string;
  displayOrder: number;
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

function intervalLabel(interval: string): string {
  const labels: Record<string, string> = {
    monthly: 'Monthly',
    biannually: 'Every 6 months',
    annually: 'Annual',
  };
  return labels[interval] ?? formatInterval(interval);
}

export const SubscriptionView: React.FC<{
  currentUser: User;
  departmentName?: string;
}> = ({ currentUser, departmentName }) => {
  const isAdmin = currentUser.role === Role.ADMIN;
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [selectedPlanCode, setSelectedPlanCode] = useState<string | null>(null);
  const [plansLoading, setPlansLoading] = useState(isAdmin);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState(false);

  const loadPlans = useCallback(async () => {
    if (!isAdmin) return;
    setPlansLoading(true);
    setPlansError(null);
    try {
      const { plans: list } = await api.getBillingPlans();
      setPlans(list);
      setSelectedPlanCode((prev) => {
        if (prev && list.some((p) => p.planCode === prev)) return prev;
        return list[0]?.planCode ?? null;
      });
    } catch (e: unknown) {
      setPlans([]);
      setPlansError(e instanceof Error ? e.message : 'Could not load plans');
    } finally {
      setPlansLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  const selectedPlan = plans.find((p) => p.planCode === selectedPlanCode) ?? null;

  const handleSubscribe = async () => {
    if (!selectedPlanCode) return;
    setCheckoutError(null);
    setCheckoutLoading(true);
    try {
      const { accessCode } = await api.initializeSubscription(selectedPlanCode);
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
          {plansLoading && (
            <div className="flex items-center justify-center gap-2 py-8 text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin text-indigo-600" aria-hidden />
              <span className="text-xs font-bold">Loading plans…</span>
            </div>
          )}

          {!plansLoading && plansError && (
            <div className="rs-alert rs-alert--danger" role="alert">
              <div className="rs-alert-body text-sm font-semibold">{plansError}</div>
              <Button variant="secondary" className="mt-3" onClick={() => void loadPlans()}>
                Try again
              </Button>
            </div>
          )}

          {!plansLoading && !plansError && plans.length > 0 && (
            <>
              <div>
                <p className="text-xs font-semibold text-slate-500 leading-relaxed">
                  Choose a billing term for your department. All doctors in this department use RosterSync at no extra cost.
                </p>
                <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase tracking-widest">
                  Billed to {currentUser.email}
                </p>
              </div>

              <div className="space-y-2" role="radiogroup" aria-label="Subscription plan">
                {plans.map((plan) => {
                  const selected = plan.planCode === selectedPlanCode;
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setSelectedPlanCode(plan.planCode)}
                      className={`w-full text-left rounded-2xl border p-4 transition-colors touch-manipulation ${
                        selected
                          ? 'border-indigo-300 bg-indigo-50 ring-1 ring-indigo-200'
                          : 'border-slate-200 bg-white hover:border-slate-300 active:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-black text-slate-900">{plan.name}</p>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mt-0.5">
                            {intervalLabel(plan.interval)}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-black text-indigo-700">
                            {formatPlanAmount(plan.amount, plan.currency)}
                          </p>
                          <p className="text-[10px] font-semibold text-slate-500">
                            per {formatInterval(plan.interval)}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
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
                  {selectedPlan && (
                    <p className="text-xs font-semibold text-slate-500 leading-relaxed">
                      You&apos;ll pay {formatPlanAmount(selectedPlan.amount, selectedPlan.currency)} per{' '}
                      {formatInterval(selectedPlan.interval)} via Paystack.
                    </p>
                  )}
                  {checkoutError && (
                    <div className="rs-alert rs-alert--danger" role="alert">
                      <div className="rs-alert-body text-sm font-semibold">{checkoutError}</div>
                    </div>
                  )}
                  <Button
                    variant="primary"
                    className="w-full py-3.5"
                    disabled={checkoutLoading || !selectedPlanCode}
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

          {!plansLoading && !plansError && plans.length === 0 && (
            <p className="text-xs font-semibold text-slate-500 text-center py-4">No subscription plans available.</p>
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
