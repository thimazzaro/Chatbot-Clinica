import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ─── contacts ───────────────────────────────────────────────────────────────
export const contacts = sqliteTable('contacts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  phone_number: text('phone_number').notNull().unique(),
  name: text('name'),
  created_at: text('created_at').notNull().default(sql`(datetime('now'))`),
  last_interaction_at: text('last_interaction_at').notNull().default(sql`(datetime('now'))`),
});

// ─── sessions ────────────────────────────────────────────────────────────────
export const sessions = sqliteTable('sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  phone_number: text('phone_number').notNull().unique(),
  current_flow: text('current_flow').notNull().default('idle'),
  current_step: text('current_step').notNull().default(''),
  context_json: text('context_json').notNull().default('{}'),
  updated_at: text('updated_at').notNull().default(sql`(datetime('now'))`),
  expires_at: text('expires_at').notNull().default(sql`(datetime('now', '+30 minutes'))`),
});

// ─── appointments ────────────────────────────────────────────────────────────
export const appointments = sqliteTable('appointments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  contact_id: integer('contact_id')
    .notNull()
    .references(() => contacts.id),
  procedure_name: text('procedure_name').notNull(),
  procedure_id: text('procedure_id').notNull(),
  scheduled_date: text('scheduled_date').notNull(), // YYYY-MM-DD
  scheduled_time: text('scheduled_time').notNull(), // HH:MM
  status: text('status', { enum: ['pending', 'confirmed', 'cancelled', 'completed'] })
    .notNull()
    .default('pending'),
  reminder_24h_sent: integer('reminder_24h_sent', { mode: 'boolean' }).notNull().default(false),
  reminder_2h_sent: integer('reminder_2h_sent', { mode: 'boolean' }).notNull().default(false),
  created_at: text('created_at').notNull().default(sql`(datetime('now'))`),
});

// ─── blocked_slots ───────────────────────────────────────────────────────────
export const blocked_slots = sqliteTable('blocked_slots', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  date: text('date').notNull(), // YYYY-MM-DD
  time: text('time').notNull(), // HH:MM
  reason: text('reason'),
});

// ─── human_handoffs ──────────────────────────────────────────────────────────
export const human_handoffs = sqliteTable('human_handoffs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  phone_number: text('phone_number').notNull(),
  reason: text('reason'),
  context_json: text('context_json').notNull().default('{}'),
  paused_until: text('paused_until').notNull(),
  created_at: text('created_at').notNull().default(sql`(datetime('now'))`),
  resolved_at: text('resolved_at'),
});

// ─── message_logs ────────────────────────────────────────────────────────────
export const message_logs = sqliteTable('message_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  phone_number: text('phone_number').notNull(),
  direction: text('direction', { enum: ['in', 'out'] }).notNull(),
  message_type: text('message_type').notNull(),
  content_json: text('content_json').notNull(),
  whatsapp_message_id: text('whatsapp_message_id').unique(),
  created_at: text('created_at').notNull().default(sql`(datetime('now'))`),
});

// ─── Types ───────────────────────────────────────────────────────────────────
export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Appointment = typeof appointments.$inferSelect;
export type NewAppointment = typeof appointments.$inferInsert;
export type BlockedSlot = typeof blocked_slots.$inferSelect;
export type HumanHandoff = typeof human_handoffs.$inferSelect;
export type MessageLog = typeof message_logs.$inferSelect;
