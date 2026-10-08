// Tipos REST derivados a mano del backend (backend/schemas/*.go,
// backend/models/*.go). La API sigue mezclando casings mientras avanza el
// corte a camelCase (AC3 migró user/auth/contactos; AC4 el chat 1:1; AC5 los
// grupos; AC6 los estados; quedan los leftovers de AC7 en snake_case): esto
// refleja fielmente el contrato real del backend, no es un error de tipado.
// Cada dominio se migra en su propio corte.

// ─────────────────────────────────────────────────────────────────────────
// Enums (string literal unions), verificados contra el código Go real
// ─────────────────────────────────────────────────────────────────────────

/** backend/repos/contactData.go status = "enviado" | "entregado" | "visto" (mensajes 1:1). */
export type MessageStatus = 'enviado' | 'entregado' | 'visto';

/** backend/database/postgres.go CHECK (status IN ('pending','accepted','rejected')). */
export type ContactStatus = 'pending' | 'accepted' | 'rejected';

/** backend/utils/validationMedia.go: tipos de media válidos para mensajes/estados. */
export type MediaType = 'image' | 'audio' | 'video' | 'sticker' | 'document';

/** backend/models/status.go Type = "text" | "image" | "video". */
export type StatusType = 'text' | 'image' | 'video';

/** backend/database/postgres.go CHECK (status IN ('answered','missed','rejected','unavailable')). */
export type CallLogStatus = 'answered' | 'missed' | 'rejected' | 'unavailable';

/** backend/schemas/schemaCall.go / models/callLog.go CallType. */
export type CallType = 'video' | 'audio';

/** backend/models/group.go GroupMember.Role. */
export type GroupRole = 'admin' | 'member';

/** backend/models/group.go GroupMessage.Kind. Absent = normal message; "system" = persisted group event. */
export type GroupMessageKind = 'system';

/** backend/models/group.go SystemEvent* constants (structured, never rendered text). */
export type GroupSystemEvent =
  | 'member_added'
  | 'member_removed'
  | 'member_left'
  | 'admin_granted'
  | 'admin_revoked'
  | 'settings_changed'
  | 'info_changed'
  | 'disappearing_changed';

/** backend/models Message.Kind (1:1). Absent = normal message; "system" = persisted chat event. */
export type MessageKind = 'system';

/** Segundos permitidos del temporizador de mensajes temporales (0 = desactivado). */
export type DisappearSeconds = 0 | 86400 | 604800 | 7776000;

// ─────────────────────────────────────────────────────────────────────────
// User / perfil — backend/schemas/schemauser.go UserGet (camelCase tras el
// corte AC3: username/telephon/email/avatarUrl/wallpaperUrl).
// ─────────────────────────────────────────────────────────────────────────

