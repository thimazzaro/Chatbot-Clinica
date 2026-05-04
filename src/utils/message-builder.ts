// Construtores para cada tipo de mensagem da Meta WhatsApp Cloud API

export interface Button {
  id: string;
  title: string; // máx 20 chars
}

export interface ListRow {
  id: string;
  title: string;       // máx 24 chars
  description?: string; // máx 72 chars
}

export interface Section {
  title?: string;
  rows: ListRow[];
}

// ─── Text ─────────────────────────────────────────────────────────────────────
export function buildTextMessage(to: string, text: string) {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { body: text },
  };
}

// ─── Interactive: Buttons ─────────────────────────────────────────────────────
export function buildButtonMessage(to: string, body: string, buttons: Button[], header?: string, footer?: string) {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      ...(header ? { header: { type: 'text', text: header } } : {}),
      body: { text: body },
      ...(footer ? { footer: { text: footer } } : {}),
      action: {
        buttons: buttons.map((b) => ({
          type: 'reply',
          reply: { id: b.id, title: b.title },
        })),
      },
    },
  };
}

// ─── Interactive: List ────────────────────────────────────────────────────────
export function buildListMessage(
  to: string,
  header: string,
  body: string,
  buttonLabel: string,
  sections: Section[],
  footer?: string,
) {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: { type: 'text', text: header },
      body: { text: body },
      ...(footer ? { footer: { text: footer } } : {}),
      action: {
        button: buttonLabel,
        sections,
      },
    },
  };
}

// ─── Template ─────────────────────────────────────────────────────────────────
export function buildTemplateMessage(to: string, templateName: string, languageCode: string, params: string[]) {
  return {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      components: [
        {
          type: 'body',
          parameters: params.map((p) => ({ type: 'text', text: p })),
        },
      ],
    },
  };
}

// ─── Mark as Read ─────────────────────────────────────────────────────────────
export function buildMarkAsRead(messageId: string) {
  return {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: messageId,
  };
}
