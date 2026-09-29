import { expect, type APIRequestContext } from '@playwright/test';

interface UserResponse {
  Telephon: string;
}

function isUserResponse(value: unknown): value is UserResponse {
  return typeof value === 'object' && value !== null && typeof (value as { Telephon?: unknown }).Telephon === 'string';
}

// Teléfono del usuario autenticado en ese contexto de API.
export async function phoneOf(request: APIRequestContext): Promise<string> {
  const res = await request.get('/api/v1/user');
  expect(res.ok()).toBeTruthy();
  const body: unknown = await res.json();
  if (!isUserResponse(body)) throw new Error('GET /api/v1/user sin "Telephon"');
  return body.Telephon;
}

// Envía un mensaje 1:1 por API (más rápido y estable que escribirlo por UI).
export async function postChat(request: APIRequestContext, receptor: string, message: string): Promise<void> {
  const res = await request.post('/api/v1/chat', { data: { receptor, message } });
  expect(res.ok(), `POST /api/v1/chat "${message}"`).toBeTruthy();
}

// Envía un mensaje de grupo por API.
export async function postGroupMessage(request: APIRequestContext, groupID: number, message: string): Promise<void> {
  const res = await request.post(`/api/v1/group/${groupID}/message`, { data: { groupID, message } });
  expect(res.ok(), `POST group ${groupID} "${message}"`).toBeTruthy();
}

interface GroupSummary {
  ID: number;
  Name: string;
}

function isGroupSummary(value: unknown): value is GroupSummary {
  if (typeof value !== 'object' || value === null) return false;
  const g = value as { ID?: unknown; Name?: unknown };
  return typeof g.ID === 'number' && typeof g.Name === 'string';
}

// Id de un grupo del usuario por nombre exacto.
export async function groupIdByName(request: APIRequestContext, name: string): Promise<number> {
  const res = await request.get('/api/v1/group');
  expect(res.ok()).toBeTruthy();
  const body: unknown = await res.json();
  const groups = typeof body === 'object' && body !== null ? (body as { groups?: unknown }).groups : undefined;
  const found = Array.isArray(groups) ? groups.filter(isGroupSummary).find((g) => g.Name === name) : undefined;
  if (!found) throw new Error(`grupo "${name}" no encontrado`);
  return found.ID;
}

// Crea un grupo (el creador debe tener a los miembros como contactos) y devuelve su id.
export async function createGroup(request: APIRequestContext, name: string, members: string[]): Promise<number> {
  const res = await request.post('/api/v1/group', { data: { name, members } });
  expect(res.status(), `POST /api/v1/group "${name}"`).toBe(201);
  const body: unknown = await res.json();
  const group = typeof body === 'object' && body !== null ? (body as { group?: unknown }).group : undefined;
  if (!isGroupSummary(group)) throw new Error('POST /api/v1/group sin "group.ID"');
  return group.ID;
}

interface GlobalSearchChat {
  kind: string;
  key: string;
  results: { messageID: number }[];
}

// Resultado de GET /api/v1/search reducido a lo que verifican los specs.
export async function globalSearch(request: APIRequestContext, q: string): Promise<GlobalSearchChat[]> {
  const res = await request.get('/api/v1/search', { params: { q } });
  expect(res.ok()).toBeTruthy();
  const body: unknown = await res.json();
  const chats = typeof body === 'object' && body !== null ? (body as { chats?: unknown }).chats : undefined;
  if (!Array.isArray(chats)) throw new Error('GET /api/v1/search sin "chats"');
  return chats.filter((c): c is GlobalSearchChat => (
    typeof c === 'object' && c !== null
    && typeof (c as { kind?: unknown }).kind === 'string'
    && typeof (c as { key?: unknown }).key === 'string'
    && Array.isArray((c as { results?: unknown }).results)
  ));
}
