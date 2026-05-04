import { sendTextMessage, sendListMessage, sendButtonMessage, type IncomingMessage } from '../services/meta-api.js';
import { saveSession, getContactId, type SessionData } from '../models/session.js';
import { getUpcomingAppointments, cancelAppointment } from '../services/appointment.js';
import { sendMainMenu } from './menu.js';
import { formatDatePtBR, parseDate } from '../utils/date-helpers.js';
import { logger } from '../services/logger.js';
import { startReschedule } from './reschedule.js';

export async function startCancellation(phoneNumber: string, session: SessionData): Promise<void> {
  const contactId = await getContactId(phoneNumber);
  if (!contactId) {
    await sendTextMessage(phoneNumber, 'Não encontrei agendamentos vinculados ao seu número. 😊');
    await sendMainMenu(phoneNumber, session, false);
    return;
  }

  const upcoming = await getUpcomingAppointments(contactId);
  if (upcoming.length === 0) {
    await sendTextMessage(phoneNumber, 'Você não tem agendamentos futuros para cancelar. 😊');
    await sendMainMenu(phoneNumber, session, false);
    return;
  }

  session.flow = 'cancellation:select_appointment';
  session.step = '';
  session.context = { ...session.context, cancelContactId: contactId };

  if (upcoming.length === 1) {
    const appt = upcoming[0]!;
    const dateLabel = formatDatePtBR(parseDate(appt.scheduled_date));
    session.context.cancelAppointmentId = appt.id;

    await sendButtonMessage(
      phoneNumber,
      `Seu próximo agendamento:\n\n💆 *${appt.procedure_name}*\n📅 ${dateLabel} às ${appt.scheduled_time}\n\nO que deseja fazer?`,
      [
        { id: 'cancel:confirm', title: 'Cancelar ❌' },
        { id: 'cancel:reschedule', title: 'Remarcar 🔄' },
        { id: 'cancel:back', title: 'Voltar' },
      ],
      'Gerenciar agendamento',
    );
    await saveSession(session);
    return;
  }

  const sections = [
    {
      title: 'Seus agendamentos',
      rows: upcoming.map((a) => ({
        id: `cancelid:${a.id}`,
        title: a.procedure_name,
        description: `${formatDatePtBR(parseDate(a.scheduled_date))} às ${a.scheduled_time}`,
      })),
    },
  ];

  await sendListMessage(
    phoneNumber,
    'Cancelamento',
    'Qual agendamento você deseja cancelar?',
    'Ver agendamentos',
    sections,
  );

  await saveSession(session);
}

export async function handleCancellationStep(msg: IncomingMessage, session: SessionData): Promise<void> {
  const { from: phoneNumber } = msg;

  // Voltar
  if (msg.buttonId === 'cancel:back') {
    await sendMainMenu(phoneNumber, session, false);
    return;
  }

  // Remarcar
  if (msg.buttonId === 'cancel:reschedule') {
    const appointmentId = session.context.cancelAppointmentId as number | undefined;
    if (!appointmentId) {
      await sendMainMenu(phoneNumber, session, false);
      return;
    }
    await startReschedule(phoneNumber, session, appointmentId);
    return;
  }

  // Cancelar (agendamento único já pré-selecionado)
  if (msg.buttonId === 'cancel:confirm') {
    const appointmentId = session.context.cancelAppointmentId as number | undefined;
    if (!appointmentId) {
      await sendMainMenu(phoneNumber, session, false);
      return;
    }
    await performCancellation(phoneNumber, appointmentId, session);
    return;
  }

  // Seleção de lista (múltiplos agendamentos)
  const rawId = msg.listId?.replace('cancelid:', '');
  if (rawId) {
    const appointmentId = parseInt(rawId, 10);
    if (isNaN(appointmentId)) {
      await sendTextMessage(phoneNumber, 'Por favor, selecione um agendamento da lista. 😊');
      return;
    }

    // Pede confirmação
    const contactId = session.context.cancelContactId as number;
    const upcoming = await getUpcomingAppointments(contactId);
    const appt = upcoming.find((a) => a.id === appointmentId);
    if (!appt) {
      await sendTextMessage(phoneNumber, 'Agendamento não encontrado. Por favor, tente novamente.');
      await startCancellation(phoneNumber, session);
      return;
    }

    session.context.cancelAppointmentId = appointmentId;
    const dateLabel = formatDatePtBR(parseDate(appt.scheduled_date));

    await sendButtonMessage(
      phoneNumber,
      `O que deseja fazer?\n\n💆 *${appt.procedure_name}*\n📅 ${dateLabel} às ${appt.scheduled_time}`,
      [
        { id: 'cancel:confirm', title: 'Cancelar ❌' },
        { id: 'cancel:reschedule', title: 'Remarcar 🔄' },
        { id: 'cancel:back', title: 'Voltar' },
      ],
      'Gerenciar agendamento',
    );

    await saveSession(session);
    return;
  }

  await sendTextMessage(phoneNumber, 'Por favor, selecione um dos agendamentos da lista. 😊');
}

async function performCancellation(phoneNumber: string, appointmentId: number, session: SessionData): Promise<void> {
  try {
    await cancelAppointment(appointmentId);
    await sendTextMessage(
      phoneNumber,
      '✅ Agendamento cancelado com sucesso. Se quiser remarcar, é só me chamar! 😊',
    );
    logger.info({ appointmentId }, 'Agendamento cancelado pelo paciente');
  } catch (err) {
    logger.error({ err, appointmentId }, 'Erro ao cancelar agendamento');
    await sendTextMessage(
      phoneNumber,
      'Ocorreu um problema ao cancelar. Vou chamar nossa recepcionista para te ajudar!',
    );
  }
  await sendMainMenu(phoneNumber, session, false);
}
