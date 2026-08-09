-- Migration: post_001_column_sizes
-- Phase: POST-AutoMigrate
-- Description: Ensure correct column lengths that GORM defaults do not guarantee.
--              Guardas idempotentes (spec R3): cada ALTER COLUMN TYPE solo se
--              aplica si la longitud actual difiere de la deseada, de modo que
--              re-ejecutar el archivo no produce error.

DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'contact_data_bases' AND column_name = 'status'
          AND character_maximum_length IS DISTINCT FROM 25
    ) THEN
        ALTER TABLE contact_data_bases ALTER COLUMN status TYPE VARCHAR(25);
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'user_data_bases' AND column_name = 'password'
          AND character_maximum_length IS DISTINCT FROM 100
    ) THEN
        ALTER TABLE user_data_bases ALTER COLUMN password TYPE VARCHAR(100);
    END IF;
END $$;
