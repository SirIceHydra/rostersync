/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_GATEWAY_PROXY_TARGET?: string;
  /** Paystack public key (`pk_test_…` or `pk_live_…`) for inline checkout. */
  readonly VITE_PAYSTACK_PUBLIC_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
