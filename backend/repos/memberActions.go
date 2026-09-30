package repos

import (
	"errors"

	"gorm/backend/models"

	"gorm.io/gorm"
)

// membershipDecision es la re-verificación PURA que se ejecuta DENTRO de la
// transacción de una mutación de membresía (bajo lockGroupRow). Centraliza las
// invariantes comunes:
//
//   - el actor debe ser miembro activo (ErrNotGroupMember)
//   - el actor debe ser admin (ErrNotGroupAdmin)
//   - el objetivo debe ser miembro activo (ErrGroupTargetNotMember)
//   - el actor no puede ser el objetivo: no auto-descarte ni auto-remoción
//     (ErrInvalidRoleChange)
//   - en un cambio de rol, el rol nuevo debe diferir del actual (no-op
//     rechazado; ErrInvalidRoleChange)
//
// La combinación "actor admin + actor != objetivo" garantiza que el grupo nunca
// queda con cero admins: el actor sigue siendo admin tras la mutación. La salida
// voluntaria queda cubierta por la promoción automática del último admin.
func membershipDecision(actorID, targetID uint, actorRole string, actorActive bool, targetRole string, targetActive bool, newRole string, roleChange bool) error {
	if !actorActive {
		return models.ErrNotGroupMember
	}
	if actorRole != models.GroupRoleAdmin {
		return models.ErrNotGroupAdmin
	}
	if !targetActive {
		return models.ErrGroupTargetNotMember
	}
	if actorID == targetID {
		return models.ErrInvalidRoleChange
	}
	if roleChange && targetRole == newRole {
		return models.ErrInvalidRoleChange
	}
	return nil
}

// memberRoleTx lee el rol activo de un usuario DENTRO de la transacción. El
// booleano indica si la fila de membresía activa existe (respeta soft-delete).
func memberRoleTx(tx *gorm.DB, groupID, userID uint) (string, bool, error) {
	var member models.GroupMember
	err := tx.Where("group_id = ? AND user_id = ?", groupID, userID).First(&member).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return "", false, nil
		}
		return "", false, err
	}
	return member.Role, true, nil
}

// requireActiveMemberTx exige que el actor siga siendo miembro activo.
func requireActiveMemberTx(tx *gorm.DB, groupID, actorID uint) error {
	_, active, err := memberRoleTx(tx, groupID, actorID)
	if err != nil {
		return err
	}
	if !active {
		return models.ErrNotGroupMember
	}
	return nil
}

// requireAdminTx exige que el actor siga siendo admin dentro de la transacción.
func requireAdminTx(tx *gorm.DB, groupID, actorID uint) error {
	role, active, err := memberRoleTx(tx, groupID, actorID)
	if err != nil {
		return err
	}
	if !active {
		return models.ErrNotGroupMember
	}
	if role != models.GroupRoleAdmin {
		return models.ErrNotGroupAdmin
	}
	return nil
}
