package services

import (
	"context"
	"errors"
	"strings"
	"unicode/utf8"

	"gorm/backend/models"
	"gorm/backend/schemas"
)

// ─────────────────────────────────────────────────────────────────────────────
// Administración de miembros: promote / dismiss / remove / settings / info
//
// Cada mutación se valida primero en el servicio (errores tipados, rápido) y se
// vuelve a verificar DENTRO de la transacción del repo bajo lockGroupRow
// (membershipDecision), de modo que dos cambios concurrentes no pueden dejar el
// grupo sin admins. El mensaje de sistema se persiste en la misma transacción.
// ─────────────────────────────────────────────────────────────────────────────

// validateRoleChange aplica las invariantes puras de un cambio de rol pedido
// por un admin activo: no auto-descarte y no-op (rol ya asignado) se rechazan.
func validateRoleChange(actorID, targetID uint, targetRole, newRole string) error {
	if actorID == targetID {
		return ErrInvalidRoleChange
	}
	if targetRole == newRole {
		return ErrInvalidRoleChange
	}
	return nil
}

// validateRemove aplica las invariantes puras de una remoción: un admin no se
// remueve a sí mismo (para salir existe LeaveGroup).
func validateRemove(actorID, targetID uint) error {
	if actorID == targetID {
		return ErrInvalidRoleChange
	}
	return nil
}

// changeMemberRole ejecuta Promote/Dismiss. Resuelve actor y objetivo, exige que
// el actor sea admin y el objetivo un miembro activo, valida la transición y
// delega la transacción al repo.
func (s *ServiceGroup) changeMemberRole(actorTelephon string, groupID uint, targetTelephon, newRole, event string, ctx context.Context) (*schemas.GroupMessageResponse, error) {
	actorID, actorRole, err := s.actorIdentity(actorTelephon, groupID, ctx)
	if err != nil {
		return nil, err
	}
	if !isAdmin(actorRole) {
		return nil, ErrNotGroupAdmin
	}

	targetID, err := s.contactRepo.GetIdByTelephon(targetTelephon, ctx)
	if err != nil {
		return nil, ErrGroupTargetNotMember
	}
	targetRole, err := s.repo.GetMemberRole(groupID, uint(targetID), ctx)
	if err != nil {
		return nil, ErrGroupTargetNotMember
	}
	if err := validateRoleChange(actorID, uint(targetID), targetRole, newRole); err != nil {
		return nil, err
	}

	system := models.NewSystemMessage(groupID, actorID, event, []string{targetTelephon})
	if err := s.repo.ChangeMemberRole(groupID, actorID, uint(targetID), newRole, system, ctx); err != nil {
		return nil, err
	}
	return s.systemMessageResponse(system, actorTelephon, ctx), nil
}

// Promote designa a un miembro activo como administrador.
func (s *ServiceGroup) Promote(actorTelephon string, groupID uint, targetTelephon string, ctx context.Context) (*schemas.GroupMessageResponse, error) {
	return s.changeMemberRole(actorTelephon, groupID, targetTelephon, models.GroupRoleAdmin, models.SystemEventAdminGranted, ctx)
}

// Dismiss descarta a un administrador (distinto del actor) y lo deja como miembro.
func (s *ServiceGroup) Dismiss(actorTelephon string, groupID uint, targetTelephon string, ctx context.Context) (*schemas.GroupMessageResponse, error) {
	return s.changeMemberRole(actorTelephon, groupID, targetTelephon, models.GroupRoleMember, models.SystemEventAdminRevoked, ctx)
}

