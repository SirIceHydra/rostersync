import crypto from 'crypto';
import type { DbClient } from './database.js';
import {
  extractNextPaymentMs,
  fetchSubscription,
  getSubscriptionManageLink,
  listCustomerSubscriptions,
  verifyTransaction,
  type PaystackAuthorization,
  type PaystackSubscription,
  type PaystackVerifyTransaction,
} from './paystack.js';
import type { SubscriptionBillingInterval } from './subscriptionTypes.js';
import {
  SUBSCRIPTION_ENTITLED_STATUSES,
  type DepartmentSubscriptionEndReason,
  type DepartmentSubscriptionStatus,
} from './subscriptionTypes.js';

function parseMetadata(raw: PaystackVerifyTransaction['metadata']): Record<string, string> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return Object.fromEntries(
        Object.entries(parsed).map(([k, v]) => [k, v == null ? '' : String(v)])
      );
    } catch {
      return {};
    }
  }
  return Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, v == null ? '' : String(v)])
  );
}

function mapPaystackSubscriptionStatus(status: string): DepartmentSubscriptionStatus {
  const s = status.toLowerCase();
  if (s === 'active') return 'ACTIVE';
  if (s === 'non-renewing' || s === 'non_renewing') return 'NON_RENEWING';
  if (s === 'attention') return 'ATTENTION';
  if (s === 'cancelled') return 'CANCELLED';
  if (s === 'completed') return 'COMPLETED';
  return 'ACTIVE';
}

function paidAtMs(tx: PaystackVerifyTransaction): number {
  const iso = tx.paid_at ?? tx.paidAt;
  return iso ? Date.parse(iso) : Date.now();
}

function nextPaymentMs(sub?: PaystackSubscription | null): number | null {
  return extractNextPaymentMs(sub);
}

/** Estimate next bill when Paystack has not populated next_payment_date yet. */
function estimateNextBillingMs(interval: string, anchorMs: number): number | null {
  if (!Number.isFinite(anchorMs) || anchorMs <= 0) return null;
  const d = new Date(anchorMs);
  const iv = interval as SubscriptionBillingInterval;
  switch (iv) {
    case 'hourly':
      d.setHours(d.getHours() + 1);
      break;
    case 'daily':
      d.setDate(d.getDate() + 1);
      break;
    case 'weekly':
      d.setDate(d.getDate() + 7);
      break;
    case 'monthly':
      d.setMonth(d.getMonth() + 1);
      break;
    case 'quarterly':
      d.setMonth(d.getMonth() + 3);
      break;
    case 'biannually':
      d.setMonth(d.getMonth() + 6);
      break;
    case 'annually':
      d.setFullYear(d.getFullYear() + 1);
      break;
    default:
      d.setMonth(d.getMonth() + 1);
  }
  return d.getTime();
}

