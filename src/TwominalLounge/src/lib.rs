pub mod config;
pub mod db;
pub mod models;
pub mod realtime;
pub mod routes;

use axum::{
    routing::{delete, get, post, put},
    Router,
};
use config::AppConfig;
use db::Database;
use realtime::RoomHub;
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;

pub struct AppState {
    pub db: Database,
    pub hub: Arc<RoomHub>,
    pub config: AppConfig,
}

pub fn create_app(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/health", get(routes::health::health_check))
        .route("/api/config", get(routes::config::get_public_config))
        .route("/api/config/raw", get(routes::config::get_raw_config))
        .route("/api/auth/guest", post(routes::auth::create_guest))
        .route(
            "/api/auth/profile/{user_id}",
            get(routes::auth::get_user_profile).put(routes::auth::update_user_profile),
        )
        .route("/api/rooms", get(routes::rooms::list_rooms).post(routes::rooms::create_room))
        .route("/api/rooms/{slug}", get(routes::rooms::get_room))
        .route("/api/rooms/{slug}/layout", put(routes::rooms::update_layout))
        .route(
            "/api/rooms/{slug}/notes",
            get(routes::rooms::list_notes).post(routes::rooms::create_note),
        )
        .route("/api/rooms/{slug}/notes/{note_id}", delete(routes::rooms::delete_note))
        .route("/api/billing/tiers", get(routes::billing::get_billing_tiers))
        .route("/api/billing/activate-room", post(routes::billing::activate_room))
        .route("/ws/room/{slug}", get(routes::ws::ws_handler))
        .fallback(routes::frontend::static_handler)
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}


