import type { SubscriptionBillingInterval } from './subscriptionTypes.js';

export type SubscriptionPlanOfferingSeed = {
  slug: string;
  paystackPlanCode: string;
  displayOrder: number;
  fallbackName: string;
  fallbackInterval: SubscriptionBillingInterval;
};

/** Default Paystack plan codes offered to department admins. */
export const SUBSCRIPTION_PLAN_OFFERINGS: SubscriptionPlanOfferingSeed[] = [
  {
    slug: 'monthly',
    paystackPlanCode: 'PLN_wo961etfdq6zx4b',
    displayOrder: 0,
    fallbackName: 'Monthly',
    fallbackInterval: 'monthly',
  },
  {
    slug: 'biannual',
    paystackPlanCode: 'PLN_wm1ampaedywrnp6',
    displayOrder: 1,
    fallbackName: 'Biannual',
    fallbackInterval: 'biannually',
  },
  {
    slug: 'annual',
    paystackPlanCode: 'PLN_ttjwtqgja2gdndj',
    displayOrder: 2,
    fallbackName: 'Annual',
    fallbackInterval: 'annually',
  },
];

/** Catalog with optional override for the monthly plan via env. */
export function getSubscriptionPlanCatalog(): SubscriptionPlanOfferingSeed[] {
  const monthlyOverride = process.env.PAYSTACK_PLAN_CODE?.trim();
  if (!monthlyOverride) return SUBSCRIPTION_PLAN_OFFERINGS;

  return SUBSCRIPTION_PLAN_OFFERINGS.map((entry) =>
    entry.slug === 'monthly' ? { ...entry, paystackPlanCode: monthlyOverride } : entry
  );
}
