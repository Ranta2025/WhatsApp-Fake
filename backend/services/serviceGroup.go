package services

import (
	"context"
	"errors"
	"gorm/backend/models"
	"gorm/backend/schemas"
	"gorm/backend/utils"
	"strings"
	"time"
	"unicode/utf8"
)

const (
	maxGroupNameLen        = 100 // columna groups.name (size:100)
	maxGroupDescriptionLen = 300 // columna groups.description (size:300)
	maxGroupMessagesPage   = 100 // máximo de mensajes por página en el historial
	maxMembersPerRequest   = 256 // máximo de miembros por petición de creación/alta
)

// ─────────────────────────────────────────────────────────────────────────────
// Interfaces
// ─────────────────────────────────────────────────────────────────────────────

// GroupServicer define todas las operaciones de negocio del dominio de grupos.
type GroupServicer interface {
	CreateGroup(telephonCreator string, data models.GroupCreate, ctx context.Context) (*schemas.GroupDetail, error)
	AddMembers(telephonRequester string, groupID uint, data models.GroupAddMembers, ctx context.Context) ([]schemas.GroupMemberBrief, *schemas.GroupMessageResponse, error)
	Promote(telephonActor string, groupID uint, targetTelephon string, ctx context.Context) (*schemas.GroupMessageResponse, error)
	Dismiss(telephonActor string, groupID uint, targetTelephon string, ctx context.Context) (*schemas.GroupMessageResponse, error)
	Remove(telephonActor string, groupID uint, targetTelephon string, ctx context.Context) (*schemas.GroupMessageResponse, error)
	UpdateSettings(telephonActor string, groupID uint, data models.GroupSettingsUpdate, ctx context.Context) (*schemas.GroupSettingsResult, error)
	UpdateInfo(telephonActor string, groupID uint, data models.GroupInfoUpdate, ctx context.Context) (*schemas.GroupInfoResult, error)
	GetUserGroups(telephon string, ctx context.Context) ([]schemas.GroupResponse, error)
	GetGroupDetail(telephon string, groupID uint, ctx context.Context) (*schemas.GroupDetail, error)
	SendGroupMessage(telephonSender string, data models.GroupMessageSend, ctx context.Context) (*schemas.GroupMessageResponse, error)
	GetGroupMessages(telephon string, groupID uint, limit, offset int, ctx context.Context) ([]schemas.GroupMessageResponse, error)
	GetGroupMessagesPage(telephon string, groupID, before uint, limit, offset int, ctx context.Context) ([]schemas.GroupMessageResponse, bool, error)
	EditGroupMessage(telephon string, groupID uint, data models.GroupMessageEdit, ctx context.Context) (*schemas.GroupMessageResponse, error)
	DeleteGroupMessage(telephon string, groupID uint, data models.GroupMessageDelete, ctx context.Context) error
	RequireCanSend(telephon string, groupID uint, ctx context.Context) error
	GetMemberTelephons(groupID uint, ctx context.Context) ([]string, error)
	LeaveGroup(telephon string, groupID uint, ctx context.Context) (*schemas.GroupMessageResponse, error)
	UpdateGroupAvatar(telephon string, groupID uint, avatarUrl string, ctx context.Context) error
	GetUsernameByTelephon(telephon string, ctx context.Context) (string, error)
	AdvanceGroupDelivered(telephon string, groupID, upToMessageID uint, ctx context.Context) (*schemas.GroupReceiptUpdate, error)
	AdvanceGroupRead(telephon string, groupID, upToMessageID uint, ctx context.Context) (*schemas.GroupReceiptUpdate, error)
	GetGroupMessageReceipts(telephon string, groupID, messageID uint, ctx context.Context) (*schemas.GroupMessageReceipts, error)
	SearchGroupMessages(telephon string, groupID uint, q string, before uint, limit int, ctx context.Context) (*schemas.SearchPage, error)
	GetGroupMessagesAround(telephon string, groupID, around uint, limit int, ctx context.Context) ([]schemas.GroupMessageResponse, bool, bool, error)
	GetGroupMessagesAfter(telephon string, groupID, after uint, limit int, ctx context.Context) ([]schemas.GroupMessageResponse, bool, error)
}

