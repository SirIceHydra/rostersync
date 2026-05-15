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
  createdAt?: string;
  created_at?: string;
  customer: { customer_code: string };
  plan: { plan_code: string; name?: string; interval?: string };
  authorization?: PaystackAuthorization;
};

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

export async function listCustomerSubscriptions(customerCode: string): Promise<PaystackSubscription[]> {
  const data = await paystackFetch<PaystackSubscription[] | { subscriptions?: PaystackSubscription[] }>(
    `/subscription?customer=${encodeURIComponent(customerCode)}`
  );
  if (Array.isArray(data)) return data;
  return (data as { subscriptions?: PaystackSubscription[] }).subscriptions ?? [];
}

export async function fetchSubscription(subscriptionCode: string): Promise<PaystackSubscription> {
  return paystackFetch<PaystackSubscription>(
    `/subscription/${encodeURIComponent(subscriptionCode.trim())}`
  );
}

export async function getSubscriptionManageLink(subscriptionCode: string): Promise<string> {
  const data = await paystackFetch<PaystackManageLink>(
    `/subscription/${encodeURIComponent(subscriptionCode.trim())}/manage/link`
  );
  if (!data.link) throw new Error('Paystack did not return a manage link');
  return data.link;
}
