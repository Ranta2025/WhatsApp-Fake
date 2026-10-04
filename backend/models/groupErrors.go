package models

import "errors"

// Errores de dominio de la administración de grupos. Viven en `models` para que
// tanto los repos (que los devuelven dentro de la transacción) como los services
// (que los exponen para el mapeo HTTP) compartan el mismo valor sin ciclos de
// importación. `services` los re-exporta con el mismo nombre.
var (
	// ErrNotGroupMember indica que el actor no es miembro activo del grupo.
	ErrNotGroupMember = errors.New("no eres miembro de este grupo")

	// ErrNotGroupAdmin indica que el actor es miembro pero no administrador.
	ErrNotGroupAdmin = errors.New("solo los administradores pueden realizar esta acción")

	// ErrGroupTargetNotMember indica que el usuario objetivo no es miembro activo.
	ErrGroupTargetNotMember = errors.New("el usuario indicado no es miembro del grupo")

	// ErrInvalidRoleChange indica un cambio de rol/membresía inválido (auto
	// descarte, auto remoción, rol ya asignado, objetivo inválido).
	ErrInvalidRoleChange = errors.New("cambio de rol no válido")
)
