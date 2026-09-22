use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct WhiteboardNote {
    pub id: Uuid,
    pub room_id: Uuid,
    pub author_name: String,
    pub content: String,
    pub color_class: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateWhiteboardNoteRequest {
    pub author_name: String,
    pub content: String,
    pub color_class: Option<String>,
}
