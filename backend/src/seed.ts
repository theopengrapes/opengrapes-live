import { db } from './db';
import bcrypt from 'bcrypt';

async function seed() {
  console.log('Seeding database...');

  // 1. Hash passwords
  const teacherPasswordHash = await bcrypt.hash('teacher123', 10);
  const studentPasswordHash = await bcrypt.hash('student123', 10);

  // 2. Insert Users (using INSERT OR IGNORE since email is UNIQUE)
  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (name, email, password_hash, role)
    VALUES (?, ?, ?, ?)
  `);

  insertUser.run('Prof. Malhotra', 'teacher@opengrapes.com', teacherPasswordHash, 'teacher');
  insertUser.run('Riya', 'riya@test.com', studentPasswordHash, 'student');
  insertUser.run('Arjun', 'arjun@test.com', studentPasswordHash, 'student');
  insertUser.run('Priya', 'priya@test.com', studentPasswordHash, 'student');
  insertUser.run('Sameer', 'sameer@test.com', studentPasswordHash, 'student');
  insertUser.run('Neha', 'neha@test.com', studentPasswordHash, 'student');
  insertUser.run('Rohan', 'rohan@test.com', studentPasswordHash, 'student');
  insertUser.run('Anjali', 'anjali@test.com', studentPasswordHash, 'student');
  insertUser.run('Vikram', 'vikram@test.com', studentPasswordHash, 'student');
  insertUser.run('Tanvi', 'tanvi@test.com', studentPasswordHash, 'student');
  insertUser.run('Kabir', 'kabir@test.com', studentPasswordHash, 'student');

  console.log('Users seeded.');

  // 3. Get IDs of seeded users
  const getUserId = (email: string): number => {
    const row = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: number };
    return row.id;
  };

  const teacherId = getUserId('teacher@opengrapes.com');
  const riyaId = getUserId('riya@test.com');
  const arjunId = getUserId('arjun@test.com');
  const priyaId = getUserId('priya@test.com');
  const sameerId = getUserId('sameer@test.com');
  const nehaId = getUserId('neha@test.com');
  const rohanId = getUserId('rohan@test.com');
  const anjaliId = getUserId('anjali@test.com');
  const vikramId = getUserId('vikram@test.com');
  const tanviId = getUserId('tanvi@test.com');
  const kabirId = getUserId('kabir@test.com');

  // 4. Insert Batches (to make it idempotent, check if they exist first, or insert if name doesn't exist)
  const insertBatch = db.prepare(`
    INSERT INTO batches (name, teacher_id)
    SELECT ?, ?
    WHERE NOT EXISTS (SELECT 1 FROM batches WHERE name = ?)
  `);

  insertBatch.run('Math 101 — Batch A', teacherId, 'Math 101 — Batch A');
  insertBatch.run('Physics — Batch B', teacherId, 'Physics — Batch B');

  console.log('Batches seeded.');

  // 5. Get batch IDs
  const getBatchId = (name: string): number => {
    const row = db.prepare('SELECT id FROM batches WHERE name = ?').get(name) as { id: number };
    return row.id;
  };

  const batchAId = getBatchId('Math 101 — Batch A');
  const batchBId = getBatchId('Physics — Batch B');

  // 6. Insert Enrollments (using INSERT OR IGNORE since student_id, batch_id is UNIQUE)
  const insertEnrollment = db.prepare(`
    INSERT OR IGNORE INTO enrollments (student_id, batch_id)
    VALUES (?, ?)
  `);

  // Batch A: Riya, Arjun, Priya, Rohan, Anjali, Vikram
  insertEnrollment.run(riyaId, batchAId);
  insertEnrollment.run(arjunId, batchAId);
  insertEnrollment.run(priyaId, batchAId);
  insertEnrollment.run(rohanId, batchAId);
  insertEnrollment.run(anjaliId, batchAId);
  insertEnrollment.run(vikramId, batchAId);

  // Batch B: Sameer, Neha, Vikram, Tanvi, Kabir
  insertEnrollment.run(sameerId, batchBId);
  insertEnrollment.run(nehaId, batchBId);
  insertEnrollment.run(vikramId, batchBId);
  insertEnrollment.run(tanviId, batchBId);
  insertEnrollment.run(kabirId, batchBId);

  console.log('Enrollments seeded.');
  console.log('Database seeding completed successfully.');
}

seed().catch((err) => {
  console.error('Error seeding database:', err);
  process.exit(1);
});
