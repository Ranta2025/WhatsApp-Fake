import { execFileSync } from 'node:child_process';
import path from 'node:path';

// Acceso directo a Postgres para sembrar estados que la app no expone (p. ej. una caducidad
// cercana). No hay rutas de test en producción: se ejecuta `psql` dentro del contenedor de
// compose, donde POSTGRES_USER/POSTGRES_DB ya están resueltos. Requiere el stack levantado con
// `docker compose up -d` (POSTGRES_PUBLIC_PORT solo evita el choque de puertos del compose).
const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');

export function psql(sql: string): string {
  return execFileSync(
    'docker',
    ['compose', 'exec', '-T', 'postgres', 'sh', '-c', 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "$1"', 'sh', sql],
    {
      cwd: REPO_ROOT,
      env: { ...process.env, POSTGRES_PUBLIC_PORT: process.env.POSTGRES_PUBLIC_PORT ?? '55432' },
      encoding: 'utf8',
    },
  ).trim();
}

// `ExpiresAt` relativo a la hora de la BD. `table` es una constante interna, nunca entrada externa.
export function setExpiry(table: 'messages' | 'group_messages', id: number, interval: string): void {
  if (!Number.isInteger(id)) throw new Error(`id de mensaje inválido: ${id}`);
  if (!/^-?\d+ (second|seconds|minute|minutes)$/.test(interval)) throw new Error(`intervalo inválido: ${interval}`);
  const updated = psql(
    `WITH u AS (UPDATE ${table} SET expires_at = now() + interval '${interval}' WHERE id = ${id} RETURNING 1) SELECT count(*) FROM u`,
  );
  if (updated !== '1') throw new Error(`no se actualizó ${table}.id=${id} (filas: ${updated})`);
}
