// Tipos REST derivados a mano del backend (backend/schemas/*.go,
// backend/models/*.go). La API mezcla casings a propósito (PascalCase en
// los schemas de chat/grupo/estado, camelCase en llamadas y en los bodies de
// petición, snake_case en avatar/wallpaper/last_seen): esto refleja
// fielmente esa inconsistencia real del backend, no es un error de tipado.
// No se migra el backend; los tipos documentan el contrato tal como es.

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
// User / perfil — backend/schemas/schemauser.go UserGet (mixed casing:
// Username/Telephon/Gmail sin json tag → PascalCase; avatar/wallpaper con
// tag explícito → snake_case).
// ─────────────────────────────────────────────────────────────────────────

export interface UserGet {
  Username: string;
  Telephon: string;
  Gmail: string;
  avatar_url: string;
  wallpaper_url: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Contactos — backend/models/contact.go ContactChat (sin json tag →
// PascalCase; LastSeen/avatar/wallpaper con tag → snake_case).
// ─────────────────────────────────────────────────────────────────────────

export interface ContactChat {
  Username: string;
  Number: string;
  Status: ContactStatus;
  ContactName: string;
  /** Puede ser null (nunca visto / offline); no tiene omitempty, así que siempre está presente. */
  last_seen: string | null;
  avatar_url: string;
  wallpaper_url: string;
  /** Silencio por chat (omitempty): ausente = no silenciado; true sin MutedUntil = "Siempre". */
  Muted?: boolean;
  /** RFC 3339 UTC; el cliente trata `MutedUntil <= ahora` como no silenciado (la lista puede estar desfasada). */
  MutedUntil?: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Mensajes 1:1 — backend/schemas/schemaMessage.go
// ─────────────────────────────────────────────────────────────────────────

/**
 * Agregado de reacciones de un mensaje tal como lo ve el espectador
 * (backend/schemas/schemaReaction.go, PascalCase dentro de Message /
 * GroupMessageResponse). `Mine` indica si el espectador es uno de los `Count`.
 */
export interface ReactionSummary {
  Emoji: string;
  Count: number;
  Mine: boolean;
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
  MessageID: number;
  SenderTelephon: string;
  Receptor: string;
  Message: string;
  Status: MessageStatus;
  /** ISO 8601 (time.Time serializado por encoding/json). */
  Time: string;
  Edited: boolean;
  MediaUrl?: string;
  MediaType?: MediaType;
  ReplyToMessageID?: number;
  ReplyToTelephon?: string;
  ReplyToMessage?: string;
  /** Omitido por el backend cuando no hay reacciones (omitempty). */
  Reactions?: ReactionSummary[];
  /** RFC 3339; solo si el chat tenía temporizador al enviar (omitempty). Inválido = ignorado. */
  ExpiresAt?: string;
  /** Solo en mensajes de sistema (omitempty); su `Message` son los segundos ("0" = off). */
  Kind?: MessageKind;
  SystemEvent?: GroupSystemEvent;
  /** Sender's idempotency key echoed back (omitempty); untrusted, read via readClientID. */
  ClientID?: string;
}

/** GET del historial de chat 1:1 con un contacto. */
export interface ChatGroup {
  ContactTelephon: string;
  ContactUsername: string;
  ContactName: string;
  ContactAvatarUrl: string;
  IsContact: boolean;
  Messages: Message[];
  /** Temporizador del chat en segundos (omitempty: ausente = 0). */
  DisappearSeconds?: number;
  /** Silencio por chat (omitempty): ausente = no silenciado; true sin MutedUntil = "Siempre". */
  Muted?: boolean;
  /** RFC 3339 UTC; el cliente trata `MutedUntil <= ahora` como no silenciado (la lista puede estar desfasada). */
  MutedUntil?: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Grupos — backend/schemas/schemaGroup.go
// ─────────────────────────────────────────────────────────────────────────

export interface GroupResponse {
  ID: number;
  Name: string;
  Description?: string;
  AvatarUrl?: string;
  CreatorTelephon: string;
  MemberCount: number;
  UserRole: GroupRole;
  CreatedAt: string;
  /** Permisos del grupo (PascalCase, backend schemaGroup.go). false = abierto (default). */
  OnlyAdminsCanSend: boolean;
  OnlyAdminsCanEditInfo: boolean;
  OnlyAdminsCanAddMembers: boolean;
  /** Temporizador de mensajes temporales en segundos (omitempty: ausente = 0). */
  DisappearSeconds?: number;
  /** Silencio por chat (omitempty): ausente = no silenciado; true sin MutedUntil = "Siempre". */
  Muted?: boolean;
  /** RFC 3339 UTC; el cliente trata `MutedUntil <= ahora` como no silenciado (la lista puede estar desfasada). */
  MutedUntil?: string;
}

export interface GroupMemberResponse {
  Telephon: string;
  Username: string;
  AvatarUrl?: string;
  Role: GroupRole;
  ContactName?: string;
  /** Marcas de agua de acuses (ids de mensaje dentro del grupo); ausentes = 0. */
  JoinedMessageID?: number;
  LastDeliveredMessageID?: number;
  LastReadMessageID?: number;
}

export interface GroupMessageResponse {
  MessageID: number;
  GroupID: number;
  SenderTelephon: string;
  SenderUsername: string;
  Message: string;
  Time: string;
  Edited: boolean;
  MediaUrl?: string;
  MediaType?: MediaType;
  ReplyToMessageID?: number;
  ReplyToTelephon?: string;
  ReplyToMessage?: string;
  /** Presente solo en eventos de sistema persistidos (backend omitempty). */
  Kind?: GroupMessageKind;
  SystemEvent?: GroupSystemEvent;
  /** Teléfonos afectados por el evento, para redactar por espectador. */
  SystemTargets?: string[];
  /** Omitido por el backend cuando no hay reacciones (omitempty). */
  Reactions?: ReactionSummary[];
  /** RFC 3339; solo si el grupo tenía temporizador al enviar (omitempty). Inválido = ignorado. */
  ExpiresAt?: string;
  /** Sender's idempotency key echoed back (omitempty); untrusted, read via readClientID. */
  ClientID?: string;
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
  Members: GroupMemberResponse[];
  Messages: GroupMessageResponse[];
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
  ID: number;
  Type: StatusType;
  Text?: string;
  /** "#RRGGBB", solo aplica a Type === 'text'. */
  BackgroundColor?: string;
  MediaUrl?: string;
  Caption?: string;
  CreatedAt: string;
  ExpiresAt: string;
  Viewed: boolean;
  /** Solo tiene sentido en "Mine" (siempre 0 en estados de contactos). */
  ViewCount: number;
}

export interface StatusOwnerBrief {
  Telephon: string;
  Username: string;
  ContactName?: string;
  AvatarUrl?: string;
}

export interface StatusContactGroup extends StatusOwnerBrief {
  Statuses: StatusItem[];
  AllViewed: boolean;
  LastUpdated: string;
}

/** GET /api/v1/status */
export interface StatusFeed {
  Mine: StatusItem[];
  Contacts: StatusContactGroup[];
}

export interface StatusViewer {
  Telephon: string;
  Username: string;
  AvatarUrl?: string;
  ViewedAt: string;
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
  number: string;
  contact_name: string;
}

export interface GetContactPutRequest {
  number: string;
  contact_name: string;
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
