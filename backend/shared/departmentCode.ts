/**
 * Generate a unique department code (8 chars, uppercase alphanumeric).
 * Used when an admin creates a new department at registration.
 */
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0,O,1,I to avoid confusion

export function generateDepartmentCode(): string {
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += CHARS.charAt(Math.floor(Math.random() * CHARS.length));
  }
  return code;
}

export async function generateUniqueDepartmentCode(db: { get: (sql: string, params?: any[]) => Promise<any> }): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = generateDepartmentCode();
    const existing = await db.get('SELECT id FROM departments WHERE code = ?', [code]);
    if (!existing) return code;
  }
  return generateDepartmentCode() + Date.now().toString(36).slice(-4);
}
