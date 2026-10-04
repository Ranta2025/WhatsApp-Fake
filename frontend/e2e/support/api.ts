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

// Optional permission settings accepted by POST /api/v1/group (all default to open).
export interface GroupCreateSettings {
  onlyAdminsCanSend?: boolean;
  onlyAdminsCanEditInfo?: boolean;
  onlyAdminsCanAddMembers?: boolean;
}

// Crea un grupo (el creador debe tener a los miembros como contactos) y devuelve su id.
export async function createGroup(
  request: APIRequestContext,
  name: string,
  members: string[],
  settings: GroupCreateSettings = {},
): Promise<number> {
  const res = await request.post('/api/v1/group', { data: { name, members, ...settings } });
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

interface WsTicketResponse {
  ticket: string;
}

function isWsTicketResponse(value: unknown): value is WsTicketResponse {
  return typeof value === 'object' && value !== null && typeof (value as { ticket?: unknown }).ticket === 'string';
}

// One-shot WS ticket (30 s) for the user authenticated in that API context.
export async function wsTicket(request: APIRequestContext): Promise<string> {
  const res = await request.get('/api/v1/ws-ticket');
  expect(res.ok(), 'GET /api/v1/ws-ticket').toBeTruthy();
  const body: unknown = await res.json();
  if (!isWsTicketResponse(body)) throw new Error('GET /api/v1/ws-ticket sin "ticket"');
  return body.ticket;
}

export interface WsFrame {
  type: string;
  error?: string;
}

function isWsFrame(value: unknown): value is WsFrame {
  return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string';
}

// Hand-crafted client: opens a raw WebSocket as that user (ticket auth, like the app),
// sends one `group_chat` frame and resolves with the first reply about it
// (`error` or the `group_chat` echo). Note: the hub keeps one connection per user,
// so this replaces that user's browser connection while it is open.
export async function forceGroupSendOverWs(
  request: APIRequestContext,
  baseURL: string,
  groupID: number,
  message: string,
  timeoutMs = 10_000,
): Promise<WsFrame> {
  const ticket = await wsTicket(request);
  const url = new URL('/api/v1/ws', baseURL);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('ticket', ticket);

  const ws = new WebSocket(url.toString());
  try {
    return await new Promise<WsFrame>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no WS reply to group_chat within ${timeoutMs} ms`)), timeoutMs);
      ws.addEventListener('open', () => {
        ws.send(JSON.stringify({ type: 'group_chat', payload: { groupID, message } }));
      });
      ws.addEventListener('message', (event) => {
        if (typeof event.data !== 'string') return;
        const frame: unknown = JSON.parse(event.data);
        if (!isWsFrame(frame) || (frame.type !== 'error' && frame.type !== 'group_chat')) return;
        clearTimeout(timer);
        resolve(frame);
      });
      ws.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new Error('WS connection error'));
      });
    });
  } finally {
    ws.close();
  }
}

// Texts of the latest group messages (system rows have an empty Message).
export async function groupMessageTexts(request: APIRequestContext, groupID: number): Promise<string[]> {
  const res = await request.get(`/api/v1/group/${groupID}/message`, { params: { limit: 50 } });
  expect(res.ok(), `GET group ${groupID} history`).toBeTruthy();
  const body: unknown = await res.json();
  const messages = typeof body === 'object' && body !== null ? (body as { messages?: unknown }).messages : undefined;
  if (!Array.isArray(messages)) throw new Error('GET group history sin "messages"');
  return messages.flatMap((m: unknown) => {
    const text = typeof m === 'object' && m !== null ? (m as { Message?: unknown }).Message : undefined;
    return typeof text === 'string' ? [text] : [];
  });
}

// Promotes/dismisses a group member through the REST API (actor must be admin).
export async function setGroupMemberRole(
  request: APIRequestContext,
  groupID: number,
  telephon: string,
  role: 'admin' | 'member',
): Promise<void> {
  const res = await request.put(`/api/v1/group/${groupID}/members/${encodeURIComponent(telephon)}/role`, { data: { role } });
  expect(res.ok(), `PUT group ${groupID} role ${role}`).toBeTruthy();
}