/** Postgres BIGINT columns may arrive as strings — normalize to ms or null. */
function toEpochMs(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function cardFieldsFromAuthorization(auth?: PaystackAuthorization | null) {
  if (!auth?.last4) {
    return {
      cardBrand: null as string | null,
      cardLast4: null as string | null,
      cardExpMonth: null as string | null,
      cardExpYear: null as string | null,
      cardBank: null as string | null,
    };
  }
  const brand =
    auth.brand?.trim() ||
    auth.card_type?.split(/\s+/)[0]?.trim() ||
    auth.channel ||
    'Card';
  return {
    cardBrand: brand,
    cardLast4: auth.last4,
    cardExpMonth: auth.exp_month != null ? String(auth.exp_month) : null,
    cardExpYear: auth.exp_year != null ? String(auth.exp_year) : null,
    cardBank: auth.bank?.trim() || null,
  };
}

async function logSubscriptionEvent(
  db: DbClient,
  input: {
    departmentSubscriptionId: string | null;
    departmentId: string;
    eventType: string;
    paystackEventId?: string | null;
    payload?: unknown;
  }
): Promise<void> {
  await db.run(
    `INSERT INTO subscription_events (
      id, department_subscription_id, department_id, event_type, paystack_event_id, payload_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      input.departmentSubscriptionId,
      input.departmentId,
      input.eventType,
      input.paystackEventId ?? null,
      input.payload ? JSON.stringify(input.payload) : null,
      Date.now(),
    ]
  );
}

async function endCurrentSubscriptions(
  db: DbClient,
  departmentId: string,
  reason: DepartmentSubscriptionEndReason,
  excludeId?: string
): Promise<void> {
  const now = Date.now();
  const params: unknown[] = [now, reason, now, departmentId];
  let sql = `
    UPDATE department_subscriptions SET
      ended_at = ?, end_reason = ?, updated_at = ?,
      status = CASE
        WHEN status = 'PENDING' THEN 'INCOMPLETE'
        ELSE 'CANCELLED'
      END
    WHERE department_id = ? AND ended_at IS NULL`;
  if (excludeId) {
    sql += ' AND id != ?';
    params.push(excludeId);
  }
  await db.run(sql, params);
}

/** Start checkout — creates a PENDING row tied to the Paystack transaction reference. */
export async function createPendingDepartmentSubscription(
  db: DbClient,
  input: {
    departmentId: string;
    planId: string;
    subscribedByUserId: string;
    checkoutReference: string;
  }
): Promise<string> {
  const now = Date.now();

  await db.transaction(async (tx) => {
    const stalePending = await tx.all(
      `SELECT id FROM department_subscriptions
       WHERE department_id = ? AND status = 'PENDING' AND ended_at IS NULL`,
      [input.departmentId]
    );
    for (const row of stalePending) {
      await tx.run(
        `UPDATE department_subscriptions SET
          status = 'INCOMPLETE', ended_at = ?, end_reason = 'CHECKOUT_ABANDONED', updated_at = ?
         WHERE id = ?`,
        [now, now, row.id]
      );
    }
  });

  const id = crypto.randomUUID();
  await db.run(
    `INSERT INTO department_subscriptions (
      id, department_id, plan_id, status, subscribed_by_user_id,
      checkout_reference, created_at, updated_at
    ) VALUES (?, ?, ?, 'PENDING', ?, ?, ?, ?)`,
    [id, input.departmentId, input.planId, input.subscribedByUserId, input.checkoutReference, now, now]
  );

  await logSubscriptionEvent(db, {
    departmentSubscriptionId: id,
    departmentId: input.departmentId,
    eventType: 'checkout.initialized',
    payload: { reference: input.checkoutReference, planId: input.planId },
  });

  return id;
}

/** After Paystack payment — verify transaction and activate the department subscription. */
export async function confirmDepartmentSubscription(
  db: DbClient,
  input: { departmentId: string; reference: string; userId: string }
): Promise<{
  subscriptionId: string;
  status: DepartmentSubscriptionStatus;
  isEntitled: boolean;
  paystackSubscriptionCode: string | null;
}> {
  const row = await db.get(
    `SELECT ds.*, sp.paystack_plan_code, sp.billing_interval
     FROM department_subscriptions ds
     INNER JOIN subscription_plans sp ON sp.id = ds.plan_id
     WHERE ds.checkout_reference = ? AND ds.department_id = ?`,
    [input.reference, input.departmentId]
  );

  if (!row) {
    throw new Error('Subscription checkout not found for this department');
  }
  if (row.subscribed_by_user_id && row.subscribed_by_user_id !== input.userId) {
    throw new Error('This checkout was started by another admin');
  }

  if (row.status === 'ACTIVE' && row.ended_at == null) {
    return {
      subscriptionId: row.id,
      status: 'ACTIVE',
      isEntitled: true,
      paystackSubscriptionCode: row.paystack_subscription_code ?? null,
    };
  }

  const tx = await verifyTransaction(input.reference);
  if (tx.status !== 'success') {
    const now = Date.now();
    await db.run(
      `UPDATE department_subscriptions SET
        status = 'INCOMPLETE', ended_at = ?, end_reason = 'CHECKOUT_FAILED', updated_at = ?
       WHERE id = ?`,
      [now, now, row.id]
    );
    await logSubscriptionEvent(db, {
      departmentSubscriptionId: row.id,
      departmentId: input.departmentId,
      eventType: 'checkout.failed',
      payload: { reference: input.reference, paystackStatus: tx.status },
    });
    throw new Error('Payment was not successful');
  }

  const meta = parseMetadata(tx.metadata);
  if (meta.department_id && meta.department_id !== input.departmentId) {
    throw new Error('Payment metadata does not match this department');
  }

  const customerCode = tx.customer?.customer_code;
  const authorizationCode = tx.authorization?.authorization_code ?? null;

  let paystackSub: PaystackSubscription | null = null;
  if (customerCode) {
    const subs = await listCustomerSubscriptions(customerCode);
    paystackSub =
      subs.find((s) => s.plan?.plan_code === row.paystack_plan_code && s.status === 'active') ??
      subs.find((s) => s.plan?.plan_code === row.paystack_plan_code) ??
      subs[0] ??
      null;
  }

  const status = paystackSub
    ? mapPaystackSubscriptionStatus(paystackSub.status)
    : 'ACTIVE';
  const periodStart = paidAtMs(tx);
  let nextPayment = nextPaymentMs(paystackSub);
  if (!nextPayment && paystackSub?.subscription_code) {
    try {
      nextPayment = nextPaymentMs(await fetchSubscription(paystackSub.subscription_code));
    } catch {
      /* fall through to estimate */
    }
  }
  if (!nextPayment && periodStart) {
    nextPayment = estimateNextBillingMs(row.billing_interval, periodStart);
  }
  const now = Date.now();
  const cardAuth = paystackSub?.authorization ?? tx.authorization ?? null;
  const card = cardFieldsFromAuthorization(cardAuth);

  await db.transaction(async (txn) => {
    await endCurrentSubscriptions(txn, input.departmentId, 'REPLACED', row.id);

    await txn.run(
      `UPDATE department_subscriptions SET
        status = ?,
        paystack_subscription_code = ?,
        paystack_customer_code = ?,
        paystack_authorization_code = ?,
        current_period_start = ?,
        current_period_end = ?,
        next_payment_at = ?,
        card_brand = ?,
        card_last4 = ?,
        card_exp_month = ?,
        card_exp_year = ?,
        card_bank = ?,
        ended_at = NULL,
        end_reason = NULL,
        updated_at = ?
       WHERE id = ?`,
      [
        status,
        paystackSub?.subscription_code ?? null,
        customerCode ?? null,
        paystackSub?.authorization?.authorization_code ?? authorizationCode,
        periodStart,
        nextPayment,
        nextPayment,
        card.cardBrand,
        card.cardLast4,
        card.cardExpMonth,
        card.cardExpYear,
        card.cardBank,
        now,
        row.id,
      ]
    );
  });

  await logSubscriptionEvent(db, {
    departmentSubscriptionId: row.id,
    departmentId: input.departmentId,
    eventType: 'checkout.confirmed',
    payload: {
      reference: input.reference,
      paystackSubscriptionCode: paystackSub?.subscription_code ?? null,
      status,
    },
  });

  return {
    subscriptionId: row.id,
    status,
    isEntitled: SUBSCRIPTION_ENTITLED_STATUSES.includes(status),
    paystackSubscriptionCode: paystackSub?.subscription_code ?? null,
  };
}

export async function getDepartmentSubscriptionStatus(
  db: DbClient,
  departmentId: string
): Promise<{
  hasSubscription: boolean;
  isEntitled: boolean;
  subscription: {
    id: string;
    status: DepartmentSubscriptionStatus;
    planCode: string;
    planName: string;
    billingInterval: string;
    amountCents: number;
    currency: string;
    currentPeriodStart: number | null;
    currentPeriodEnd: number | null;
    nextPaymentAt: number | null;
    paystackSubscriptionCode: string | null;
    paymentMethod: {
      brand: string;
      last4: string;
      expMonth: string | null;
      expYear: string | null;
      bank: string | null;
    } | null;
  } | null;
}> {
  const row = await db.get(
    `SELECT ds.id, ds.status, ds.created_at, ds.current_period_start, ds.current_period_end, ds.next_payment_at,
            ds.paystack_subscription_code, ds.card_brand, ds.card_last4, ds.card_exp_month,
            ds.card_exp_year, ds.card_bank,
            sp.paystack_plan_code, sp.name AS plan_name, sp.billing_interval,
            sp.amount_cents, sp.currency
     FROM department_subscriptions ds
     INNER JOIN subscription_plans sp ON sp.id = ds.plan_id
     WHERE ds.department_id = ? AND ds.ended_at IS NULL
     ORDER BY ds.created_at DESC
     LIMIT 1`,
    [departmentId]
  );

  if (!row) {
    return { hasSubscription: false, isEntitled: false, subscription: null };
  }

  const status = row.status as DepartmentSubscriptionStatus;
  const isEntitled = SUBSCRIPTION_ENTITLED_STATUSES.includes(status);

  let cardBrand = row.card_brand as string | null;
  let cardLast4 = row.card_last4 as string | null;
  let cardExpMonth = row.card_exp_month as string | null;
  let cardExpYear = row.card_exp_year as string | null;
  let cardBank = row.card_bank as string | null;
  let nextPaymentAt = toEpochMs(row.next_payment_at);
  const periodStart = toEpochMs(row.current_period_start);
  const createdAt = toEpochMs(row.created_at);

  if (row.paystack_subscription_code) {
    try {
      const live = await fetchSubscription(row.paystack_subscription_code);
      const liveNext = nextPaymentMs(live);
      if (liveNext) {
        nextPaymentAt = liveNext;
        await db.run(
          `UPDATE department_subscriptions SET next_payment_at = ?, updated_at = ? WHERE id = ?`,
          [liveNext, Date.now(), row.id]
        );
      }
      if (!cardLast4) {
        const card = cardFieldsFromAuthorization(live.authorization);
        if (card.cardLast4) {
          cardBrand = card.cardBrand;
          cardLast4 = card.cardLast4;
          cardExpMonth = card.cardExpMonth;
          cardExpYear = card.cardExpYear;
          cardBank = card.cardBank;
          await db.run(
            `UPDATE department_subscriptions SET
              card_brand = ?, card_last4 = ?, card_exp_month = ?, card_exp_year = ?, card_bank = ?,
              updated_at = ?
             WHERE id = ?`,
            [cardBrand, cardLast4, cardExpMonth, cardExpYear, cardBank, Date.now(), row.id]
          );
        }
      }
    } catch {
      /* use stored / estimated values */
    }
  }

  if (!nextPaymentAt) {
    const anchor = periodStart ?? createdAt;
    if (anchor) {
      nextPaymentAt = estimateNextBillingMs(row.billing_interval, anchor);
    }
  }

  const paymentMethod =
    cardLast4 && cardBrand
      ? {
          brand: cardBrand,
          last4: cardLast4,
          expMonth: cardExpMonth,
          expYear: cardExpYear,
          bank: cardBank,
        }
      : null;

  return {
    hasSubscription: true,
    isEntitled,
    subscription: {
      id: row.id,
      status,
      planCode: row.paystack_plan_code,
      planName: row.plan_name,
      billingInterval: row.billing_interval,
      amountCents: row.amount_cents,
      currency: row.currency,
      currentPeriodStart: toEpochMs(row.current_period_start),
      currentPeriodEnd: toEpochMs(row.current_period_end),
      nextPaymentAt,
      paystackSubscriptionCode: row.paystack_subscription_code ?? null,
      paymentMethod,
    },
  };
}

export async function getDepartmentSubscriptionManageLink(
  db: DbClient,
  departmentId: string
): Promise<string> {
  const row = await db.get(
    `SELECT paystack_subscription_code, status FROM department_subscriptions
     WHERE department_id = ? AND ended_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
    [departmentId]
  );
  if (!row?.paystack_subscription_code) {
    throw new Error('No Paystack subscription found for this department');
  }
  const status = row.status as DepartmentSubscriptionStatus;
  if (!SUBSCRIPTION_ENTITLED_STATUSES.includes(status)) {
    throw new Error('Subscription is not active');
  }
  return getSubscriptionManageLink(row.paystack_subscription_code);
}
