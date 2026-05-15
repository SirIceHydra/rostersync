declare module '@paystack/inline-js' {
  export type PaystackTransactionSuccess = {
    reference: string;
    trans?: string;
    status?: string;
    message?: string;
  };

  export type PaystackNewTransactionOptions = {
    key: string;
    email?: string;
    amount?: number;
    accessCode?: string;
    access_code?: string;
    planCode?: string;
    plan?: string;
    reference?: string;
    onSuccess?: (transaction: PaystackTransactionSuccess) => void;
    onCancel?: () => void;
  };

  export default class PaystackPop {
    newTransaction(options: PaystackNewTransactionOptions): void;
  }
}
