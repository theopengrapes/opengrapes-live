import { Request, Response, NextFunction } from 'express';
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
export declare function requireAuth(req: Request, res: Response, next: NextFunction): Response<any, Record<string, any>> | undefined;
export declare function requireClassroomAuth(req: Request, res: Response, next: NextFunction): Response<any, Record<string, any>> | undefined;
export declare function requireLMSOrClassroomAuth(req: Request, res: Response, next: NextFunction): void | Response<any, Record<string, any>>;
export declare function requireRole(role: 'teacher' | 'student'): (req: Request, res: Response, next: NextFunction) => Response<any, Record<string, any>> | undefined;
