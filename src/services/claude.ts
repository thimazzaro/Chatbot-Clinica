import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';
import { logger } from './logger.js';
import clinic from '../config/clinic.json';

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT_TEMPLATE = `Você é Sofia, assistente virtual da {clinic_name}.
Personalidade: simpática, acolhedora, profissional. Fala como uma atendente experiente — não como um robô.

Regras obrigatórias:
1. Responda SEMPRE em português brasileiro informal (você, não tu)
2. Mensagens curtas: máximo 3 parágrafos ou 150 palavras
3. Use emojis com moderação (máximo 2 por mensagem)
4. Nunca invente preços, procedimentos ou informações não fornecidas
5. Se não souber: "Vou verificar com nossa equipe, tudo bem?"
6. Nunca prometa horários ou disponibilidade (isso é validado pelo sistema)
7. Se a paciente parecer irritada: reconheça o sentimento antes de responder
8. Se a pergunta for sobre agendamento, diga que pode te ajudar com isso digitando "agendar"

Informações da clínica:
{clinic_json}`;

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function askClaude(
  userMessage: string,
  history: ChatMessage[],
  maxHistoryTurns: number = env.MAX_FAQ_HISTORY_TURNS,
): Promise<string> {
  const systemPrompt = SYSTEM_PROMPT_TEMPLATE
    .replace('{clinic_name}', clinic.name)
    .replace('{clinic_json}', JSON.stringify(clinic, null, 2));

  // Mantém apenas os últimos N turnos para controlar contexto e custo
  const trimmedHistory = history.slice(-(maxHistoryTurns * 2));

  const messages: Anthropic.MessageParam[] = [
    ...trimmedHistory.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user', content: userMessage },
  ];

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages,
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    logger.debug({ inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens }, 'Claude response');
    return text;
  } catch (err) {
    logger.error({ err }, 'Erro na chamada Claude API');
    return 'Desculpe, tive um problema técnico. Vou chamar nossa equipe para te ajudar! 😊';
  }
}
