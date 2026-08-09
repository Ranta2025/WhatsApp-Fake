-- Migration: pre_002_rename_email_to_gmail
-- Phase: PRE-AutoMigrate
-- Description: Rename column email → gmail on user_data_bases to match the GORM model.
--              Must run BEFORE AutoMigrate to prevent duplicate column creation.

DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'user_data_bases' AND column_name = 'email'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'user_data_bases' AND column_name = 'gmail'
    ) THEN
        ALTER TABLE user_data_bases RENAME COLUMN email TO gmail;
    END IF;
END $$;
