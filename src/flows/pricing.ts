import { sendTextMessage, sendListMessage, sendButtonMessage, type IncomingMessage } from '../services/meta-api.js';
import { saveSession, type SessionData } from '../models/session.js';
import { sendMainMenu } from './menu.js';
import clinic from '../config/clinic.json';

export async function startPricing(phoneNumber: string, session: SessionData): Promise<void> {
  session.flow = 'pricing:select_procedure';
  session.step = '';
  session.context = { history: [] };

  const sections = [
    {
      title: 'Nossos procedimentos',
      rows: clinic.procedures.map((p) => ({
        id: `price:${p.id}`,
        title: p.name,
        description: `A partir de R$${p.price}`,
      })),
    },
  ];

  await sendListMessage(
    phoneNumber,
    'Tabela de preços',
    'Selecione o procedimento para ver detalhes e preço completo:',
    'Ver procedimentos',
    sections,
  );

  await saveSession(session);
}

export async function handlePricingStep(msg: IncomingMessage, session: SessionData): Promise<void> {
  const { from: phoneNumber } = msg;

  if (session.flow !== 'pricing:select_procedure') {
    await sendMainMenu(phoneNumber, session);
    return;
  }

  const procedureId = msg.listId?.replace('price:', '');

  if (!procedureId) {
    await sendTextMessage(phoneNumber, 'Por favor, selecione um procedimento da lista. 😊');
    return;
  }

  const procedure = clinic.procedures.find((p) => p.id === procedureId);

  if (!procedure) {
    await sendTextMessage(phoneNumber, 'Procedimento não encontrado. Por favor, selecione um da lista.');
    return;
  }

  const details =
    `💆 *${procedure.name}*\n\n` +
    `📝 ${procedure.description}\n\n` +
    `⏱️ Duração: ${procedure.duration_minutes} minutos\n` +
    `💰 Valor: R$${procedure.price}\n\n` +
    `📍 ${clinic.address}`;

  await sendTextMessage(phoneNumber, details);

  // Mostra promoções se houver
  if (clinic.promotions.length > 0) {
    const promos = clinic.promotions.map((p) => `• ${p}`).join('\n');
    await sendTextMessage(phoneNumber, `🎉 *Promoções especiais:*\n${promos}`);
  }

  await sendButtonMessage(
    phoneNumber,
    'Gostaria de agendar esse procedimento?',
    [
      { id: 'menu:agendar', title: 'Agendar agora' },
      { id: 'pricing:voltar', title: 'Ver outros preços' },
    ],
  );

  session.flow = 'pricing:select_procedure';
  session.step = 'post_detail';
  await saveSession(session);
}