// GroupRepoInterface define las operaciones de persistencia que necesita el servicio.
type GroupRepoInterface interface {
	CreateGroupWithMembers(group *models.Group, creatorID uint, memberIDs []uint, ctx context.Context) error
	AddMembers(groupID uint, members []models.GroupMember, system *models.GroupMessage, ctx context.Context) ([]models.GroupMember, error)
	ChangeMemberRole(groupID, actorID, targetID uint, newRole string, system *models.GroupMessage, ctx context.Context) error
	RemoveMember(groupID, actorID, targetID uint, system *models.GroupMessage, ctx context.Context) error
	UpdateGroupSettings(groupID, actorID uint, patch models.GroupSettingsUpdate, system *models.GroupMessage, ctx context.Context) (*models.Group, error)
	UpdateGroupInfo(groupID, actorID uint, name, description *string, system *models.GroupMessage, ctx context.Context) (*models.Group, error)
	GetGroupByID(groupID uint, ctx context.Context) (*models.Group, error)
	GetGroupMembers(groupID uint, ctx context.Context) ([]models.GroupMember, error)
	GetUserGroups(userID uint, ctx context.Context) ([]models.UserGroupRow, error)
	IsMember(groupID, userID uint, ctx context.Context) (bool, error)
	GetMemberRole(groupID, userID uint, ctx context.Context) (string, error)
	GetMemberTelephons(groupID uint, ctx context.Context) ([]string, error)
	CreateGroupMessage(msg *models.GroupMessage, ctx context.Context) error
	GetGroupMessages(groupID uint, limit, offset int, ctx context.Context) ([]models.GroupMessage, error)
	GetGroupMessagesPage(groupID, before uint, limit, offset int, ctx context.Context) ([]models.GroupMessage, bool, error)
	GetGroupMessageByID(messageID uint, ctx context.Context) (*models.GroupMessage, error)
	EditGroupMessage(groupID, messageID, senderID uint, newContent string, ctx context.Context) error
	DeleteGroupMessage(groupID, messageID, senderID uint, ctx context.Context) error
	LeaveGroup(groupID, userID uint, system *models.GroupMessage, ctx context.Context) error
	UpdateGroupAvatar(groupID uint, avatarUrl string, ctx context.Context) error
	AdvanceMemberReceipts(groupID, userID, deliveredUpTo, readUpTo uint, ctx context.Context) (models.GroupReceiptState, bool, error)
	SearchGroupMessages(groupID, userID uint, q string, before uint, limit int, ctx context.Context) ([]models.SearchRow, bool, error)
	GetGroupMessagesAround(groupID, around uint, limit int, ctx context.Context) ([]models.GroupMessage, bool, bool, error)
	GetGroupMessagesAfter(groupID, after uint, limit int, ctx context.Context) ([]models.GroupMessage, bool, error)
}

