-- Migration: post_004_drop_legacy_users_table
-- Phase: POST-AutoMigrate
-- Description: Drop the old 'users' table left over from the initial schema.
--              The canonical table is 'user_data_bases' (used by GORM AutoMigrate).

DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'users'
    ) THEN
        DROP TABLE users;
    END IF;
END $$;
