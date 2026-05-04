import Fastify from 'fastify';
import { env } from './config/env.js';
import { logger } from './services/logger.js';
import { validateWebhookSignature, parseIncomingWebhook } from './services/meta-api.js';
import { routeMessage } from './flows/router.js';
import { startScheduler } from './services/scheduler.js';

const app = Fastify({ logger: false }); // usamos pino diretamente

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }));

// ─── GET /webhook/whatsapp — verificação Meta ─────────────────────────────────
app.get<{
  Querystring: {
    'hub.mode'?: string;
    'hub.verify_token'?: string;
    'hub.challenge'?: string;
  };
}>('/webhook/whatsapp', async (req, reply) => {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;

  if (mode === 'subscribe' && token === env.WEBHOOK_VERIFY_TOKEN) {
    logger.info('Webhook Meta verificado com sucesso');
    return reply.status(200).send(challenge);
  }

  logger.warn({ mode, token }, 'Tentativa de verificação de webhook inválida');
  return reply.status(403).send('Forbidden');
});

// ─── POST /webhook/whatsapp — mensagens recebidas ─────────────────────────────
app.post('/webhook/whatsapp', {
  config: { rawBody: true },
}, async (req, reply) => {
  // Retorna 200 IMEDIATAMENTE (requisito Meta)
  reply.status(200).send();

  // Valida assinatura HMAC-SHA256
  const signature = req.headers['x-hub-signature-256'] as string | undefined;
  const rawBody = (req as unknown as { rawBody?: string }).rawBody ?? JSON.stringify(req.body);

  if (!validateWebhookSignature(rawBody, signature)) {
    logger.warn('Assinatura do webhook inválida — requisição ignorada');
    return;
  }

  // Processa de forma assíncrona (não bloqueia o ACK)
  setImmediate(() => {
    const msg = parseIncomingWebhook(req.body);
    if (!msg) return;

    routeMessage(msg).catch((err) => {
      logger.error({ err, from: msg.from.slice(-4) }, 'Erro ao processar mensagem');
    });
  });
});

// ─── Plugin para capturar raw body (necessário para validar assinatura) ───────
app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
  try {
    (req as unknown as { rawBody: string }).rawBody = body as string;
    done(null, JSON.parse(body as string));
  } catch (err) {
    done(err as Error, undefined);
  }
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────
async function shutdown(signal: string) {
  logger.info({ signal }, 'Encerrando servidor...');
  await app.close();
  logger.info('Servidor encerrado');
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

// ─── Start ────────────────────────────────────────────────────────────────────
async function start() {
  try {
    startScheduler();
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    logger.info({ port: env.PORT }, `Servidor rodando na porta ${env.PORT}`);
  } catch (err) {
    logger.error({ err }, 'Falha ao iniciar servidor');
    process.exit(1);
  }
}

void start();
