import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
export const siteSettings = sqliteTable("site_settings", {
  id: text("id").primaryKey(), config: text("config").notNull(),
  revision: integer("revision").notNull().default(1), updatedAt: text("updated_at").notNull(),
});
export const siteOwner = sqliteTable("site_owner", {
  id: text("id").primaryKey(), userId: text("user_id").notNull(), createdAt: text("created_at").notNull(),
});
export const pdfShares = sqliteTable("pdf_shares", {
  id: text("id").primaryKey(), filename: text("filename").notNull(), size: integer("size").notNull(),
  creatorHash: text("creator_hash").notNull(), uploadHash: text("upload_hash").notNull(),
  status: text("status").notNull(), createdAt: integer("created_at").notNull(),
  uploadExpires: integer("upload_expires").notNull(),
}, table => [index("idx_pdf_shares_creator_status").on(table.creatorHash, table.status), index("idx_pdf_shares_status_expiry").on(table.status, table.uploadExpires)]);
export const shareEvents = sqliteTable("share_events", {
  id: text("id").primaryKey(), creatorHash: text("creator_hash").notNull(), createdAt: integer("created_at").notNull(),
}, table => [index("idx_share_events_created").on(table.createdAt), index("idx_share_events_creator_created").on(table.creatorHash, table.createdAt)]);
