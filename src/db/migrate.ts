import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';

console.log('⏳ Rodando migrations...');

const dbPath = process.env.DATABASE_URL ?? './data/chatbot.db';

// Garante que a pasta data existe
import { mkdirSync } from 'fs';
try { mkdirSync('./data', { recursive: true }); } catch {}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const sqlPath = join(process.cwd(), 'src', 'db', 'migrations', '0000_initial.sql');
const sql = readFileSync(sqlPath, 'utf-8');

// Executa cada statement separadamente
const statements = sql
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith('--'));

const runMigrations = db.transaction(() => {
  for (const statement of statements) {
    try {
      db.prepare(statement).run();
    } catch (err: any) {
      // Ignora erros de "already exists"
      if (!err.message.includes('already exists')) {
        throw err;
      }
    }
  }
});

runMigrations();
db.close();

console.log('✅ Migrations concluídas com sucesso!');
