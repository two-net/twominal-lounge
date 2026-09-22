use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct UserPosition {
    pub user_id: Uuid,
    pub room_id: Uuid,
    pub x: f64,
    pub y: f64,
    pub direction: String,
    pub state: String,
    pub last_seen_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MovementPayload {
    pub x: f64,
    pub y: f64,
    pub direction: String,
    pub state: String,
}
