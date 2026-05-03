import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-in-production';

// Configurable via env. Default 5 days — matches enterprise "stay logged in" expectation.
// Set JWT_EXPIRY_DAYS=1 for short-lived tokens, =30 for long-lived ones.
const JWT_EXPIRY_DAYS = parseInt(process.env.JWT_EXPIRY_DAYS ?? '5', 10) || 5;
const JWT_EXPIRY_SECONDS = JWT_EXPIRY_DAYS * 24 * 60 * 60;

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
}

export function generateToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY_SECONDS });
}

/** Returns the expiry timestamp (ms) of a freshly-issued token. */
export function tokenExpiresAt(): number {
  return Date.now() + JWT_EXPIRY_SECONDS * 1000;
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch (error) {
    return null;
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.substring(7);
  const payload = verifyToken(token);

  if (!payload) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  // Attach user info to request
  (req as any).user = payload;
  next();
}

export function adminOnly(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;
  
  if (!user || user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  next();
}

/** Require X-Department-Id header and validate user is member of that department. Use after authMiddleware. */
export function requireDepartment(getDb: () => { get: (sql: string, params?: any[]) => Promise<any> }) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const departmentId = req.headers['x-department-id'] as string;
    if (!departmentId || !departmentId.trim()) {
      return res.status(400).json({ error: 'X-Department-Id header required' });
    }

    try {
      const db = getDb();
      const member = await db.get(
        'SELECT 1 FROM user_departments WHERE user_id = ? AND department_id = ?',
        [user.userId, departmentId.trim()]
      );
      if (!member) {
        return res.status(403).json({ error: 'Not a member of this department. Join with the department code first.' });
      }
      (req as any).departmentId = departmentId.trim();
      next();
    } catch (e) {
      res.status(500).json({ error: 'Failed to verify department' });
    }
  };
}
