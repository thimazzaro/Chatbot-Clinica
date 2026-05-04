import {
  sendTextMessage,
  sendListMessage,
  sendButtonMessage,
  type IncomingMessage,
} from '../services/meta-api.js';
import {
  saveSession,
  updateContact,
  getContactId,
  type SessionData,
} from '../models/session.js';
import { notifyNewAppointment } from './handoff.js';
import {
  getNextAvailableDates,
  getAvailableSlots,
  createAppointment,
} from '../services/appointment.js';
import { sendMainMenu } from './menu.js';
import { formatDatePtBR, formatDateShort, parseDate } from '../utils/date-helpers.js';
import { logger } from '../services/logger.js';
import clinic from '../config/clinic.json';

// ─── Entry point ─────────────────────────────────────────────────────────────
export async function startScheduling(phoneNumber: string, session: SessionData): Promise<void> {
  session.flow = 'scheduling:select_procedure';
  session.step = '';
  session.context = { history: [] };

  const sections = [
    {
      title: 'Procedimentos disponíveis',
      rows: clinic.procedures.map((p) => ({
        id: `proc:${p.id}`,
        title: p.name,
        description: `${p.duration_minutes} min • R$${p.price}`,
      })),
    },
  ];

  await sendListMessage(
    phoneNumber,
    'Agendamento',
    'Qual procedimento você gostaria de agendar?',
    'Ver procedimentos',
    sections,
  );

  await saveSession(session);
}

// ─── Step handler — called by router ─────────────────────────────────────────
export async function handleSchedulingStep(msg: IncomingMessage, session: SessionData): Promise<void> {
  const { from: phoneNumber } = msg;

  switch (session.flow) {
    case 'scheduling:select_procedure':
      await handleProcedureSelection(msg, session);
      break;
    case 'scheduling:enter_name':
      await handleNameEntry(msg, session);
      break;
    case 'scheduling:select_date':
      await handleDateSelection(msg, session);
      break;
    case 'scheduling:select_time':
      await handleTimeSelection(msg, session);
      break;
    case 'scheduling:confirm':
      await handleConfirmation(msg, session);
      break;
    default:
      await sendMainMenu(phoneNumber, session);
  }
}

// ─── Passo 1: Selecionar procedimento ────────────────────────────────────────
async function handleProcedureSelection(msg: IncomingMessage, session: SessionData): Promise<void> {
  const { from: phoneNumber } = msg;
  const selectedId = msg.listId?.replace('proc:', '');

  const procedure = clinic.procedures.find((p) => p.id === selectedId);
  if (!procedure) {
    await sendTextMessage(phoneNumber, 'Por favor, selecione um procedimento da lista. 😊');
    return;
  }

  session.context.procedureId = procedure.id;
  session.context.procedureName = procedure.name;
  session.flow = 'scheduling:enter_name';

  await sendTextMessage(
    phoneNumber,
    `Ótima escolha! *${procedure.name}* é um dos nossos favoritos. 😊\n\nPode me informar seu nome completo?`,
  );

  await saveSession(session);
}

// ─── Passo 2: Informar nome ───────────────────────────────────────────────────
async function handleNameEntry(msg: IncomingMessage, session: SessionData): Promise<void> {
  const { from: phoneNumber } = msg;

  if (msg.type !== 'text' || !msg.text?.trim()) {
    await sendTextMessage(phoneNumber, 'Por favor, me informe seu nome completo para continuar. 😊');
    return;
  }

  const name = msg.text.trim();
  if (name.length < 3 || name.split(' ').length < 2) {
    await sendTextMessage(phoneNumber, 'Preciso do seu nome completo (nome e sobrenome). Pode me informar?');
    return;
  }

  session.context.patientName = name;
  session.flow = 'scheduling:select_date';

  await updateContact(phoneNumber, name);

  // Busca próximas datas disponíveis
  const availableDates = await getNextAvailableDates(3);

  if (availableDates.length === 0) {
    await sendTextMessage(
      phoneNumber,
      'No momento não temos datas disponíveis nos próximos dias. Vou chamar nossa recepcionista para te ajudar! 😊',
    );
    await sendMainMenu(phoneNumber, session);
    return;
  }

  const sections = [
    {
      title: 'Datas disponíveis',
      rows: availableDates.map((dateStr) => ({
        id: `date:${dateStr}`,
        title: formatDatePtBR(parseDate(dateStr)),
        description: formatDateShort(parseDate(dateStr)),
      })),
    },
  ];

  await sendListMessage(
    phoneNumber,
    'Escolha a data',
    `Perfeito, ${name.split(' ')[0]}! 🗓️\nQual data é melhor para você?`,
    'Ver datas',
    sections,
  );

  await saveSession(session);
}

