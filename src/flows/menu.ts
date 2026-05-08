import { sendListMessage } from '../services/meta-api.js';
import { saveSession, type SessionData } from '../models/session.js';
import clinic from '../config/clinic.json';

export async function sendMainMenu(phoneNumber: string, session: SessionData, greeting = true): Promise<void> {
  const header = greeting
    ? `Olá! Bem-vinda à ${clinic.name} ✨`
    : `Como posso te ajudar? ✨`;

  const sections = [
    {
      title: 'Opções',
      rows: [
        { id: 'menu:agendar',   title: 'Agendar consulta',       description: 'Marque seu horário' },
        { id: 'menu:precos',    title: 'Tabela de preços',        description: 'Veja valores e procedimentos' },
        { id: 'menu:gerenciar', title: 'Gerenciar agendamento',   description: 'Cancelar ou remarcar' },
        { id: 'menu:duvidas',   title: 'Dúvidas',                 description: 'Converse com nossa assistente Sofia' },
      ],
    },
  ];

  await sendListMessage(
    phoneNumber,
    header,
    'Como posso te ajudar hoje?',
    'Ver opções',
    sections,
    'Responda a qualquer momento para recomeçar.',
  );

  session.flow = 'idle';
  session.step = 'menu_sent';
  await saveSession(session);
}