export interface UserGet {
  username: string;
  telephon: string;
  email: string;
  avatarUrl: string;
  wallpaperUrl: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Contactos — backend/models/contact.go ContactChat (camelCase tras el corte
// AC3: username/telephon/status/contactName/lastSeen/avatarUrl/wallpaperUrl).
// ─────────────────────────────────────────────────────────────────────────

export interface ContactChat {
  username: string;
  telephon: string;
  status: ContactStatus;
  contactName: string;
  /** Puede ser null (nunca visto / offline); no tiene omitempty, así que siempre está presente. */
  lastSeen: string | null;
  avatarUrl: string;
  wallpaperUrl: string;
  /** Silencio por chat (omitempty): ausente = no silenciado; true sin mutedUntil = "Siempre". */
  muted?: boolean;
  /** RFC 3339 UTC; el cliente trata `mutedUntil <= ahora` como no silenciado (la lista puede estar desfasada). */
  mutedUntil?: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Mensajes 1:1 — backend/schemas/schemaMessage.go
// ─────────────────────────────────────────────────────────────────────────

/**
 * Agregado de reacciones de un mensaje tal como lo ve el espectador
 * (backend/schemas/schemaReaction.go, camelCase). `mine` indica si el
 * espectador es uno de los `count`.
 */
export interface ReactionSummary {
  emoji: string;
  count: number;
  mine: boolean;
}

/** Usuario que reaccionó (GET .../reactions, camelCase). */
export interface ReactionUser {
  telephon: string;
  username: string;
  avatarUrl: string;
}

export interface ReactionUsersEntry {
  emoji: string;
  users: ReactionUser[];
}

/** GET /api/v1/chat/message/:id/reactions y /api/v1/group/:groupID/message/:messageID/reactions. */
export interface MessageReactionsResponse {
  reactions: ReactionUsersEntry[];
}

export interface Message {
  messageID: number;
  senderTelephon: string;
  receptor: string;
  message: string;
  status: MessageStatus;
  /** ISO 8601 (time.Time serializado por encoding/json). */
  time: string;
  edited: boolean;
  mediaUrl?: string;
  mediaType?: MediaType;
  replyToMessageID?: number;
  replyToTelephon?: string;
  replyToMessage?: string;
  /** Omitido por el backend cuando no hay reacciones (omitempty). */
  reactions?: ReactionSummary[];
  /** RFC 3339; solo si el chat tenía temporizador al enviar (omitempty). Inválido = ignorado. */
  expiresAt?: string;
  /** Solo en mensajes de sistema (omitempty); su `message` son los segundos ("0" = off). */
  kind?: MessageKind;
  systemEvent?: GroupSystemEvent;
  /** Sender's idempotency key echoed back (omitempty); untrusted, read via readClientID. */
  clientID?: string;
}

/** GET del historial de chat 1:1 con un contacto. */
export interface ChatGroup {
  contactTelephon: string;
  contactUsername: string;
  contactName: string;
  contactAvatarUrl: string;
  isContact: boolean;
  messages: Message[];
  /** Temporizador del chat en segundos (omitempty: ausente = 0). */
  disappearSeconds?: number;
  /** Silencio por chat (omitempty): ausente = no silenciado; true sin mutedUntil = "Siempre". */
  muted?: boolean;
  /** RFC 3339 UTC; el cliente trata `mutedUntil <= ahora` como no silenciado (la lista puede estar desfasada). */
  mutedUntil?: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Grupos — backend/schemas/schemaGroup.go
// ─────────────────────────────────────────────────────────────────────────

export interface GroupResponse {
  id: number;
  name: string;
  description?: string;
  avatarUrl?: string;
  creatorTelephon: string;
  memberCount: number;
  userRole: GroupRole;
  createdAt: string;
  /** Permisos del grupo (camelCase, backend schemaGroup.go). false = abierto (default). */
  onlyAdminsCanSend: boolean;
  onlyAdminsCanEditInfo: boolean;
  onlyAdminsCanAddMembers: boolean;
  /** Temporizador de mensajes temporales en segundos (omitempty: ausente = 0). */
  disappearSeconds?: number;
  /** Silencio por chat (omitempty): ausente = no silenciado; true sin mutedUntil = "Siempre". */
  muted?: boolean;
  /** RFC 3339 UTC; el cliente trata `mutedUntil <= ahora` como no silenciado (la lista puede estar desfasada). */
  mutedUntil?: string;
}

export interface GroupMemberResponse {
  telephon: string;
  username: string;
  avatarUrl?: string;
  role: GroupRole;
  contactName?: string;
  /** Marcas de agua de acuses (ids de mensaje dentro del grupo); ausentes = 0. */
  joinedMessageID?: number;
  lastDeliveredMessageID?: number;
  lastReadMessageID?: number;
}

export interface GroupMessageResponse {
  messageID: number;
  groupID: number;
  senderTelephon: string;
  senderUsername: string;
  message: string;
  time: string;
  edited: boolean;
  mediaUrl?: string;
  mediaType?: MediaType;
  replyToMessageID?: number;
  replyToTelephon?: string;
  replyToMessage?: string;
  /** Presente solo en eventos de sistema persistidos (backend omitempty). */
  kind?: GroupMessageKind;
  systemEvent?: GroupSystemEvent;
  /** Teléfonos afectados por el evento, para redactar por espectador. */
  systemTargets?: string[];
  /** Omitido por el backend cuando no hay reacciones (omitempty). */
  reactions?: ReactionSummary[];
  /** RFC 3339; solo si el grupo tenía temporizador al enviar (omitempty). Inválido = ignorado. */
  expiresAt?: string;
  /** Sender's idempotency key echoed back (omitempty); untrusted, read via readClientID. */
  clientID?: string;
}

/** Ficha mínima de un miembro en la lista de acuses (camelCase, ver schemaGroup.go). */
export interface GroupMemberBrief {
  telephon: string;
  username: string;
  avatarUrl?: string;
}

/** GET /api/v1/group/:groupID/message/:messageID/receipts (solo el autor del mensaje). */
export interface GroupMessageReceipts {
  readBy: GroupMemberBrief[];
  /** Entregado pero aún no leído. */
  deliveredTo: GroupMemberBrief[];
  /** Todavía sin entregar. */
  pending: GroupMemberBrief[];
}

/** GET /api/v1/group/:groupID */
export interface GroupDetail extends GroupResponse {
  members: GroupMemberResponse[];
  messages: GroupMessageResponse[];
}

// ─────────────────────────────────────────────────────────────────────────
// Llamadas — backend/schemas/schemaCall.go (camelCase, a diferencia de
// chat/grupo/estado que son PascalCase).
// ─────────────────────────────────────────────────────────────────────────

export interface CallLogResponse {
  id: number;
  callerTelephon: string;
  callerUsername: string;
  receiverTelephon: string;
  receiverUsername: string;
  callType: CallType;
  status: CallLogStatus;
  startedAt: string;
  answeredAt?: string;
  endedAt?: string;
  /** Segundos. */
  duration: number;
  isOutgoing: boolean;
}

// ─────────────────────────────────────────────────────────────────────────
// Estados ("Estados" / stories) — backend/schemas/schemaStatus.go
// ─────────────────────────────────────────────────────────────────────────

export interface StatusItem {
  id: number;
  type: StatusType;
  text?: string;
  /** "#RRGGBB", solo aplica a type === 'text'. */
  backgroundColor?: string;
  mediaUrl?: string;
  caption?: string;
  createdAt: string;
  expiresAt: string;
  viewed: boolean;
  /** Solo tiene sentido en "mine" (siempre 0 en estados de contactos). */
  viewCount: number;
}

export interface StatusOwnerBrief {
  telephon: string;
  username: string;
  contactName?: string;
  avatarUrl?: string;
}

export interface StatusContactGroup extends StatusOwnerBrief {
  statuses: StatusItem[];
  allViewed: boolean;
  lastUpdated: string;
}

/** GET /api/v1/status */
export interface StatusFeed {
  mine: StatusItem[];
  contacts: StatusContactGroup[];
}

export interface StatusViewer {
  telephon: string;
  username: string;
  avatarUrl?: string;
  viewedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Subida de media — backend/services/serviceMedia.go MediaUploadResult
// ─────────────────────────────────────────────────────────────────────────

export interface MediaUploadResult {
  url: string;
  mediaType: MediaType | 'document';
  mimeType: string;
  size: number;
  filename: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Bodies de petición (camelCase / snake_case según backend/models/json.go)
// ─────────────────────────────────────────────────────────────────────────

export interface UserLoginRequest {
  username: string;
  password: string;
}

export interface ContactAddRequest {
  telephon: string;
  contactName: string;
}

export interface GetContactPutRequest {
  telephon: string;
  contactName: string;
}

export interface MessageSendRequest {
  receptor: string;
  message: string;
  mediaUrl?: string;
  mediaType?: MediaType;
  replyToMessageID?: number;
  replyToTelephon?: string;
  replyToMessage?: string;
}

export interface MessageEditRequest {
  messageID: number;
  receptor: string;
  message: string;
}

export interface MessageDeleteRequest {
  messageID: number;
  receptor: string;
}

export interface UserActivateRequest {
  username: string;
  code: string;
}

export interface UserRecoverRequest {
  email: string;
  code: string;
}

export interface UserRecoverAndChangeRequest {
  email: string;
  code: string;
  password: string;
}

export interface UserForgotPasswordRequest {
  email: string;
  code: string;
  password: string;
}

export interface GroupCreateRequest {
  name: string;
  description?: string;
  /** Teléfonos E.164 de los miembros iniciales. */
  members: string[];
  /**
   * CUSTOM (decisión 2026-09-30): permisos opcionales al crear, default abierto.
   * Plumbing listo para GA7; el backend actual (GroupCreate) todavía no los parsea.
   */
  onlyAdminsCanSend?: boolean;
  onlyAdminsCanEditInfo?: boolean;
  onlyAdminsCanAddMembers?: boolean;
}

export interface GroupMemberRoleRequest {
  role: GroupRole;
}

export interface GroupSettingsRequest {
  onlyAdminsCanSend?: boolean;
  onlyAdminsCanEditInfo?: boolean;
  onlyAdminsCanAddMembers?: boolean;
}

export interface GroupInfoRequest {
  name?: string;
  description?: string;
}

/** Respuesta de PUT .../members/:telephon/role (camelCase, handlerGroup.go). */
export interface GroupMemberRoleResult {
  groupID: number;
  telephon: string;
  role: GroupRole;
  systemMessage?: GroupMessageResponse;
}

/** Respuesta de DELETE .../members/:telephon. */
export interface GroupMemberRemovedResult {
  groupID: number;
  telephon: string;
  systemMessage?: GroupMessageResponse;
}

/** Respuesta de PATCH .../settings y payload del evento `group_settings`. */
export interface GroupSettingsResult {
  groupID: number;
  onlyAdminsCanSend: boolean;
  onlyAdminsCanEditInfo: boolean;
  onlyAdminsCanAddMembers: boolean;
  systemMessage?: GroupMessageResponse;
}

/** Respuesta de PATCH .../:groupID y payload del evento `group_info`. */
export interface GroupInfoResult {
  groupID: number;
  name: string;
  description: string;
  systemMessage?: GroupMessageResponse;
}

export interface GroupAddMembersRequest {
  members: string[];
}

export interface GroupMessageSendRequest {
  groupID: number;
  message: string;
  mediaUrl?: string;
  mediaType?: MediaType;
  replyToMessageID?: number;
  replyToTelephon?: string;
  replyToMessage?: string;
}

export interface GroupMessageEditRequest {
  messageID: number;
  message: string;
}

export interface GroupMessageDeleteRequest {
  messageID: number;
}

export interface CallOfferRequest {
  to: string;
  roomID: string;
  callType: CallType;
}

export interface CallResponseRequest {
  to: string;
  roomID: string;
}

export interface StatusCreateRequest {
  type: StatusType;
  text?: string;
  backgroundColor?: string;
  mediaUrl?: string;
  caption?: string;
}

export interface BugReportRequest {
  title: string;
  description: string;
  steps: string;
  expected: string;
  actual: string;
  user_email: string;
  browser: string;
  os: string;
  screen_size: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Web Push (camelCase, /api/v1/push/*)
// ─────────────────────────────────────────────────────────────────────────

/** GET /api/v1/push/config. `publicKey` is "" when disabled; `preview` is the effective per-user setting. */
export interface PushConfig {
  enabled: boolean;
  publicKey: string;
  preview: boolean;
}

/** POST /api/v1/push/subscribe body: exactly `PushSubscription.toJSON()`. */
export type PushSubscribeRequest = PushSubscriptionJSON;

/** DELETE /api/v1/push/subscribe body. */
export interface PushUnsubscribeRequest {
  endpoint: string;
}

/** PUT /api/v1/push/preview body. */
export interface PushPreviewRequest {
  preview: boolean;
}

// ─────────────────────────────────────────────────────────────────────────
// Silenciar chats (camelCase, PUT/DELETE /api/v1/chat/:contact/mute y /api/v1/group/:groupID/mute)
// ─────────────────────────────────────────────────────────────────────────

export type MuteDuration = '8h' | '1w' | 'always';

/** PUT .../mute body. */
export interface MuteRequest {
  duration: MuteDuration;
}

/** PUT .../mute response; `mutedUntil` is null for "always". */
export interface MuteResponse {
  muted: true;
  mutedUntil: string | null;
}

// ─────────────────────────────────────────────────────────────────────────
// Búsqueda de mensajes (camelCase, ver backend/schemas/schemaSearch.go)
// ─────────────────────────────────────────────────────────────────────────

/** Rango [inicio, fin) en índices de rune (codepoint) sobre `snippet`. */
export type HighlightRange = [number, number];

export interface SearchResult {
  messageID: number;
  /** ISO 8601. */
  time: string;
  snippet: string;
  highlights: HighlightRange[];
}

/** GET /api/v1/chat/:contact/search y /api/v1/group/:groupID/message/search. */
export interface SearchPage {
  results: SearchResult[];
  hasMore: boolean;
}

export type SearchChatKind = 'direct' | 'group';

export interface GlobalSearchChat {
  kind: SearchChatKind;
  /** telephon del contacto (direct) o id del grupo como texto (group). */
  key: string;
  name: string;
  avatarUrl: string;
  results: SearchResult[];
  total: number;
}

/** GET /api/v1/search. */
export interface GlobalSearchResponse {
  chats: GlobalSearchChat[];
}

// ─────────────────────────────────────────────────────────────────────────
// Sticker library (camelCase, /api/v1/stickers/*) — backend/models/sticker.go
// ─────────────────────────────────────────────────────────────────────────

/** One owned sticker (StickerResponse). */
export interface Sticker {
  id: number;
  url: string;
  sha256: string;
  animated: boolean;
  favorite: boolean;
  tags: string[];
  createdAt: string;
}

/** A favorite, built-in or owned (StickerFavoriteItem). */
export interface StickerFavoriteItem {
  url: string;
  createdAt: string;
}

/** A recently used sticker (StickerRecentItem). */
export interface StickerRecentItem {
  url: string;
  lastUsedAt: string;
}

/** GET /api/v1/stickers. */
export interface StickerLibraryResponse {
  mine: Sticker[];
  favorites: StickerFavoriteItem[];
  recents: StickerRecentItem[];
}

/** POST /api/v1/stickers/save body. */
export interface StickerSaveRequest {
  url: string;
}

/** PUT /api/v1/stickers/favorites body. */
export interface StickerFavoriteRequest {
  url: string;
  favorite: boolean;
}

// ─────────────────────────────────────────────────────────────────────────
// Errores
// ─────────────────────────────────────────────────────────────────────────

export interface ApiErrorBody {
  error: string;
}
