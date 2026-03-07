-- Migration: post_008_group_indexes_and_constraints
-- Phase: POST-AutoMigrate
-- Description: Indexes and CHECK constraints for the groups feature tables
--              (groups, group_members, group_messages).

-- Unique partial index: prevents duplicate active memberships while allowing
-- a user to re-join a group after being soft-deleted.
CREATE UNIQUE INDEX IF NOT EXISTS idx_group_member_active
    ON group_members (group_id, user_id)
    WHERE deleted_at IS NULL;

-- Composite index for paginated group message history queries.
CREATE INDEX IF NOT EXISTS idx_group_messages_history
    ON group_messages (group_id, created_at)
    WHERE deleted_at IS NULL;

-- Lookup index: fetch all members belonging to a given group.
CREATE INDEX IF NOT EXISTS idx_group_members_group
    ON group_members (group_id)
    WHERE deleted_at IS NULL;

DO $$ BEGIN
    -- group_members.role
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.constraint_column_usage
        WHERE table_name = 'group_members' AND constraint_name = 'chk_group_members_role'
    ) THEN
        ALTER TABLE group_members ADD CONSTRAINT chk_group_members_role
            CHECK (role IN ('admin', 'member'));
    END IF;

    -- group_messages.media_type (same valid values as messages.media_type)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.constraint_column_usage
        WHERE table_name = 'group_messages' AND constraint_name = 'chk_group_messages_media_type'
    ) THEN
        ALTER TABLE group_messages ADD CONSTRAINT chk_group_messages_media_type
            CHECK (
                media_type IS NULL OR media_type = ''
                OR media_type IN ('image', 'audio', 'video', 'sticker', 'document')
            );
    END IF;
END $$;
