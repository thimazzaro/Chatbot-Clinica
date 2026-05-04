import { db } from '../db/index.js';
import { appointments, blocked_slots } from '../db/schema.js';
import { and, eq, gte, or } from 'drizzle-orm';
import { addDays, toDateStr } from '../utils/date-helpers.js';
import clinic from '../config/clinic.json';
import type { Appointment } from '../db/schema.js';

const { start_time, end_time, interval_minutes, working_days } = clinic.appointment_slots;

/** Gera todos os slots do dia (ex: ["09:00", "10:00", ...]) */
function generateDaySlots(): string[] {
  const slots: string[] = [];
  const [startH, startM] = start_time.split(':').map(Number) as [number, number];
  const [endH, endM] = end_time.split(':').map(Number) as [number, number];
  let totalMinutes = startH * 60 + startM;
  const endTotal = endH * 60 + endM;

  while (totalMinutes < endTotal) {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    totalMinutes += interval_minutes;
  }
  return slots;
}

/** Retorna slots livres para uma data */
export async function getAvailableSlots(dateStr: string): Promise<string[]> {
  const allSlots = generateDaySlots();

  // Busca agendamentos existentes e slots bloqueados
  const [bookedRows, blockedRows] = await Promise.all([
    db
      .select({ time: appointments.scheduled_time })
      .from(appointments)
      .where(
        and(
          eq(appointments.scheduled_date, dateStr),
          or(eq(appointments.status, 'pending'), eq(appointments.status, 'confirmed')),
        ),
      ),
    db
      .select({ time: blocked_slots.time })
      .from(blocked_slots)
      .where(eq(blocked_slots.date, dateStr)),
  ]);

  const occupied = new Set([
    ...bookedRows.map((r) => r.time),
    ...blockedRows.map((r) => r.time),
  ]);

  // Filtra horários passados
  const now = new Date();
  const [y, m, d] = dateStr.split('-').map(Number) as [number, number, number];

  return allSlots.filter((slot) => {
    if (occupied.has(slot)) return false;
    const [h, min] = slot.split(':').map(Number) as [number, number];
    const slotDate = new Date(y, m - 1, d, h, min);
    return slotDate > now;
  });
}

/** Retorna as próximas N datas com slots disponíveis */
export async function getNextAvailableDates(count = 3): Promise<string[]> {
  const result: string[] = [];
  let cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  let tries = 0;

  while (result.length < count && tries < 60) {
    cursor = addDays(cursor, 1);
    tries++;
    const dow = cursor.getDay(); // 0=dom..6=sab
    if (!(working_days as number[]).includes(dow)) continue;

    const dateStr = toDateStr(cursor);
    const slots = await getAvailableSlots(dateStr);
    if (slots.length > 0) result.push(dateStr);
  }

  return result;
}

/** Retorna agendamentos futuros (pending/confirmed) de um contato */
export async function getUpcomingAppointments(contactId: number): Promise<Appointment[]> {
  const today = toDateStr(new Date());
  return db
    .select()
    .from(appointments)
    .where(
      and(
        eq(appointments.contact_id, contactId),
        or(eq(appointments.status, 'pending'), eq(appointments.status, 'confirmed')),
        gte(appointments.scheduled_date, today),
      ),
    );
}

/** Cancela um agendamento pelo id */
export async function cancelAppointment(appointmentId: number): Promise<void> {
  await db
    .update(appointments)
    .set({ status: 'cancelled' })
    .where(eq(appointments.id, appointmentId));
}

/** Confirma o agendamento mais próximo de um contato (resposta ao lembrete) */
export async function confirmAppointmentByPhone(contactId: number): Promise<boolean> {
  const upcoming = await getUpcomingAppointments(contactId);
  if (upcoming.length === 0) return false;
  const next = upcoming.sort((a, b) =>
    `${a.scheduled_date} ${a.scheduled_time}`.localeCompare(`${b.scheduled_date} ${b.scheduled_time}`),
  )[0]!;
  await db.update(appointments).set({ status: 'confirmed' }).where(eq(appointments.id, next.id));
  return true;
}

/** Atualiza data e hora de um agendamento existente */
export async function updateAppointmentDateTime(
  appointmentId: number,
  date: string,
  time: string,
): Promise<void> {
  await db
    .update(appointments)
    .set({ scheduled_date: date, scheduled_time: time, status: 'confirmed', reminder_24h_sent: false, reminder_2h_sent: false })
    .where(eq(appointments.id, appointmentId));
}

/** Cria um agendamento no banco e retorna o id */
export async function createAppointment(params: {
  contactId: number;
  procedureId: string;
  procedureName: string;
  date: string;
  time: string;
}): Promise<number> {
  const [row] = await db
    .insert(appointments)
    .values({
      contact_id: params.contactId,
      procedure_id: params.procedureId,
      procedure_name: params.procedureName,
      scheduled_date: params.date,
      scheduled_time: params.time,
      status: 'confirmed',
    })
    .returning({ id: appointments.id });

  return row!.id;
}
