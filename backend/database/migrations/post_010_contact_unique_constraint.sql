-- post_010_contact_unique_constraint.sql
-- Agrega unique constraint para prevenir contactos duplicados
CREATE UNIQUE INDEX IF NOT EXISTS uq_contact_user_pair
    ON contact_data_bases (id_user, id_contact)
    WHERE deleted_at IS NULL;
