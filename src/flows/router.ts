import { type IncomingMessage, markAsRead, sendTextMessage } from '../services/meta-api.js';
import { getSession, updateContact, getContactId } from '../models/session.js';
import { db } from '../db/index.js';
import { message_logs } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { sendMainMenu } from './menu.js';
import { startScheduling, handleSchedulingStep } from './scheduling.js';
import { startFaq, handleFaqStep } from './faq.js';
import { startPricing, handlePricingStep } from './pricing.js';
import { isInHandoff, handleHandoffStep } from './handoff.js';
import { startCancellation, handleCancellationStep } from './cancellation.js';
import { handleRescheduleStep } from './reschedule.js';
import { confirmAppointmentByPhone } from '../services/appointment.js';
import { logger } from '../services/logger.js';

/** Ponto de entrada para toda mensagem recebida */
export async function routeMessage(msg: IncomingMessage): Promise<void> {
  const { from: phoneNumber, messageId } = msg;

  // ─── Idempotência: ignora mensagens já processadas ────────────────────
  if (messageId) {
    const [existing] = await db
      .select({ id: message_logs.id })
      .from(message_logs)
      .where(eq(message_logs.whatsapp_message_id, messageId));
    if (existing) {
      logger.debug({ messageId }, 'Mensagem duplicada ignorada');
      return;
    }
  }

  // ─── Marcar como lida (best-effort) ──────────────────────────────────
  if (messageId) await markAsRead(messageId);

  // ─── Log da mensagem recebida ─────────────────────────────────────────
  await db.insert(message_logs).values({
    phone_number: phoneNumber,
    direction: 'in',
    message_type: msg.type,
    content_json: JSON.stringify(msg),
    whatsapp_message_id: messageId ?? null,
  }).onConflictDoNothing();

  // ─── Atualiza contato ────────────────────────────────────────────────
  await updateContact(phoneNumber, msg.displayName);

  // ─── Verifica handoff ativo ──────────────────────────────────────────
  if (await isInHandoff(phoneNumber)) {
    const session = await getSession(phoneNumber);
    await handleHandoffStep(msg, session);
    return;
  }

  // ─── Obtém sessão ────────────────────────────────────────────────────
  const session = await getSession(phoneNumber);

  // ─── Comandos globais (qualquer estado) ──────────────────────────────
  const textLower = msg.text?.toLowerCase().trim() ?? '';
  const isGlobalReset = ['oi', 'olá', 'ola', 'menu', 'inicio', 'início', 'reiniciar'].includes(textLower);

  if (isGlobalReset) {
    await sendMainMenu(phoneNumber, session);
    return;
  }

  // ─── Respostas ao template lembrete_24h ───────────────────────────────
  if (textLower === 'confirmar') {
    const contactId = await getContactId(phoneNumber);
    if (contactId) {
      const confirmed = await confirmAppointmentByPhone(contactId);
      if (confirmed) {
        await sendTextMessage(phoneNumber, `✅ Agendamento confirmado! Te esperamos. 😊`);
      } else {
        await sendTextMessage(phoneNumber, 'Não encontrei agendamentos pendentes para confirmar. Se precisar de ajuda, responda "menu". 😊');
      }
    }
    return;
  }

  if (textLower === 'cancelar') {
    await startCancellation(phoneNumber, session);
    return;
  }

  // ─── Botões do menu principal (acessíveis de qualquer estado) ────────
  const buttonId = msg.buttonId ?? msg.listId ?? '';

  if (buttonId === 'menu:agendar') {
    await startScheduling(phoneNumber, session);
    return;
  }
  if (buttonId === 'menu:duvidas') {
    await startFaq(phoneNumber, session);
    return;
  }
  if (buttonId === 'menu:precos') {
    await startPricing(phoneNumber, session);
    return;
  }
  if (buttonId === 'pricing:voltar') {
    await startPricing(phoneNumber, session);
    return;
  }

  // ─── Roteamento por estado da sessão ─────────────────────────────────
  if (session.flow.startsWith('scheduling:')) {
    await handleSchedulingStep(msg, session);
    return;
  }

  if (session.flow === 'faq:chatting') {
    await handleFaqStep(msg, session);
    return;
  }

  if (session.flow === 'pricing:select_procedure') {
    await handlePricingStep(msg, session);
    return;
  }

  if (session.flow === 'handoff:waiting') {
    await handleHandoffStep(msg, session);
    return;
  }

  if (session.flow === 'cancellation:select_appointment') {
    await handleCancellationStep(msg, session);
    return;
  }

  if (session.flow.startsWith('reschedule:')) {
    await handleRescheduleStep(msg, session);
    return;
  }

  // ─── Estado idle ou step desconhecido → menu ──────────────────────────
  await sendMainMenu(phoneNumber, session);
}
