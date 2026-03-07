-- Migration: post_002_contact_unique_index
-- Phase: POST-AutoMigrate
-- Description: Partial unique index on contacts to prevent duplicate active relationships
--              while allowing soft-deleted rows (deleted_at IS NOT NULL) to coexist.

DROP INDEX IF EXISTS idx_user_contact;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_contact_active
    ON contact_data_bases (id_user, id_contact)
    WHERE deleted_at IS NULL;
