-- Migration 0002: Whiteboard Notes
-- Standard relational persistence for collaborative whiteboard sticky notes without partitioning

CREATE TABLE IF NOT EXISTS whiteboard_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    author_name VARCHAR(128) NOT NULL,
    content TEXT NOT NULL,
    color_class VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whiteboard_notes_room ON whiteboard_notes(room_id);