// Remove elimina a otro miembro activo (admin o member) del grupo.
func (s *ServiceGroup) Remove(actorTelephon string, groupID uint, targetTelephon string, ctx context.Context) (*schemas.GroupMessageResponse, error) {
	actorID, actorRole, err := s.actorIdentity(actorTelephon, groupID, ctx)
	if err != nil {
		return nil, err
	}
	if !isAdmin(actorRole) {
		return nil, ErrNotGroupAdmin
	}

	targetID, err := s.contactRepo.GetIdByTelephon(targetTelephon, ctx)
	if err != nil {
		return nil, ErrGroupTargetNotMember
	}
	if _, err := s.repo.GetMemberRole(groupID, uint(targetID), ctx); err != nil {
		return nil, ErrGroupTargetNotMember
	}
	if err := validateRemove(actorID, uint(targetID)); err != nil {
		return nil, err
	}

	system := models.NewSystemMessage(groupID, actorID, models.SystemEventMemberRemoved, []string{targetTelephon})
	if err := s.repo.RemoveMember(groupID, actorID, uint(targetID), system, ctx); err != nil {
		return nil, err
	}
	return s.systemMessageResponse(system, actorTelephon, ctx), nil
}

// UpdateSettings cambia la configuración de permisos del grupo (solo admins).
func (s *ServiceGroup) UpdateSettings(actorTelephon string, groupID uint, data models.GroupSettingsUpdate, ctx context.Context) (*schemas.GroupSettingsResult, error) {
	if !data.AnySet() {
		return nil, errors.New("debes indicar al menos una configuración")
	}
	actorID, actorRole, err := s.actorIdentity(actorTelephon, groupID, ctx)
	if err != nil {
		return nil, err
	}
	if !isAdmin(actorRole) {
		return nil, ErrNotGroupAdmin
	}

	system := models.NewSystemMessage(groupID, actorID, models.SystemEventSettingsChanged, nil)
	group, err := s.repo.UpdateGroupSettings(groupID, actorID, data, system, ctx)
	if err != nil {
		return nil, err
	}
	return &schemas.GroupSettingsResult{
		GroupID:                 groupID,
		OnlyAdminsCanSend:       group.OnlyAdminsCanSend,
		OnlyAdminsCanEditInfo:   group.OnlyAdminsCanEditInfo,
		OnlyAdminsCanAddMembers: group.OnlyAdminsCanAddMembers,
		SystemMessage:           s.systemMessageResponse(system, actorTelephon, ctx),
	}, nil
}

// UpdateInfo cambia el nombre/descripción del grupo. Permitido a un admin o a
// un miembro cuando "solo admins editan info" está apagado (matriz de GA1).
func (s *ServiceGroup) UpdateInfo(actorTelephon string, groupID uint, data models.GroupInfoUpdate, ctx context.Context) (*schemas.GroupInfoResult, error) {
	if !data.AnySet() {
		return nil, errors.New("debes indicar el nombre o la descripción")
	}
	if data.Name != nil {
		name := strings.TrimSpace(*data.Name)
		if name == "" {
			return nil, errors.New("el nombre del grupo no puede estar vacío")
		}
		if utf8.RuneCountInString(name) > maxGroupNameLen {
			return nil, errors.New("el nombre del grupo no puede superar los 100 caracteres")
		}
		data.Name = &name
	}
	if data.Description != nil && utf8.RuneCountInString(*data.Description) > maxGroupDescriptionLen {
		return nil, errors.New("la descripción no puede superar los 300 caracteres")
	}

	if err := s.requireCanEditInfo(actorTelephon, groupID, ctx); err != nil {
		return nil, err
	}
	actorID, err := s.contactRepo.GetIdByTelephon(actorTelephon, ctx)
	if err != nil {
		return nil, errors.New("usuario no encontrado")
	}

	system := models.NewSystemMessage(groupID, uint(actorID), models.SystemEventInfoChanged, nil)
	group, err := s.repo.UpdateGroupInfo(groupID, uint(actorID), data.Name, data.Description, system, ctx)
	if err != nil {
		return nil, err
	}
	return &schemas.GroupInfoResult{
		GroupID:       groupID,
		Name:          group.Name,
		Description:   group.Description,
		SystemMessage: s.systemMessageResponse(system, actorTelephon, ctx),
	}, nil
}
