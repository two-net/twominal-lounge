use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InteractiveObject {
    pub id: String,
    pub object_type: String, // "chair", "desk", "whiteboard", "plant", "water_cooler", "couch"
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    pub direction: Option<String>,
    pub properties: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrivateZone {
    pub id: String,
    pub name: String,
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Room {
    pub id: Uuid,
    pub slug: String,
    pub name: String,
    pub description: String,
    pub owner_id: Option<Uuid>,
    pub max_occupancy: i32,
    pub pricing_tier: String,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct RoomLayout {
    pub id: Uuid,
    pub room_id: Uuid,
    pub width: i32,
    pub height: i32,
    pub spawn_x: i32,
    pub spawn_y: i32,
    pub tilemap_data: serde_json::Value,
    pub collision_mask: serde_json::Value,
    pub interactive_objects: serde_json::Value,
    pub private_zones: serde_json::Value,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoomDetails {
    #[serde(flatten)]
    pub room: Room,
    pub layout: RoomLayout,
    pub active_occupancy: usize,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateRoomRequest {
    pub name: String,
    pub slug: Option<String>,
    pub description: Option<String>,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub pricing_tier: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateLayoutRequest {
    pub spawn_x: Option<i32>,
    pub spawn_y: Option<i32>,
    pub tilemap_data: Option<serde_json::Value>,
    pub collision_mask: Option<serde_json::Value>,
    pub interactive_objects: Option<Vec<InteractiveObject>>,
    pub private_zones: Option<Vec<PrivateZone>>,
}
