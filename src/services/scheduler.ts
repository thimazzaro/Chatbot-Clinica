import cron from 'node-cron';
import { db } from '../db/index.js';
import { appointments, contacts } from '../db/schema.js';
import { and, eq, lte, or } from 'drizzle-orm';
import { sendTemplateMessage } from './meta-api.js';
import { purgeExpiredSessions } from '../models/session.js';
import { logger } from './logger.js';

/**
 * Inicia todos os cron jobs da aplicação.
 * Deve ser chamado uma vez no startup, após o banco estar pronto.
 */
export function startScheduler(): void {
  // ─── Lembretes 24h — roda a cada 30 min ────────────────────────────────
  cron.schedule('*/30 * * * *', () => {
    void sendReminders24h().catch((err) =>
      logger.error({ err }, 'Erro no cron de lembretes 24h'),
    );
  });

  // ─── Lembretes 2h — roda a cada 15 min ─────────────────────────────────
  cron.schedule('*/15 * * * *', () => {
    void sendReminders2h().catch((err) =>
      logger.error({ err }, 'Erro no cron de lembretes 2h'),
    );
  });

  // ─── Purga sessões expiradas — roda a cada hora ─────────────────────────
  cron.schedule('0 * * * *', () => {
    void purgeExpiredSessions().catch((err) =>
      logger.error({ err }, 'Erro ao purgar sessões'),
    );
  });

  logger.info('Scheduler iniciado (lembretes 24h/2h + purge de sessões)');
}

// ─── Lembrete 24h ────────────────────────────────────────────────────────────
async function sendReminders24h(): Promise<void> {
  const now = new Date();

  // Janela: agendamentos entre 23h e 25h a partir de agora
  const from = new Date(now.getTime() + 23 * 60 * 60 * 1000);
  const to = new Date(now.getTime() + 25 * 60 * 60 * 1000);

  const pending = await db
    .select({
      id: appointments.id,
      contactId: appointments.contact_id,
      procedureName: appointments.procedure_name,
      scheduledDate: appointments.scheduled_date,
      scheduledTime: appointments.scheduled_time,
      phone: contacts.phone_number,
      name: contacts.name,
    })
    .from(appointments)
    .innerJoin(contacts, eq(appointments.contact_id, contacts.id))
    .where(
      and(
        eq(appointments.reminder_24h_sent, false),
        or(eq(appointments.status, 'pending'), eq(appointments.status, 'confirmed')),
        lte(appointments.scheduled_date, to.toISOString().slice(0, 10)),
      ),
    );

  for (const appt of pending) {
    const apptDateTime = new Date(`${appt.scheduledDate}T${appt.scheduledTime}:00`);
    if (apptDateTime < from || apptDateTime > to) continue;

    try {
      await sendTemplateMessage(appt.phone, 'lembrete_24h', [
        appt.name ?? 'Paciente',
        appt.procedureName,
        appt.scheduledTime,
      ]);

      await db
        .update(appointments)
        .set({ reminder_24h_sent: true })
        .where(eq(appointments.id, appt.id));

      logger.info({ appointmentId: appt.id }, 'Lembrete 24h enviado');
    } catch (err) {
      logger.error({ err, appointmentId: appt.id }, 'Falha ao enviar lembrete 24h');
    }
  }
}

// ─── Lembrete 2h ─────────────────────────────────────────────────────────────
async function sendReminders2h(): Promise<void> {
  const now = new Date();

  const from = new Date(now.getTime() + 90 * 60 * 1000);   // 1h30
  const to = new Date(now.getTime() + 150 * 60 * 1000);    // 2h30

  const pending = await db
    .select({
      id: appointments.id,
      contactId: appointments.contact_id,
      procedureName: appointments.procedure_name,
      scheduledDate: appointments.scheduled_date,
      scheduledTime: appointments.scheduled_time,
      phone: contacts.phone_number,
      name: contacts.name,
    })
    .from(appointments)
    .innerJoin(contacts, eq(appointments.contact_id, contacts.id))
    .where(
      and(
        eq(appointments.reminder_2h_sent, false),
        or(eq(appointments.status, 'pending'), eq(appointments.status, 'confirmed')),
        lte(appointments.scheduled_date, to.toISOString().slice(0, 10)),
      ),
    );

  for (const appt of pending) {
    const apptDateTime = new Date(`${appt.scheduledDate}T${appt.scheduledTime}:00`);
    if (apptDateTime < from || apptDateTime > to) continue;

    try {
      await sendTemplateMessage(appt.phone, 'lembrete_2h', [
        appt.name ?? 'Paciente',
        appt.procedureName,
        appt.scheduledTime,
      ]);

      await db
        .update(appointments)
        .set({ reminder_2h_sent: true })
        .where(eq(appointments.id, appt.id));

      logger.info({ appointmentId: appt.id }, 'Lembrete 2h enviado');
    } catch (err) {
      logger.error({ err, appointmentId: appt.id }, 'Falha ao enviar lembrete 2h');
    }
  }
}
