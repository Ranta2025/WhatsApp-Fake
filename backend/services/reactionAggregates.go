package services

import (
	"context"
	"gorm/backend/models"
	"gorm/backend/schemas"
)

// ReactionAggregator resuelve en lote los agregados de reacciones de una página
// de mensajes (UNA consulta por página, nunca una por mensaje). La implementa
// repos.RepoReaction.
type ReactionAggregator interface {
	ReactionsForMessages(kind string, ids []uint, viewerID uint, ctx context.Context) (map[uint][]models.ReactionAggregate, error)
}

// pickAggregator devuelve el primer agregador no nulo de los opcionales del
// constructor; nil significa "sin reacciones" (tests y constructores previos).
func pickAggregator(opt []ReactionAggregator) ReactionAggregator {
	for _, a := range opt {
		if a != nil {
			return a
		}
	}
	return nil
}

// fetchReactions hace la consulta única de una página. Un fallo se devuelve al
// llamador (igual que cualquier otro fallo de repo en esa ruta) en vez de
// degradar en silencio a "sin reacciones": un cliente que fusiona la ventana
// borraría chips ya mostrados. Sin agregador o sin ids no consulta.
func fetchReactions(agg ReactionAggregator, kind string, ids []uint, viewerID uint, ctx context.Context) (map[uint][]schemas.ReactionSummary, error) {
	if agg == nil || len(ids) == 0 {
		return nil, nil
	}
	raw, err := agg.ReactionsForMessages(kind, ids, viewerID, ctx)
	if err != nil {
		return nil, err
	}
	out := make(map[uint][]schemas.ReactionSummary, len(raw))
	for id, list := range raw {
		if len(list) == 0 {
			continue
		}
		summaries := make([]schemas.ReactionSummary, 0, len(list))
		for _, a := range list {
			summaries = append(summaries, schemas.ReactionSummary{Emoji: a.Emoji, Count: a.Count, Mine: a.Mine})
		}
		out[id] = summaries
	}
	return out, nil
}

func directIDs(msgs []models.Message) []uint {
	ids := make([]uint, 0, len(msgs))
	for i := range msgs {
		ids = append(ids, msgs[i].ID)
	}
	return ids
}

// groupReactableIDs omite los mensajes de sistema: nunca tienen reacciones.
func groupReactableIDs(msgs []models.GroupMessage) []uint {
	ids := make([]uint, 0, len(msgs))
	for i := range msgs {
		if msgs[i].Kind != models.GroupMessageKindSystem {
			ids = append(ids, msgs[i].ID)
		}
	}
	return ids
}

func attachDirectReactions(msgs []schemas.Message, byID map[uint][]schemas.ReactionSummary) {
	for i := range msgs {
		msgs[i].Reactions = byID[msgs[i].MessageID]
	}
}

func attachGroupReactions(msgs []schemas.GroupMessageResponse, byID map[uint][]schemas.ReactionSummary) {
	for i := range msgs {
		if msgs[i].Kind == models.GroupMessageKindSystem {
			continue
		}
		msgs[i].Reactions = byID[msgs[i].MessageID]
	}
}

// directMessagesWithReactions convierte una página 1:1 y le adjunta reacciones
// con una sola consulta para viewerID.
func (rp *ServiceChat) directMessagesWithReactions(msgsDB []models.Message, telephonUser, telephonContact string, idUser int, ctx context.Context) ([]schemas.Message, error) {
	byID, err := fetchReactions(rp.reactions, models.ReactionKindDirect, directIDs(msgsDB), uint(idUser), ctx)
	if err != nil {
		return nil, err
	}
	out := convertMessagesToSchemas(msgsDB, telephonUser, telephonContact, idUser)
	attachDirectReactions(out, byID)
	return out, nil
}

// groupMessagesWithReactions convierte una página de grupo y le adjunta
// reacciones con una sola consulta para viewerID.
func (s *ServiceGroup) groupMessagesWithReactions(msgs []models.GroupMessage, viewerID uint, ctx context.Context) ([]schemas.GroupMessageResponse, error) {
	byID, err := fetchReactions(s.reactions, models.ReactionKindGroup, groupReactableIDs(msgs), viewerID, ctx)
	if err != nil {
		return nil, err
	}
	out := convertGroupMessages(msgs)
	attachGroupReactions(out, byID)
	return out, nil
}
