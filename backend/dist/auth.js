"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
exports.requireClassroomAuth = requireClassroomAuth;
exports.requireLMSOrClassroomAuth = requireLMSOrClassroomAuth;
exports.requireRole = requireRole;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const LMS_JWT_SECRET = process.env.LMS_JWT_SECRET || 'fallback-secret-for-dev-only-change-this';
function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authorization token missing or invalid format' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, LMS_JWT_SECRET);
        req.user = decoded;
        next();
    }
    catch (error) {
        return res.status(401).json({ error: 'Invalid or expired authorization token' });
    }
}
const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || 'fallback-access-secret';
// Middleware for endpoints called exclusively from the classroom subdomain
function requireClassroomAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authorization token missing' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, ACCESS_TOKEN_SECRET);
        if (decoded.type !== 'access') {
            return res.status(401).json({ error: 'Invalid token type' });
        }
        req.user = decoded;
        next();
    }
    catch (error) {
        return res.status(401).json({ error: 'Invalid or expired classroom access token' });
    }
}
// Middleware for endpoints called from both dashboard and classroom (e.g. /api/end-class)
function requireLMSOrClassroomAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authorization token missing' });
    }
    const token = authHeader.split(' ')[1];
    // Try LMS Token verification
    try {
        const decoded = jsonwebtoken_1.default.verify(token, LMS_JWT_SECRET);
        req.user = decoded;
        return next();
    }
    catch (e) { }
    // Try Classroom Access Token verification
    try {
        const decoded = jsonwebtoken_1.default.verify(token, ACCESS_TOKEN_SECRET);
        if (decoded.type === 'access') {
            req.user = decoded;
            return next();
        }
    }
    catch (e) { }
    return res.status(401).json({ error: 'Invalid or expired authorization token' });
}
function requireRole(role) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const userRole = req.user.role;
        const isTeacher = userRole === 'teacher' || userRole === 'ADMIN';
        const isStudent = userRole === 'student' || userRole === 'STUDENT';
        if (role === 'teacher' && !isTeacher) {
            return res.status(403).json({ error: 'Forbidden: requires teacher role' });
        }
        if (role === 'student' && !isStudent) {
            return res.status(403).json({ error: 'Forbidden: requires student role' });
        }
        next();
    };
}
