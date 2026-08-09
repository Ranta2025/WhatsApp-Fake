-- post_011_call_log_indexes.sql
CREATE INDEX IF NOT EXISTS idx_call_logs_caller_time
    ON call_logs (caller_id, started_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_call_logs_receiver_time
    ON call_logs (receiver_id, started_at DESC)
    WHERE deleted_at IS NULL;
