import * as dotenv from 'dotenv';
dotenv.config();

import { z } from 'zod';

const envSchema = z.object({
  // Meta / WhatsApp
  WHATSAPP_TOKEN: z.string().min(1, 'WHATSAPP_TOKEN é obrigatório'),
  WHATSAPP_PHONE_ID: z.string().min(1, 'WHATSAPP_PHONE_ID é obrigatório'),
  WHATSAPP_APP_SECRET: z.string().min(1, 'WHATSAPP_APP_SECRET é obrigatório'),
  WEBHOOK_VERIFY_TOKEN: z.string().min(1, 'WEBHOOK_VERIFY_TOKEN é obrigatório'),

  // Anthropic
  ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY é obrigatório'),

  // App
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().default('./data/chatbot.db'),

  // Comportamento
  SESSION_TIMEOUT_MINUTES: z.coerce.number().default(30),
  HUMAN_HANDOFF_PAUSE_MINUTES: z.coerce.number().default(120),
  MAX_FAQ_HISTORY_TURNS: z.coerce.number().default(5),
  RATE_LIMIT_MSG_PER_SECOND: z.coerce.number().default(1),
});

function loadEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Variáveis de ambiente inválidas:\n${missing}`);
  }
  return result.data;
}

export const env = loadEnv();
export type Env = typeof env;
