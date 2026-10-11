import "server-only";
import { createClient, type Client, type InValue } from "@libsql/client";

let client: Client | undefined;
let initialized: Promise<void> | undefined;
const schema = [
  "CREATE TABLE IF NOT EXISTS site_settings (id TEXT PRIMARY KEY, config TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS pdf_shares (id TEXT PRIMARY KEY, filename TEXT NOT NULL, size INTEGER NOT NULL, creator_hash TEXT NOT NULL, upload_hash TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL, upload_expires INTEGER NOT NULL)",
  "CREATE INDEX IF NOT EXISTS pdf_shares_creator ON pdf_shares (creator_hash, status)",
  "CREATE INDEX IF NOT EXISTS pdf_shares_expiry ON pdf_shares (status, upload_expires)",
  "CREATE TABLE IF NOT EXISTS share_events (id TEXT PRIMARY KEY, creator_hash TEXT NOT NULL, created_at INTEGER NOT NULL)",
  "CREATE INDEX IF NOT EXISTS share_events_created ON share_events (created_at)",
  "CREATE INDEX IF NOT EXISTS share_events_creator ON share_events (creator_hash, created_at)",
  "CREATE TABLE IF NOT EXISTS owner_login (id TEXT PRIMARY KEY, password_hash TEXT NOT NULL, session_version TEXT NOT NULL, updated_at INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS owner_sessions (token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, version TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS login_attempts (id TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS migration_state (id TEXT PRIMARY KEY, completed_at INTEGER NOT NULL)",
];
function connection() {
  if (!client) {
    const url = process.env.TURSO_DATABASE_URL;
    if (!url) throw new Error("Database not configured");
    client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  }
  return client;
}
async function ready() {
  initialized ??= connection().batch(schema, "write").then(() => {}).catch(error => {
    initialized = undefined;
    throw error;
  });
  await initialized;
  return connection();
}
class Statement {
  constructor(readonly sql: string, readonly args: InValue[] = []) {}
  bind(...args: InValue[]) { return new Statement(this.sql, args); }
  async first<T>() { const result = await (await ready()).execute(this); return (result.rows[0] as T | undefined) ?? null; }
  async all<T>() { const result = await (await ready()).execute(this); return { results: result.rows as unknown as T[] }; }
  async run() { const result = await (await ready()).execute(this); return { meta: { changes: result.rowsAffected } }; }
}
export const database = {
  prepare(sql: string) { return new Statement(sql); },
  async batch(statements: Statement[]) {
    const results = await (await ready()).batch(statements.map(({ sql, args }) => ({ sql, args })), "write");
    return results.map(result => ({ meta: { changes: result.rowsAffected } }));
  },
};
