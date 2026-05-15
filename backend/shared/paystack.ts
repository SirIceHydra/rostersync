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

function secretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (!key) throw new Error('Paystack is not configured (PAYSTACK_SECRET_KEY)');
  return key;
}

export function planCode(): string {
  const code = process.env.PAYSTACK_PLAN_CODE?.trim();
  if (!code) throw new Error('Paystack plan is not configured (PAYSTACK_PLAN_CODE)');
  return code;
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

export async function fetchPlan(code?: string): Promise<PaystackPlan> {
  const plan = code?.trim() || planCode();
  return paystackFetch<PaystackPlan>(`/plan/${encodeURIComponent(plan)}`);
}

export async function initializeSubscriptionCheckout(input: {
  email: string;
  reference: string;
  metadata?: Record<string, string>;
  callbackUrl?: string;
}): Promise<PaystackInitializeData> {
  const plan = await fetchPlan();
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
