use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BillingTier {
    pub id: String,
    pub name: String,
    pub description: String,
    pub price_cents: i32,
    pub currency: String,
    pub billing_type: String, // "one_time" | "free" | "pay_per_room"
    pub max_occupancy: i32,
    pub max_rooms: i32,
    pub features: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ActivateRoomRequest {
    pub room_slug: String,
    pub tier_id: String,
    pub license_key: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ActivateRoomResponse {
    pub success: bool,
    pub room_slug: String,
    pub tier: String,
    pub max_occupancy: i32,
    pub message: String,
}
