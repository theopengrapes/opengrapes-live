import Database from 'better-sqlite3';
export declare const db: Database.Database;
export declare function insertHandoffCode(code: string, userId: number, role: string, roomId: string, batchId: number): void;