// ─── Passo 3: Selecionar data ─────────────────────────────────────────────────
async function handleDateSelection(msg: IncomingMessage, session: SessionData): Promise<void> {
  const { from: phoneNumber } = msg;
  const dateStr = msg.listId?.replace('date:', '');

  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    await sendTextMessage(phoneNumber, 'Por favor, selecione uma das datas disponíveis. 😊');
    return;
  }

  session.context.selectedDate = dateStr;
  session.flow = 'scheduling:select_time';

  const slots = await getAvailableSlots(dateStr);

  if (slots.length === 0) {
    await sendTextMessage(
      phoneNumber,
      'Essa data não tem mais horários disponíveis. Vou te mostrar as datas novamente.',
    );
    session.flow = 'scheduling:select_date';
    const availableDates = await getNextAvailableDates(3);
    const sections = [
      {
        title: 'Datas disponíveis',
        rows: availableDates.map((d) => ({
          id: `date:${d}`,
          title: formatDatePtBR(parseDate(d)),
          description: formatDateShort(parseDate(d)),
        })),
      },
    ];
    await sendListMessage(phoneNumber, 'Escolha a data', 'Qual data é melhor para você?', 'Ver datas', sections);
    await saveSession(session);
    return;
  }

  const sections = [
    {
      title: `Horários — ${formatDatePtBR(parseDate(dateStr))}`,
      rows: slots.map((t) => ({ id: `time:${t}`, title: t })),
    },
  ];

  await sendListMessage(
    phoneNumber,
    'Escolha o horário',
    `Que horas ficaria melhor para você?`,
    'Ver horários',
    sections,
  );

  await saveSession(session);
}

// ─── Passo 4: Selecionar horário ──────────────────────────────────────────────
async function handleTimeSelection(msg: IncomingMessage, session: SessionData): Promise<void> {
  const { from: phoneNumber } = msg;
  const time = msg.listId?.replace('time:', '');

  if (!time || !/^\d{2}:\d{2}$/.test(time)) {
    await sendTextMessage(phoneNumber, 'Por favor, selecione um dos horários disponíveis. 😊');
    return;
  }

  // Valida disponibilidade em tempo real (pode ter sido tomado)
  const available = await getAvailableSlots(session.context.selectedDate!);
  if (!available.includes(time)) {
    await sendTextMessage(phoneNumber, 'Esse horário acabou de ser preenchido. Por favor, escolha outro:');
    session.flow = 'scheduling:select_time';
    const sections = [
      {
        title: 'Horários disponíveis',
        rows: available.map((t) => ({ id: `time:${t}`, title: t })),
      },
    ];
    await sendListMessage(phoneNumber, 'Horários', 'Escolha outro horário:', 'Ver horários', sections);
    await saveSession(session);
    return;
  }

  session.context.selectedTime = time;
  session.flow = 'scheduling:confirm';

  const { procedureName, patientName, selectedDate } = session.context;
  const dateFormatted = formatDatePtBR(parseDate(selectedDate!));

  const summary =
    `📋 *Resumo do agendamento*\n\n` +
    `👤 Nome: ${patientName}\n` +
    `💆 Procedimento: ${procedureName}\n` +
    `📅 Data: ${dateFormatted}\n` +
    `🕐 Horário: ${time}\n` +
    `📍 Local: ${clinic.address}\n\n` +
    `Confirma o agendamento?`;

  await sendButtonMessage(
    phoneNumber,
    summary,
    [
      { id: 'confirm:yes', title: 'Confirmar ✅' },
      { id: 'confirm:no', title: 'Cancelar ❌' },
    ],
  );

  await saveSession(session);
}

// ─── Passo 5: Confirmação ─────────────────────────────────────────────────────
async function handleConfirmation(msg: IncomingMessage, session: SessionData): Promise<void> {
  const { from: phoneNumber } = msg;
  const choice = msg.buttonId;

  if (choice === 'confirm:no' || msg.text?.toLowerCase().includes('cancel')) {
    await sendTextMessage(phoneNumber, 'Tudo bem! Agendamento cancelado. 😊');
    await sendMainMenu(phoneNumber, session, false);
    return;
  }

  if (choice !== 'confirm:yes') {
    await sendButtonMessage(
      phoneNumber,
      'Você confirma o agendamento?',
      [
        { id: 'confirm:yes', title: 'Confirmar ✅' },
        { id: 'confirm:no', title: 'Cancelar ❌' },
      ],
    );
    return;
  }

  const { procedureId, procedureName, patientName, selectedDate, selectedTime } = session.context;

  try {
    // Garante contato no banco
    await updateContact(phoneNumber, patientName);
    const contactId = await getContactId(phoneNumber);
    if (!contactId) throw new Error('Contato não encontrado após upsert');

    await createAppointment({
      contactId,
      procedureId: procedureId!,
      procedureName: procedureName!,
      date: selectedDate!,
      time: selectedTime!,
    });

    // Notifica recepcionista em background (não bloqueia o ACK ao paciente)
    void notifyNewAppointment({
      customerPhone: phoneNumber,
      patientName: patientName!,
      procedureName: procedureName!,
      date: selectedDate!,
      time: selectedTime!,
    });

    const dateFormatted = formatDatePtBR(parseDate(selectedDate!));
    await sendTextMessage(
      phoneNumber,
      `✅ Agendamento confirmado!\n\n` +
        `💆 *${procedureName}*\n` +
        `📅 ${dateFormatted} às ${selectedTime}\n` +
        `📍 ${clinic.address}\n\n` +
        `Você receberá lembretes 24h e 2h antes do horário. Até lá! 😊`,
    );

    logger.info({ phoneNumber: phoneNumber.slice(-4), procedure: procedureId, date: selectedDate }, 'Agendamento criado');
  } catch (err) {
    logger.error({ err }, 'Erro ao criar agendamento');
    await sendTextMessage(
      phoneNumber,
      'Ocorreu um problema ao confirmar o agendamento. Vou chamar nossa recepcionista para te ajudar!',
    );
  }

  await sendMainMenu(phoneNumber, session, false);
}
