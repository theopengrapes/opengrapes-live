import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const LMS_JWT_SECRET = process.env.LMS_JWT_SECRET || 'fallback-secret-for-dev-only-change-this';

export interface UserPayload {
  userId: number;
  role: 'teacher' | 'student';
  name: string;
  email?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: UserPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization token missing or invalid format' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, LMS_JWT_SECRET) as UserPayload;
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired authorization token' });
  }
}

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || 'fallback-access-secret';

// Middleware for endpoints called exclusively from the classroom subdomain
export function requireClassroomAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization token missing' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, ACCESS_TOKEN_SECRET) as any;
    if (decoded.type !== 'access') {
      return res.status(401).json({ error: 'Invalid token type' });
    }
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired classroom access token' });
  }
}

// Middleware for endpoints called from both dashboard and classroom (e.g. /api/end-class)
export function requireLMSOrClassroomAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization token missing' });
  }
  const token = authHeader.split(' ')[1];

  // Try LMS Token verification
  try {
    const decoded = jwt.verify(token, LMS_JWT_SECRET) as any;
    req.user = decoded;
    return next();
  } catch (e) {}

  // Try Classroom Access Token verification
  try {
    const decoded = jwt.verify(token, ACCESS_TOKEN_SECRET) as any;
    if (decoded.type === 'access') {
      req.user = decoded;
      return next();
    }
  } catch (e) {}

  return res.status(401).json({ error: 'Invalid or expired authorization token' });
}

export function requireRole(role: 'teacher' | 'student') {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (req.user.role !== role) {
      return res.status(403).json({ error: `Forbidden: requires ${role} role` });
    }

    next();
  };
}
