-- Migration: post_005_message_performance_indexes
-- Phase: POST-AutoMigrate
-- Description: Composite indexes required for efficient conversation queries on messages.
--              Without these, every chat load performs a sequential scan.
--
--  idx_messages_conv     – (id_user, id_receptor, sent_at) for the primary direction
--  idx_messages_conv_rev – (id_receptor, id_user, sent_at) for the reverse direction
--  idx_messages_pending  – partial index for undelivered messages (used on reconnect)

CREATE INDEX IF NOT EXISTS idx_messages_conv
    ON messages (id_user, id_receptor, sent_at)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_messages_conv_rev
    ON messages (id_receptor, id_user, sent_at)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_messages_pending
    ON messages (id_receptor, status)
    WHERE status = 'enviado' AND deleted_at IS NULL;
