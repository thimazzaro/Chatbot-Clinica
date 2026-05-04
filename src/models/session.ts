import { db } from '../db/index.js';
import { sessions, contacts } from '../db/schema.js';
import { eq, lt } from 'drizzle-orm';
import { env } from '../config/env.js';
import { logger } from '../services/logger.js';

// ─── Flow state types ────────────────────────────────────────────────────────
export type FlowState =
  | 'idle'
  | 'scheduling:select_procedure'
  | 'scheduling:enter_name'
  | 'scheduling:select_date'
  | 'scheduling:select_time'
  | 'scheduling:confirm'
  | 'faq:chatting'
  | 'pricing:select_procedure'
  | 'handoff:waiting'
  | 'cancellation:select_appointment'
  | 'reschedule:select_date'
  | 'reschedule:select_time'
  | 'reschedule:confirm';

export interface SchedulingContext {
  procedureId?: string;
  procedureName?: string;
  patientName?: string;
  selectedDate?: string;   // YYYY-MM-DD
  selectedTime?: string;   // HH:MM
}

export interface FaqContext {
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export type SessionContext = SchedulingContext & FaqContext & Record<string, unknown>;

export interface SessionData {
  phoneNumber: string;
  flow: FlowState;
  step: string;
  context: SessionContext;
  expiresAt: Date;
}

// ─── In-memory cache to reduce DB reads ──────────────────────────────────────
const cache = new Map<string, SessionData>();

function nowPlusMinutes(minutes: number): Date {
  return new Date(Date.now() + minutes * 60 * 1000);
}

function toIso(d: Date): string {
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getSession(phoneNumber: string): Promise<SessionData> {
  // Check cache first
  const cached = cache.get(phoneNumber);
  if (cached && cached.expiresAt > new Date()) {
    return cached;
  }

  const [row] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.phone_number, phoneNumber));

  // Session expired or not found → return fresh idle session
  if (!row || new Date(row.expires_at) <= new Date()) {
    const fresh = makeFresh(phoneNumber);
    cache.set(phoneNumber, fresh);
    return fresh;
  }

  const parsed: SessionData = {
    phoneNumber,
    flow: row.current_flow as FlowState,
    step: row.current_step,
    context: JSON.parse(row.context_json) as SessionContext,
    expiresAt: new Date(row.expires_at),
  };
  cache.set(phoneNumber, parsed);
  return parsed;
}

export async function saveSession(data: SessionData): Promise<void> {
  const expires = nowPlusMinutes(env.SESSION_TIMEOUT_MINUTES);
  data.expiresAt = expires;
  cache.set(data.phoneNumber, data);

  await db
    .insert(sessions)
    .values({
      phone_number: data.phoneNumber,
      current_flow: data.flow,
      current_step: data.step,
      context_json: JSON.stringify(data.context),
      updated_at: toIso(new Date()),
      expires_at: toIso(expires),
    })
    .onConflictDoUpdate({
      target: sessions.phone_number,
      set: {
        current_flow: data.flow,
        current_step: data.step,
        context_json: JSON.stringify(data.context),
        updated_at: toIso(new Date()),
        expires_at: toIso(expires),
      },
    });
}

export async function resetSession(phoneNumber: string): Promise<SessionData> {
  const fresh = makeFresh(phoneNumber);
  await saveSession(fresh);
  return fresh;
}

export async function updateContact(phoneNumber: string, name?: string): Promise<void> {
  await db
    .insert(contacts)
    .values({
      phone_number: phoneNumber,
      name: name ?? null,
      last_interaction_at: toIso(new Date()),
    })
    .onConflictDoUpdate({
      target: contacts.phone_number,
      set: { last_interaction_at: toIso(new Date()), ...(name ? { name } : {}) },
    });
}

export async function getContactId(phoneNumber: string): Promise<number | null> {
  const [row] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(eq(contacts.phone_number, phoneNumber));
  return row?.id ?? null;
}

/** Limpa sessões expiradas do banco (chamado periodicamente) */
export async function purgeExpiredSessions(): Promise<void> {
  try {
    await db.delete(sessions).where(lt(sessions.expires_at, toIso(new Date())));
  } catch (err) {
    logger.warn({ err }, 'Falha ao purgar sessões expiradas');
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function makeFresh(phoneNumber: string): SessionData {
  return {
    phoneNumber,
    flow: 'idle',
    step: '',
    context: { history: [] },
    expiresAt: nowPlusMinutes(env.SESSION_TIMEOUT_MINUTES),
  };
}
