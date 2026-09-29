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
}

// ─────────────────────────────────────────────────────────────────────────
// Mensajes 1:1 — backend/schemas/schemaMessage.go
// ─────────────────────────────────────────────────────────────────────────

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
}

/** GET del historial de chat 1:1 con un contacto. */
export interface ChatGroup {
  ContactTelephon: string;
  ContactUsername: string;
  ContactName: string;
  ContactAvatarUrl: string;
  IsContact: boolean;
  Messages: Message[];
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
// Errores
// ─────────────────────────────────────────────────────────────────────────

export interface ApiErrorBody {
  error: string;
}
