-- Migration: pre_001_rename_reply_to_telephon
-- Phase: PRE-AutoMigrate
-- Description: Rename legacy column reply_to_username → reply_to_telephon.
--              The column stores a phone number; the old name was incorrect.
--              Must run BEFORE AutoMigrate to avoid it creating a duplicate column.

DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'messages' AND column_name = 'reply_to_username'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'messages' AND column_name = 'reply_to_telephon'
    ) THEN
        ALTER TABLE messages RENAME COLUMN reply_to_username TO reply_to_telephon;
    END IF;
END $$;
