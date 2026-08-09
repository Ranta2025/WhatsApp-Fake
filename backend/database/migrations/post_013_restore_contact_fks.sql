-- Migration: post_013_restore_contact_fks
-- Phase: POST-AutoMigrate
-- Description: C5 — Restaura las foreign keys de contact_data_bases que
--              post_003_drop_legacy_fk_constraints.sql eliminó, con limpieza
--              previa de filas huérfanas (id_user / id_contact sin usuario
--              correspondiente) para que ADD CONSTRAINT no falle.
--
--              Todo el bloque DO $$ es UNA transacción: si la limpieza o el
--              ADD CONSTRAINT falla, nada se aplica. Guardas IF NOT EXISTS
--              (spec R3) hacen la migración re-ejecutable sin error.
--
--              ON DELETE CASCADE (spec R1): al borrar un usuario se eliminan
--              sus filas de contactos. Las columnas son NOT NULL, por lo que
--              SET NULL no es viable; el borrado lógico (deleted_at) no
--              dispara el cascade.

DO $$
DECLARE
    orphan_count INT;
BEGIN
    -- 1. Limpieza previa de huérfanos: filas cuyos id_user o id_contact ya no
    --    existen en user_data_bases (la tabla canónica; 'users' legacy se
    --    eliminó en post_004).
    DELETE FROM contact_data_bases
    WHERE id_user NOT IN (SELECT id FROM user_data_bases)
       OR id_contact NOT IN (SELECT id FROM user_data_bases);

    GET DIAGNOSTICS orphan_count = ROW_COUNT;
    RAISE NOTICE 'post_013: % filas huerfanas eliminadas', orphan_count;

    -- 2. Restauración de FKs con guardas idempotentes.
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_contact_data_bases_user'
    ) THEN
        ALTER TABLE contact_data_bases ADD CONSTRAINT fk_contact_data_bases_user
            FOREIGN KEY (id_user) REFERENCES user_data_bases(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_contact_data_bases_user_contact'
    ) THEN
        ALTER TABLE contact_data_bases ADD CONSTRAINT fk_contact_data_bases_user_contact
            FOREIGN KEY (id_contact) REFERENCES user_data_bases(id) ON DELETE CASCADE;
    END IF;
END $$;
