import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import * as schema from './schema.js';

const dbUrl = process.env['DATABASE_URL'] ?? './data/chatbot.db';
mkdirSync(dirname(dbUrl), { recursive: true });

const sqlite = new Database(dbUrl);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
const db = drizzle(sqlite, { schema });

async function seed() {
  console.log('🌱 Iniciando seed...');

  // Slots bloqueados de exemplo (feriados, almoço, manutenção)
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const dayAfter = new Date(today);
  dayAfter.setDate(today.getDate() + 2);

  await db.insert(schema.blocked_slots).values([
    { date: fmt(tomorrow), time: '12:00', reason: 'Horário de almoço' },
    { date: fmt(tomorrow), time: '13:00', reason: 'Horário de almoço' },
    { date: fmt(dayAfter), time: '09:00', reason: 'Manutenção de equipamentos' },
    { date: fmt(dayAfter), time: '10:00', reason: 'Manutenção de equipamentos' },
  ]).onConflictDoNothing();

  // Contato de exemplo
  const [contact] = await db.insert(schema.contacts).values({
    phone_number: '5511988887777',
    name: 'Maria Silva',
  }).onConflictDoNothing().returning();

  if (contact) {
    // Agendamento de exemplo (confirmado)
    const futureDate = new Date(today);
    futureDate.setDate(today.getDate() + 3);

    await db.insert(schema.appointments).values({
      contact_id: contact.id,
      procedure_name: 'Limpeza de pele',
      procedure_id: 'limpeza-pele',
      scheduled_date: fmt(futureDate),
      scheduled_time: '14:00',
      status: 'confirmed',
    }).onConflictDoNothing();
  }

  console.log('✅ Seed concluído!');
  console.log(`   - 4 slots bloqueados criados`);
  console.log(`   - 1 contato de exemplo criado`);
  console.log(`   - 1 agendamento de exemplo criado`);
  sqlite.close();
}

seed().catch((err) => {
  console.error('❌ Erro no seed:', err);
  process.exit(1);
});
