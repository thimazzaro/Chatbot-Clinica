/**
 * Fila por número de telefone para respeitar máx N msg/s.
 * Garante envio ordenado e evita rejeição por rate limit da Meta.
 */

type QueueEntry = {
  fn: () => Promise<void>;
  resolve: () => void;
  reject: (err: unknown) => void;
};

const queues = new Map<string, QueueEntry[]>();
const processing = new Set<string>();

export function enqueue(phoneNumber: string, fn: () => Promise<void>, intervalMs: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const key = phoneNumber;
    if (!queues.has(key)) queues.set(key, []);
    queues.get(key)!.push({ fn, resolve, reject });

    if (!processing.has(key)) {
      processing.add(key);
      void processQueue(key, intervalMs);
    }
  });
}

async function processQueue(key: string, intervalMs: number): Promise<void> {
  const queue = queues.get(key)!;
  while (queue.length > 0) {
    const entry = queue.shift()!;
    try {
      await entry.fn();
      entry.resolve();
    } catch (err) {
      entry.reject(err);
    }
    if (queue.length > 0) {
      await delay(intervalMs);
    }
  }
  processing.delete(key);
  queues.delete(key);
}

function delay(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}
