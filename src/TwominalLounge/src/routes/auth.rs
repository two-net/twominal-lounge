use crate::models::{AuthResponse, CreateGuestRequest};
use crate::AppState;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use rand::RngExt;
use serde_json::json;
use std::sync::Arc;
use uuid::Uuid;

pub async fn create_guest(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CreateGuestRequest>,
) -> Response {
    let (guest_num, default_color) = {
        let mut rng = rand::rng();
        let num: u32 = rng.random_range(100..999);
        let colors = ["#3b82f6", "#10b981", "#8b5cf6", "#ec4899", "#f59e0b", "#06b6d4"];
        let color = colors[rng.random_range(0..colors.len())];
        (num, color)
    };

    let username = format!("guest_{}", guest_num);
    let display_name = payload
        .display_name
        .unwrap_or_else(|| format!("Guest {}", guest_num));

    let avatar = if let Some(cfg) = payload.avatar_config {
        json!(cfg)
    } else {
        json!({
            "skin": "tan",
            "hair": "short",
            "hair_color": default_color,
            "outfit": "hoodie",
            "outfit_color": default_color,
            "hat": "none"
        })
    };

    let user = match state.db.create_user(&username, &display_name, avatar).await {
        Ok(u) => u,
        Err(e) => {
            tracing::error!(error = %e, "Failed to create guest user");
            return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
        }
    };

    let token = format!("token-{}", user.id);

    tracing::info!(user_id = %user.id, username = %user.username, "Guest user session created");

    (StatusCode::OK, Json(AuthResponse { user, token })).into_response()
}

pub async fn get_user_profile(
    State(state): State<Arc<AppState>>,
    Path(user_id): Path<Uuid>,
) -> Response {
    match state.db.get_user(user_id).await {
        Ok(Some(user)) => (StatusCode::OK, Json(user)).into_response(),
        Ok(None) => (StatusCode::NOT_FOUND, "User not found").into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub async fn update_user_profile(
    State(state): State<Arc<AppState>>,
    Path(user_id): Path<Uuid>,
    Json(payload): Json<crate::models::UpdateProfileRequest>,
) -> Response {
    match state.db.update_user_profile(user_id, payload.display_name, payload.avatar_config).await {
        Ok(Some(user)) => (StatusCode::OK, Json(user)).into_response(),
        Ok(None) => (StatusCode::NOT_FOUND, "User not found").into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

