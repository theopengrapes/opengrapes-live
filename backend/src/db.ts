import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve(__dirname, '../opengrapes.db');
export const db: Database.Database = new Database(dbPath);

// Enable foreign keys support in SQLite
db.pragma('foreign_keys = ON');

// Initialize schema tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('teacher', 'student')),
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    teacher_id INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS enrollments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES users(id),
    batch_id INTEGER NOT NULL REFERENCES batches(id),
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'suspended')),
    enrolled_at TEXT DEFAULT (datetime('now')),
    UNIQUE(student_id, batch_id)
  );

  CREATE TABLE IF NOT EXISTS live_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id INTEGER NOT NULL REFERENCES batches(id),
    room_id TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'live' CHECK(status IN ('live', 'completed', 'expired')),
    started_at TEXT DEFAULT (datetime('now')),
    ended_at TEXT,
    teacher_joined INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS handoff_codes (
    code TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    room_id TEXT NOT NULL,
    batch_id INTEGER,
    created_at INTEGER NOT NULL,
    used INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS doubts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    student_id INTEGER NOT NULL REFERENCES users(id),
    doubt_text TEXT NOT NULL,
    answer TEXT NOT NULL,
    screenshot TEXT, -- base64 representation of canvas or file
    timestamp TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS meeting_minutes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL UNIQUE REFERENCES live_sessions(room_id),
    content TEXT NOT NULL,
    generated_at TEXT DEFAULT (datetime('now'))
  );
`);

// Migrate database: add has_notes column to live_sessions if it doesn't exist
try {
  db.exec("ALTER TABLE live_sessions ADD COLUMN has_notes INTEGER DEFAULT 0");
} catch (error) {
  // Ignored if column already exists
}

// Migrate database: add teacher_joined column to live_sessions if it doesn't exist
try {
  db.exec("ALTER TABLE live_sessions ADD COLUMN teacher_joined INTEGER DEFAULT 0");
} catch (error) {
  // Ignored if column already exists
}

// Add a helper function to write to the handoff table and prune old codes (> 5 min)
export function insertHandoffCode(code: string, userId: number, role: string, roomId: string, batchId: number) {
  const now = Date.now();
  // Housekeeping: prune old entries
  db.prepare(`DELETE FROM handoff_codes WHERE created_at < ?`).run(now - 5 * 60 * 1000);
  
  // Insert new code
  db.prepare(`
    INSERT INTO handoff_codes (code, user_id, role, room_id, batch_id, created_at, used)
    VALUES (?, ?, ?, ?, ?, ?, 0)
  `).run(code, userId, role, roomId, batchId, now);
}
