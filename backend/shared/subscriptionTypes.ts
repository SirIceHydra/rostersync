/** Billing interval — mirrors Paystack plan intervals. */
export type SubscriptionBillingInterval =
  | 'hourly'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'biannually'
  | 'annually';

/**
 * Department subscription lifecycle.
 * Maps closely to Paystack subscription statuses plus checkout states.
 */
export type DepartmentSubscriptionStatus =
  | 'PENDING'       // Checkout started, not confirmed yet
  | 'ACTIVE'        // Paid and entitled
  | 'NON_RENEWING'  // Active until period end; will not renew
  | 'ATTENTION'     // Paystack: payment issue on file
  | 'PAST_DUE'      // Grace / retry window (app-level or mapped from webhooks)
  | 'CANCELLED'     // Ended before natural completion
  | 'COMPLETED'     // All billing cycles finished
  | 'INCOMPLETE';   // Checkout or activation failed

/** Why a subscription row was closed (ended_at set). */
export type DepartmentSubscriptionEndReason =
  | 'CHECKOUT_ABANDONED'
  | 'CHECKOUT_FAILED'
  | 'CANCELLED'
  | 'COMPLETED'
  | 'PLAN_CHANGED'
  | 'REPLACED'
  | 'EXPIRED';

/** Statuses that grant department access (doctors use the product). */
export const SUBSCRIPTION_ENTITLED_STATUSES: DepartmentSubscriptionStatus[] = [
  'ACTIVE',
  'NON_RENEWING',
  'ATTENTION',
  'PAST_DUE',
];

export interface SubscriptionPlanRow {
  id: string;
  slug: string | null;
  paystack_plan_code: string;
  name: string;
  description: string | null;
  billing_interval: SubscriptionBillingInterval;
  amount_cents: number;
  currency: string;
  invoice_limit: number | null;
  is_active: boolean;
  display_order: number;
  created_at: number;
  updated_at: number;
}

export interface DepartmentSubscriptionRow {
  id: string;
  department_id: string;
  plan_id: string;
  status: DepartmentSubscriptionStatus;
  subscribed_by_user_id: string | null;
  paystack_subscription_code: string | null;
  paystack_customer_code: string | null;
  paystack_authorization_code: string | null;
  checkout_reference: string | null;
  current_period_start: number | null;
  current_period_end: number | null;
  next_payment_at: number | null;
  ended_at: number | null;
  end_reason: DepartmentSubscriptionEndReason | null;
  created_at: number;
  updated_at: number;
}
