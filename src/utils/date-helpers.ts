const WEEKDAYS_PT = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const MONTHS_PT = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/** Formata Date para string "Quinta, 15 de janeiro" */
export function formatDatePtBR(date: Date): string {
  const day = WEEKDAYS_PT[date.getDay()];
  const d = date.getDate();
  const month = MONTHS_PT[date.getMonth()];
  return `${day}, ${d} de ${month}`;
}

/** Formata Date para string "15/01/2025" */
export function formatDateShort(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

/** Converte "YYYY-MM-DD" para Date (local, sem offset UTC) */
export function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}

/** Retorna "YYYY-MM-DD" de um Date */
export function toDateStr(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Adiciona N dias a uma data */
export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Verifica se uma data está no passado */
export function isPast(dateStr: string, timeStr: string): boolean {
  const [h, min] = timeStr.split(':').map(Number);
  const d = parseDate(dateStr);
  d.setHours(h!, min!, 0, 0);
  return d < new Date();
}

/** Formata data e hora para exibição humana */
export function formatDateTime(dateStr: string, timeStr: string): string {
  return `${formatDatePtBR(parseDate(dateStr))} às ${timeStr}`;
}
