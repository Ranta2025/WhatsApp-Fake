// Tipos del protocolo WebSocket, verificados contra backend/websocket/*.go
// (hub.go, cliente.go, handler.go, message_handlers.go) y los handlers REST
// que también empujan eventos por el mismo Hub (handlerChat.go,
// handlerGroup.go, handlerStatus.go, handlerContact.go).
//
// Envelope: casi todo viaja como { type, payload }. Dos excepciones reales:
//   - "error" es plano: { type: "error", error: string } (sin payload).
//   - "pong" no lleva nada más que { type: "pong" }.
// No existe ningún evento con clave "data".
//
// Estos tipos describen el contrato de red tal como el backend lo envía/
// espera, antes de cualquier remapeo que haga el cliente (ver
// src/api/websocket.ts `WsHandlerMap` para el contrato post-remapeo que
// reciben los listeners de `wsManager.on(...)`).

import type {
  Message,
  GroupMessageResponse,
  GroupResponse,
  StatusOwnerBrief,
  StatusItem,
  StatusViewer,
  CallType,
} from './api';

// ─────────────────────────────────────────────────────────────────────────
// Servidor → Cliente
// ─────────────────────────────────────────────────────────────────────────

export interface WsOnline {
  type: 'online';
  payload: { username: string; telephon: string };
}

export interface WsOffline {
  type: 'offline';
  payload: { username: string; telephon: string; last_seen: string };
}

export interface WsContactsOnline {
  type: 'contacts_online';
  /** Nunca null: el backend siempre construye al menos un array vacío. */
  payload: { contacts: string[] };
}

export interface WsUsernameChanged {
  type: 'username_changed';
  payload: { old_username: string; new_username: string; telephon: string };
}

export interface WsAvatarChanged {
  type: 'avatar_changed';
  payload: { telephon: string; avatar_url: string };
}

/** Confirmación de un mensaje 1:1 nuevo (a remitente y receptor). */
export interface WsChat {
  type: 'chat';
  payload: Message;
}

export interface WsEditMessage {
  type: 'edit_message';
  payload: Message;
}

export interface WsDeleteMessage {
  type: 'delete_message';
  payload: Message;
}

/** Notifica al remitente original que sus mensajes fueron vistos. */
export interface WsRead {
  type: 'read';
  payload: { from: string };
}

export interface WsTyping {
  type: 'typing';
  payload: { from: string };
}

/** Ack masivo: los mensajes pendientes hacia `receiver` ya fueron entregados. */
export interface WsMessageDelivered {
  type: 'message_delivered';
  payload: { receiver: string };
}

export interface WsIncomingCall {
  type: 'incoming_call';
  payload: { from: string; username: string; roomID: string; callType: CallType };
}

export interface WsCallUnavailable {
  type: 'call_unavailable';
  payload: { to: string; reason: string };
}

export interface WsCallAccepted {
  type: 'call_accepted';
  payload: { from: string; roomID: string };
}

export interface WsCallRejected {
  type: 'call_rejected';
  payload: { from: string; roomID: string };
}

export interface WsCallEnded {
  type: 'call_ended';
  payload: { from: string; roomID: string };
}

export interface WsGroupChat {
  type: 'group_chat';
  payload: GroupMessageResponse;
}

export interface WsGroupTyping {
  type: 'group_typing';
  payload: { groupID: number; from: string };
}

export interface WsGroupEditMessage {
  type: 'group_edit_message';
  payload: GroupMessageResponse;
}

/**
 * A diferencia de group_chat/group_edit_message, el backend NO reenvía el
 * schema completo aquí: construye un mapa a mano solo con estas dos claves
 * (message_handlers.go HandleGroupDeleteMessage), en PascalCase (coherente
 * con el resto de claves de grupo, mismatched con group_typing que usa
 * camelCase "groupID").
 */
export interface WsGroupDeleteMessage {
  type: 'group_delete_message';
  payload: { MessageID: number; GroupID: number };
}

/** Solo se emite al crear el grupo o añadir miembros (REST, sin equivalente WS). */
export interface WsGroupAdded {
  type: 'group_added';
  payload: GroupResponse;
}

export interface WsGroupMemberAdded {
  type: 'group_member_added';
  payload: {
    groupID: number;
    addedByUsername: string;
    addedMembers: Array<{ telephon: string; username: string }>;
    newMemberCount: number;
  };
}

export interface WsGroupAvatarUpdate {
  type: 'group_avatar_update';
  payload: { groupID: number; avatarUrl: string };
}

export interface WsGroupMemberLeft {
  type: 'group_member_left';
  payload: { groupID: number; telephon: string; username: string };
}

/**
 * Avance de los acuses de un miembro (`deliveredUpTo`/`readUpTo` = mayor id de
 * mensaje del grupo entregado/leído). Se envía a los miembros conectados salvo
 * a quien originó el acuse (message_handlers.go publishGroupReceipt). camelCase.
 */
export interface WsGroupReceipt {
  type: 'group_receipt';
  payload: { groupID: number; telephon: string; deliveredUpTo: number; readUpTo: number };
}

export interface WsStatusNew {
  type: 'status_new';
  payload: { owner: StatusOwnerBrief; status: StatusItem };
}

