use crate::models::{CreateRoomRequest, RoomDetails, UpdateLayoutRequest};
use crate::AppState;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use std::sync::Arc;

pub async fn list_rooms(
    State(state): State<Arc<AppState>>,
) -> Response {
    let rooms = match state.db.list_rooms().await {
        Ok(r) => r,
        Err(e) => {
            tracing::error!(error = %e, "Failed to list rooms");
            return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
        }
    };

    let mut result = Vec::new();
    for room in rooms {
        let occupancy = state.hub.active_occupancy(&room.slug).await;
        result.push(serde_json::json!({
            "id": room.id,
            "slug": room.slug,
            "name": room.name,
            "description": room.description,
            "max_occupancy": room.max_occupancy,
            "pricing_tier": room.pricing_tier,
            "active_occupancy": occupancy,
            "created_at": room.created_at,
        }));
    }

    (StatusCode::OK, Json(result)).into_response()
}

pub async fn get_room(
    State(state): State<Arc<AppState>>,
    Path(slug): Path<String>,
) -> Response {
    let room = match state.db.get_room_by_slug(&slug).await {
        Ok(Some(r)) => r,
        Ok(None) => return (StatusCode::NOT_FOUND, format!("Room '{}' not found", slug)).into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    let layout = match state.db.get_room_layout(room.id).await {
        Ok(Some(l)) => l,
        Ok(None) => return (StatusCode::NOT_FOUND, "Room layout missing").into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    let active_occupancy = state.hub.active_occupancy(&slug).await;

    state.hub.get_or_create_room(&slug, &room.name, layout.clone()).await;

    (
        StatusCode::OK,
        Json(RoomDetails {
            room,
            layout,
            active_occupancy,
        }),
    )
        .into_response()
}

pub async fn create_room(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CreateRoomRequest>,
) -> Response {
    let (room, layout) = match state.db.create_room(&payload, None).await {
        Ok(pair) => pair,
        Err(e) => {
            tracing::error!(error = %e, "Failed to create room");
            return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
        }
    };

    state.hub.get_or_create_room(&room.slug, &room.name, layout.clone()).await;

    tracing::info!(room_slug = %room.slug, "New room created successfully");

    (
        StatusCode::CREATED,
        Json(RoomDetails {
            room,
            layout,
            active_occupancy: 0,
        }),
    )
        .into_response()
}

pub async fn update_layout(
    State(state): State<Arc<AppState>>,
    Path(slug): Path<String>,
    Json(payload): Json<UpdateLayoutRequest>,
) -> Response {
    let room = match state.db.get_room_by_slug(&slug).await {
        Ok(Some(r)) => r,
        Ok(None) => return (StatusCode::NOT_FOUND, format!("Room '{}' not found", slug)).into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    if let Err(e) = state.db.update_room_layout(room.id, &payload).await {
        return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
    }

    if let Some(layout) = state.db.get_room_layout(room.id).await.ok().flatten() {
        let mut rooms = state.hub.rooms.write().await;
        if let Some(session) = rooms.get_mut(&slug) {
            session.layout = layout;
        }
    }

    tracing::info!(room_slug = %slug, "Room layout updated");

    (StatusCode::OK, Json(serde_json::json!({ "success": true, "slug": slug }))).into_response()
}

pub async fn list_notes(
    State(state): State<Arc<AppState>>,
    Path(slug): Path<String>,
) -> Response {
    let room = match state.db.get_room_by_slug(&slug).await {
        Ok(Some(r)) => r,
        Ok(None) => return (StatusCode::NOT_FOUND, format!("Room '{}' not found", slug)).into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    match state.db.list_whiteboard_notes(room.id).await {
        Ok(notes) => (StatusCode::OK, Json(notes)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub async fn create_note(
    State(state): State<Arc<AppState>>,
    Path(slug): Path<String>,
    Json(payload): Json<crate::models::CreateWhiteboardNoteRequest>,
) -> Response {
    let room = match state.db.get_room_by_slug(&slug).await {
        Ok(Some(r)) => r,
        Ok(None) => return (StatusCode::NOT_FOUND, format!("Room '{}' not found", slug)).into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    let color = payload.color_class.unwrap_or_else(|| "bg-amber-100 text-amber-950 border-amber-300".to_string());
    match state.db.create_whiteboard_note(room.id, &payload.author_name, &payload.content, &color).await {
        Ok(note) => {
            state.hub.broadcast_whiteboard_note(&slug, &note).await;
            (StatusCode::CREATED, Json(note)).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

pub async fn delete_note(
    State(state): State<Arc<AppState>>,
    Path((slug, note_id)): Path<(String, uuid::Uuid)>,
) -> Response {
    match state.db.delete_whiteboard_note(note_id).await {
        Ok(deleted) => {
            if deleted {
                state.hub.broadcast_whiteboard_note_deleted(&slug, note_id).await;
                (StatusCode::OK, Json(serde_json::json!({ "success": true }))).into_response()
            } else {
                (StatusCode::NOT_FOUND, "Note not found").into_response()
            }
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

