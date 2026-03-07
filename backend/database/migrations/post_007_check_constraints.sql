-- Migration: post_007_check_constraints
-- Phase: POST-AutoMigrate
-- Description: Add CHECK constraints to enforce domain values at the database level.
--              All constraints are idempotent (wrapped in DO blocks).

DO $$ BEGIN
    -- messages.status
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.constraint_column_usage
        WHERE table_name = 'messages' AND constraint_name = 'chk_messages_status'
    ) THEN
        ALTER TABLE messages ADD CONSTRAINT chk_messages_status
            CHECK (status IN ('enviado', 'entregado', 'visto'));
    END IF;

    -- messages.media_type
    -- Valid values: '' (plain text), 'image', 'audio', 'video', 'sticker', 'document'
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.constraint_column_usage
        WHERE table_name = 'messages' AND constraint_name = 'chk_messages_media_type'
    ) THEN
        ALTER TABLE messages ADD CONSTRAINT chk_messages_media_type
            CHECK (
                media_type IS NULL OR media_type = ''
                OR media_type IN ('image', 'audio', 'video', 'sticker', 'document')
            );
    END IF;

    -- call_logs.call_type
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.constraint_column_usage
        WHERE table_name = 'call_logs' AND constraint_name = 'chk_call_logs_call_type'
    ) THEN
        ALTER TABLE call_logs ADD CONSTRAINT chk_call_logs_call_type
            CHECK (call_type IN ('video', 'audio'));
    END IF;

    -- call_logs.status
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.constraint_column_usage
        WHERE table_name = 'call_logs' AND constraint_name = 'chk_call_logs_status'
    ) THEN
        ALTER TABLE call_logs ADD CONSTRAINT chk_call_logs_status
            CHECK (status IN ('answered', 'missed', 'rejected', 'unavailable'));
    END IF;

    -- contact_data_bases.status
    -- Must run AFTER post_006_normalize_contact_status.sql
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.constraint_column_usage
        WHERE table_name = 'contact_data_bases' AND constraint_name = 'chk_contacts_status'
    ) THEN
        ALTER TABLE contact_data_bases ADD CONSTRAINT chk_contacts_status
            CHECK (status IN ('pending', 'accepted', 'rejected'));
    END IF;
END $$;