/**
 * Casing mixto intencional: las claves del payload son camelCase, pero
 * `viewer` reutiliza StatusViewer (PascalCase). `viewedAt` está duplicado
 * también dentro de `viewer.ViewedAt`.
 */
export interface WsStatusViewed {
  type: 'status_viewed';
  payload: { statusId: number; viewer: StatusViewer; viewedAt: string; viewCount: number };
}

export interface WsStatusDeleted {
  type: 'status_deleted';
  payload: { ownerTelephon: string; statusId: number };
}

/** Envelope plano: NO tiene `payload`, el mensaje va en `error`. */
export interface WsError {
  type: 'error';
  error: string;
}

/** Respuesta al ping del cliente; no lleva ningún otro campo. */
export interface WsPong {
  type: 'pong';
}

/** Todo evento que el backend puede enviar por WebSocket, discriminado por `type`. */
export type WsEvent =
  | WsOnline
  | WsOffline
  | WsContactsOnline
  | WsUsernameChanged
  | WsAvatarChanged
  | WsChat
  | WsEditMessage
  | WsDeleteMessage
  | WsRead
  | WsTyping
  | WsMessageDelivered
  | WsIncomingCall
  | WsCallUnavailable
  | WsCallAccepted
  | WsCallRejected
  | WsCallEnded
  | WsGroupChat
  | WsGroupTyping
  | WsGroupEditMessage
  | WsGroupDeleteMessage
  | WsGroupAdded
  | WsGroupMemberAdded
  | WsGroupAvatarUpdate
  | WsGroupMemberLeft
  | WsGroupReceipt
  | WsStatusNew
  | WsStatusViewed
  | WsStatusDeleted
  | WsError
  | WsPong;

export type WsEventType = WsEvent['type'];

/** Estrecha WsEvent a la variante concreta de un `type` dado. */
export type WsEventOf<T extends WsEventType> = Extract<WsEvent, { type: T }>;

// ─────────────────────────────────────────────────────────────────────────
// Cliente → Servidor (ver frontend/src/api/websocket.ts `_send`, todo viaja
// como { type, payload } salvo "ping"; router del backend en cliente.go
// buildRouter — cualquier `type` fuera de esta lista se descarta).
// ─────────────────────────────────────────────────────────────────────────

export interface WsPing {
  type: 'ping';
}

export interface WsSendChat {
  type: 'chat';
  payload: {
    receptor: string;
    message: string;
    mediaUrl?: string;
    mediaType?: string;
    replyToMessageID?: number;
    replyToTelephon?: string;
    replyToMessage?: string;
  };
}

export interface WsSendRead {
  type: 'read';
  payload: { from: string };
}

export interface WsSendTyping {
  type: 'typing';
  payload: { to: string };
}

export interface WsSendEditMessage {
  type: 'edit_message';
  payload: { messageID: number; receptor: string; message: string };
}

export interface WsSendDeleteMessage {
  type: 'delete_message';
  payload: { messageID: number; receptor: string };
}

export interface WsSendCallOffer {
  type: 'call_offer';
  payload: { to: string; roomID: string; callType: CallType };
}

export interface WsSendCallAccept {
  type: 'call_accept';
  payload: { to: string; roomID: string };
}

export interface WsSendCallReject {
  type: 'call_reject';
  payload: { to: string; roomID: string };
}

export interface WsSendCallEnd {
  type: 'call_end';
  payload: { to: string; roomID: string };
}

export interface WsSendGroupChat {
  type: 'group_chat';
  payload: {
    groupID: number;
    message: string;
    mediaUrl?: string;
    mediaType?: string;
    replyToMessageID?: number;
    replyToTelephon?: string;
    replyToMessage?: string;
  };
}

export interface WsSendGroupTyping {
  type: 'group_typing';
  payload: { groupID: number };
}

export interface WsSendGroupEditMessage {
  type: 'group_edit_message';
  payload: { groupID: number; messageID: number; message: string };
}

export interface WsSendGroupDeleteMessage {
  type: 'group_delete_message';
  payload: { groupID: number; messageID: number };
}

export interface WsSendGroupJoin {
  type: 'group_join';
  payload: { groupID: number };
}

/** Acuse de entrega: recibí los mensajes del grupo hasta `messageID`. */
export interface WsSendGroupDelivered {
  type: 'group_delivered';
  payload: { groupID: number; messageID: number };
}

/** Acuse de lectura: leí el grupo hasta `upToMessageID` (implica entregado). */
export interface WsSendGroupRead {
  type: 'group_read';
  payload: { groupID: number; upToMessageID: number };
}

/** Todo mensaje que el frontend puede enviar por WebSocket. */
export type WsClientMessage =
  | WsPing
  | WsSendChat
  | WsSendRead
  | WsSendTyping
  | WsSendEditMessage
  | WsSendDeleteMessage
  | WsSendCallOffer
  | WsSendCallAccept
  | WsSendCallReject
  | WsSendCallEnd
  | WsSendGroupChat
  | WsSendGroupTyping
  | WsSendGroupEditMessage
  | WsSendGroupDeleteMessage
  | WsSendGroupJoin
  | WsSendGroupDelivered
  | WsSendGroupRead;

export type WsClientMessageType = WsClientMessage['type'];
