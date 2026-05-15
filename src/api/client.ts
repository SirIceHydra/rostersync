/** Trimmed gateway URL, or empty string for same-origin `/api` (Vite proxy in dev; nginx in Docker SPA image). */
function resolveApiBase(): string {
  const raw = import.meta.env.VITE_API_URL;
  const fromEnv = typeof raw === 'string' ? raw.trim() : '';
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  if (import.meta.env.DEV) return '';
  return 'http://localhost:4000';
}

const API_BASE = resolveApiBase();

const AUTH_PATHS = ['/api/auth/register', '/api/auth/login', '/api/auth/verify', '/api/auth/join-department', '/api/auth/departments'];

export interface Department {
  id: string;
  code: string;
  name: string | null;
}

const TOKEN_EXPIRY_KEY = 'rs_token_exp';
// Refresh when fewer than this many ms remain on the token.
const REFRESH_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 1 day

class ApiClient {
  private token: string | null = null;
  private departmentId: string | null = null;
  private refreshing: Promise<void> | null = null;

  setToken(token: string | null, expiresAt?: number) {
    this.token = token;
    if (token) {
      localStorage.setItem('rs_token', token);
      // Store expiry alongside the token so we can check it without decoding JWT.
      const exp = expiresAt ?? Date.now() + 5 * 24 * 60 * 60 * 1000;
      localStorage.setItem(TOKEN_EXPIRY_KEY, String(exp));
    } else {
      localStorage.removeItem('rs_token');
      localStorage.removeItem(TOKEN_EXPIRY_KEY);
    }
  }

  getToken(): string | null {
    if (!this.token) {
      this.token = localStorage.getItem('rs_token');
    }
    return this.token;
  }

  /** Returns true if the stored token is expired (or missing). App should call this on init. */
  isTokenExpired(): boolean {
    const exp = localStorage.getItem(TOKEN_EXPIRY_KEY);
    if (!exp) return !this.getToken(); // no expiry stored → treat as expired only if no token
    return Date.now() > parseInt(exp, 10);
  }

  /** Returns true when the token exists but is within REFRESH_THRESHOLD_MS of expiry. */
  shouldRefresh(): boolean {
    const exp = localStorage.getItem(TOKEN_EXPIRY_KEY);
    if (!exp || !this.getToken()) return false;
    const remaining = parseInt(exp, 10) - Date.now();
    return remaining > 0 && remaining < REFRESH_THRESHOLD_MS;
  }

  /** Silently refreshes the token. Coalesces concurrent calls into one request. */
  async refreshToken(): Promise<void> {
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      try {
        const data = await this.request<{ token: string; tokenExpiresAt: number }>('/api/auth/refresh', { method: 'POST' });
        this.setToken(data.token, data.tokenExpiresAt);
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }

  setDepartmentId(id: string | null) {
    this.departmentId = id;
    if (id) {
      localStorage.setItem('rs_dept_id', id);
    } else {
      localStorage.removeItem('rs_dept_id');
    }
  }

  getDepartmentId(): string | null {
    if (!this.departmentId) {
      this.departmentId = localStorage.getItem('rs_dept_id');
    }
    return this.departmentId;
  }

  private needsDepartmentHeader(endpoint: string): boolean {
    return !AUTH_PATHS.some(p => endpoint.startsWith(p));
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = this.getToken();
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    }
    if (this.needsDepartmentHeader(endpoint)) {
      const deptId = this.getDepartmentId();
      if (deptId) {
        (headers as Record<string, string>)['X-Department-Id'] = deptId;
      }
    }

    let response: Response;
    try {
      response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(
        msg === 'Failed to fetch'
          ? `Could not reach the server (${API_BASE || '(same origin /api)'}). Run the API gateway on port 4000 (npm run dev in backend/), use npm run dev:all, or set VITE_API_URL / VITE_GATEWAY_PROXY_TARGET in .env — see README “URLs & ports”.`
          : msg
      );
    }

    if (!response.ok) {
      const ct = response.headers.get('content-type') ?? '';
      let message = `Request failed (${response.status})`;
      if (ct.includes('application/json')) {
        const error = await response.json().catch(() => ({}));
        message = (error as { error?: string }).error || message;
      } else {
        const text = await response.text().catch(() => '');
        const html =
          /cannot get\s+\/api/i.test(text) ||
          /<!\s*doctype\s+html/i.test(text) ||
          /<\/html>/i.test(text);
        if (html) {
          message =
            response.status === 404
              ? `API route not found (${endpoint}). The browser may be talking to the wrong server — use the API gateway at port 4000, leave VITE_API_URL empty in dev (Vite proxies /api), or see README “URLs & ports”.`
              : `Non-JSON error (${response.status}) from ${endpoint}. Check VITE_API_URL points at the gateway (http://localhost:4000), not a single microservice port.`;
        } else if (text) message = text.trim().slice(0, 280);
      }
      throw new Error(message);
    }

    return response.json();
  }

