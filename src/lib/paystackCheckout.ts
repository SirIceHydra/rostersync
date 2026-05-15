import PaystackPop from '@paystack/inline-js';
import type { PaystackTransactionSuccess } from '../types/paystack-inline-js';

export function openPaystackCheckout(input: {
  accessCode: string;
  onSuccess?: (transaction: PaystackTransactionSuccess) => void;
  onCancel?: () => void;
}): void {
  const key = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY?.trim();
  if (!key) {
    throw new Error('Paystack public key is not configured (VITE_PAYSTACK_PUBLIC_KEY)');
  }

  const paystack = new PaystackPop();
  paystack.newTransaction({
    key,
    accessCode: input.accessCode,
    onSuccess: (transaction) => input.onSuccess?.(transaction),
    onCancel: () => input.onCancel?.(),
  });
}
