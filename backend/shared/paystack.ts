const PAYSTACK_API = 'https://api.paystack.co';

type PaystackEnvelope<T> = {
  status: boolean;
  message: string;
  data: T;
};

export type PaystackPlan = {
  id: number;
  name: string;
  plan_code: string;
  amount: number;
  interval: string;
  currency: string;
};

export type PaystackInitializeData = {
  authorization_url: string;
  access_code: string;
  reference: string;
};

export type PaystackVerifyTransaction = {
  status: string;
  reference: string;
  amount: number;
  paid_at?: string;
  paidAt?: string;
  customer: {
    customer_code: string;
    email: string;
  };
  authorization?: {
    authorization_code: string;
  };
  metadata?: string | Record<string, unknown>;
  plan?: { plan_code?: string; name?: string } | null;
};

export type PaystackAuthorization = {
  authorization_code?: string;
  bin?: string;
  last4?: string;
  exp_month?: string;
  exp_year?: string;
  channel?: string;
  card_type?: string;
  bank?: string;
  brand?: string;
  country_code?: string;
  reusable?: boolean;
};

export type PaystackSubscription = {
  subscription_code: string;
  status: string;
  amount: number;
  next_payment_date?: string;
  nextPaymentDate?: string;
  createdAt?: string;
  created_at?: string;
  customer: { customer_code: string };
  plan: { plan_code: string; name?: string; interval?: string };
  authorization?: PaystackAuthorization;
};

/** Parse Paystack's next billing timestamp from a subscription payload. */
export function extractNextPaymentMs(sub?: PaystackSubscription | null): number | null {
  if (!sub) return null;
  const raw = sub.next_payment_date ?? sub.nextPaymentDate;
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

export type PaystackManageLink = {
  link: string;
};

function secretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (!key) throw new Error('Paystack is not configured (PAYSTACK_SECRET_KEY)');
  return key;
}

export function requirePlanCode(code: string | undefined): string {
  const trimmed = code?.trim();
  if (!trimmed) throw new Error('Plan code is required');
  return trimmed;
}

async function paystackFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${PAYSTACK_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const body = (await res.json()) as PaystackEnvelope<T>;
  if (!res.ok || !body.status) {
    throw new Error(body.message || `Paystack error (${res.status})`);
  }
  return body.data;
}

export async function fetchPlan(planCode: string): Promise<PaystackPlan> {
  return paystackFetch<PaystackPlan>(`/plan/${encodeURIComponent(requirePlanCode(planCode))}`);
}

export async function initializeSubscriptionCheckout(input: {
  email: string;
  planCode: string;
  reference: string;
  metadata?: Record<string, string>;
  callbackUrl?: string;
}): Promise<PaystackInitializeData> {
  const plan = await fetchPlan(input.planCode);
  return paystackFetch<PaystackInitializeData>('/transaction/initialize', {
    method: 'POST',
    body: JSON.stringify({
      email: input.email,
      amount: plan.amount,
      plan: plan.plan_code,
      reference: input.reference,
      metadata: input.metadata,
      ...(input.callbackUrl ? { callback_url: input.callbackUrl } : {}),
    }),
  });
}

export async function verifyTransaction(reference: string): Promise<PaystackVerifyTransaction> {
  return paystackFetch<PaystackVerifyTransaction>(
    `/transaction/verify/${encodeURIComponent(reference.trim())}`
  );
}

type PaystackCustomer = {
  id: number;
  customer_code: string;
  email?: string;
};

type RawPaystackSubscription = PaystackSubscription & {
  customer?: PaystackSubscription['customer'] | PaystackCustomer;
  plan?: PaystackSubscription['plan'] | { plan_code?: string; name?: string; interval?: string };
};

function normalizeSubscription(raw: RawPaystackSubscription): PaystackSubscription {
  const customerObj =
    raw.customer && typeof raw.customer === 'object' ? raw.customer : undefined;
  const customerCode =
    customerObj && 'customer_code' in customerObj ? customerObj.customer_code : '';

  const planObj = raw.plan && typeof raw.plan === 'object' ? raw.plan : undefined;
  const planCode = planObj && 'plan_code' in planObj ? planObj.plan_code ?? '' : '';

  return {
    subscription_code: raw.subscription_code,
    status: raw.status,
    amount: raw.amount,
    next_payment_date: raw.next_payment_date,
    nextPaymentDate: raw.nextPaymentDate,
    createdAt: raw.createdAt,
    created_at: raw.created_at,
    customer: { customer_code: customerCode },
    plan: {
      plan_code: planCode,
      name: planObj && 'name' in planObj ? planObj.name : undefined,
      interval: planObj && 'interval' in planObj ? planObj.interval : undefined,
    },
    authorization: raw.authorization,
  };
}

function normalizeSubscriptionList(data: unknown): PaystackSubscription[] {
  const rows = Array.isArray(data)
    ? data
    : (data as { subscriptions?: RawPaystackSubscription[] })?.subscriptions ?? [];
  return rows
    .filter((row) => row?.subscription_code)
    .map((row) => normalizeSubscription(row as RawPaystackSubscription));
}

export async function fetchCustomer(customerCode: string): Promise<PaystackCustomer> {
  return paystackFetch<PaystackCustomer>(`/customer/${encodeURIComponent(customerCode.trim())}`);
}

/** List subscriptions for a customer (Paystack expects numeric customer id, not CUS_ code). */
export async function listCustomerSubscriptions(customerCode: string): Promise<PaystackSubscription[]> {
  const customer = await fetchCustomer(customerCode);
  const data = await paystackFetch<unknown>(
    `/subscription?customer=${encodeURIComponent(String(customer.id))}&perPage=50`
  );
  return normalizeSubscriptionList(data);
}

export async function fetchSubscription(subscriptionCode: string): Promise<PaystackSubscription> {
  const raw = await paystackFetch<RawPaystackSubscription>(
    `/subscription/${encodeURIComponent(subscriptionCode.trim())}`
  );
  return normalizeSubscription(raw);
}

/** Pick the best matching subscription for a plan code. */
export function pickSubscriptionForPlan(
  subscriptions: PaystackSubscription[],
  planCode: string
): PaystackSubscription | null {
  if (!subscriptions.length) return null;
  const code = planCode.trim();
  const activeish = (s: PaystackSubscription) => {
    const st = s.status?.toLowerCase() ?? '';
    return st === 'active' || st === 'non-renewing' || st === 'attention';
  };
  return (
    subscriptions.find((s) => s.plan?.plan_code === code && activeish(s)) ??
    subscriptions.find((s) => s.plan?.plan_code === code) ??
    subscriptions.find(activeish) ??
    subscriptions[0] ??
    null
  );
}

export async function getSubscriptionManageLink(subscriptionCode: string): Promise<string> {
  const data = await paystackFetch<PaystackManageLink>(
    `/subscription/${encodeURIComponent(subscriptionCode.trim())}/manage/link`
  );
  if (!data.link) throw new Error('Paystack did not return a manage link');
  return data.link;
}
