import pino from 'pino';

export const logger = pino({
  level: process.env['NODE_ENV'] === 'production' ? 'info' : 'debug',
  transport:
    process.env['NODE_ENV'] !== 'production'
      ? {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
        }
      : undefined,
  redact: {
    paths: ['WHATSAPP_TOKEN', 'ANTHROPIC_API_KEY', 'WHATSAPP_APP_SECRET', '*.token', '*.apiKey'],
    censor: '[REDACTED]',
  },
});
