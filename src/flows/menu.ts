import { sendTextMessage } from '../services/meta-api.js';
import { saveSession, type SessionData } from '../models/session.js';
import clinic from '../config/clinic.json';

export async function sendMainMenu(phoneNumber: string, session: SessionData, greeting = true): Promise<void> {
  const header = greeting
    ? `Olá! Bem-vinda à ${clinic.name} ✨`
    : `Como posso te ajudar? ✨`;

  // TESTE: texto simples para diagnosticar entrega
  await sendTextMessage(phoneNumber, `${header}\n\nComo posso te ajudar hoje?\n1️⃣ Agendar consulta\n2️⃣ Tabela de preços\n3️⃣ Gerenciar agendamento\n4️⃣ Dúvidas`);

  session.flow = 'idle';
  session.step = 'menu_sent';
  await saveSession(session);
}
