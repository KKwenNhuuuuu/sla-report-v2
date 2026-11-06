import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
let dbInstance = null;

export async function initDB() {
    if (dbInstance) return dbInstance;

    dbInstance = await open({
        filename: path.join(here, '../helpdesk.sqlite'),
        driver: sqlite3.Database
    });

    await dbInstance.exec(`
        CREATE TABLE IF NOT EXISTS sites (id INTEGER PRIMARY KEY, timezone TEXT, business_hours TEXT);
        CREATE TABLE IF NOT EXISTS holidays (site_id INTEGER, date TEXT, name TEXT, PRIMARY KEY(site_id, date));
        CREATE TABLE IF NOT EXISTS staff (id INTEGER PRIMARY KEY, name TEXT);
        
        CREATE TABLE IF NOT EXISTS requests (
            id INTEGER PRIMARY KEY, 
            site_id INTEGER, 
            priority TEXT, 
            status TEXT, 
            created_at TEXT, 
            deleted_at TEXT, 
            merged_into_id INTEGER, 
            raw_data TEXT
        );
        
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY, 
            request_id INTEGER, 
            status TEXT, 
            at INTEGER, 
            actor_id INTEGER, 
            due_at TEXT, 
            reverts_id INTEGER, 
            raw_data TEXT
        );
        
        CREATE TABLE IF NOT EXISTS sync_state (key TEXT PRIMARY KEY, value TEXT);
    `);

    console.log("Đã khởi tạo xong schema SQLite!");
    return dbInstance;
}