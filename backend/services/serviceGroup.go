package services

import (
	"context"
	"errors"
	"gorm/backend/models"
	"gorm/backend/schemas"
	"time"
)

// ─────────────────────────────────────────────────────────────────────────────
// Interfaces
// ─────────────────────────────────────────────────────────────────────────────

// GroupServicer define todas las operaciones de negocio del dominio de grupos.
type GroupServicer interface {
	CreateGroup(telephonCreator string, data models.GroupCreate, ctx context.Context) (*schemas.GroupDetail, error)
	AddMembers(telephonRequester string, groupID uint, data models.GroupAddMembers, ctx context.Context) error
	GetUserGroups(telephon string, ctx context.Context) ([]schemas.GroupResponse, error)
	GetGroupDetail(telephon string, groupID uint, ctx context.Context) (*schemas.GroupDetail, error)
	SendGroupMessage(telephonSender string, data models.GroupMessageSend, ctx context.Context) (*schemas.GroupMessageResponse, error)
	GetGroupMessages(telephon string, groupID uint, limit, offset int, ctx context.Context) ([]schemas.GroupMessageResponse, error)
	EditGroupMessage(telephon string, groupID uint, data models.GroupMessageEdit, ctx context.Context) (*schemas.GroupMessageResponse, error)
	DeleteGroupMessage(telephon string, groupID uint, data models.GroupMessageDelete, ctx context.Context) error
	GetMemberTelephons(groupID uint, ctx context.Context) ([]string, error)
	LeaveGroup(telephon string, groupID uint, ctx context.Context) error
	UpdateGroupAvatar(telephon string, groupID uint, avatarUrl string, ctx context.Context) error
	GetUsernameByTelephon(telephon string, ctx context.Context) (string, error)
}