#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::Body,
        http::{Request, StatusCode},
    };
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    fn create_test_state() -> Arc<AppState> {
        let config = AppConfig::default();
        let db = Database::connect_lazy(&config.database).expect("Failed to initialize lazy DB pool");
        let hub = Arc::new(RoomHub::new(config.spatial.clone()));
        Arc::new(AppState { db, hub, config })
    }

    #[tokio::test]
    async fn test_health_check_endpoint() {
        let state = create_test_state();
        let app = create_app(state);

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = response.into_body().collect().await.unwrap().to_bytes();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["status"], "ok");
    }

    #[tokio::test]
    async fn test_raw_config_endpoint() {
        let state = create_test_state();
        let app = create_app(state);

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/config/raw")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = response.into_body().collect().await.unwrap().to_bytes();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["billing"]["currency"], "USD");
    }

    #[tokio::test]
    async fn test_whiteboard_notes_crud() {
        let config = AppConfig::load();
        let db = match Database::connect_and_migrate(&config.database).await {
            Ok(db) => db,
            Err(err) => {
                eprintln!("Skipping test_whiteboard_notes_crud: PostgreSQL database unavailable ({err})");
                return;
            }
        };
        let hub = Arc::new(RoomHub::new(config.spatial.clone()));
        let state = Arc::new(AppState { db, hub, config });
        let app = create_app(state.clone());

        // Ensure a test room exists
        let (room, _) = state
            .db
            .create_room(
                &crate::models::CreateRoomRequest {
                    name: "Test Whiteboard Lounge".to_string(),
                    slug: Some("test-whiteboard-lounge".to_string()),
                    description: Some("Automated test lounge".to_string()),
                    width: Some(30),
                    height: Some(20),
                    pricing_tier: Some("free".to_string()),
                },
                None,
            )
            .await
            .unwrap();

        // 1. Post a new note
        let note_payload = serde_json::json!({
            "author_name": "Test Architect",
            "content": "Verify spatial audio attenuation and auto-migrations",
            "color_class": "bg-amber-100 text-amber-950 border-amber-300"
        });

        let post_resp = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/rooms/{}/notes", room.slug))
                    .header("content-type", "application/json")
                    .body(Body::from(serde_json::to_vec(&note_payload).unwrap()))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(post_resp.status(), StatusCode::CREATED);
        let body = post_resp.into_body().collect().await.unwrap().to_bytes();
        let created_note: serde_json::Value = serde_json::from_slice(&body).unwrap();
        let note_id = created_note["id"].as_str().unwrap().to_string();

        // 2. List notes
        let list_resp = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!("/api/rooms/{}/notes", room.slug))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(list_resp.status(), StatusCode::OK);

        // 3. Delete note
        let delete_resp = app
            .oneshot(
                Request::builder()
                    .method("DELETE")
                    .uri(format!("/api/rooms/{}/notes/{}", room.slug, note_id))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(delete_resp.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn test_peer_default_media_state() {
        use crate::realtime::room_hub::RoomSession;
        let config = AppConfig::default();
        let layout = crate::models::RoomLayout {
            id: uuid::Uuid::new_v4(),
            room_id: uuid::Uuid::new_v4(),
            width: 30,
            height: 20,
            spawn_x: 6,
            spawn_y: 6,
            tilemap_data: serde_json::json!({}),
            collision_mask: serde_json::json!([]),
            interactive_objects: serde_json::json!([]),
            private_zones: serde_json::json!([]),
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
        };
        let mut session = RoomSession::new(
            "test-room".to_string(),
            "Test Room".to_string(),
            layout,
            config.spatial,
        );
        let (tx, _rx) = tokio::sync::mpsc::unbounded_channel();
        let avatar = crate::models::AvatarConfig {
            skin: "tan".to_string(),
            hair: "short".to_string(),
            hair_color: "#2563eb".to_string(),
            outfit: "hoodie".to_string(),
            outfit_color: "#6366f1".to_string(),
            hat: "none".to_string(),
            character: Some("hoodie".to_string()),
        };

        let (_peer_id, welcome) = session.join(
            uuid::Uuid::new_v4(),
            "Alex R.".to_string(),
            avatar,
            None,
            None,
            tx,
        );

        if let crate::realtime::protocol::ServerMessage::Welcome { self_peer, .. } = welcome {
            assert!(self_peer.mic_muted, "Mic should be muted by default");
            assert!(self_peer.cam_off, "Camera should be off by default");
        } else {
            panic!("Expected Welcome message");
        }
    }

    #[tokio::test]
    async fn test_screensharing_shared_cursor_and_drawing() {
        use crate::realtime::protocol::{ClientMessage, ServerMessage};
        use crate::realtime::room_hub::RoomSession;

        let config = AppConfig::default();
        let layout = crate::models::RoomLayout {
            id: uuid::Uuid::new_v4(),
            room_id: uuid::Uuid::new_v4(),
            width: 30,
            height: 20,
            spawn_x: 5,
            spawn_y: 5,
            tilemap_data: serde_json::json!({}),
            collision_mask: serde_json::json!([]),
            interactive_objects: serde_json::json!([]),
            private_zones: serde_json::json!([]),
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
        };
        let mut session = RoomSession::new(
            "collab-stage".to_string(),
            "Presentation Stage".to_string(),
            layout,
            config.spatial,
        );

        let (tx1, _rx1) = tokio::sync::mpsc::unbounded_channel();
        let (tx2, mut rx2) = tokio::sync::mpsc::unbounded_channel();

        let avatar1 = crate::models::AvatarConfig {
            skin: "fair".to_string(),
            hair: "short".to_string(),
            hair_color: "#14b8a6".to_string(),
            outfit: "tshirt".to_string(),
            outfit_color: "#14b8a6".to_string(),
            hat: "none".to_string(),
            character: Some("alex".to_string()),
        };
        let avatar2 = crate::models::AvatarConfig {
            skin: "tan".to_string(),
            hair: "long".to_string(),
            hair_color: "#ec4899".to_string(),
            outfit: "suit".to_string(),
            outfit_color: "#ec4899".to_string(),
            hat: "none".to_string(),
            character: Some("sarah".to_string()),
        };

        let (peer1_id, _) = session.join(uuid::Uuid::new_v4(), "Alex R.".to_string(), avatar1, None, None, tx1);
        let (_peer2_id, _) = session.join(uuid::Uuid::new_v4(), "Sarah C.".to_string(), avatar2, None, None, tx2);

        // Clear peer2 welcome / peer joined messages
        while rx2.try_recv().is_ok() {}

        // Peer 1 moves cursor on screen sharing stage
        session.handle_cursor_move(&peer1_id, "screen".to_string(), 0.45, 0.72);

        let received = rx2.recv().await.expect("Peer 2 should receive cursor move");
        if let ServerMessage::PeerCursorMoved { peer_id, display_name, stage, x, y, .. } = received {
            assert_eq!(peer_id, peer1_id);
            assert_eq!(display_name, "Alex R.");
            assert_eq!(stage, "screen");
            assert!((x - 0.45).abs() < 1e-4);
            assert!((y - 0.72).abs() < 1e-4);
        } else {
            panic!("Expected PeerCursorMoved message");
        }

        // Peer 1 draws a laser or pen annotation stroke
        let stroke_json = serde_json::json!({
            "tool": "laser",
            "color": "#14b8a6",
            "size": 4,
            "points": [{"x": 0.1, "y": 0.2}, {"x": 0.15, "y": 0.25}]
        });
        session.handle_screen_annotation(&peer1_id, stroke_json.clone());

        let received_stroke = rx2.recv().await.expect("Peer 2 should receive stroke sync");
        if let ServerMessage::ScreenAnnotationSync { from_peer_id, stroke } = received_stroke {
            assert_eq!(from_peer_id, peer1_id);
            assert_eq!(stroke["tool"], "laser");
        } else {
            panic!("Expected ScreenAnnotationSync message");
        }

        // Test serialization / deserialization of ClientMessage
        let cursor_msg = ClientMessage::CursorMove {
            stage: "screen".to_string(),
            x: 0.5,
            y: 0.5,
        };
        let serialized = serde_json::to_string(&cursor_msg).unwrap();
        let deserialized: ClientMessage = serde_json::from_str(&serialized).unwrap();
        if let ClientMessage::CursorMove { stage, x, y } = deserialized {
            assert_eq!(stage, "screen");
            assert_eq!(x, 0.5);
            assert_eq!(y, 0.5);
        } else {
            panic!("Deserialization failed");
        }

        let clear_json = r#"{"type":"ClearScreenAnnotations","payload":{}}"#;
        let clear_res: Result<ClientMessage, _> = serde_json::from_str(clear_json);
        assert!(clear_res.is_ok());
    }

    #[tokio::test]
    async fn test_embedded_frontend_root_and_spa_routing() {
        let state = create_test_state();
        let app = create_app(state);

        // 1. Root route "/" should serve embedded frontend index.html
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.headers().get("content-type").unwrap(),
            "text/html; charset=utf-8"
        );

        // 2. Client-side SPA route "/rooms/lounge-test" should also serve index.html
        let response_spa = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/rooms/lounge-test")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response_spa.status(), StatusCode::OK);
        assert_eq!(
            response_spa.headers().get("content-type").unwrap(),
            "text/html; charset=utf-8"
        );

        // 3. Unknown API route "/api/unknown-endpoint" should return 404 and NOT serve index.html
        let response_api_404 = app
            .oneshot(
                Request::builder()
                    .uri("/api/unknown-endpoint")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response_api_404.status(), StatusCode::NOT_FOUND);
        assert_eq!(
            response_api_404.headers().get("content-type").unwrap(),
            "application/json"
        );
    }
}


