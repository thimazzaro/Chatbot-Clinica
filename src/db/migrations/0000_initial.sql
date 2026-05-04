CREATE TABLE IF NOT EXISTS `contacts` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `phone_number` text NOT NULL UNIQUE,
  `name` text,
  `created_at` text NOT NULL DEFAULT (datetime('now')),
  `last_interaction_at` text NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS `sessions` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `phone_number` text NOT NULL UNIQUE,
  `current_flow` text NOT NULL DEFAULT 'idle',
  `current_step` text NOT NULL DEFAULT '',
  `context_json` text NOT NULL DEFAULT '{}',
  `updated_at` text NOT NULL DEFAULT (datetime('now')),
  `expires_at` text NOT NULL DEFAULT (datetime('now', '+30 minutes'))
);

CREATE TABLE IF NOT EXISTS `appointments` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `contact_id` integer NOT NULL REFERENCES `contacts`(`id`),
  `procedure_name` text NOT NULL,
  `procedure_id` text NOT NULL,
  `scheduled_date` text NOT NULL,
  `scheduled_time` text NOT NULL,
  `status` text NOT NULL DEFAULT 'pending',
  `reminder_24h_sent` integer NOT NULL DEFAULT 0,
  `reminder_2h_sent` integer NOT NULL DEFAULT 0,
  `created_at` text NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS `blocked_slots` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `date` text NOT NULL,
  `time` text NOT NULL,
  `reason` text
);

CREATE TABLE IF NOT EXISTS `human_handoffs` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `phone_number` text NOT NULL,
  `reason` text,
  `context_json` text NOT NULL DEFAULT '{}',
  `paused_until` text NOT NULL,
  `created_at` text NOT NULL DEFAULT (datetime('now')),
  `resolved_at` text
);

CREATE TABLE IF NOT EXISTS `message_logs` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `phone_number` text NOT NULL,
  `direction` text NOT NULL,
  `message_type` text NOT NULL,
  `content_json` text NOT NULL,
  `whatsapp_message_id` text UNIQUE,
  `created_at` text NOT NULL DEFAULT (datetime('now'))
);
