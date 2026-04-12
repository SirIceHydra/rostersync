import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class Database {
  private db: sqlite3.Database;
  private static instance: Database;
  private initialized: boolean = false;
  private initPromise: Promise<void> | null = null;

  private constructor(dbPath: string) {
    // Ensure the data directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`Created data directory: ${dir}`);
    }

    this.db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Database connection error:', err);
      } else {
        console.log(`Connected to SQLite database at ${dbPath}`);
      }
    });
    
    // Initialize schema and store promise
    this.initPromise = this.initializeSchema();
  }

  static getInstance(dbPath?: string): Database {
    if (!Database.instance) {
      const resolvedPath = dbPath || process.env.DB_PATH || './data/rostersync.db';
      Database.instance = new Database(resolvedPath);
    }
    return Database.instance;
  }
  
  // Wait for initialization to complete
  async waitForInit(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
    }
  }

  private async initializeSchema(): Promise<void> {
    const runQuery = (sql: string): Promise<void> => {
      return new Promise((resolve, reject) => {
        this.db.run(sql, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    };

    try {
      // Users table - includes cumulative tracking for fairness across months
      await runQuery(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          name TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('ADMIN', 'DOCTOR')),
          firm TEXT,
          cumulative_holiday_hours INTEGER DEFAULT 0,
          cumulative_total_hours INTEGER DEFAULT 0,
          cumulative_weekend_shifts INTEGER DEFAULT 0,
          start_date INTEGER,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `);
      
      // Migration: add new columns if they don't exist (for existing databases)
      await runQuery(`ALTER TABLE users ADD COLUMN cumulative_total_hours INTEGER DEFAULT 0`).catch(() => {});
      await runQuery(`ALTER TABLE users ADD COLUMN cumulative_weekend_shifts INTEGER DEFAULT 0`).catch(() => {});
      await runQuery(`ALTER TABLE users ADD COLUMN start_date INTEGER`).catch(() => {});

      // Departments table (multi-tenant: each has unique code)
      await runQuery(`
        CREATE TABLE IF NOT EXISTS departments (
          id TEXT PRIMARY KEY,
          code TEXT UNIQUE NOT NULL,
          name TEXT,
          created_at INTEGER NOT NULL,
          created_by TEXT,
          FOREIGN KEY (created_by) REFERENCES users(id)
        )
      `);
      await runQuery(`CREATE UNIQUE INDEX IF NOT EXISTS idx_departments_code ON departments(code)`);

      // User–department membership (one user can belong to many departments)
      await runQuery(`
        CREATE TABLE IF NOT EXISTS user_departments (
          user_id TEXT NOT NULL,
          department_id TEXT NOT NULL,
          role_in_dept TEXT NOT NULL CHECK(role_in_dept IN ('ADMIN', 'MEMBER')),
          joined_at INTEGER NOT NULL,
          PRIMARY KEY (user_id, department_id),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE
        )
      `);

      // Rosters table (scoped by department)
      await runQuery(`
        CREATE TABLE IF NOT EXISTS rosters (
          id TEXT PRIMARY KEY,
          department_id TEXT NOT NULL,
          month INTEGER NOT NULL,
          year INTEGER NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('DRAFT', 'FINAL')),
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          UNIQUE(department_id, month, year),
          FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE
        )
      `);

      // Shifts table (unchanged; roster has department)
      await runQuery(`
        CREATE TABLE IF NOT EXISTS shifts (
          id TEXT PRIMARY KEY,
          roster_id TEXT NOT NULL,
          date TEXT NOT NULL,
          doctor_id TEXT NOT NULL,
          template_id TEXT NOT NULL,
          is_public_holiday INTEGER DEFAULT 0,
          FOREIGN KEY (roster_id) REFERENCES rosters(id) ON DELETE CASCADE,
          FOREIGN KEY (doctor_id) REFERENCES users(id),
          UNIQUE(roster_id, date)
        )
      `);

      // Requests table (scoped by department)
      await runQuery(`
        CREATE TABLE IF NOT EXISTS requests (
          id TEXT PRIMARY KEY,
          department_id TEXT NOT NULL,
          doctor_id TEXT NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('UNAVAILABLE', 'SWAP', 'LEAVE')),
          date TEXT NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED')),
          reason TEXT,
          swap_with_doctor_id TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
          FOREIGN KEY (doctor_id) REFERENCES users(id),
          FOREIGN KEY (swap_with_doctor_id) REFERENCES users(id)
        )
      `);

      // Fairness settings per department
      await runQuery(`
        CREATE TABLE IF NOT EXISTS fairness_settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          department_id TEXT NOT NULL UNIQUE,
          hour_diff_limit INTEGER NOT NULL DEFAULT 24,
          weekend_diff_limit INTEGER NOT NULL DEFAULT 1,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE
        )
      `);

      // Department join requests (doctor requests to join a department)
      await runQuery(`
        CREATE TABLE IF NOT EXISTS department_join_requests (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          department_id TEXT NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED')),
          created_at INTEGER NOT NULL,
          decided_at INTEGER,
          decided_by TEXT,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
          FOREIGN KEY (decided_by) REFERENCES users(id)
        )
      `);

      // Migration: existing DBs may have rosters/requests without department_id
      const rosterInfo = await this.get('PRAGMA table_info(rosters)').catch(() => null);
      const hasDeptCol = rosterInfo && Array.isArray(rosterInfo) && rosterInfo.some((c: any) => c.name === 'department_id');
      if (!hasDeptCol && rosterInfo) {
        const defaultId = 'dept-default-' + Date.now();
        const defaultCode = 'LEGACY';
        const now = Date.now();
        // Avoid crashing if another service already inserted the LEGACY department
        await this.run(
          'INSERT OR IGNORE INTO departments (id, code, name, created_at, created_by) VALUES (?, ?, ?, ?, NULL)',
          [defaultId, defaultCode, 'Default (migrated)', now]
        );
        // Clean up any partial previous migration before recreating helper tables
        await this.run('DROP TABLE IF EXISTS rosters_new');
        await this.run(
          'CREATE TABLE rosters_new (id TEXT PRIMARY KEY, department_id TEXT NOT NULL, month INTEGER NOT NULL, year INTEGER NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, UNIQUE(department_id, month, year))'
        );
        // Legacy installs could have multiple rosters for the same month/year.
        // When migrating, keep a single roster per (month, year) by grouping.
        await this.run(
          'INSERT INTO rosters_new (id, department_id, month, year, status, created_at, updated_at) ' +
          'SELECT id, ?, month, year, status, created_at, updated_at FROM rosters GROUP BY year, month',
          [defaultId]
        );
        await this.run('DROP TABLE rosters');
        await this.run('ALTER TABLE rosters_new RENAME TO rosters');
        const reqInfo = await this.get('PRAGMA table_info(requests)').catch(() => null);
        const reqHasDept = reqInfo && Array.isArray(reqInfo) && reqInfo.some((c: any) => c.name === 'department_id');
        if (!reqHasDept && reqInfo) {
          await this.run('DROP TABLE IF EXISTS requests_new');
          await this.run(
            'CREATE TABLE requests_new (id TEXT PRIMARY KEY, department_id TEXT NOT NULL, doctor_id TEXT NOT NULL, type TEXT NOT NULL, date TEXT NOT NULL, status TEXT NOT NULL, reason TEXT, swap_with_doctor_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)'
          );
          await this.run(
            'INSERT INTO requests_new SELECT id, ?, doctor_id, type, date, status, reason, swap_with_doctor_id, created_at, updated_at FROM requests',
            [defaultId]
          );
          await this.run('DROP TABLE requests');
          await this.run('ALTER TABLE requests_new RENAME TO requests');
        }
        const users = await this.all('SELECT id, role FROM users');
        for (const u of users) {
          await this.run(
            'INSERT OR IGNORE INTO user_departments (user_id, department_id, role_in_dept, joined_at) VALUES (?, ?, ?, ?)',
            [u.id, defaultId, u.role === 'ADMIN' ? 'ADMIN' : 'MEMBER', now]
          );
        }
        // Only seed fairness_settings with a department_id column if that column exists.
        // On very old databases, fairness_settings has no department_id yet; the legacy
        // migration below will recreate it with the right shape.
        const fairnessInfoEarly = await this.all('PRAGMA table_info(fairness_settings)').catch(() => null);
        const hasDeptInFairnessEarly = Array.isArray(fairnessInfoEarly) && fairnessInfoEarly.some((c: any) => c.name === 'department_id');
        if (hasDeptInFairnessEarly) {
          const oldFairness = await this.get('SELECT hour_diff_limit, weekend_diff_limit, created_at, updated_at FROM fairness_settings WHERE id = 1').catch(() => null);
          const hLimit = oldFairness?.hour_diff_limit ?? 24;
          const wLimit = oldFairness?.weekend_diff_limit ?? 1;
          const fCreated = oldFairness?.created_at ?? now;
          const fUpdated = oldFairness?.updated_at ?? now;
          await this.run(
            'INSERT OR IGNORE INTO fairness_settings (department_id, hour_diff_limit, weekend_diff_limit, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
            [defaultId, hLimit, wLimit, fCreated, fUpdated]
          );
        }
      }

      // Legacy: if fairness_settings has old schema (id=1), migrate to department-scoped
      const fairnessCols = await this.get('PRAGMA table_info(fairness_settings)').catch(() => null);
      const hasDeptInFairness = fairnessCols && Array.isArray(fairnessCols) && fairnessCols.some((c: any) => c.name === 'department_id');
      if (!hasDeptInFairness && fairnessCols) {
        await this.run(
          'CREATE TABLE IF NOT EXISTS fairness_settings_new (id INTEGER PRIMARY KEY AUTOINCREMENT, department_id TEXT NOT NULL UNIQUE, hour_diff_limit INTEGER NOT NULL DEFAULT 24, weekend_diff_limit INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)'
        );
        const defaultDept = await this.get('SELECT id FROM departments LIMIT 1');
        if (defaultDept) {
          const row = await this.get('SELECT hour_diff_limit, weekend_diff_limit, created_at, updated_at FROM fairness_settings LIMIT 1');
          const now2 = Date.now();
          await this.run(
            'INSERT INTO fairness_settings_new (department_id, hour_diff_limit, weekend_diff_limit, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
            [defaultDept.id, row?.hour_diff_limit ?? 24, row?.weekend_diff_limit ?? 1, row?.created_at ?? now2, row?.updated_at ?? now2]
          );
        }
        await this.run('DROP TABLE fairness_settings');
        await this.run('ALTER TABLE fairness_settings_new RENAME TO fairness_settings');
      }

      // Create indexes for performance
      await runQuery(`CREATE INDEX IF NOT EXISTS idx_shifts_roster_date ON shifts(roster_id, date)`);
      await runQuery(`CREATE INDEX IF NOT EXISTS idx_shifts_doctor ON shifts(doctor_id)`);
      await runQuery(`CREATE INDEX IF NOT EXISTS idx_requests_doctor ON requests(doctor_id)`);
      await runQuery(`CREATE INDEX IF NOT EXISTS idx_requests_date ON requests(date)`);
      await runQuery(`CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status)`);
      await runQuery(`CREATE INDEX IF NOT EXISTS idx_requests_department ON requests(department_id)`);
      await runQuery(`CREATE INDEX IF NOT EXISTS idx_rosters_department ON rosters(department_id)`);
      await runQuery(`CREATE INDEX IF NOT EXISTS idx_user_departments_user ON user_departments(user_id)`);
      await runQuery(`CREATE INDEX IF NOT EXISTS idx_user_departments_department ON user_departments(department_id)`);
      await runQuery(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);

      this.initialized = true;
      console.log('Database schema initialized successfully');
    } catch (error) {
      console.error('Failed to initialize database schema:', error);
      throw error;
    }
  }

  getDb(): sqlite3.Database {
    return this.db;
  }

  // Promisified database methods
  run(sql: string, params: any[] = []): Promise<sqlite3.RunResult> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve(this);
      });
    });
  }

  get(sql: string, params: any[] = []): Promise<any> {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  all(sql: string, params: any[] = []): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}
