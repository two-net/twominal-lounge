use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AvatarConfig {
    pub skin: String,
    pub hair: String,
    pub hair_color: String,
    pub outfit: String,
    pub outfit_color: String,
    pub hat: String,
    #[serde(default = "default_character")]
    pub character: Option<String>,
}

fn default_character() -> Option<String> {
    Some("hoodie".to_string())
}

impl Default for AvatarConfig {
    fn default() -> Self {
        Self {
            skin: "tan".to_string(),
            hair: "short".to_string(),
            hair_color: "#2563eb".to_string(),
            outfit: "hoodie".to_string(),
            outfit_color: "#6366f1".to_string(),
            hat: "none".to_string(),
            character: Some("hoodie".to_string()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct User {
    pub id: Uuid,
    pub username: String,
    pub display_name: String,
    pub avatar_config: serde_json::Value,
    pub license_type: String,
    pub license_key: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateGuestRequest {
    pub display_name: Option<String>,
    pub avatar_config: Option<AvatarConfig>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateProfileRequest {
    pub display_name: Option<String>,
    pub avatar_config: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AuthResponse {
    pub user: User,
    pub token: String,
}

