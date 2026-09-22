-- Twominal Lounge Database Schema
-- Standard ORM schema with strictly NO partitioning

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(64) UNIQUE NOT NULL,
    display_name VARCHAR(128) NOT NULL,
    avatar_config JSONB NOT NULL DEFAULT '{"skin":"tan","hair":"short","hair_color":"#2563eb","outfit":"hoodie","outfit_color":"#6366f1","hat":"none"}',
    license_type VARCHAR(32) NOT NULL DEFAULT 'free',
    license_key VARCHAR(128),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Rooms table
CREATE TABLE IF NOT EXISTS rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(128) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
    max_occupancy INT NOT NULL DEFAULT 25,
    pricing_tier VARCHAR(32) NOT NULL DEFAULT 'free',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Room Layouts table
CREATE TABLE IF NOT EXISTS room_layouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID UNIQUE NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    width INT NOT NULL DEFAULT 30,
    height INT NOT NULL DEFAULT 20,
    spawn_x INT NOT NULL DEFAULT 6,
    spawn_y INT NOT NULL DEFAULT 6,
    tilemap_data JSONB NOT NULL DEFAULT '{}',
    collision_mask JSONB NOT NULL DEFAULT '[]',
    interactive_objects JSONB NOT NULL DEFAULT '[]',
    private_zones JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User Positions table
CREATE TABLE IF NOT EXISTS user_positions (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    x FLOAT8 NOT NULL DEFAULT 6.0,
    y FLOAT8 NOT NULL DEFAULT 6.0,
    direction VARCHAR(16) NOT NULL DEFAULT 'down',
    state VARCHAR(16) NOT NULL DEFAULT 'idle',
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, room_id)
);

CREATE INDEX IF NOT EXISTS idx_rooms_slug ON rooms(slug);
CREATE INDEX IF NOT EXISTS idx_user_positions_room ON user_positions(room_id);
