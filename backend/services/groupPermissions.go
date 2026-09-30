package services

import (
	"context"
	"errors"

	"gorm/backend/models"
)

// Errores tipados de permisos de grupo. Los handlers los traducen a códigos
// HTTP (403 de permiso, 400 de objetivo inválido, 404 de objetivo inexistente)
// y los caminos WebSocket responden con `error` sin difundir nada.
//
// Los errores compartidos con el repo (not-admin, objetivo no-miembro, cambio
// inválido, no-miembro) viven en `models` y se re-exportan aquí para que los
// handlers sigan usando `services.Err*`.
var (
	ErrNotGroupMember       = models.ErrNotGroupMember
	ErrNotGroupAdmin        = models.ErrNotGroupAdmin
	ErrGroupTargetNotMember = models.ErrGroupTargetNotMember
	ErrInvalidRoleChange    = models.ErrInvalidRoleChange

	ErrGroupSendRestricted = errors.New("solo los admins pueden enviar mensajes")
	ErrGroupEditRestricted = errors.New("solo los admins pueden editar la información del grupo")
	ErrGroupAddRestricted  = errors.New("solo los admins pueden agregar participantes")
)

// isAdmin indica si un rol de miembro es de administrador.
func isAdmin(role string) bool {
	return role == models.GroupRoleAdmin
}

// La matriz de permisos es pura (sin acceso a datos) y debe replicarse en el
// cliente. Cada acción restringible se concede a un admin siempre y a un
// miembro sólo cuando la restricción correspondiente está apagada.

func canSend(actorIsAdmin, onlyAdminsCanSend bool) bool {
	return actorIsAdmin || !onlyAdminsCanSend
}

func canEditInfo(actorIsAdmin, onlyAdminsCanEditInfo bool) bool {
	return actorIsAdmin || !onlyAdminsCanEditInfo
}

func canAddMembers(actorIsAdmin, onlyAdminsCanAddMembers bool) bool {
	return actorIsAdmin || !onlyAdminsCanAddMembers
}

// groupPermissionState es el estado cargado una sola vez (rol del actor +
// configuración del grupo) que alimenta la matriz.
type groupPermissionState struct {
	actorIsAdmin            bool
	onlyAdminsCanSend       bool
	onlyAdminsCanEditInfo   bool
	onlyAdminsCanAddMembers bool
}

// actorIdentity resuelve el usuario y devuelve su ID y su rol en el grupo.
// Devuelve ErrNotGroupMember si no es miembro activo.
func (s *ServiceGroup) actorIdentity(telephon string, groupID uint, ctx context.Context) (uint, string, error) {
	userID, err := s.contactRepo.GetIdByTelephon(telephon, ctx)
	if err != nil {
		return 0, "", errors.New("usuario no encontrado")
	}
	role, err := s.repo.GetMemberRole(groupID, uint(userID), ctx)
	if err != nil {
		// Coherente con el resto de mutaciones de grupo: cualquier fallo de la
		// comprobación de membresía se trata como "no eres miembro".
		return 0, "", ErrNotGroupMember
	}
	return uint(userID), role, nil
}

// actorRole resuelve el usuario y devuelve su rol en el grupo.
func (s *ServiceGroup) actorRole(telephon string, groupID uint, ctx context.Context) (string, error) {
	_, role, err := s.actorIdentity(telephon, groupID, ctx)
	return role, err
}

// groupPermissionContext carga el rol del actor y la configuración del grupo
// (GetMemberRole + GetGroupByID) para alimentar la matriz.
func (s *ServiceGroup) groupPermissionContext(telephon string, groupID uint, ctx context.Context) (groupPermissionState, error) {
	role, err := s.actorRole(telephon, groupID, ctx)
	if err != nil {
		return groupPermissionState{}, err
	}

	group, err := s.repo.GetGroupByID(groupID, ctx)
	if err != nil {
		return groupPermissionState{}, err
	}

	return groupPermissionState{
		actorIsAdmin:            isAdmin(role),
		onlyAdminsCanSend:       group.OnlyAdminsCanSend,
		onlyAdminsCanEditInfo:   group.OnlyAdminsCanEditInfo,
		onlyAdminsCanAddMembers: group.OnlyAdminsCanAddMembers,
	}, nil
}

// requireAdmin exige que el actor sea admin activo del grupo (no necesita la
// configuración del grupo).
func (s *ServiceGroup) requireAdmin(telephon string, groupID uint, ctx context.Context) error {
	role, err := s.actorRole(telephon, groupID, ctx)
	if err != nil {
		return err
	}
	if !isAdmin(role) {
		return ErrNotGroupAdmin
	}
	return nil
}

// requireCanSend exige permiso para enviar (o mostrar "escribiendo") en el grupo.
func (s *ServiceGroup) requireCanSend(telephon string, groupID uint, ctx context.Context) error {
	state, err := s.groupPermissionContext(telephon, groupID, ctx)
	if err != nil {
		return err
	}
	if !canSend(state.actorIsAdmin, state.onlyAdminsCanSend) {
		return ErrGroupSendRestricted
	}
	return nil
}

// requireCanEditInfo exige permiso para editar la info del grupo.
func (s *ServiceGroup) requireCanEditInfo(telephon string, groupID uint, ctx context.Context) error {
	state, err := s.groupPermissionContext(telephon, groupID, ctx)
	if err != nil {
		return err
	}
	if !canEditInfo(state.actorIsAdmin, state.onlyAdminsCanEditInfo) {
		return ErrGroupEditRestricted
	}
	return nil
}

// requireCanAddMembers exige permiso para agregar participantes al grupo.
func (s *ServiceGroup) requireCanAddMembers(telephon string, groupID uint, ctx context.Context) error {
	state, err := s.groupPermissionContext(telephon, groupID, ctx)
	if err != nil {
		return err
	}
	if !canAddMembers(state.actorIsAdmin, state.onlyAdminsCanAddMembers) {
		return ErrGroupAddRestricted
	}
	return nil
}
