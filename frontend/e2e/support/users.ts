import path from 'node:path';

export const DEMO_PASSWORD = 'Demo1234!';

export const USERS = {
  ana: { username: 'ana_demo', display: 'Ana' },
  luis: { username: 'luis_demo', display: 'Luis' },
  marta: { username: 'marta_demo', display: 'Marta' },
} as const;

export type UserKey = keyof typeof USERS;

export const AUTH_DIR = path.join(import.meta.dirname, '..', '.auth');

export function storageStatePath(user: UserKey): string {
  return path.join(AUTH_DIR, `${user}.json`);
}
