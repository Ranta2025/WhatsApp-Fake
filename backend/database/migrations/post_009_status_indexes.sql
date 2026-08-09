CREATE INDEX IF NOT EXISTS idx_statuses_owner_expires_at
ON statuses (owner_id, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_statuses_expires_at
ON statuses (expires_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_status_views_unique_status_viewer
ON status_views (status_id, viewer_id)
WHERE deleted_at IS NULL;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.constraint_column_usage
        WHERE table_name = 'statuses' AND constraint_name = 'chk_status_content_present'
    ) THEN
        ALTER TABLE statuses ADD CONSTRAINT chk_status_content_present
            CHECK (
                COALESCE(NULLIF(BTRIM(text), ''), NULLIF(BTRIM(media_url), '')) IS NOT NULL
            );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.constraint_column_usage
        WHERE table_name = 'statuses' AND constraint_name = 'chk_status_media_type'
    ) THEN
        ALTER TABLE statuses ADD CONSTRAINT chk_status_media_type
            CHECK (
                media_type IS NULL OR media_type IN ('', 'image', 'video')
            );
    END IF;
END $$;
