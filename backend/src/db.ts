import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;

const ssl = connectionString && (
  connectionString.includes('neon.tech') ||
  connectionString.includes('supabase.co') ||
  connectionString.includes('supabase.com') ||
  process.env.PGSSLMODE === 'require' ||
  process.env.NODE_ENV === 'production'
) ? { rejectUnauthorized: false } : undefined;

export const db = new Pool({
  connectionString,
  ssl,
});
