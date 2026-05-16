import React, { useCallback, useEffect, useState } from 'react';
import { CreditCard, Building2, Loader2, CheckCircle2, ExternalLink, Check, RefreshCw, AlertCircle } from 'lucide-react';
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

type SubRow = NonNullable<BillingStatus['subscription']>;

type StatusDisplay = {
  badge: string;
  badgeColor: 'green' | 'yellow' | 'red' | 'slate';
  hint: string;
  dateLabel: string | null;
  dateValue: string | null;
  icon: 'active' | 'ending' | 'warning';
};

function trialMonthsLabel(months: number): string {
  if (months === 1) return '1 month';
  return `${months} months`;
}

function getSubscriptionStatusDisplay(sub: SubRow): StatusDisplay {
  const accessEndMs = sub.currentPeriodEnd ?? sub.nextPaymentAt;
  const accessEnd = formatBillingDate(accessEndMs);
  const nextBill = formatBillingDate(sub.nextPaymentAt);
  const trialEnd = formatBillingDate(sub.trialEndsAt);

  if (sub.isTrialing) {
    return {
      badge: trialEnd ? `Free trial until ${trialEnd}` : 'Free trial',
      badgeColor: 'green',
      hint: 'Your card is on file — billing starts automatically when the trial ends.',
      dateLabel: 'First billing date',
      dateValue: trialEnd ?? nextBill,
      icon: 'active',
    };
  }

  switch (sub.status) {
    case 'ACTIVE':
      return {
        badge: 'Active',
        badgeColor: 'green',
        hint: 'Your subscription renews automatically.',
        dateLabel: 'Next billing date',
        dateValue: nextBill,
        icon: 'active',
      };
    case 'NON_RENEWING':
      return {
        badge: accessEnd ? `Active until ${accessEnd}` : 'Active until period ends',
        badgeColor: 'yellow',
        hint: 'Cancelled on Paystack — it will not renew.',
        dateLabel: 'Access ends',
        dateValue: accessEnd,
        icon: 'ending',
      };
    case 'ATTENTION':
      return {
        badge: 'Payment attention needed',
        badgeColor: 'red',
        hint: 'Update your payment method to keep access.',
        dateLabel: 'Next billing date',
        dateValue: nextBill,
        icon: 'warning',
      };
    case 'PAST_DUE':
      return {
        badge: 'Past due',
        badgeColor: 'red',
        hint: 'Please update billing to restore full access.',
        dateLabel: 'Next billing date',
        dateValue: nextBill,
        icon: 'warning',
      };
    default:
      return {
        badge: sub.status,
        badgeColor: 'slate',
        hint: '',
        dateLabel: null,
        dateValue: null,
        icon: 'warning',
      };
  }
}

