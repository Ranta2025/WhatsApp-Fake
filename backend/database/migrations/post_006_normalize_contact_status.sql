-- Migration: post_006_normalize_contact_status
-- Phase: POST-AutoMigrate
-- Description: One-time data migration to normalise legacy status values that existed
--              before the CHECK constraint (post_007) is applied.
--              Must run BEFORE post_007_check_constraints.sql.

UPDATE contact_data_bases SET status = 'rejected' WHERE status = 'rechazed';
UPDATE contact_data_bases SET status = 'pending'  WHERE status = 'pendiente';
