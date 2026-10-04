package services

import (
	"errors"
	"regexp"
	"strings"
)

// ErrInvalidClientID is returned when a send carries a clientID that is not a
// canonical UUID (8-4-4-4-12 hex digits, any version).
var ErrInvalidClientID = errors.New("clientID no válido: debe ser un UUID")

// ErrClientIDConflict is returned when a sender reuses a clientID already bound
// to a message in another conversation (different receiver or group). The
// stored message is never returned as if it belonged to the new destination.
var ErrClientIDConflict = errors.New("clientID ya usado en otra conversación")

var clientIDPattern = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

// normalizeClientID validates an optional idempotency key. Empty means "no key"
// (legacy, non-idempotent send) and yields nil; otherwise the canonical
// lowercase UUID is returned.
func normalizeClientID(raw string) (*string, error) {
	if raw == "" {
		return nil, nil
	}
	id := strings.ToLower(raw)
	if !clientIDPattern.MatchString(id) {
		return nil, ErrInvalidClientID
	}
	return &id, nil
}