function SubscriptionStatusBanner({ sub }: { sub: SubRow }) {
  const display = getSubscriptionStatusDisplay(sub);
  const Icon =
    display.icon === 'active' ? CheckCircle2 : display.icon === 'ending' ? RefreshCw : AlertCircle;
  const iconClass =
    display.icon === 'active'
      ? 'text-emerald-600 bg-emerald-50'
      : display.icon === 'ending'
        ? 'text-amber-600 bg-amber-50'
        : 'text-red-600 bg-red-50';

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-white p-4">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconClass}`}>
        <Icon size={20} aria-hidden />
      </span>
      <div className="min-w-0 flex-1 space-y-1.5">
        <Badge color={display.badgeColor} className="text-[10px]">
          {display.badge}
        </Badge>
        {display.hint && (
          <p className="text-xs font-semibold text-slate-600 leading-relaxed">{display.hint}</p>
        )}
      </div>
    </div>
  );
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
  const [trialMonths, setTrialMonths] = useState(0);

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
      const { plans: list, trialMonths: months } = await api.getBillingPlans();
      setTrialMonths(months);
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
        <Card className="p-6 space-y-5 border-slate-200 bg-gradient-to-b from-slate-50/40 to-white">
          <SubscriptionStatusBanner sub={activeSub} />

          <div className="space-y-1">
            <p className="text-sm font-black text-slate-900">{activeSub.planName}</p>
            <p className="text-xs font-semibold text-slate-600">
              {intervalLabel(activeSub.billingInterval)} ·{' '}
              {formatPlanAmount(activeSub.amountCents, activeSub.currency)} per{' '}
              {formatInterval(activeSub.billingInterval)}
            </p>
          </div>

          {(() => {
            const display = getSubscriptionStatusDisplay(activeSub);
            if (!display.dateLabel) return null;
            return (
              <dl className="text-xs">
                <dt className="font-bold uppercase tracking-widest text-slate-400 text-[10px]">
                  {display.dateLabel}
                </dt>
                <dd className="font-semibold text-slate-800 mt-0.5">{display.dateValue ?? '—'}</dd>
              </dl>
            );
          })()}

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
        <div className="space-y-5">
          {plansLoading && (
            <Card className="p-6">
              <div className="flex items-center justify-center gap-2 py-8 text-slate-500">
                <Loader2 className="w-5 h-5 animate-spin text-indigo-600" aria-hidden />
                <span className="text-xs font-bold">Loading plans…</span>
              </div>
            </Card>
          )}

          {!plansLoading && plansError && (
            <Card className="p-6">
              <div className="rs-alert rs-alert--danger" role="alert">
                <div className="rs-alert-body text-sm font-semibold">{plansError}</div>
                <Button variant="secondary" className="mt-3" onClick={() => void loadPlans()}>
                  Try again
                </Button>
              </div>
            </Card>
          )}

          {!plansLoading && !plansError && plans.length > 0 && (
            <>
              <div>
                <p className="text-sm font-black text-slate-900">Choose a plan</p>
                <p className="text-xs font-semibold text-slate-500 mt-1 leading-relaxed">
                  {trialMonths > 0
                    ? `Start with a ${trialMonthsLabel(trialMonths)} free trial — add your card to verify, then choose a plan. All doctors use RosterSync at no extra cost.`
                    : 'Pick a billing term for your department. All doctors use RosterSync at no extra cost.'}
                </p>
                <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase tracking-widest">
                  Billed to {currentUser.email}
                </p>
              </div>

              <div
                className="grid grid-cols-1 sm:grid-cols-3 gap-3"
                role="radiogroup"
                aria-label="Subscription plan"
              >
                {plans.map((plan) => {
                  const selected = plan.planCode === selectedPlanCode;
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setSelectedPlanCode(plan.planCode)}
                      className={`relative flex flex-col text-left rounded-2xl border p-4 min-h-[11rem] transition-all touch-manipulation ${
                        selected
                          ? 'border-indigo-400 bg-indigo-50/80 ring-2 ring-indigo-200 shadow-sm'
                          : 'border-slate-200 bg-white hover:border-indigo-200 hover:shadow-sm active:bg-slate-50'
                      }`}
                    >
                      {selected && (
                        <span className="absolute top-3 right-3 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-white">
                          <Check size={14} strokeWidth={3} aria-hidden />
                        </span>
                      )}
                      <div className="flex flex-wrap items-center gap-1.5 pr-8">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                          {intervalLabel(plan.interval)}
                        </p>
                        {trialMonths > 0 && (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-emerald-700">
                            {trialMonthsLabel(trialMonths)} free
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-black text-slate-900 mt-2 leading-snug">{plan.name}</p>
                      {plan.description && (
                        <p className="text-[11px] font-semibold text-slate-500 mt-1.5 leading-relaxed flex-1">
                          {plan.description}
                        </p>
                      )}
                      <div className="mt-auto pt-4">
                        <p className="text-lg font-black text-indigo-700 leading-none">
                          {formatPlanAmount(plan.amount, plan.currency)}
                        </p>
                        <p className="text-[10px] font-semibold text-slate-500 mt-1">
                          per {formatInterval(plan.interval)}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {selectedPlan && (
                <p className="text-xs font-semibold text-slate-500 leading-relaxed">
                  {trialMonths > 0 ? (
                    <>
                      Verify your card on Paystack, then your {trialMonthsLabel(trialMonths)} trial begins.
                      After that, {formatPlanAmount(selectedPlan.amount, selectedPlan.currency)} per{' '}
                      {formatInterval(selectedPlan.interval)}.
                    </>
                  ) : (
                    <>
                      You&apos;ll pay {formatPlanAmount(selectedPlan.amount, selectedPlan.currency)} per{' '}
                      {formatInterval(selectedPlan.interval)} via Paystack.
                    </>
                  )}
                </p>
              )}
              {checkoutError && (
                <div className="rs-alert rs-alert--danger" role="alert">
                  <div className="rs-alert-body text-sm font-semibold">{checkoutError}</div>
                </div>
              )}
              <Button
                variant="primary"
                className="w-full py-3.5 sm:max-w-xs"
                disabled={checkoutLoading || !selectedPlanCode}
                onClick={() => void handleSubscribe()}
              >
                {checkoutLoading ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                    Processing…
                  </span>
                ) : (
                  trialMonths > 0 ? 'Start free trial' : 'Subscribe now'
                )}
              </Button>
            </>
          )}

          {!plansLoading && !plansError && plans.length === 0 && (
            <Card className="p-6">
              <p className="text-xs font-semibold text-slate-500 text-center py-4">
                No subscription plans available.
              </p>
            </Card>
          )}
        </div>
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
