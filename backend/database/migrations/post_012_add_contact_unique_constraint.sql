-- Migration: post_012_add_contact_unique_constraint
-- Phase: POST-AutoMigrate
-- Description: C9 — Garantiza a nivel de base de datos la unicidad del par
--              (id_user, id_contact) en contact_data_bases, incluso en
--              entornos donde AutoMigrate no creó el índice compuesto del
--              modelo (idx_contact_pair) o fue eliminado manualmente.
--
--              Patrón IF NOT EXISTS: re-ejecutable sin error (spec R3).
--
--              Nota de diseño: el modelo GORM declara
--              uniqueIndex:idx_contact_pair; los índices parciales
--              post_002/post_010 (WHERE deleted_at IS NULL) conviven con este
--              índice completo. Este archivo es el respaldo idempotente que
--              garantiza que el índice compuesto siempre exista.

CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_pair
    ON contact_data_bases (id_user, id_contact);