// GroupRepoInterface define las operaciones de persistencia que necesita el servicio.
type GroupRepoInterface interface {
	CreateGroupWithCreator(group *models.Group, creatorID uint) error
	AddMembers(groupID uint, members []models.GroupMember, ctx context.Context) error
	GetGroupByID(groupID uint, ctx context.Context) (*models.Group, error)
	GetGroupMembers(groupID uint, ctx context.Context) ([]models.GroupMember, error)
	GetUserGroups(userID uint, ctx context.Context) ([]models.Group, error)
	IsMember(groupID, userID uint, ctx context.Context) (bool, error)
	GetMemberRole(groupID, userID uint, ctx context.Context) (string, error)
	GetMemberTelephons(groupID uint, ctx context.Context) ([]string, error)
	GetMemberCount(groupID uint, ctx context.Context) (int, error)
	CreateGroupMessage(msg *models.GroupMessage, ctx context.Context) error
	GetGroupMessages(groupID uint, limit, offset int, ctx context.Context) ([]models.GroupMessage, error)
	GetGroupMessageByID(messageID uint, ctx context.Context) (*models.GroupMessage, error)
	EditGroupMessage(messageID, senderID uint, newContent string, ctx context.Context) error
	DeleteGroupMessage(messageID, senderID uint, ctx context.Context) error
	LeaveGroup(groupID, userID uint, ctx context.Context) error
	UpdateGroupAvatar(groupID uint, avatarUrl string, ctx context.Context) error
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

// CreateGroup crea un nuevo grupo: valida miembros, persiste con transacción y
// retorna el detalle completo.
func (s *ServiceGroup) CreateGroup(telephonCreator string, data models.GroupCreate, ctx context.Context) (*schemas.GroupDetail, error) {
	creatorID, err := s.contactRepo.GetIdByTelephon(telephonCreator, ctx)
	if err != nil {
		return nil, errors.New("creador no encontrado")
	}

	// Resolver teléfonos de miembros a IDs, validando que sean contactos del creador
	memberIDs, err := s.resolveMemberTelephons(uint(creatorID), data.Members, ctx)
	if err != nil {
		return nil, err
	}

	// Construir el modelo del grupo
	group := &models.Group{
		Name:        data.Name,
		Description: data.Description,
		CreatorID:   uint(creatorID),
	}

	// Persistir grupo + creador como admin en una sola transacción
	if err := s.repo.CreateGroupWithCreator(group, uint(creatorID)); err != nil {
		return nil, errors.New("error al crear el grupo")
	}

	// Añadir los miembros iniciales (si los hay)
	if len(memberIDs) > 0 {
		members := make([]models.GroupMember, 0, len(memberIDs))
		for _, memberID := range memberIDs {
			members = append(members, models.GroupMember{
				GroupID:   group.ID,
				UserID:    memberID,
				Role:      "member",
				AddedByID: uint(creatorID),
			})
		}
		if err := s.repo.AddMembers(group.ID, members, ctx); err != nil {
			// El grupo ya fue creado; loguear el error pero no fallar
			// (el creador puede volver a añadir miembros después)
			return nil, errors.New("grupo creado pero falló al añadir algunos miembros")
		}
	}

	return s.GetGroupDetail(telephonCreator, group.ID, ctx)
}

// AddMembers añade nuevos miembros a un grupo.
// Cualquier miembro puede añadir, pero sólo puede añadir a sus propios contactos aceptados.
func (s *ServiceGroup) AddMembers(telephonRequester string, groupID uint, data models.GroupAddMembers, ctx context.Context) error {
	requesterID, err := s.contactRepo.GetIdByTelephon(telephonRequester, ctx)
	if err != nil {
		return errors.New("usuario no encontrado")
	}

	// Verificar que el requester es miembro del grupo
	isMember, err := s.repo.IsMember(groupID, uint(requesterID), ctx)
	if err != nil || !isMember {
		return errors.New("no eres miembro de este grupo")
	}

	// Resolver teléfonos, validando que sean contactos del requester
	memberIDs, err := s.resolveMemberTelephons(uint(requesterID), data.Members, ctx)
	if err != nil {
		return err
	}

	if len(memberIDs) == 0 {
		return errors.New("no se encontraron contactos válidos para añadir")
	}

	members := make([]models.GroupMember, 0, len(memberIDs))
	for _, memberID := range memberIDs {
		members = append(members, models.GroupMember{
			GroupID:   groupID,
			UserID:    memberID,
			Role:      "member",
			AddedByID: uint(requesterID),
		})
	}
	return s.repo.AddMembers(groupID, members, ctx)
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
		count, _ := s.repo.GetMemberCount(g.ID, ctx)
		creatorTel, _ := s.contactRepo.GetTelephonByID(g.CreatorID, ctx)
		role, _ := s.repo.GetMemberRole(g.ID, uint(userID), ctx)
		responses = append(responses, schemas.GroupResponse{
			ID:              g.ID,
			Name:            g.Name,
			Description:     g.Description,
			AvatarUrl:       g.AvatarUrl,
			CreatorTelephon: creatorTel,
			MemberCount:     count,
			UserRole:        role,
			CreatedAt:       g.CreatedAt,
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
	memberCount := len(members)

	detail := &schemas.GroupDetail{
		GroupResponse: schemas.GroupResponse{
			ID:              group.ID,
			Name:            group.Name,
			Description:     group.Description,
			AvatarUrl:       group.AvatarUrl,
			CreatorTelephon: creatorTel,
			MemberCount:     memberCount,
			CreatedAt:       group.CreatedAt,
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
	senderID, err := s.contactRepo.GetIdByTelephon(telephonSender, ctx)
	if err != nil {
		return nil, errors.New("remitente no encontrado")
	}

	// Verificar membresía
	isMember, err := s.repo.IsMember(data.GroupID, uint(senderID), ctx)
	if err != nil || !isMember {
		return nil, errors.New("no eres miembro de este grupo")
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
	userID, err := s.contactRepo.GetIdByTelephon(telephon, ctx)
	if err != nil {
		return nil, errors.New("usuario no encontrado")
	}

	isMember, err := s.repo.IsMember(groupID, uint(userID), ctx)
	if err != nil || !isMember {
		return nil, errors.New("no tienes acceso a este grupo")
	}

	if limit <= 0 {
		limit = 50
	}

	messages, err := s.repo.GetGroupMessages(groupID, limit, offset, ctx)
	if err != nil {
		return nil, err
	}
	return convertGroupMessages(messages), nil
}

// EditGroupMessage edita el contenido de un mensaje de grupo.
// Solo el remitente original puede editar sus mensajes.
func (s *ServiceGroup) EditGroupMessage(telephon string, groupID uint, data models.GroupMessageEdit, ctx context.Context) (*schemas.GroupMessageResponse, error) {
	senderID, err := s.contactRepo.GetIdByTelephon(telephon, ctx)
	if err != nil {
		return nil, errors.New("usuario no encontrado")
	}

	isMember, err := s.repo.IsMember(groupID, uint(senderID), ctx)
	if err != nil || !isMember {
		return nil, errors.New("no eres miembro de este grupo")
	}

	if err := s.repo.EditGroupMessage(data.MessageID, uint(senderID), data.Message, ctx); err != nil {
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

	return s.repo.DeleteGroupMessage(data.MessageID, uint(senderID), ctx)
}

// GetMemberTelephons retorna los teléfonos de los miembros activos de un grupo.
// Usado por el Hub para enviar mensajes por WebSocket.
func (s *ServiceGroup) GetMemberTelephons(groupID uint, ctx context.Context) ([]string, error) {
	return s.repo.GetMemberTelephons(groupID, ctx)
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers internos
// ─────────────────────────────────────────────────────────────────────────────

// resolveMemberTelephons convierte una lista de teléfonos a IDs, validando que
// cada uno sea contacto aceptado del usuario solicitante.
func (s *ServiceGroup) resolveMemberTelephons(requesterID uint, telephons []string, ctx context.Context) ([]uint, error) {
	ids := make([]uint, 0, len(telephons))
	for _, tel := range telephons {
		memberID, err := s.contactRepo.GetIdByTelephon(tel, ctx)
		if err != nil {
			return nil, errors.New("el número " + tel + " no está registrado")
		}
		// Verificar que es contacto aceptado del requester
		isContact, err := s.contactRepo.IsAcceptedContact(requesterID, uint(memberID), ctx)
		if err != nil || !isContact {
			return nil, errors.New("el número " + tel + " no es un contacto aceptado tuyo")
		}
		ids = append(ids, uint(memberID))
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
	}
}

// LeaveGroup elimina al usuario de la membresía del grupo.
func (s *ServiceGroup) LeaveGroup(telephon string, groupID uint, ctx context.Context) error {
	userID, err := s.contactRepo.GetIdByTelephon(telephon, ctx)
	if err != nil {
		return errors.New("usuario no encontrado")
	}
	isMember, err := s.repo.IsMember(groupID, uint(userID), ctx)
	if err != nil {
		return err
	}
	if !isMember {
		return errors.New("no eres miembro de este grupo")
	}
	return s.repo.LeaveGroup(groupID, uint(userID), ctx)
}

// UpdateGroupAvatar actualiza el avatar del grupo verificando que el usuario sea miembro.
func (s *ServiceGroup) UpdateGroupAvatar(telephon string, groupID uint, avatarUrl string, ctx context.Context) error {
	userID, err := s.contactRepo.GetIdByTelephon(telephon, ctx)
	if err != nil {
		return errors.New("usuario no encontrado")
	}
	isMember, err := s.repo.IsMember(groupID, uint(userID), ctx)
	if err != nil {
		return err
	}
	if !isMember {
		return errors.New("no eres miembro de este grupo")
	}
	return s.repo.UpdateGroupAvatar(groupID, avatarUrl, ctx)
}

// GetUsernameByTelephon retorna el username de un usuario por su número de teléfono.
func (s *ServiceGroup) GetUsernameByTelephon(telephon string, ctx context.Context) (string, error) {
	return s.contactRepo.GetUsernameByTelephon(telephon, ctx)
}