// GroupContactRepoInterface es el subconjunto del repo de contactos que necesita
// el servicio de grupos (resolución de IDs y validación de contactos).
type GroupContactRepoInterface interface {
	GetIdByTelephon(telephon string, ctx context.Context) (int, error)
	GetTelephonByID(id uint, ctx context.Context) (string, error)
	IsAcceptedContact(userID, contactID uint, ctx context.Context) (bool, error)
	GetUsernameByTelephon(telephon string, ctx context.Context) (string, error)
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementación
// ─────────────────────────────────────────────────────────────────────────────

// ServiceGroup contiene la lógica de negocio del dominio de grupos.
type ServiceGroup struct {
	repo        GroupRepoInterface
	contactRepo GroupContactRepoInterface
}

// InitServiceGroup crea el servicio de grupos con sus repositorios,
// devolviendo la interfaz GroupServicer.
func InitServiceGroup(repo GroupRepoInterface, contactRepo GroupContactRepoInterface) GroupServicer {
	return &ServiceGroup{repo: repo, contactRepo: contactRepo}
}

// ─────────────────────────────────────────────────────────────────────────────
// Grupos
// ─────────────────────────────────────────────────────────────────────────────

// CreateGroup crea un nuevo grupo: valida miembros, persiste grupo + creador +
// miembros en una única transacción y retorna el detalle completo.
func (s *ServiceGroup) CreateGroup(telephonCreator string, data models.GroupCreate, ctx context.Context) (*schemas.GroupDetail, error) {
	name := strings.TrimSpace(data.Name)
	if name == "" {
		return nil, errors.New("el nombre del grupo no puede estar vacío")
	}
	if utf8.RuneCountInString(name) > maxGroupNameLen {
		return nil, errors.New("el nombre del grupo no puede superar los 100 caracteres")
	}
	if utf8.RuneCountInString(data.Description) > maxGroupDescriptionLen {
		return nil, errors.New("la descripción no puede superar los 300 caracteres")
	}

	creatorID, err := s.contactRepo.GetIdByTelephon(telephonCreator, ctx)
	if err != nil {
		return nil, errors.New("creador no encontrado")
	}

	// Resolver teléfonos de miembros a IDs, validando que sean contactos del creador
	memberIDs, err := s.resolveMemberTelephons(uint(creatorID), data.Members, ctx)
	if err != nil {
		return nil, err
	}

	group := &models.Group{
		Name:        name,
		Description: data.Description,
		CreatorID:   uint(creatorID),
	}

	if err := s.repo.CreateGroupWithMembers(group, uint(creatorID), memberIDs, ctx); err != nil {
		return nil, errors.New("error al crear el grupo")
	}

	return s.GetGroupDetail(telephonCreator, group.ID, ctx)
}

// AddMembers añade nuevos miembros a un grupo y devuelve los realmente
// añadidos (un contacto que ya era miembro activo no cuenta). Persiste el
// evento member_added en la misma transacción del alta.
func (s *ServiceGroup) AddMembers(telephonRequester string, groupID uint, data models.GroupAddMembers, ctx context.Context) ([]schemas.GroupMemberBrief, *schemas.GroupMessageResponse, error) {
	requesterID, err := s.contactRepo.GetIdByTelephon(telephonRequester, ctx)
	if err != nil {
		return nil, nil, errors.New("usuario no encontrado")
	}

	// Enforcement de la matriz: admin siempre; miembro sólo si el grupo permite
	// que cualquiera agregue (only_admins_can_add_members apagado).
	if err := s.requireCanAddMembers(telephonRequester, groupID, ctx); err != nil {
		return nil, nil, err
	}

	// Resolver teléfonos, validando que sean contactos del requester
	memberIDs, err := s.resolveMemberTelephons(uint(requesterID), data.Members, ctx)
	if err != nil {
		return nil, nil, err
	}

	if len(memberIDs) == 0 {
		return nil, nil, errors.New("no se encontraron contactos válidos para añadir")
	}

	members := make([]models.GroupMember, 0, len(memberIDs))
	for _, memberID := range memberIDs {
		members = append(members, models.GroupMember{
			GroupID:   groupID,
			UserID:    memberID,
			Role:      models.GroupRoleMember,
			AddedByID: uint(requesterID),
		})
	}
	// El repo completa los targets con los teléfonos realmente insertados y muta
	// el puntero con el id asignado (GORM) al persistir dentro de su transacción.
	system := models.NewSystemMessage(groupID, uint(requesterID), models.SystemEventMemberAdded, nil)
	added, err := s.repo.AddMembers(groupID, members, system, ctx)
	if err != nil {
		return nil, nil, err
	}
	out := make([]schemas.GroupMemberBrief, 0, len(added))
	for _, m := range added {
		out = append(out, schemas.GroupMemberBrief{
			Telephon:  m.User.Telephon,
			Username:  m.User.Username,
			AvatarUrl: m.User.AvatarUrl,
		})
	}
	return out, s.systemMessageResponse(system, telephonRequester, ctx), nil
}

// GetUserGroups retorna los grupos en los que participa el usuario.
func (s *ServiceGroup) GetUserGroups(telephon string, ctx context.Context) ([]schemas.GroupResponse, error) {
	userID, err := s.contactRepo.GetIdByTelephon(telephon, ctx)
	if err != nil {
		return nil, errors.New("usuario no encontrado")
	}

	groups, err := s.repo.GetUserGroups(uint(userID), ctx)
	if err != nil {
		return nil, err
	}

	responses := make([]schemas.GroupResponse, 0, len(groups))
	for _, g := range groups {
		responses = append(responses, schemas.GroupResponse{
			ID:              g.ID,
			Name:            g.Name,
			Description:     g.Description,
			AvatarUrl:       g.AvatarUrl,
			CreatorTelephon: g.CreatorTelephon,
			MemberCount:     g.MemberCount,
			UserRole:        g.UserRole,
			CreatedAt:       g.CreatedAt,

			OnlyAdminsCanSend:       g.OnlyAdminsCanSend,
			OnlyAdminsCanEditInfo:   g.OnlyAdminsCanEditInfo,
			OnlyAdminsCanAddMembers: g.OnlyAdminsCanAddMembers,
		})
	}
	return responses, nil
}

// GetGroupDetail retorna info completa del grupo: metadatos, miembros y últimos 50 mensajes.
// Sólo accesible para miembros del grupo.
func (s *ServiceGroup) GetGroupDetail(telephon string, groupID uint, ctx context.Context) (*schemas.GroupDetail, error) {
	userID, err := s.contactRepo.GetIdByTelephon(telephon, ctx)
	if err != nil {
		return nil, errors.New("usuario no encontrado")
	}

	// Verificar membresía
	isMember, err := s.repo.IsMember(groupID, uint(userID), ctx)
	if err != nil || !isMember {
		return nil, errors.New("no tienes acceso a este grupo")
	}

	group, err := s.repo.GetGroupByID(groupID, ctx)
	if err != nil {
		return nil, err
	}

	members, err := s.repo.GetGroupMembers(groupID, ctx)
	if err != nil {
		return nil, err
	}

	messages, err := s.repo.GetGroupMessages(groupID, 50, 0, ctx)
	if err != nil {
		return nil, err
	}

	creatorTel, _ := s.contactRepo.GetTelephonByID(group.CreatorID, ctx)

	// Rol del usuario que consulta (antes no se devolvía en el detalle)
	userRole := ""
	for _, m := range members {
		if m.UserID == uint(userID) {
			userRole = m.Role
			break
		}
	}

	detail := &schemas.GroupDetail{
		GroupResponse: schemas.GroupResponse{
			ID:              group.ID,
			Name:            group.Name,
			Description:     group.Description,
			AvatarUrl:       group.AvatarUrl,
			CreatorTelephon: creatorTel,
			MemberCount:     len(members),
			UserRole:        userRole,
			CreatedAt:       group.CreatedAt,

			OnlyAdminsCanSend:       group.OnlyAdminsCanSend,
			OnlyAdminsCanEditInfo:   group.OnlyAdminsCanEditInfo,
			OnlyAdminsCanAddMembers: group.OnlyAdminsCanAddMembers,
		},
		Members:  convertGroupMembers(members),
		Messages: convertGroupMessages(messages),
	}
	return detail, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// Mensajes de grupo
// ─────────────────────────────────────────────────────────────────────────────

// SendGroupMessage persiste un mensaje de grupo y retorna el schema listo para broadcast.
func (s *ServiceGroup) SendGroupMessage(telephonSender string, data models.GroupMessageSend, ctx context.Context) (*schemas.GroupMessageResponse, error) {
	if data.GroupID == 0 {
		return nil, errors.New("el ID del grupo es obligatorio")
	}
	content := messageContent{
		Message:         data.Message,
		MediaUrl:        data.MediaUrl,
		MediaType:       data.MediaType,
		ReplyToTelephon: data.ReplyToTelephon,
		ReplyToMessage:  data.ReplyToMessage,
	}
	if err := validateMessageContent(&content); err != nil {
		return nil, err
	}
	data.ReplyToMessage = content.ReplyToMessage

	senderID, err := s.contactRepo.GetIdByTelephon(telephonSender, ctx)
	if err != nil {
		return nil, errors.New("remitente no encontrado")
	}

	// Enforcement de la matriz: admin siempre; miembro sólo si el grupo permite
	// enviar (only_admins_can_send apagado). Cubre REST y WS `group_chat`.
	if err := s.requireCanSend(telephonSender, data.GroupID, ctx); err != nil {
		return nil, err
	}

	// Un mensaje de sistema no es un objetivo válido de respuesta. Si el id no
	// existe se conserva el comportamiento previo (el cliente ya validó).
	if data.ReplyToMessageID != nil && *data.ReplyToMessageID != 0 {
		if target, err := s.repo.GetGroupMessageByID(*data.ReplyToMessageID, ctx); err == nil &&
			target.Kind == models.GroupMessageKindSystem {
			return nil, errors.New("no puedes responder a un mensaje de sistema")
		}
	}

	msg := &models.GroupMessage{
		GroupID:          data.GroupID,
		SenderID:         uint(senderID),
		Message:          data.Message,
		Time:             time.Now(),
		MediaUrl:         data.MediaUrl,
		MediaType:        data.MediaType,
		ReplyToMessageID: data.ReplyToMessageID,
		ReplyToTelephon:  data.ReplyToTelephon,
		ReplyToMessage:   data.ReplyToMessage,
	}

	if err := s.repo.CreateGroupMessage(msg, ctx); err != nil {
		return nil, errors.New("error al guardar el mensaje")
	}

	senderUsername, _ := s.contactRepo.GetUsernameByTelephon(telephonSender, ctx)

	return &schemas.GroupMessageResponse{
		MessageID:        msg.ID,
		GroupID:          msg.GroupID,
		SenderTelephon:   telephonSender,
		SenderUsername:   senderUsername,
		Message:          msg.Message,
		Time:             msg.Time,
		Edited:           false,
		MediaUrl:         msg.MediaUrl,
		MediaType:        msg.MediaType,
		ReplyToMessageID: msg.ReplyToMessageID,
		ReplyToTelephon:  msg.ReplyToTelephon,
		ReplyToMessage:   msg.ReplyToMessage,
	}, nil
}

// GetGroupMessages retorna el historial de mensajes de un grupo con paginación.
func (s *ServiceGroup) GetGroupMessages(telephon string, groupID uint, limit, offset int, ctx context.Context) ([]schemas.GroupMessageResponse, error) {
	messages, _, err := s.GetGroupMessagesPage(telephon, groupID, 0, limit, offset, ctx)
	return messages, err
}

// GetGroupMessagesPage retorna una página del historial (más reciente primero).
// before > 0 activa el cursor por id (solo mensajes anteriores); hasMore indica
// si quedan mensajes más antiguos.
func (s *ServiceGroup) GetGroupMessagesPage(telephon string, groupID, before uint, limit, offset int, ctx context.Context) ([]schemas.GroupMessageResponse, bool, error) {
	userID, err := s.contactRepo.GetIdByTelephon(telephon, ctx)
	if err != nil {
		return nil, false, errors.New("usuario no encontrado")
	}

	isMember, err := s.repo.IsMember(groupID, uint(userID), ctx)
	if err != nil || !isMember {
		return nil, false, errors.New("no tienes acceso a este grupo")
	}

	if limit <= 0 {
		limit = 50
	}
	if limit > maxGroupMessagesPage {
		limit = maxGroupMessagesPage
	}
	if offset < 0 {
		offset = 0
	}

	messages, hasMore, err := s.repo.GetGroupMessagesPage(groupID, before, limit, offset, ctx)
	if err != nil {
		return nil, false, err
	}
	return convertGroupMessages(messages), hasMore, nil
}

// EditGroupMessage edita el contenido de un mensaje de grupo.
// Solo el remitente original puede editar sus mensajes.
func (s *ServiceGroup) EditGroupMessage(telephon string, groupID uint, data models.GroupMessageEdit, ctx context.Context) (*schemas.GroupMessageResponse, error) {
	if err := validateEditedContent(data.Message); err != nil {
		return nil, err
	}
	senderID, err := s.contactRepo.GetIdByTelephon(telephon, ctx)
	if err != nil {
		return nil, errors.New("usuario no encontrado")
	}

	// Editar el mensaje propio comparte la matriz de envío: admin siempre;
	// miembro sólo si el grupo permite enviar.
	if err := s.requireCanSend(telephon, groupID, ctx); err != nil {
		return nil, err
	}

	if err := s.repo.EditGroupMessage(groupID, data.MessageID, uint(senderID), data.Message, ctx); err != nil {
		return nil, err
	}

	msg, err := s.repo.GetGroupMessageByID(data.MessageID, ctx)
	if err != nil {
		return nil, err
	}

	senderUsername, _ := s.contactRepo.GetUsernameByTelephon(telephon, ctx)
	resp := groupMessageToSchema(msg, telephon, senderUsername)
	return &resp, nil
}

// DeleteGroupMessage elimina (soft-delete) un mensaje de grupo.
// Solo el remitente original puede borrar sus mensajes.
func (s *ServiceGroup) DeleteGroupMessage(telephon string, groupID uint, data models.GroupMessageDelete, ctx context.Context) error {
	senderID, err := s.contactRepo.GetIdByTelephon(telephon, ctx)
	if err != nil {
		return errors.New("usuario no encontrado")
	}

	isMember, err := s.repo.IsMember(groupID, uint(senderID), ctx)
	if err != nil || !isMember {
		return errors.New("no eres miembro de este grupo")
	}

	return s.repo.DeleteGroupMessage(groupID, data.MessageID, uint(senderID), ctx)
}

// GetMemberTelephons retorna los teléfonos de los miembros activos de un grupo.
// Usado por el Hub para enviar mensajes por WebSocket.
func (s *ServiceGroup) GetMemberTelephons(groupID uint, ctx context.Context) ([]string, error) {
	return s.repo.GetMemberTelephons(groupID, ctx)
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers internos
// ─────────────────────────────────────────────────────────────────────────────

// resolveMemberTelephons convierte una lista de teléfonos a IDs (sin duplicados
// y excluyendo al propio solicitante), validando que cada uno sea contacto
// aceptado del usuario solicitante.
func (s *ServiceGroup) resolveMemberTelephons(requesterID uint, telephons []string, ctx context.Context) ([]uint, error) {
	if len(telephons) > maxMembersPerRequest {
		return nil, errors.New("demasiados miembros en una sola petición")
	}
	ids := make([]uint, 0, len(telephons))
	seen := make(map[uint]struct{}, len(telephons))
	for _, tel := range telephons {
		memberID, err := s.contactRepo.GetIdByTelephon(tel, ctx)
		if err != nil {
			return nil, errors.New("el número " + tel + " no está registrado")
		}
		id := uint(memberID)
		if id == requesterID {
			continue
		}
		if _, dup := seen[id]; dup {
			continue
		}
		// Verificar que es contacto aceptado del requester
		isContact, err := s.contactRepo.IsAcceptedContact(requesterID, id, ctx)
		if err != nil || !isContact {
			return nil, errors.New("el número " + tel + " no es un contacto aceptado tuyo")
		}
		seen[id] = struct{}{}
		ids = append(ids, id)
	}
	return ids, nil
}

// convertGroupMembers transforma modelos de miembros en schemas de respuesta.
func convertGroupMembers(members []models.GroupMember) []schemas.GroupMemberResponse {
	result := make([]schemas.GroupMemberResponse, 0, len(members))
	for _, m := range members {
		result = append(result, schemas.GroupMemberResponse{
			Telephon:  m.User.Telephon,
			Username:  m.User.Username,
			AvatarUrl: m.User.AvatarUrl,
			Role:      m.Role,

			JoinedMessageID:        m.JoinedMessageID,
			LastDeliveredMessageID: m.LastDeliveredMessageID,
			LastReadMessageID:      m.LastReadMessageID,
		})
	}
	return result
}

// convertGroupMessages transforma modelos de mensajes de grupo en schemas de respuesta.
func convertGroupMessages(messages []models.GroupMessage) []schemas.GroupMessageResponse {
	result := make([]schemas.GroupMessageResponse, 0, len(messages))
	for _, m := range messages {
		resp := groupMessageToSchema(&m, m.Sender.Telephon, m.Sender.Username)
		result = append(result, resp)
	}
	return result
}

// groupMessageToSchema mapea un GroupMessage a GroupMessageResponse.
func groupMessageToSchema(m *models.GroupMessage, senderTelephon, senderUsername string) schemas.GroupMessageResponse {
	return schemas.GroupMessageResponse{
		MessageID:        m.ID,
		GroupID:          m.GroupID,
		SenderTelephon:   senderTelephon,
		SenderUsername:   senderUsername,
		Message:          m.Message,
		Time:             m.Time,
		Edited:           m.Edited,
		MediaUrl:         m.MediaUrl,
		MediaType:        m.MediaType,
		ReplyToMessageID: m.ReplyToMessageID,
		ReplyToTelephon:  m.ReplyToTelephon,
		ReplyToMessage:   m.ReplyToMessage,

		Kind:          m.Kind,
		SystemEvent:   m.SystemEvent,
		SystemTargets: m.SystemTargets,
	}
}

// LeaveGroup elimina al usuario de la membresía del grupo y persiste el evento
// member_left (el que sale es el actor y el target) en la misma transacción.
// Devuelve el mensaje de sistema persistido para incluirlo en el evento WS.
func (s *ServiceGroup) LeaveGroup(telephon string, groupID uint, ctx context.Context) (*schemas.GroupMessageResponse, error) {
	userID, err := s.contactRepo.GetIdByTelephon(telephon, ctx)
	if err != nil {
		return nil, errors.New("usuario no encontrado")
	}
	isMember, err := s.repo.IsMember(groupID, uint(userID), ctx)
	if err != nil {
		return nil, err
	}
	if !isMember {
		return nil, errors.New("no eres miembro de este grupo")
	}
	system := models.NewSystemMessage(groupID, uint(userID), models.SystemEventMemberLeft, []string{telephon})
	if err := s.repo.LeaveGroup(groupID, uint(userID), system, ctx); err != nil {
		return nil, err
	}
	return s.systemMessageResponse(system, telephon, ctx), nil
}

// systemMessageResponse mapea el mensaje de sistema que el repo persistió y mutó
// in-place dentro de su transacción (id/time/targets) al schema del evento.
// Devuelve nil si no se persistió (id 0), p. ej. cuando no hubo altas.
func (s *ServiceGroup) systemMessageResponse(msg *models.GroupMessage, actorTelephon string, ctx context.Context) *schemas.GroupMessageResponse {
	if msg == nil || msg.ID == 0 {
		return nil
	}
	username, _ := s.contactRepo.GetUsernameByTelephon(actorTelephon, ctx)
	resp := groupMessageToSchema(msg, actorTelephon, username)
	return &resp
}

// UpdateGroupAvatar actualiza el avatar del grupo. El avatar es "info del
// grupo": lo puede cambiar un admin, o un miembro si only_admins_can_edit_info
// está apagado.
func (s *ServiceGroup) UpdateGroupAvatar(telephon string, groupID uint, avatarUrl string, ctx context.Context) error {
	if avatarUrl != "" && !utils.IsSafeMediaURL(avatarUrl) {
		return errors.New("URL de avatar no válida")
	}
	if err := s.requireCanEditInfo(telephon, groupID, ctx); err != nil {
		return err
	}
	return s.repo.UpdateGroupAvatar(groupID, avatarUrl, ctx)
}

// RequireCanSend expone la comprobación de la matriz de envío para los caminos
// que no pasan por SendGroupMessage (el indicador "escribiendo" por WebSocket).
//
// Tradeoff de rendimiento: cada evento de typing hace un GetMemberRole (índice
// parcial único group_id+user_id) + GetGroupByID (PK). Es el mismo coste que un
// envío real y el cliente ya limita la frecuencia del typing, así que se opta
// por la lectura directa SIN cache: una cache per-client exigiría invalidar en
// `group_settings`/`group_member_role` y añadiría ventanas de permiso obsoleto.
// Solo se añadirá cache si el perfilado lo justifica.
func (s *ServiceGroup) RequireCanSend(telephon string, groupID uint, ctx context.Context) error {
	return s.requireCanSend(telephon, groupID, ctx)
}

// GetUsernameByTelephon retorna el username de un usuario por su número de teléfono.
func (s *ServiceGroup) GetUsernameByTelephon(telephon string, ctx context.Context) (string, error) {
	return s.contactRepo.GetUsernameByTelephon(telephon, ctx)
}

// requireGroupMember resuelve al usuario y exige que sea miembro activo del
// grupo (ErrNotGroupMember en otro caso).
func (s *ServiceGroup) requireGroupMember(telephon string, groupID uint, ctx context.Context) error {
	userID, err := s.contactRepo.GetIdByTelephon(telephon, ctx)
	if err != nil {
		return errors.New("usuario no encontrado")
	}
	isMember, err := s.repo.IsMember(groupID, uint(userID), ctx)
	if err != nil {
		return err
	}
	if !isMember {
		return ErrNotGroupMember
	}
	return nil
}

// GetGroupMessagesAround devuelve una ventana cronológica (más antiguo primero)
// centrada en el mensaje around y si hay más mensajes antes/después.
func (s *ServiceGroup) GetGroupMessagesAround(telephon string, groupID, around uint, limit int, ctx context.Context) ([]schemas.GroupMessageResponse, bool, bool, error) {
	if err := s.requireGroupMember(telephon, groupID, ctx); err != nil {
		return nil, false, false, err
	}
	msgs, hasOlder, hasNewer, err := s.repo.GetGroupMessagesAround(groupID, around, clampWindowLimit(limit), ctx)
	if err != nil {
		return nil, false, false, err
	}
	return convertGroupMessages(msgs), hasOlder, hasNewer, nil
}

// GetGroupMessagesAfter devuelve hasta limit mensajes posteriores a after en
// orden cronológico y si quedan más.
func (s *ServiceGroup) GetGroupMessagesAfter(telephon string, groupID, after uint, limit int, ctx context.Context) ([]schemas.GroupMessageResponse, bool, error) {
	if err := s.requireGroupMember(telephon, groupID, ctx); err != nil {
		return nil, false, err
	}
	msgs, hasNewer, err := s.repo.GetGroupMessagesAfter(groupID, after, clampWindowLimit(limit), ctx)
	if err != nil {
		return nil, false, err
	}
	return convertGroupMessages(msgs), hasNewer, nil
}
