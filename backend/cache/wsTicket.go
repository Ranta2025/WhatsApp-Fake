package cache

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

// wsTicketTTL es la vida de un ticket de WebSocket: solo sirve para abrir la conexión.
const wsTicketTTL = 30 * time.Second

// WSTicketStore emite tickets de un solo uso para autenticar la conexión
// WebSocket cuando el frontend y el backend están en dominios distintos (p. ej.
// Vercel + Render) y el navegador no envía la cookie de sesión al backend.
type WSTicketStore struct {
	rd *redis.Client
}

// NewWSTicketStore crea el almacén de tickets sobre Redis.
func NewWSTicketStore(rd *redis.Client) *WSTicketStore {
	return &WSTicketStore{rd: rd}
}

// Create genera un ticket aleatorio asociado al usuario.
func (s *WSTicketStore) Create(ctx context.Context, username, telephon string) (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	ticket := hex.EncodeToString(b)
	if err := s.rd.Set(ctx, "wsticket:"+ticket, telephon+"|"+username, wsTicketTTL).Err(); err != nil {
		return "", err
	}
	return ticket, nil
}

// Consume valida y elimina el ticket (un solo uso) devolviendo username y telephon.
func (s *WSTicketStore) Consume(ctx context.Context, ticket string) (string, string, error) {
	if ticket == "" {
		return "", "", errors.New("ticket vacío")
	}
	value, err := s.rd.GetDel(ctx, "wsticket:"+ticket).Result()
	if err != nil {
		return "", "", errors.New("ticket inválido o expirado")
	}
	telephon, username, ok := strings.Cut(value, "|")
	if !ok {
		return "", "", errors.New("ticket inválido")
	}
	return username, telephon, nil
}