  // Auth
  async register(data: { email: string; password: string; name: string; role: string; firm?: string; departmentName?: string }) {
    return this.request<{ user: any; token: string; tokenExpiresAt?: number; department?: Department; departments: Department[] }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async login(email: string, password: string) {
    return this.request<{ user: any; token: string; tokenExpiresAt?: number; departments: Department[] }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async verify() {
    return this.request<{ user: any; departments: Department[] }>('/api/auth/verify');
  }

  async getDepartments() {
    return this.request<{ departments: Department[] }>('/api/auth/departments');
  }

  async joinDepartment(code: string) {
    return this.request<{ department: Department; alreadyMember?: boolean; pending?: boolean }>('/api/auth/join-department', {
      method: 'POST',
      body: JSON.stringify({ code: code.trim().toUpperCase() }),
    });
  }

  async getJoinRequests() {
    return this.request<{ requests: { id: string; userId: string; email: string; name: string; createdAt: number }[] }>('/api/auth/join-requests');
  }

  async approveJoinRequest(id: string) {
    return this.request<{ success: boolean; user?: any }>(`/api/auth/join-requests/${id}/approve`, {
      method: 'POST',
    });
  }

  async rejectJoinRequest(id: string) {
    return this.request<{ success: boolean }>(`/api/auth/join-requests/${id}/reject`, {
      method: 'POST',
    });
  }

  // Users
  async getDoctors(schedulingYear?: number) {
    const q =
      schedulingYear !== undefined && !Number.isNaN(schedulingYear)
        ? `?schedulingYear=${schedulingYear}`
        : '';
    return this.request<any[]>(`/api/users/doctors${q}`);
  }

  async getUsers() {
    return this.request<any[]>('/api/users');
  }

  async addUserByEmail(email: string) {
    return this.request<any>('/api/users', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  async addPlaceholder(name: string, firm: string) {
    return this.request<any>('/api/users/placeholder', {
      method: 'POST',
      body: JSON.stringify({ name, firm }),
    });
  }

  async linkPlaceholder(placeholderId: string, realUserId: string) {
    return this.request<any>(`/api/users/${placeholderId}/link`, {
      method: 'POST',
      body: JSON.stringify({ realUserId }),
    });
  }

  async getUnlinkedDoctors() {
    return this.request<Array<{ id: string; name: string; email: string; firm: string }>>('/api/users/unlinked');
  }

  async deleteUser(id: string) {
    return this.request<{ success: boolean }>(`/api/users/${id}`, {
      method: 'DELETE',
    });
  }

  async patchUser(
    id: string,
    body: Partial<{ name: string; firm: string; cumulativeHolidayHours: number; workloadStartMode: string }>
  ) {
    return this.request<any>(`/api/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  // Rosters
  async getRoster(year: number, month: number) {
    return this.request<any>(`/api/rosters/${year}/${month}`);
  }

  /** Rolling months of roster rows for this department (see GET /api/rosters/archive). */
  async getRosterArchive(months = 6) {
    return this.request<{
      entries: Array<{
        year: number;
        month: number;
        rosterId: string | null;
        status: string | null;
        updatedAt: number | null;
        hint?: string;
      }>;
    }>(`/api/rosters/archive?months=${encodeURIComponent(String(months))}`);
  }

  async generateRoster(month?: number, year?: number) {
    return this.request<{ roster: any; report: any }>('/api/rosters/generate', {
      method: 'POST',
      body: JSON.stringify({ month, year }),
    });
  }

  async updateShift(rosterId: string, shiftId: string, doctorId: string) {
    return this.request<{ success: boolean }>(`/api/rosters/${rosterId}/shifts/${shiftId}`, {
      method: 'PATCH',
      body: JSON.stringify({ doctorId }),
    });
  }

  async publishRoster(rosterId: string) {
    return this.request<{ success: boolean }>(`/api/rosters/${rosterId}/publish`, {
      method: 'POST',
    });
  }

  async unpublishRoster(rosterId: string) {
    return this.request<{ success: boolean; message: string }>(`/api/rosters/${rosterId}/unpublish`, {
      method: 'POST',
    });
  }

  /** Recompute cumulative hours/PH/weekends from all published rosters. Use if rosters were published before tracking was added. */
  async syncCumulative() {
    return this.request<{ success: boolean; message: string; doctorsUpdated: number }>('/api/rosters/sync-cumulative', {
      method: 'POST',
    });
  }

  // Requests
  async getApprovedSchedule(start: string, end: string) {
    const q = `start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
    return this.request<{ entries: { date: string; type: string; doctorId: string }[] }>(
      `/api/requests/approved-schedule?${q}`
    );
  }

  async getRequests() {
    return this.request<any[]>('/api/requests');
  }

  async createRequest(data: { type: string; date: string; reason?: string; swapWithDoctorId?: string; doctorId?: string }) {
    return this.request<any>('/api/requests', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateRequestStatus(id: string, status: string) {
    return this.request<any>(`/api/requests/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  // Analytics
  async getFairnessReport(year: number, month: number) {
    return this.request<any>(`/api/analytics/roster/${year}/${month}/fairness`);
  }

  async getFairnessSettings() {
    return this.request<{
      hourLimit: number;
      weekendLimit: number;
      maxShiftsPer7Days: number;
      minRestDays: number;
      allowConsecutiveShifts?: boolean;
      fairnessHistoryMode: 'ALL_TIME' | 'CALENDAR_YEAR';
    }>('/api/analytics/fairness-settings');
  }

  async getBillingPlan() {
    return this.request<{
      planCode: string;
      name: string;
      amount: number;
      currency: string;
      interval: string;
    }>('/api/billing/plan');
  }

  async initializeSubscription() {
    return this.request<{
      accessCode: string;
      authorizationUrl: string;
      reference: string;
    }>('/api/billing/subscribe/initialize', { method: 'POST' });
  }

  async updateFairnessSettings(settings: {
    hourLimit: number;
    weekendLimit: number;
    maxShiftsPer7Days: number;
    minRestDays: number;
    fairnessHistoryMode: 'ALL_TIME' | 'CALENDAR_YEAR';
  }) {
    return this.request<{
      success: boolean;
      hourLimit: number;
      weekendLimit: number;
      maxShiftsPer7Days: number;
      minRestDays: number;
      fairnessHistoryMode: 'ALL_TIME' | 'CALENDAR_YEAR';
    }>('/api/analytics/fairness-settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  }
}

export const api = new ApiClient();
