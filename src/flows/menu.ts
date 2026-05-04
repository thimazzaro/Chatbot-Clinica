import { sendButtonMessage } from '../services/meta-api.js';
import { saveSession, type SessionData } from '../models/session.js';
import clinic from '../config/clinic.json';

export async function sendMainMenu(phoneNumber: string, session: SessionData, greeting = true): Promise<void> {
  const header = greeting
    ? `Olá! Bem-vinda à ${clinic.name} ✨`
    : `Como posso te ajudar? ✨`;

  const body = 'Como posso te ajudar hoje?';

  await sendButtonMessage(
    phoneNumber,
    body,
    [
      { id: 'menu:agendar', title: 'Agendar consulta' },
      { id: 'menu:duvidas', title: 'Dúvidas' },
      { id: 'menu:precos', title: 'Preços' },
    ],
    header,
    'Responda a qualquer momento para recomeçar.',
  );

  session.flow = 'idle';
  session.step = 'menu_sent';
  await saveSession(session);
}
