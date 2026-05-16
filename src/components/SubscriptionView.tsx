import React, { useCallback, useEffect, useState } from 'react';
import { CreditCard, Building2, Loader2, CheckCircle2, ExternalLink } from 'lucide-react';
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

type BillingStatus = Awaited<ReturnType<typeof api.getBillingStatus>>;

function formatPlanAmount(amountCents: number, currency: string): string {
  const major = amountCents / 100;
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

function toEpochMs(value: number | string | null | undefined): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function formatBillingDate(value: number | string | null | undefined): string | null {
  const ms = toEpochMs(value);
  if (ms == null) return null;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-ZA', {
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

function formatCardLabel(pm: NonNullable<NonNullable<BillingStatus['subscription']>['paymentMethod']>): string {
  const brand = pm.brand.charAt(0).toUpperCase() + pm.brand.slice(1).toLowerCase();
  const exp =
    pm.expMonth && pm.expYear ? ` · Exp ${pm.expMonth.padStart(2, '0')}/${pm.expYear.slice(-2)}` : '';
  const bank = pm.bank ? ` · ${pm.bank}` : '';
  return `${brand} •••• ${pm.last4}${exp}${bank}`;
}

export const SubscriptionView: React.FC<{
  currentUser: User;
  departmentName?: string;
}> = ({ currentUser, departmentName }) => {
  const isAdmin = currentUser.role === Role.ADMIN;
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [selectedPlanCode, setSelectedPlanCode] = useState<string | null>(null);
  const [plansLoading, setPlansLoading] = useState(false);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [manageLoading, setManageLoading] = useState(false);
  const [manageError, setManageError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const status = await api.getBillingStatus();
      setBillingStatus(status);
      return status;
    } catch {
      setBillingStatus(null);
      return null;
    } finally {
      setStatusLoading(false);
    }
  }, []);

  const loadPlans = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    void (async () => {
      const status = await loadStatus();
      if (isAdmin && !status?.isEntitled) {
        await loadPlans();
      }
    })();
  }, [loadStatus, loadPlans, isAdmin]);

  const selectedPlan = plans.find((p) => p.planCode === selectedPlanCode) ?? null;
  const isEntitled = billingStatus?.isEntitled ?? false;
  const activeSub = billingStatus?.subscription ?? null;

  const handleSubscribe = async () => {
    if (!selectedPlanCode) return;
    setCheckoutError(null);
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

  const handleManageSubscription = async () => {
    setManageError(null);
    setManageLoading(true);
    try {
      const { link } = await api.getSubscriptionManageLink();
      window.open(link, '_blank', 'noopener,noreferrer');
    } catch (e: unknown) {
      setManageError(e instanceof Error ? e.message : 'Could not open subscription management');
    } finally {
      setManageLoading(false);
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
            <span className="text-xs font-bold">Loading subscription…</span>
          </div>
        </Card>
      )}

      {!statusLoading && isEntitled && activeSub && (
        <Card className="p-6 space-y-5 border-emerald-100 bg-gradient-to-b from-emerald-50/50 to-white">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-6 h-6 shrink-0 text-emerald-600" aria-hidden />
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-black text-slate-900">{activeSub.planName}</p>
              <p className="text-xs font-semibold text-slate-600">
                {intervalLabel(activeSub.billingInterval)} ·{' '}
                {formatPlanAmount(activeSub.amountCents, activeSub.currency)} per{' '}
                {formatInterval(activeSub.billingInterval)}
              </p>
              <div className="pt-1">
                <Badge color="green">{statusLabel(activeSub.status)}</Badge>
              </div>
            </div>
          </div>

                    {formatBillingDate(activeSub.nextPaymentAt) && (
            <dl className="text-xs">
              <dt className="font-bold uppercase tracking-widest text-slate-400 text-[10px]">Next billing date</dt>
              <dd className="font-semibold text-slate-800 mt-0.5">{formatBillingDate(activeSub.nextPaymentAt)}</dd>
            </dl>
          )}

          {isAdmin && activeSub.paymentMethod && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Payment method</p>
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                  <CreditCard size={20} aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-black text-slate-900">{formatCardLabel(activeSub.paymentMethod)}</p>
                  <p className="text-[10px] font-semibold text-slate-500 mt-0.5">Charged via Paystack</p>
                </div>
              </div>
            </div>
          )}

          {isAdmin && !activeSub.paymentMethod && (
            <p className="text-xs font-semibold text-slate-500">
              Card details will appear here after Paystack syncs your subscription.
            </p>
          )}

          {!isAdmin && (
            <p className="text-xs font-semibold text-slate-500 leading-relaxed">
              Your department admin manages billing. You can use RosterSync at no extra cost.
            </p>
          )}

          {isAdmin && (
            <div className="space-y-2 pt-1">
              {manageError && (
                <div className="rs-alert rs-alert--danger" role="alert">
                  <div className="rs-alert-body text-sm font-semibold">{manageError}</div>
                </div>
              )}
              <Button
                variant="secondary"
                className="w-full py-3.5"
                disabled={manageLoading}
                onClick={() => void handleManageSubscription()}
              >
                {manageLoading ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                    Opening…
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2">
                    Manage subscription
                    <ExternalLink size={16} aria-hidden />
                  </span>
                )}
              </Button>
              <p className="text-[10px] font-semibold text-slate-400 text-center leading-relaxed">
                Update your card, view invoices, or cancel on Paystack&apos;s secure page.
              </p>
            </div>
          )}

          {!isAdmin && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500">
              <Building2 size={12} aria-hidden />
              Included with your department
            </span>
          )}
        </Card>
      )}

      {!statusLoading && isAdmin && !isEntitled && (
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

          {!plansLoading && !plansError && plans.length === 0 && (
            <p className="text-xs font-semibold text-slate-500 text-center py-4">No subscription plans available.</p>
          )}
        </Card>
      )}

      {!statusLoading && !isAdmin && !isEntitled && (
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
      )}
    </div>
  );
};
