import {
  sendTextMessage,
  sendListMessage,
  sendButtonMessage,
  type IncomingMessage,
} from '../services/meta-api.js';
import { saveSession, type SessionData } from '../models/session.js';
import {
  getNextAvailableDates,
  getAvailableSlots,
  updateAppointmentDateTime,
} from '../services/appointment.js';
import { sendMainMenu } from './menu.js';
import { formatDatePtBR, formatDateShort, parseDate } from '../utils/date-helpers.js';
import { logger } from '../services/logger.js';
import clinic from '../config/clinic.json';

export async function startReschedule(
  phoneNumber: string,
  session: SessionData,
  appointmentId: number,
): Promise<void> {
  session.flow = 'reschedule:select_date';
  session.step = '';
  session.context.rescheduleAppointmentId = appointmentId;

  const availableDates = await getNextAvailableDates(3);
  if (availableDates.length === 0) {
    await sendTextMessage(
      phoneNumber,
      'No momento não há datas disponíveis. Vou chamar nossa recepcionista para te ajudar! 😊',
    );
    await sendMainMenu(phoneNumber, session, false);
    return;
  }

  const sections = [
    {
      title: 'Datas disponíveis',
      rows: availableDates.map((d) => ({
        id: `rdate:${d}`,
        title: formatDatePtBR(parseDate(d)),
        description: formatDateShort(parseDate(d)),
      })),
    },
  ];

  await sendListMessage(
    phoneNumber,
    'Reagendamento',
    'Qual a nova data que prefere?',
    'Ver datas',
    sections,
  );

  await saveSession(session);
}

export async function handleRescheduleStep(msg: IncomingMessage, session: SessionData): Promise<void> {
  const { from: phoneNumber } = msg;

  switch (session.flow) {
    case 'reschedule:select_date':
      await handleDateSelection(msg, session);
      break;
    case 'reschedule:select_time':
      await handleTimeSelection(msg, session);
      break;
    case 'reschedule:confirm':
      await handleConfirmation(msg, session);
      break;
    default:
      await sendMainMenu(phoneNumber, session);
  }
}

async function handleDateSelection(msg: IncomingMessage, session: SessionData): Promise<void> {
  const { from: phoneNumber } = msg;
  const dateStr = msg.listId?.replace('rdate:', '');

  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    await sendTextMessage(phoneNumber, 'Por favor, selecione uma das datas disponíveis. 😊');
    return;
  }

  const slots = await getAvailableSlots(dateStr);
  if (slots.length === 0) {
    await sendTextMessage(phoneNumber, 'Essa data não tem horários disponíveis. Escolha outra:');
    const availableDates = await getNextAvailableDates(3);
    const sections = [
      {
        title: 'Datas disponíveis',
        rows: availableDates.map((d) => ({
          id: `rdate:${d}`,
          title: formatDatePtBR(parseDate(d)),
          description: formatDateShort(parseDate(d)),
        })),
      },
    ];
    await sendListMessage(phoneNumber, 'Reagendamento', 'Qual a nova data?', 'Ver datas', sections);
    return;
  }

  session.context.rescheduleDate = dateStr;
  session.flow = 'reschedule:select_time';

  const sections = [
    {
      title: `Horários — ${formatDatePtBR(parseDate(dateStr))}`,
      rows: slots.map((t) => ({ id: `rtime:${t}`, title: t })),
    },
  ];

  await sendListMessage(phoneNumber, 'Reagendamento', 'Que horas prefere?', 'Ver horários', sections);
  await saveSession(session);
}

async function handleTimeSelection(msg: IncomingMessage, session: SessionData): Promise<void> {
  const { from: phoneNumber } = msg;
  const time = msg.listId?.replace('rtime:', '');

  if (!time || !/^\d{2}:\d{2}$/.test(time)) {
    await sendTextMessage(phoneNumber, 'Por favor, selecione um dos horários disponíveis. 😊');
    return;
  }

  const available = await getAvailableSlots(session.context.rescheduleDate as string);
  if (!available.includes(time)) {
    await sendTextMessage(phoneNumber, 'Esse horário acabou de ser preenchido. Por favor, escolha outro:');
    const sections = [
      {
        title: 'Horários disponíveis',
        rows: available.map((t) => ({ id: `rtime:${t}`, title: t })),
      },
    ];
    await sendListMessage(phoneNumber, 'Reagendamento', 'Escolha outro horário:', 'Ver horários', sections);
    return;
  }

  session.context.rescheduleTime = time;
  session.flow = 'reschedule:confirm';

  const dateStr = session.context.rescheduleDate as string;
  const dateFormatted = formatDatePtBR(parseDate(dateStr));

  await sendButtonMessage(
    phoneNumber,
    `📋 *Novo horário*\n\n📅 ${dateFormatted}\n🕐 ${time}\n📍 ${clinic.address}\n\nConfirma o reagendamento?`,
    [
      { id: 'reschedule:yes', title: 'Confirmar ✅' },
      { id: 'reschedule:no', title: 'Cancelar ❌' },
    ],
  );

  await saveSession(session);
}

async function handleConfirmation(msg: IncomingMessage, session: SessionData): Promise<void> {
  const { from: phoneNumber } = msg;

  if (msg.buttonId === 'reschedule:no') {
    await sendTextMessage(phoneNumber, 'Reagendamento cancelado. 😊');
    await sendMainMenu(phoneNumber, session, false);
    return;
  }

  if (msg.buttonId !== 'reschedule:yes') {
    await sendButtonMessage(
      phoneNumber,
      'Confirma o reagendamento?',
      [
        { id: 'reschedule:yes', title: 'Confirmar ✅' },
        { id: 'reschedule:no', title: 'Cancelar ❌' },
      ],
    );
    return;
  }

  const appointmentId = session.context.rescheduleAppointmentId as number;
  const date = session.context.rescheduleDate as string;
  const time = session.context.rescheduleTime as string;

  try {
    await updateAppointmentDateTime(appointmentId, date, time);
    const dateFormatted = formatDatePtBR(parseDate(date));
    await sendTextMessage(
      phoneNumber,
      `✅ Reagendamento confirmado!\n\n📅 ${dateFormatted} às ${time}\n📍 ${clinic.address}\n\nVocê receberá um lembrete antes do horário. Até lá! 😊`,
    );
    logger.info({ appointmentId, date, time }, 'Agendamento remarcado pelo paciente');
  } catch (err) {
    logger.error({ err, appointmentId }, 'Erro ao remarcar agendamento');
    await sendTextMessage(
      phoneNumber,
      'Ocorreu um problema ao remarcar. Vou chamar nossa recepcionista para te ajudar!',
    );
  }

  await sendMainMenu(phoneNumber, session, false);
}
