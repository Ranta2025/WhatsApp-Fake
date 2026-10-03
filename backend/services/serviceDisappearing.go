package services

import (
	"context"
	"errors"
	"strconv"

	"gorm/backend/models"
	"gorm/backend/schemas"
)

// ─────────────────────────────────────────────────────────────────────────────
// Mensajes temporales: ajuste del temporizador (chat 1:1 y grupo)
// ─────────────────────────────────────────────────────────────────────────────

// SetChatDisappearing cambia el temporizador del chat 1:1 entre el actor y el
// contacto. Valida la duración ANTES de tocar el repo. changed=false (sin
// mensaje) cuando el valor ya era el vigente. El mensaje devuelto es el de
// sistema persistido (DE2 lo mapea a schema/WS).
func (rp *ServiceChat) SetChatDisappearing(actorTelephon, contactTelephon string, seconds int, ctx context.Context) (bool, *models.Message, error) {
	if !models.ValidDisappearSeconds(seconds) {
		return false, nil, models.ErrInvalidDisappearDuration
	}
	actorID, contactID, err := rp.resolveChatPair(actorTelephon, contactTelephon, ctx)
	if err != nil {
		return false, nil, err
	}
	sys := &models.Message{
		IdUser:      actorID,
		IdReceptor:  contactID,
		Kind:        models.MessageKindSystem,
		SystemEvent: models.SystemEventDisappearingChanged,
		Message:     strconv.Itoa(seconds),
	}
	changed, saved, err := rp.repo.SetChatDisappearing(actorID, contactID, seconds, sys, ctx)
	if err != nil {
		return false, nil, err
	}
	if !changed {
		return false, nil, nil
	}
	return true, saved, nil
}

// GetChatDisappearing devuelve el temporizador vigente del chat 1:1 (0 = off).
func (rp *ServiceChat) GetChatDisappearing(actorTelephon, contactTelephon string, ctx context.Context) (int, error) {
	actorID, contactID, err := rp.resolveChatPair(actorTelephon, contactTelephon, ctx)
	if err != nil {
		return 0, err
	}
	return rp.repo.GetChatDisappearing(actorID, contactID, ctx)
}

func (rp *ServiceChat) resolveChatPair(actorTelephon, contactTelephon string, ctx context.Context) (uint, uint, error) {
	actorID, err := rp.repo.GetIdByTelephon(actorTelephon, ctx)
	if err != nil {
		return 0, 0, err
	}
	contactID, err := rp.repo.GetIdByTelephon(contactTelephon, ctx)
	if err != nil {
		return 0, 0, errors.New("el receptor no existe")
	}
	return uint(actorID), uint(contactID), nil
}

// SetGroupDisappearing cambia el temporizador del grupo. Valida la duración y
// luego exige el permiso de "editar info" (requireCanEditInfo) ANTES de llamar
// al repo, que re-verifica membresía bajo lock. changed=false (sin mensaje)
// cuando el valor no cambia.
func (s *ServiceGroup) SetGroupDisappearing(actorTelephon string, groupID uint, seconds int, ctx context.Context) (bool, *schemas.GroupMessageResponse, error) {
	if !models.ValidDisappearSeconds(seconds) {
		return false, nil, models.ErrInvalidDisappearDuration
	}
	if err := s.requireCanEditInfo(actorTelephon, groupID, ctx); err != nil {
		return false, nil, err
	}
	actorID, err := s.contactRepo.GetIdByTelephon(actorTelephon, ctx)
	if err != nil {
		return false, nil, errors.New("usuario no encontrado")
	}
	system := models.NewSystemMessage(groupID, uint(actorID), models.SystemEventDisappearingChanged, nil)
	system.Message = strconv.Itoa(seconds)
	changed, saved, err := s.repo.SetGroupDisappearing(uint(actorID), groupID, seconds, system, ctx)
	if err != nil {
		return false, nil, err
	}
	if !changed {
		return false, nil, nil
	}
	return true, s.systemMessageResponse(saved, actorTelephon, ctx), nil
}

// GetGroupDisappearing devuelve el temporizador del grupo a un miembro activo.
func (s *ServiceGroup) GetGroupDisappearing(telephon string, groupID uint, ctx context.Context) (int, error) {
	if _, err := s.actorRole(telephon, groupID, ctx); err != nil {
		return 0, err
	}
	return s.repo.GetGroupDisappearing(groupID, ctx)
}
