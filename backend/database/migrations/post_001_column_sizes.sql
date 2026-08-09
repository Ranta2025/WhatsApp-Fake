-- Migration: post_001_column_sizes
-- Phase: POST-AutoMigrate
-- Description: Ensure correct column lengths that GORM defaults do not guarantee.

ALTER TABLE contact_data_bases ALTER COLUMN status   TYPE VARCHAR(25);
ALTER TABLE user_data_bases    ALTER COLUMN password TYPE VARCHAR(100);
