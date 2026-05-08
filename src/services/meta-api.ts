import { createHmac } from 'crypto';
import { env } from '../config/env.js';
import { enqueue } from '../utils/rate-limiter.js';
import {
  buildTextMessage,
  buildButtonMessage,
  buildListMessage,
  buildTemplateMessage,
  buildMarkAsRead,
  type Button,
  type Section,
} from '../utils/message-builder.js';
import { logger } from './logger.js';

const GRAPH_URL = `https://graph.facebook.com/v19.0/${env.WHATSAPP_PHONE_ID}`;
const INTERVAL_MS = Math.ceil(1000 / env.RATE_LIMIT_MSG_PER_SECOND);

// ─── Meta error codes ────────────────────────────────────────────────────────
const META_ERROR_MESSAGES: Record<number, string> = {
  131030: 'Template não aprovado ou inexistente na conta Meta',
  131047: 'Mensagem fora da janela de 24h — use template',
  130429: 'Rate limit atingido na Meta API',
  131026: 'Número do destinatário inválido ou não cadastrado no WhatsApp',
};

// ─── Incoming message types ───────────────────────────────────────────────────
export interface IncomingMessage {
  from: string;
  messageId: string;
  type: 'text' | 'interactive' | 'template' | 'other';
  text?: string;
  buttonId?: string;
  listId?: string;
  displayName?: string;
}

// ─── HTTP helper ─────────────────────────────────────────────────────────────
async function callGraphApi(path: string, body: unknown, attempt = 1): Promise<void> {
  const url = `${GRAPH_URL}/${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (networkErr) {
    if (attempt <= 3) {
      const backoff = attempt * 1000;
      logger.warn({ attempt, backoff }, 'Erro de rede na Meta API, retentando...');
      await new Promise((r) => setTimeout(r, backoff));
      return callGraphApi(path, body, attempt + 1);
    }
    throw networkErr;
  }

  // LOG TEMPORÁRIO: mostra resposta da Meta para diagnóstico
  const raw = await response.text();
  logger.info({ status: response.status, body: raw }, 'Meta API resposta');

  if (!response.ok) {
    let code: number | undefined;
    try {
      const parsed = JSON.parse(raw) as { error?: { code?: number } };
      code = parsed.error?.code;
    } catch {
      // raw não é JSON
    }

    const friendly = code ? META_ERROR_MESSAGES[code] : undefined;
    const msg = friendly ?? `Meta API HTTP ${response.status}`;

    // Retry em rate limit ou erros 5xx
    if ((response.status === 429 || response.status >= 500) && attempt <= 3) {
      const backoff = attempt * 2000;
      logger.warn({ attempt, status: response.status, code }, `${msg} — retentando em ${backoff}ms`);
      await new Promise((r) => setTimeout(r, backoff));
      return callGraphApi(path, body, attempt + 1);
    }

    logger.error({ status: response.status, code, body: raw }, msg);

    throw new Error(msg);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function sendTextMessage(to: string, text: string): Promise<void> {
  logger.info({ to: mask(to), type: 'text' }, 'Enviando mensagem de texto');
  await enqueue(to, () => callGraphApi('messages', buildTextMessage(to, text)), INTERVAL_MS);
}

export async function sendButtonMessage(to: string, body: string, buttons: Button[], header?: string, footer?: string): Promise<void> {
  logger.info({ to: mask(to), type: 'button', count: buttons.length }, 'Enviando mensagem com botões');
  await enqueue(to, () => callGraphApi('messages', buildButtonMessage(to, body, buttons, header, footer)), INTERVAL_MS);
}

export async function sendListMessage(to: string, header: string, body: string, buttonLabel: string, sections: Section[], footer?: string): Promise<void> {
  logger.info({ to: mask(to), type: 'list' }, 'Enviando mensagem com lista');
  await enqueue(to, () => callGraphApi('messages', buildListMessage(to, header, body, buttonLabel, sections, footer)), INTERVAL_MS);
}

export async function sendTemplateMessage(to: string, templateName: string, params: string[], languageCode = 'pt_BR'): Promise<void> {
  logger.info({ to: mask(to), templateName, type: 'template' }, 'Enviando template');
  await enqueue(to, () => callGraphApi('messages', buildTemplateMessage(to, templateName, languageCode, params)), INTERVAL_MS);
}

export async function markAsRead(messageId: string): Promise<void> {
  try {
    await callGraphApi('messages', buildMarkAsRead(messageId));
  } catch (err) {
    // Não bloquear o fluxo por falha no mark-as-read
    logger.warn({ messageId }, 'Falha ao marcar mensagem como lida');
  }
}

// ─── Webhook signature validation ────────────────────────────────────────────
export function validateWebhookSignature(rawBody: string, signature: string | undefined): boolean {
  if (!signature) return false;
  const [algo, hash] = signature.split('=');
  if (algo !== 'sha256' || !hash) return false;
  const expected = createHmac('sha256', env.WHATSAPP_APP_SECRET).update(rawBody).digest('hex');
  // Comparação de tempo constante
  return timingSafeEqual(expected, hash);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// ─── Parse webhook payload ────────────────────────────────────────────────────
export function parseIncomingWebhook(body: unknown): IncomingMessage | null {
  try {
    const payload = body as {
      object?: string;
      entry?: Array<{
        changes?: Array<{
          value?: {
            messages?: Array<{
              id: string;
              from: string;
              type: string;
              text?: { body: string };
              interactive?: {
                type: string;
                button_reply?: { id: string; title: string };
                list_reply?: { id: string; title: string };
              };
            }>;
            contacts?: Array<{ profile?: { name?: string } }>;
            statuses?: unknown[];
          };
        }>;
      }>;
    };

    if (payload.object !== 'whatsapp_business_account') return null;

    const change = payload.entry?.[0]?.changes?.[0]?.value;
    if (!change) return null;

    // Ignorar eventos de status (delivered, read, sent)
    if (change.statuses && !change.messages) return null;

    const msg = change.messages?.[0];
    if (!msg) return null;

    const displayName = change.contacts?.[0]?.profile?.name;
    const base = { from: msg.from, messageId: msg.id, displayName };

    if (msg.type === 'text' && msg.text) {
      return { ...base, type: 'text', text: msg.text.body };
    }

    if (msg.type === 'interactive' && msg.interactive) {
      if (msg.interactive.type === 'button_reply' && msg.interactive.button_reply) {
        return { ...base, type: 'interactive', buttonId: msg.interactive.button_reply.id };
      }
      if (msg.interactive.type === 'list_reply' && msg.interactive.list_reply) {
        return { ...base, type: 'interactive', listId: msg.interactive.list_reply.id };
      }
    }

    return { ...base, type: 'other' };
  } catch {
    return null;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
/** Mascara número de telefone para logs: 5511999****77 */
function mask(phone: string): string {
  if (phone.length < 6) return '***';
  return phone.slice(0, 4) + '****' + phone.slice(-2);
}
