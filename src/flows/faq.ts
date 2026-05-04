import { sendTextMessage, sendButtonMessage, type IncomingMessage } from '../services/meta-api.js';
import { saveSession, type SessionData } from '../models/session.js';
import { askClaude, type ChatMessage } from '../services/claude.js';
import { sendMainMenu } from './menu.js';

const HANDOFF_KEYWORDS = ['humano', 'atendente', 'recepcionista', 'pessoa', 'falar com alguém'];

export async function startFaq(phoneNumber: string, session: SessionData): Promise<void> {
  session.flow = 'faq:chatting';
  session.step = '';
  if (!session.context.history) session.context.history = [];

  await sendButtonMessage(
    phoneNumber,
    'Pode me perguntar qualquer coisa sobre nossos procedimentos, cuidados pós-tratamento ou funcionamento da clínica! 😊\n\nOu se preferir falar com nossa equipe:',
    [{ id: 'faq:humano', title: 'Falar com humano' }],
    'Dúvidas — Sofia',
  );

  await saveSession(session);
}

export async function handleFaqStep(msg: IncomingMessage, session: SessionData): Promise<void> {
  const { from: phoneNumber } = msg;

  // Botão de handoff
  if (msg.buttonId === 'faq:humano') {
    // Importação dinâmica para evitar ciclo
    const { startHandoff } = await import('./handoff.js');
    await startHandoff(phoneNumber, session, 'Paciente solicitou falar com humano durante FAQ');
    return;
  }

  // Verificar palavras de handoff no texto
  if (msg.text) {
    const lower = msg.text.toLowerCase();
    if (HANDOFF_KEYWORDS.some((k) => lower.includes(k))) {
      const { startHandoff } = await import('./handoff.js');
      await startHandoff(phoneNumber, session, 'Paciente pediu atendente humano');
      return;
    }

    // Verificar se quer voltar ao menu
    if (['menu', 'voltar', 'inicio', 'início'].some((k) => lower === k)) {
      await sendMainMenu(phoneNumber, session);
      return;
    }
  }

  if (!msg.text?.trim()) {
    await sendTextMessage(phoneNumber, 'Pode me fazer sua pergunta por texto. 😊');
    return;
  }

  // Garante que history é um array
  if (!Array.isArray(session.context.history)) {
    session.context.history = [];
  }

  const history = session.context.history as ChatMessage[];
  const userMessage = msg.text.trim();

  const reply = await askClaude(userMessage, history);

  // Atualiza histórico
  history.push({ role: 'user', content: userMessage });
  history.push({ role: 'assistant', content: reply });
  session.context.history = history;

  await sendTextMessage(phoneNumber, reply);

  // Após resposta, oferece opções
  await sendButtonMessage(
    phoneNumber,
    'Posso te ajudar com mais alguma coisa?',
    [
      { id: 'menu:agendar', title: 'Agendar consulta' },
      { id: 'faq:humano', title: 'Falar com humano' },
    ],
  );

  await saveSession(session);
}
