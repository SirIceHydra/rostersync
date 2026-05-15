import React, { useCallback, useEffect, useState } from 'react';
import { CreditCard, Building2, Loader2, CheckCircle2 } from 'lucide-react';
import { Card } from './Card';
import { Button } from './Button';
import { Badge } from './Badge';
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

type BillingStatus = {
  hasSubscription: boolean;
  isEntitled: boolean;
  subscription: {
    id: string;
    status: string;
    planCode: string;
    planName: string;
    billingInterval: string;
    currentPeriodEnd: number | null;
    nextPaymentAt: number | null;
    paystackSubscriptionCode: string | null;
  } | null;
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

function formatDate(ms: number | null): string | null {
  if (!ms) return null;
  return new Date(ms).toLocaleDateString('en-ZA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    ACTIVE: 'Active',
    NON_RENEWING: 'Active until renewal ends',
    ATTENTION: 'Payment attention needed',
    PAST_DUE: 'Past due',
    PENDING: 'Checkout pending',
    CANCELLED: 'Cancelled',
    COMPLETED: 'Completed',
    INCOMPLETE: 'Incomplete',
  };
  return map[status] ?? status;
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
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [confirmSuccess, setConfirmSuccess] = useState(false);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const status = await api.getBillingStatus();
      setBillingStatus(status);
    } catch {
      setBillingStatus(null);
    } finally {
      setStatusLoading(false);
    }
  }, []);

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
    void loadStatus();
    void loadPlans();
  }, [loadStatus, loadPlans]);

  const selectedPlan = plans.find((p) => p.planCode === selectedPlanCode) ?? null;
  const isEntitled = billingStatus?.isEntitled ?? false;
  const activeSub = billingStatus?.subscription ?? null;
  const showCheckout = isAdmin && !isEntitled;

  const handleSubscribe = async () => {
    if (!selectedPlanCode) return;
    setCheckoutError(null);
    setConfirmSuccess(false);
    setCheckoutLoading(true);
    try {
      const init = await api.initializeSubscription(selectedPlanCode);
      setCheckoutLoading(false);
      openPaystackCheckout({
        accessCode: init.accessCode,
        onSuccess: async (transaction) => {
          setCheckoutLoading(true);
          try {
            const ref = transaction.reference ?? init.reference;
            await api.confirmSubscription(ref);
            setConfirmSuccess(true);
            await loadStatus();
          } catch (e: unknown) {
            setCheckoutError(e instanceof Error ? e.message : 'Payment succeeded but confirmation failed');
          } finally {
            setCheckoutLoading(false);
          }
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

      {statusLoading && (
        <Card className="p-6">
          <div className="flex items-center justify-center gap-2 py-4 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin text-indigo-600" aria-hidden />
            <span className="text-xs font-bold">Checking subscription…</span>
          </div>
        </Card>
      )}

      {!statusLoading && isEntitled && activeSub && (
        <Card className="p-6 space-y-3 border-emerald-100 bg-emerald-50/40">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-6 h-6 shrink-0 text-emerald-600" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-slate-900">{activeSub.planName}</p>
              <p className="text-xs font-semibold text-slate-600 mt-1">
                {intervalLabel(activeSub.billingInterval)} plan · {statusLabel(activeSub.status)}
              </p>
              {formatDate(activeSub.nextPaymentAt) && (
                <p className="text-[10px] font-bold text-slate-500 mt-2 uppercase tracking-widest">
                  Next payment {formatDate(activeSub.nextPaymentAt)}
                </p>
              )}
              <div className="mt-3">
                <Badge color="green">Department active</Badge>
              </div>
              {!isAdmin && (
                <p className="text-xs font-semibold text-slate-500 mt-3 leading-relaxed">
                  Your admin has subscribed this department. You can use RosterSync at no extra cost.
                </p>
              )}
            </div>
          </div>
        </Card>
      )}

      {isAdmin ? (
        <Card className="p-6 space-y-5">
          {isEntitled && (
            <p className="text-xs font-semibold text-slate-500 leading-relaxed">
              To change billing term, choose a new plan below. Completing checkout will replace the current subscription.
            </p>
          )}

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

          {!plansLoading && !plansError && plans.length > 0 && showCheckout && (
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

              {confirmSuccess && (
                <div className="rs-alert rs-alert--success flex items-start gap-2" role="status">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" aria-hidden />
                  <div className="rs-alert-body text-sm font-semibold">
                    Subscription saved. Your department is now active on RosterSync.
                  </div>
                </div>
              )}

              {!confirmSuccess && (
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
                        Processing…
                      </span>
                    ) : (
                      'Subscribe now'
                    )}
                  </Button>
                </>
              )}
            </>
          )}

          {!plansLoading && !plansError && plans.length > 0 && isEntitled && !showCheckout && (
            <div className="space-y-2" role="radiogroup" aria-label="Subscription plan">
              {plans.map((plan) => {
                const isCurrent = plan.planCode === activeSub?.planCode;
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
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-black text-slate-900">{plan.name}</p>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mt-0.5">
                          {intervalLabel(plan.interval)}
                          {isCurrent ? ' · Current' : ''}
                        </p>
                      </div>
                      <p className="text-sm font-black text-indigo-700 shrink-0">
                        {formatPlanAmount(plan.amount, plan.currency)}
                      </p>
                    </div>
                  </button>
                );
              })}
              {selectedPlan && selectedPlan.planCode !== activeSub?.planCode && (
                <>
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
                    {checkoutLoading ? 'Processing…' : 'Switch to this plan'}
                  </Button>
                </>
              )}
            </div>
          )}

          {!plansLoading && !plansError && plans.length === 0 && (
            <p className="text-xs font-semibold text-slate-500 text-center py-4">No subscription plans available.</p>
          )}
        </Card>
      ) : (
        !statusLoading &&
        !isEntitled && (
          <Card className="p-6">
            <div className="flex flex-col items-center text-center gap-4 py-4">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                <CreditCard size={28} strokeWidth={2} aria-hidden />
              </span>
              <div>
                <p className="text-sm font-black text-slate-800">No active subscription</p>
                <p className="text-xs font-semibold text-slate-500 mt-2 max-w-sm leading-relaxed">
                  Your department admin needs to subscribe before everyone can use RosterSync.
                </p>
              </div>
            </div>
          </Card>
        )
      )}

      {!isAdmin && !statusLoading && isEntitled && (
        <Card className="p-6">
          <div className="flex flex-col items-center text-center gap-4 py-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500">
              <Building2 size={12} aria-hidden />
              Included with your department
            </span>
          </div>
        </Card>
      )}
    </div>
  );
};
