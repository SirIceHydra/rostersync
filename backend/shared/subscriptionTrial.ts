/** Free-trial length in months (0 = no trial — legacy immediate subscription on checkout). */
export function subscriptionTrialMonths(): number {
  const raw = process.env.SUBSCRIPTION_TRIAL_MONTHS?.trim();
  if (raw === '' || raw === undefined) return 2;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 2;
  return Math.floor(n);
}

/** Card verification charge during trial signup (cents). Default R1.00 for ZAR. */
export function subscriptionTrialAuthAmountCents(): number {
  const raw = process.env.SUBSCRIPTION_TRIAL_AUTH_AMOUNT_CENTS?.trim();
  if (!raw) return 100;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 100) return 100;
  return Math.floor(n);
}

export function addMonthsMs(anchorMs: number, months: number): number {
  const d = new Date(anchorMs);
  d.setMonth(d.getMonth() + months);
  return d.getTime();
}

export function computeTrialEndsAtMs(fromMs: number = Date.now()): number | null {
  const months = subscriptionTrialMonths();
  if (months <= 0) return null;
  return addMonthsMs(fromMs, months);
}

/** Trial window has not ended yet (by date only). */
export function isSubscriptionOnTrial(trialEndsAt: unknown): boolean {
  if (trialEndsAt == null || trialEndsAt === '') return false;
  const n = typeof trialEndsAt === 'number' ? trialEndsAt : Number(trialEndsAt);
  return Number.isFinite(n) && n > Date.now();
}

/** Show trial UX only while the Paystack subscription is still active (not cancelled, etc.). */
export function isActiveTrialPeriod(
  trialEndsAt: unknown,
  status: string
): boolean {
  return isSubscriptionOnTrial(trialEndsAt) && status === 'ACTIVE';
}

/** Trial calendar window (for copy), regardless of Paystack status. */
export function isWithinTrialWindow(trialEndsAt: unknown): boolean {
  return isSubscriptionOnTrial(trialEndsAt);
}
