package services

import (
	"context"
	"errors"
	"fmt"
	"gorm/backend/models"
	"gorm/backend/schemas"
)

// Estados derivados de un mensaje de grupo (mismos valores que los chats 1:1).
const (
	StatusSent      = "enviado"
	StatusDelivered = "entregado"
	StatusRead      = "visto"
)

// Errores tipados que los handlers traducen a códigos HTTP.
// ErrNotGroupMember se declara junto a los permisos de grupo (groupPermissions.go).
var ErrGroupMessageNotFound = models.ErrGroupMessageNotFound

// ErrNotMessageSender indica que quien consulta los acuses no es el autor del mensaje.
var ErrNotMessageSender = errors.New("solo el autor del mensaje puede ver sus acuses")

// receiptEligible indica si el miembro cuenta para los acuses del mensaje
// msgID enviado por senderID: no es el remitente y ya era miembro antes de que
// se enviara el mensaje (joined_message_id < msgID).
func receiptEligible(m models.GroupMember, msgID, senderID uint) bool {
	return m.UserID != senderID && m.JoinedMessageID < msgID
}

func hasRead(m models.GroupMember, msgID uint) bool {
	return m.LastReadMessageID >= msgID
}

// hasDelivered: un miembro que leyó el mensaje cuenta también como entregado.
func hasDelivered(m models.GroupMember, msgID uint) bool {
	return m.LastDeliveredMessageID >= msgID || hasRead(m, msgID)
}

// GroupMessageStatus deriva el estado de un mensaje a partir de las marcas de
// agua de los miembros actuales: "visto" si todos los elegibles lo leyeron,
// "entregado" si todos lo recibieron y "enviado" en otro caso (incluido el caso
// sin miembros elegibles).
func GroupMessageStatus(msgID, senderID uint, members []models.GroupMember) string {
	eligible, delivered, read := 0, 0, 0
	for _, m := range members {
		if !receiptEligible(m, msgID, senderID) {
			continue
		}
		eligible++
		if hasDelivered(m, msgID) {
			delivered++
		}
		if hasRead(m, msgID) {
			read++
		}
	}
	switch {
	case eligible == 0 || delivered < eligible:
		return StatusSent
	case read == eligible:
		return StatusRead
	default:
		return StatusDelivered
	}
}

// partitionGroupReceipts reparte a los miembros elegibles en leído / entregado
// (sin leer) / pendiente.
func partitionGroupReceipts(msgID, senderID uint, members []models.GroupMember) schemas.GroupMessageReceipts {
	out := schemas.GroupMessageReceipts{
		ReadBy:      []schemas.GroupMemberBrief{},
		DeliveredTo: []schemas.GroupMemberBrief{},
		Pending:     []schemas.GroupMemberBrief{},
	}
	for _, m := range members {
		if !receiptEligible(m, msgID, senderID) {
			continue
		}
		brief := schemas.GroupMemberBrief{
			Telephon:  m.User.Telephon,
			Username:  m.User.Username,
			AvatarUrl: m.User.AvatarUrl,
		}
		switch {
		case hasRead(m, msgID):
			out.ReadBy = append(out.ReadBy, brief)
		case hasDelivered(m, msgID):
			out.DeliveredTo = append(out.DeliveredTo, brief)
		default:
			out.Pending = append(out.Pending, brief)
		}
	}
	return out
}

// requireMember resuelve el id del usuario y comprueba su pertenencia al grupo.
func (s *ServiceGroup) requireMember(telephon string, groupID uint, ctx context.Context) (uint, error) {
	userID, err := s.contactRepo.GetIdByTelephon(telephon, ctx)
	if err != nil {
		return 0, errors.New("usuario no encontrado")
	}
	isMember, err := s.repo.IsMember(groupID, uint(userID), ctx)
	if err != nil {
		// Fallo de infraestructura: no es una denegación (el handler responde 500).
		return 0, fmt.Errorf("comprobar pertenencia al grupo: %w", err)
	}
	if !isMember {
		return 0, ErrNotGroupMember
	}
	return uint(userID), nil
}

// AdvanceGroupDelivered avanza la marca de "entregado" del usuario en el grupo
// hasta upToMessageID (acotada al último mensaje del grupo). Devuelve nil si
// no hubo cambio (para no emitir eventos redundantes).
func (s *ServiceGroup) AdvanceGroupDelivered(telephon string, groupID, upToMessageID uint, ctx context.Context) (*schemas.GroupReceiptUpdate, error) {
	return s.advanceReceipts(telephon, groupID, upToMessageID, 0, ctx)
}

// AdvanceGroupRead avanza la marca de "leído" (y con ella la de entregado).
func (s *ServiceGroup) AdvanceGroupRead(telephon string, groupID, upToMessageID uint, ctx context.Context) (*schemas.GroupReceiptUpdate, error) {
	return s.advanceReceipts(telephon, groupID, upToMessageID, upToMessageID, ctx)
}

func (s *ServiceGroup) advanceReceipts(telephon string, groupID, delivered, read uint, ctx context.Context) (*schemas.GroupReceiptUpdate, error) {
	userID, err := s.requireMember(telephon, groupID, ctx)
	if err != nil {
		return nil, err
	}
	if delivered == 0 && read == 0 {
		return nil, nil
	}
	state, changed, err := s.repo.AdvanceMemberReceipts(groupID, userID, delivered, read, ctx)
	if err != nil {
		return nil, err
	}
	if !changed {
		return nil, nil
	}
	return &schemas.GroupReceiptUpdate{
		GroupID:       groupID,
		Telephon:      telephon,
		DeliveredUpTo: state.DeliveredUpTo,
		ReadUpTo:      state.ReadUpTo,
	}, nil
}

// GetGroupMessageReceipts devuelve quién leyó / recibió / no ha recibido un
// mensaje. Solo el autor del mensaje puede consultarlo (ErrNotMessageSender).
func (s *ServiceGroup) GetGroupMessageReceipts(telephon string, groupID, messageID uint, ctx context.Context) (*schemas.GroupMessageReceipts, error) {
	userID, err := s.requireMember(telephon, groupID, ctx)
	if err != nil {
		return nil, err
	}
	msg, err := s.repo.GetGroupMessageByID(messageID, ctx)
	if err != nil {
		return nil, err
	}
	if msg.GroupID != groupID {
		return nil, ErrGroupMessageNotFound
	}
	if msg.Kind == models.GroupMessageKindSystem {
		// Los eventos de sistema no tienen acuses (ni Info ni ticks).
		return nil, ErrGroupMessageNotFound
	}
	if msg.SenderID != userID {
		return nil, ErrNotMessageSender
	}
	members, err := s.repo.GetGroupMembers(groupID, ctx)
	if err != nil {
		return nil, err
	}
	out := partitionGroupReceipts(messageID, userID, members)
	return &out, nil
}
