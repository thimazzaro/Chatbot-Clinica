import { sendTextMessage, type IncomingMessage } from '../services/meta-api.js';
import { saveSession, type SessionData } from '../models/session.js';
import { sendMainMenu } from './menu.js';
import { db } from '../db/index.js';
import { human_handoffs } from '../db/schema.js';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { env } from '../config/env.js';
import { logger } from '../services/logger.js';
import { formatDatePtBR, parseDate } from '../utils/date-helpers.js';
import clinic from '../config/clinic.json';

function nowPlusMinutes(minutes: number): string {
  return new Date(Date.now() + minutes * 60 * 1000)
    .toISOString()
    .replace('T', ' ')
    .slice(0, 19);
}

/** Verifica se o número está em pausa para handoff ativo */
export async function isInHandoff(phoneNumber: string): Promise<boolean> {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const [row] = await db
    .select({ id: human_handoffs.id })
    .from(human_handoffs)
    .where(
      and(
        eq(human_handoffs.phone_number, phoneNumber),
        gt(human_handoffs.paused_until, now),
        isNull(human_handoffs.resolved_at),
      ),
    );
  return !!row;
}

/** Inicia handoff: pausa bot, notifica recepcionista */
export async function startHandoff(
  phoneNumber: string,
  session: SessionData,
  reason: string,
): Promise<void> {
  const pausedUntil = nowPlusMinutes(env.HUMAN_HANDOFF_PAUSE_MINUTES);
  const contextSnapshot = JSON.stringify(session.context);

  await db.insert(human_handoffs).values({
    phone_number: phoneNumber,
    reason,
    context_json: contextSnapshot,
    paused_until: pausedUntil,
  });

  session.flow = 'handoff:waiting';
  session.step = '';
  await saveSession(session);

  await sendTextMessage(
    phoneNumber,
    `Vou chamar nossa equipe para continuar te atendendo! 😊\n\nEm instantes uma de nossas recepcionistas entrará em contato. O chatbot voltará automaticamente em ${env.HUMAN_HANDOFF_PAUSE_MINUTES / 60}h caso não haja retorno.`,
  );

  // Notifica recepcionista
  await notifyReceptionist(phoneNumber, reason, session);
}

/** Envia mensagem para recepcionista com contexto */
async function notifyReceptionist(
  customerPhone: string,
  reason: string,
  session: SessionData,
): Promise<void> {
  const receptionistPhone = clinic.receptionist_whatsapp;
  if (!receptionistPhone || receptionistPhone === '5511999999999') {
    logger.warn('Número da recepcionista não configurado em clinic.json');
    return;
  }

  // Importação lazy para evitar ciclo
  const { sendTextMessage: sendMsg } = await import('../services/meta-api.js');

  const flowLabels: Record<string, string> = {
    'scheduling:select_procedure': 'Agendamento — selecionando procedimento',
    'scheduling:enter_name': 'Agendamento — informando nome',
    'scheduling:select_date': 'Agendamento — selecionando data',
    'scheduling:select_time': 'Agendamento — selecionando horário',
    'scheduling:confirm': 'Agendamento — confirmando',
    'faq:chatting': 'Dúvidas via chatbot',
    'pricing:select_procedure': 'Consultando preços',
    idle: 'Menu inicial',
  };

  const flowLabel = flowLabels[session.flow] ?? session.flow;
  const ctx = session.context as Record<string, unknown>;

  const lines: string[] = [
    `🔔 *Novo atendimento para você!*`,
    ``,
    `📱 Cliente: +${customerPhone}`,
    `💬 Motivo: ${reason}`,
    `📍 Estava em: ${flowLabel}`,
  ];

  if (ctx['patientName']) lines.push(`👤 Nome: ${String(ctx['patientName'])}`);
  if (ctx['procedureName']) lines.push(`💆 Procedimento: ${String(ctx['procedureName'])}`);

  lines.push(``, `Para retomar, responda diretamente pelo WhatsApp Business.`);

  try {
    await sendMsg(receptionistPhone, lines.join('\n'));
    logger.info({ flowLabel }, 'Recepcionista notificada sobre handoff');
  } catch (err) {
    logger.error({ err }, 'Falha ao notificar recepcionista');
  }
}

/** Handler durante espera de humano */
export async function handleHandoffStep(msg: IncomingMessage, session: SessionData): Promise<void> {
  const { from: phoneNumber } = msg;

  // Verifica se pausa ainda está ativa
  const stillPaused = await isInHandoff(phoneNumber);
  if (stillPaused) {
    await sendTextMessage(
      phoneNumber,
      'Já avisamos nossa equipe! Em breve uma recepcionista entrará em contato. 😊',
    );
    return;
  }

  // Pausa expirou — retoma bot
  await sendTextMessage(
    phoneNumber,
    'Olá novamente! Estou de volta para te ajudar. 😊',
  );
  await sendMainMenu(phoneNumber, session, false);
}

/** Notifica a recepcionista sobre um novo agendamento feito pelo bot */
export async function notifyNewAppointment(params: {
  customerPhone: string;
  patientName: string;
  procedureName: string;
  date: string;
  time: string;
}): Promise<void> {
  const receptionistPhone = clinic.receptionist_whatsapp;
  if (!receptionistPhone || receptionistPhone === '5511999999999') {
    logger.warn('Número da recepcionista não configurado — notificação de agendamento ignorada');
    return;
  }

  const { sendTextMessage: sendMsg } = await import('../services/meta-api.js');
  const dateFormatted = formatDatePtBR(parseDate(params.date));

  const lines = [
    `📅 *Novo agendamento via chatbot!*`,
    ``,
    `👤 Paciente: ${params.patientName}`,
    `📱 WhatsApp: +${params.customerPhone}`,
    `💆 Procedimento: ${params.procedureName}`,
    `🗓️ Data: ${dateFormatted} às ${params.time}`,
  ];

  try {
    await sendMsg(receptionistPhone, lines.join('\n'));
    logger.info({ procedureName: params.procedureName }, 'Recepcionista notificada sobre novo agendamento');
  } catch (err) {
    logger.error({ err }, 'Falha ao notificar recepcionista sobre novo agendamento');
  }
}
