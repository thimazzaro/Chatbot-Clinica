# WhatsApp Chatbot — Clínicas Estéticas

Chatbot de atendimento automatizado para clínicas estéticas brasileiras integrado ao **WhatsApp Business Cloud API** (API oficial Meta). Sem risco de banimento.

---

## Funcionalidades

- Menu principal com botões interativos
- Agendamento em 5 etapas (procedimento → nome → data → horário → confirmação)
- Dúvidas via IA (Claude Haiku) com histórico de conversa
- Tabela de preços com detalhes por procedimento
- Handoff para humano com notificação automática da recepcionista
- Lembretes automáticos 24h e 2h antes via templates Meta
- Validação de assinatura HMAC-SHA256 em todo webhook
- Rate limiting interno e retry com exponential backoff
- Logs estruturados (pino) sem expor dados sensíveis

---

## Pré-requisitos

- Node.js 20+
- Conta no [Meta for Developers](https://developers.facebook.com/)
- Chave de API Anthropic

---

## 1. Criar o app na Meta for Developers

1. Acesse [developers.facebook.com](https://developers.facebook.com/) e clique em **Meus Apps → Criar app**
2. Selecione tipo **Business**
3. Adicione o produto **WhatsApp** ao app
4. Em **WhatsApp → Configuração**, anote:
   - `Phone Number ID` → `WHATSAPP_PHONE_ID`
   - `App Secret` (em Configurações Básicas) → `WHATSAPP_APP_SECRET`

---

## 2. Obter o WHATSAPP_TOKEN (System User Token permanente)

> Tokens temporários expiram em 24h. Use System User Token para produção.

1. Acesse **Business Manager** (business.facebook.com)
2. Vá em **Usuários → Usuários do Sistema → Adicionar**
3. Crie um usuário com função **Admin**
4. Clique em **Gerar novo token** → selecione o app e as permissões:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
5. Copie o token → `WHATSAPP_TOKEN`

---

## 3. Configurar o webhook no painel da Meta

1. No app Meta, vá em **WhatsApp → Configuração → Webhook**
2. Clique em **Editar** e preencha:
   - **URL do callback**: `https://SEU_DOMINIO/webhook/whatsapp`
   - **Token de verificação**: o valor que você definiu em `WEBHOOK_VERIFY_TOKEN`
3. Clique em **Verificar e salvar**
4. Assine o campo **messages** nos webhooks

---

## 4. Registrar os templates de lembrete

> Templates precisam ser aprovados pela Meta (24–48h). Use nomes exatos.

No **Business Manager → Conta do WhatsApp → Modelos de mensagem → Criar modelo**:

**Template 1: `lembrete_24h`**
- Categoria: `UTILITY`
- Idioma: `pt_BR`
- Corpo:
```
Olá {{1}}! 😊 Lembrando do seu agendamento de {{2}} amanhã às {{3}} na Bella Estética. Responda CONFIRMAR para confirmar ou CANCELAR para reagendar.
```

**Template 2: `lembrete_2h`**
- Categoria: `UTILITY`
- Idioma: `pt_BR`
- Corpo:
```
Oi {{1}}! Seu horário de {{2}} é em 2 horas ({{3}}). Te esperamos na Rua das Flores, 123. Até logo! ✨
```

---

## 5. Instalação local

```bash
# Clone e entre no diretório
cd chatbot-clinica

# Copie e preencha as variáveis
cp .env.example .env

# Instale dependências
npm install

# Crie o banco e rode migrations
npm run db:migrate

# Popule com dados de exemplo
npm run db:seed

# Inicie em modo desenvolvimento
npm run dev
```

---

## 6. Configurar a clínica

Edite [src/config/clinic.json](src/config/clinic.json):

- `name`: nome da clínica
- `receptionist_whatsapp`: número completo com DDI (ex: `5511999999999`)
- `address`: endereço completo
- `procedures`: adicione/remova procedimentos com `id`, `name`, `description`, `duration_minutes`, `price`
- `appointment_slots`: horários de funcionamento e intervalo entre agendamentos

---

## 7. Deploy no Railway

### Via CLI

```bash
# Instale o Railway CLI
npm install -g @railway/cli

# Login
railway login

# Crie o projeto
railway init

# Configure as variáveis de ambiente
railway variables set WHATSAPP_TOKEN=xxx WHATSAPP_PHONE_ID=xxx ...

# Deploy
railway up
```

### Via GitHub (recomendado)

1. Faça push do projeto para um repositório GitHub
2. Em [railway.app](https://railway.app), clique em **New Project → Deploy from GitHub**
3. Selecione o repositório
4. Vá em **Variables** e adicione todas as variáveis do `.env.example`
5. Em **Settings → Networking**, adicione um domínio público
6. Use a URL gerada para configurar o webhook na Meta

### Volume persistente para o banco

No Railway, adicione um **Volume** montado em `/app/data` para que o SQLite persista entre deploys.

---

## 8. Conectar o número real da clínica

1. No **Business Manager**, vá em **Contas do WhatsApp → Números de telefone**
2. Clique em **Adicionar número de telefone**
3. Siga o fluxo de verificação por SMS/ligação
4. Após verificação, atualize `WHATSAPP_PHONE_ID` com o ID do novo número

> O número precisa estar associado a uma **Conta Comercial do WhatsApp** aprovada pela Meta.

---

## Variáveis de ambiente

| Variável | Descrição |
|---|---|
| `WHATSAPP_TOKEN` | Token permanente do System User |
| `WHATSAPP_PHONE_ID` | ID do número de telefone na Meta |
| `WHATSAPP_APP_SECRET` | App Secret para validar assinatura do webhook |
| `WEBHOOK_VERIFY_TOKEN` | Token que você define para verificação inicial |
| `ANTHROPIC_API_KEY` | Chave da API Anthropic |
| `PORT` | Porta HTTP (padrão: 3000) |
| `DATABASE_URL` | Caminho do SQLite (padrão: `./data/chatbot.db`) |
| `SESSION_TIMEOUT_MINUTES` | Expiração da sessão (padrão: 30) |
| `HUMAN_HANDOFF_PAUSE_MINUTES` | Pausa do bot após handoff (padrão: 120) |
| `MAX_FAQ_HISTORY_TURNS` | Turnos de histórico para Claude (padrão: 5) |
| `RATE_LIMIT_MSG_PER_SECOND` | Limite de mensagens por segundo (padrão: 1) |

---

## Scripts disponíveis

```bash
npm run dev          # Desenvolvimento com hot reload
npm run build        # Compila TypeScript
npm run start        # Produção (após build)
npm run db:migrate   # Cria/atualiza o banco
npm run db:seed      # Insere dados de exemplo
npm run db:generate  # Gera migrations do schema (drizzle-kit)
npm run db:studio    # Abre Drizzle Studio (GUI do banco)
```

---

## Estrutura de arquivos

```
src/
├── index.ts                    # Servidor Fastify + webhook handler
├── config/
│   ├── env.ts                  # Validação de env com Zod
│   └── clinic.json             # Configuração da clínica
├── db/
│   ├── schema.ts               # Schema Drizzle (6 tabelas)
│   ├── index.ts                # Instância do banco
│   ├── migrate.ts              # Script de migration standalone
│   ├── seed.ts                 # Script de seed
│   └── migrations/             # Arquivos SQL gerados
├── services/
│   ├── meta-api.ts             # Wrapper Cloud API Meta (retry, rate limit, HMAC)
│   ├── claude.ts               # Wrapper Anthropic com histórico
│   ├── scheduler.ts            # Cron jobs de lembretes
│   ├── appointment.ts          # Slots de disponibilidade
│   └── logger.ts               # Pino logger configurado
├── flows/
│   ├── router.ts               # Roteador principal por estado
│   ├── menu.ts                 # Menu inicial
│   ├── scheduling.ts           # Agendamento multi-etapa
│   ├── faq.ts                  # Dúvidas via Claude
│   ├── pricing.ts              # Preços
│   └── handoff.ts              # Transferência para humano
├── models/
│   └── session.ts              # Gerenciador de sessões (cache + DB)
└── utils/
    ├── message-builder.ts      # Builders para tipos de mensagem Meta
    ├── date-helpers.ts         # Formatação de datas pt-BR
    └── rate-limiter.ts         # Fila por número de telefone
```
