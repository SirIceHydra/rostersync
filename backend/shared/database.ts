import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Pool, type PoolClient } from 'pg';
import { fetchPlan } from './paystack.js';
import { getSubscriptionPlanCatalog } from './subscriptionCatalog.js';
import type { SubscriptionBillingInterval } from './subscriptionTypes.js';

/** Resolve backend/.env no matter which working directory started the process */
const _backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(_backendRoot, '.env') });

// ─────────────────────────────────────────────────────────────────────────────
// Converts SQLite-style ? placeholders to Postgres $1, $2, $3 …
// ─────────────────────────────────────────────────────────────────────────────
function toPositional(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared query interface — implemented by both Database and TransactionDatabase
// so service code doesn't need to know which one it has.
// ─────────────────────────────────────────────────────────────────────────────
export interface DbClient {
  get(sql: string, params?: any[]): Promise<any>;
  all(sql: string, params?: any[]): Promise<any[]>;
  run(sql: string, params?: any[]): Promise<{ changes?: number; lastID?: string }>;
  transaction<T>(fn: (db: DbClient) => Promise<T>): Promise<T>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Transaction-scoped client wrapping a single PoolClient
// ─────────────────────────────────────────────────────────────────────────────
class TransactionDatabase implements DbClient {
  constructor(private client: PoolClient) {}

  async transaction<T>(_fn: (db: DbClient) => Promise<T>): Promise<T> {
    throw new Error('Nested transactions are not supported');
  }

  async get(sql: string, params: any[] = []): Promise<any> {
    const { rows } = await this.client.query(toPositional(sql), params);
    return rows[0] ?? null;
  }

  async all(sql: string, params: any[] = []): Promise<any[]> {
    const { rows } = await this.client.query(toPositional(sql), params);
    return rows;
  }

  async run(sql: string, params: any[] = []): Promise<{ changes?: number; lastID?: string }> {
    const result = await this.client.query(toPositional(sql), params);
    return {
      changes: result.rowCount ?? 0,
      lastID: result.rows[0]?.id,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main singleton database class — drop-in replacement for the SQLite version.
// All services call db.get() / db.all() / db.run() exactly as before.
// ─────────────────────────────────────────────────────────────────────────────
export class Database implements DbClient {
  private pool: Pool;
  private static instance: Database;
  private initPromise: Promise<void> | null = null;

  private constructor() {
    const connectionString = process.env.DATABASE_URL?.trim();
    if (!connectionString) {
      throw new Error(
        'DATABASE_URL is not set. Copy backend/.env.example to backend/.env and add your Postgres URL.'
      );
    }

    this.pool = new Pool({
      connectionString,
      // In production (Railway, Render, etc.) TLS is required but cert may be self-signed
      ssl: process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });

    this.pool.on('error', (err) => {
      console.error('Unexpected database pool error:', err.message);
    });

    this.initPromise = this.initializeSchema();
  }

  static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }

  /** Await schema creation before serving requests */
  async waitForInit(): Promise<void> {
    if (this.initPromise) await this.initPromise;
  }

  // ── Query helpers ──────────────────────────────────────────────────────────

  async get(sql: string, params: any[] = []): Promise<any> {
    const { rows } = await this.pool.query(toPositional(sql), params);
    return rows[0] ?? null;
  }

  async all(sql: string, params: any[] = []): Promise<any[]> {
    const { rows } = await this.pool.query(toPositional(sql), params);
    return rows;
  }

  async run(sql: string, params: any[] = []): Promise<{ changes?: number; lastID?: string }> {
    const result = await this.pool.query(toPositional(sql), params);
    return {
      changes: result.rowCount ?? 0,
      lastID: result.rows[0]?.id,
    };
  }

  /** Run multiple operations in a single ACID transaction */
  async transaction<T>(fn: (db: DbClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(new TransactionDatabase(client));
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /** Healthcheck — returns true if the database is reachable */
  async ping(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  // ── Schema bootstrap ───────────────────────────────────────────────────────

  private async initializeSchema(): Promise<void> {
    // Helper: run DDL and silently ignore "already exists" errors
    const run = async (sql: string) => {
      try {
        await this.pool.query(sql);
      } catch (e: any) {
        if (
          !e.message?.includes('already exists') &&
          !e.message?.includes('duplicate column')
        ) {
          throw e;
        }
      }
    };

    // Users — cumulative hours tracked for cross-month fairness
    await run(`
      CREATE TABLE IF NOT EXISTS users (
        id                       TEXT    PRIMARY KEY,
        email                    TEXT    UNIQUE NOT NULL,
        password_hash            TEXT    NOT NULL,
        name                     TEXT    NOT NULL,
        role                     TEXT    NOT NULL CHECK(role IN ('ADMIN','DOCTOR')),
        firm                     TEXT,
        cumulative_holiday_hours INTEGER DEFAULT 0,
        cumulative_total_hours   INTEGER DEFAULT 0,
        cumulative_weekend_shifts INTEGER DEFAULT 0,
        start_date               BIGINT,
        workload_start_mode      TEXT    DEFAULT 'STAGGERED',
        created_at               BIGINT  NOT NULL,
        updated_at               BIGINT  NOT NULL
      )
    `);
    // Placeholder columns — added to existing DBs via ALTER TABLE (idempotent)
    await run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_placeholder BOOLEAN DEFAULT FALSE`);
    await run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS linked_user_id TEXT`);

    // Departments — each is one tenant
    await run(`
      CREATE TABLE IF NOT EXISTS departments (
        id         TEXT   PRIMARY KEY,
        code       TEXT   UNIQUE NOT NULL,
        name       TEXT,
        created_at BIGINT NOT NULL,
        created_by TEXT   REFERENCES users(id)
      )
    `);
    await run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_departments_code ON departments(code)`);

    // One user can belong to many departments
    await run(`
      CREATE TABLE IF NOT EXISTS user_departments (
        user_id       TEXT   NOT NULL REFERENCES users(id)       ON DELETE CASCADE,
        department_id TEXT   NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
        role_in_dept  TEXT   NOT NULL CHECK(role_in_dept IN ('ADMIN','MEMBER')),
        joined_at     BIGINT NOT NULL,
        PRIMARY KEY (user_id, department_id)
      )
    `);

    // Rosters — scoped by department, unique per month/year
    await run(`
      CREATE TABLE IF NOT EXISTS rosters (
        id            TEXT   PRIMARY KEY,
        department_id TEXT   NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
        month         INTEGER NOT NULL,
        year          INTEGER NOT NULL,
        status        TEXT   NOT NULL CHECK(status IN ('DRAFT','FINAL')),
        created_at    BIGINT NOT NULL,
        updated_at    BIGINT NOT NULL,
        UNIQUE(department_id, month, year)
      )
    `);

    // Shifts — one per day per roster
    await run(`
      CREATE TABLE IF NOT EXISTS shifts (
        id                TEXT    PRIMARY KEY,
        roster_id         TEXT    NOT NULL REFERENCES rosters(id) ON DELETE CASCADE,
        date              TEXT    NOT NULL,
        doctor_id         TEXT    NOT NULL REFERENCES users(id),
        template_id       TEXT    NOT NULL,
        is_public_holiday INTEGER DEFAULT 0,
        UNIQUE(roster_id, date)
      )
    `);

    // Requests — leave, swaps, unavailable etc.
    await run(`
      CREATE TABLE IF NOT EXISTS requests (
        id                  TEXT   PRIMARY KEY,
        department_id       TEXT   NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
        doctor_id           TEXT   NOT NULL REFERENCES users(id),
        type                TEXT   NOT NULL CHECK(type IN ('UNAVAILABLE','SWAP','LEAVE','PREFERRED_WORK','POST_CALL_OFF')),
        date                TEXT   NOT NULL,
        status              TEXT   NOT NULL CHECK(status IN ('PENDING','APPROVED','REJECTED')),
        reason              TEXT,
        swap_with_doctor_id TEXT   REFERENCES users(id),
        created_at          BIGINT NOT NULL,
        updated_at          BIGINT NOT NULL
      )
    `);

    // Fairness settings — one row per department
    await run(`
      CREATE TABLE IF NOT EXISTS fairness_settings (
        id                    SERIAL  PRIMARY KEY,
        department_id         TEXT    NOT NULL UNIQUE REFERENCES departments(id) ON DELETE CASCADE,
        hour_diff_limit       INTEGER NOT NULL DEFAULT 24,
        weekend_diff_limit    INTEGER NOT NULL DEFAULT 1,
        max_shifts_per_7_days INTEGER NOT NULL DEFAULT 2,
        allow_consecutive_shifts INTEGER NOT NULL DEFAULT 0,
        min_rest_days         INTEGER NOT NULL DEFAULT 1,
        fairness_history_mode TEXT    NOT NULL DEFAULT 'ALL_TIME',
        created_at            BIGINT  NOT NULL,
        updated_at            BIGINT  NOT NULL
      )
    `);

    // Department join requests (doctor → admin approval flow)
    await run(`
      CREATE TABLE IF NOT EXISTS department_join_requests (
        id            TEXT   PRIMARY KEY,
        user_id       TEXT   NOT NULL REFERENCES users(id)       ON DELETE CASCADE,
        department_id TEXT   NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
        status        TEXT   NOT NULL CHECK(status IN ('PENDING','APPROVED','REJECTED')),
        created_at    BIGINT NOT NULL,
        decided_at    BIGINT,
        decided_by    TEXT   REFERENCES users(id)
      )
    `);

    // ── Billing: plan catalog + per-department subscriptions ─────────────────
    // Admin pays; all doctors in the department inherit access via the active row.
    // Multiple plan rows support different terms (monthly, annual, tiers, etc.).
    await run(`
      CREATE TABLE IF NOT EXISTS subscription_plans (
        id                 TEXT    PRIMARY KEY,
        slug               TEXT    UNIQUE,
        paystack_plan_code TEXT    UNIQUE NOT NULL,
        name               TEXT    NOT NULL,
        description        TEXT,
        billing_interval   TEXT    NOT NULL CHECK(billing_interval IN (
          'hourly','daily','weekly','monthly','quarterly','biannually','annually'
        )),
        amount_cents       INTEGER NOT NULL,
        currency           TEXT    NOT NULL DEFAULT 'ZAR',
        invoice_limit      INTEGER,
        is_active          BOOLEAN NOT NULL DEFAULT TRUE,
        display_order      INTEGER NOT NULL DEFAULT 0,
        created_at         BIGINT  NOT NULL,
        updated_at         BIGINT  NOT NULL
      )
    `);

    // One open row per department (ended_at IS NULL). History kept when plans change or cancel.
    await run(`
      CREATE TABLE IF NOT EXISTS department_subscriptions (
        id                          TEXT    PRIMARY KEY,
        department_id               TEXT    NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
        plan_id                     TEXT    NOT NULL REFERENCES subscription_plans(id),
        status                      TEXT    NOT NULL CHECK(status IN (
          'PENDING','ACTIVE','NON_RENEWING','ATTENTION','PAST_DUE',
          'CANCELLED','COMPLETED','INCOMPLETE'
        )),
        subscribed_by_user_id       TEXT    REFERENCES users(id),
        paystack_subscription_code  TEXT    UNIQUE,
        paystack_customer_code      TEXT,
        paystack_authorization_code TEXT,
        checkout_reference          TEXT,
        current_period_start        BIGINT,
        current_period_end          BIGINT,
        next_payment_at             BIGINT,
        ended_at                    BIGINT,
        end_reason                  TEXT    CHECK(end_reason IS NULL OR end_reason IN (
          'CHECKOUT_ABANDONED','CHECKOUT_FAILED','CANCELLED','COMPLETED',
          'PLAN_CHANGED','REPLACED','EXPIRED'
        )),
        created_at                  BIGINT  NOT NULL,
        updated_at                  BIGINT  NOT NULL
      )
    `);

    // Webhook / audit log — optional payload for debugging and reconciliation.
    await run(`
      CREATE TABLE IF NOT EXISTS subscription_events (
        id                        TEXT    PRIMARY KEY,
        department_subscription_id TEXT   REFERENCES department_subscriptions(id) ON DELETE SET NULL,
        department_id             TEXT    NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
        event_type                TEXT    NOT NULL,
        paystack_event_id         TEXT,
        payload_json              TEXT,
        created_at                BIGINT  NOT NULL
      )
    `);

    await run(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_department_subscriptions_current
        ON department_subscriptions(department_id)
        WHERE ended_at IS NULL
    `);
    await run(`
      CREATE INDEX IF NOT EXISTS idx_department_subscriptions_dept_status
        ON department_subscriptions(department_id, status)
    `);
    await run(`
      CREATE INDEX IF NOT EXISTS idx_department_subscriptions_paystack_code
        ON department_subscriptions(paystack_subscription_code)
        WHERE paystack_subscription_code IS NOT NULL
    `);
    await run(`
      CREATE INDEX IF NOT EXISTS idx_subscription_plans_active
        ON subscription_plans(is_active, display_order)
    `);
    await run(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_events_paystack
        ON subscription_events(paystack_event_id)
        WHERE paystack_event_id IS NOT NULL
    `);

    await this.seedSubscriptionPlans();

    // Performance indexes
    await run(`CREATE INDEX IF NOT EXISTS idx_shifts_roster_date       ON shifts(roster_id, date)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_shifts_doctor             ON shifts(doctor_id)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_requests_doctor           ON requests(doctor_id)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_requests_date             ON requests(date)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_requests_status           ON requests(status)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_requests_department       ON requests(department_id)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_rosters_department        ON rosters(department_id)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_user_departments_user     ON user_departments(user_id)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_user_departments_dept     ON user_departments(department_id)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_users_email               ON users(email)`);

    console.log('PostgreSQL schema initialised successfully');
  }

  /** Upsert all catalog plans (monthly, biannual, annual) from Paystack when configured. */
  private async seedSubscriptionPlans(): Promise<void> {
    for (const entry of getSubscriptionPlanCatalog()) {
      await this.upsertSubscriptionPlanOffering(entry);
    }
  }

  private async upsertSubscriptionPlanOffering(entry: {
    slug: string;
    paystackPlanCode: string;
    displayOrder: number;
    fallbackName: string;
    fallbackInterval: SubscriptionBillingInterval;
  }): Promise<void> {
    const now = Date.now();
    let name = entry.fallbackName;
    let billingInterval = entry.fallbackInterval;
    let amountCents = 0;
    let currency = 'ZAR';

    try {
      const plan = await fetchPlan(entry.paystackPlanCode);
      name = plan.name;
      billingInterval = plan.interval as SubscriptionBillingInterval;
      amountCents = plan.amount;
      currency = plan.currency;
    } catch {
      // Offline or missing secret — use fallbacks; Paystack sync can refresh later.
    }

    const existing = await this.get(
      'SELECT id FROM subscription_plans WHERE paystack_plan_code = ?',
      [entry.paystackPlanCode]
    );

    if (existing) {
      await this.run(
        `UPDATE subscription_plans SET
          slug = ?, name = ?, billing_interval = ?, amount_cents = ?, currency = ?,
          display_order = ?, is_active = TRUE, updated_at = ?
         WHERE id = ?`,
        [entry.slug, name, billingInterval, amountCents, currency, entry.displayOrder, now, existing.id]
      );
      return;
    }

    await this.run(
      `INSERT INTO subscription_plans (
        id, slug, paystack_plan_code, name, billing_interval, amount_cents, currency,
        invoice_limit, is_active, display_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, TRUE, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        entry.slug,
        entry.paystackPlanCode,
        name,
        billingInterval,
        amountCents,
        currency,
        entry.displayOrder,
        now,
        now,
      ]
    );
  }
}
