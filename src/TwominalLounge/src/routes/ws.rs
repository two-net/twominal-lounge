use crate::realtime::protocol::{ClientMessage, ServerMessage};
use crate::AppState;
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, State,
    },
    response::Response,
};
use futures_util::{SinkExt, StreamExt};
use std::sync::Arc;
use tokio::sync::mpsc;
use uuid::Uuid;

pub async fn ws_handler(
    State(state): State<Arc<AppState>>,
    Path(slug): Path<String>,
    ws: WebSocketUpgrade,
) -> Response {
    ws.on_upgrade(move |socket| handle_socket(socket, state, slug))
}

async fn handle_socket(socket: WebSocket, state: Arc<AppState>, slug: String) {
    let (mut ws_sender, mut ws_receiver) = socket.split();

    // Ensure room session is active in hub
    let room_exists = {
        let rooms = state.hub.rooms.read().await;
        rooms.contains_key(&slug)
    };

    if !room_exists {
        if let Ok(Some(room)) = state.db.get_room_by_slug(&slug).await {
            if let Ok(Some(layout)) = state.db.get_room_layout(room.id).await {
                state.hub.get_or_create_room(&slug, &room.name, layout).await;
            }
        }
    }

    let (tx, mut rx) = mpsc::unbounded_channel::<ServerMessage>();

    // Forward outbound messages from channel to WebSocket
    let send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if let Ok(json) = serde_json::to_string(&msg) {
                if ws_sender.send(Message::Text(json.into())).await.is_err() {
                    break;
                }
            }
        }
    });

    let mut current_peer_id: Option<String> = None;
    let mut current_user_id: Option<Uuid> = None;
    let mut current_room_id: Option<Uuid> = None;

    if let Ok(Some(room)) = state.db.get_room_by_slug(&slug).await {
        current_room_id = Some(room.id);
    }

    tracing::info!(room = %slug, "WebSocket connection opened");

    while let Some(Ok(msg)) = ws_receiver.next().await {
        match msg {
            Message::Text(text) => {
                match serde_json::from_str::<ClientMessage>(&text) {
                    Ok(client_msg) => match client_msg {
                        ClientMessage::Join {
                            user_id,
                            display_name,
                            avatar_config,
                            initial_x,
                            initial_y,
                        } => {
                            current_user_id = Some(user_id);
                            let mut rooms = state.hub.rooms.write().await;
                            if let Some(session) = rooms.get_mut(&slug) {
                                let (peer_id, welcome) = session.join(
                                    user_id,
                                    display_name,
                                    avatar_config,
                                    initial_x,
                                    initial_y,
                                    tx.clone(),
                                );
                                current_peer_id = Some(peer_id);
                                let _ = tx.send(welcome);
                            } else {
                                let _ = tx.send(ServerMessage::Error {
                                    message: format!("Room '{}' is not currently active", slug),
                                });
                            }
                        }
                        ClientMessage::Move {
                            x,
                            y,
                            direction,
                            state: motion_state,
                        } => {
                            if let Some(ref peer_id) = current_peer_id {
                                let mut rooms = state.hub.rooms.write().await;
                                if let Some(session) = rooms.get_mut(&slug) {
                                    session.handle_move(
                                        peer_id,
                                        x,
                                        y,
                                        direction.clone(),
                                        motion_state.clone(),
                                    );
                                }
                            }
                        }
                        ClientMessage::Interact {
                            object_id,
                            action,
                            data,
                        } => {
                            if let Some(ref peer_id) = current_peer_id {
                                let rooms = state.hub.rooms.read().await;
                                if let Some(session) = rooms.get(&slug) {
                                    session.handle_interact(peer_id, object_id, action, data);
                                }
                            }
                        }
                        ClientMessage::ChatMessage { text, channel } => {
                            if let Some(ref peer_id) = current_peer_id {
                                let rooms = state.hub.rooms.read().await;
                                if let Some(session) = rooms.get(&slug) {
                                    session.handle_chat(peer_id, text, channel);
                                }
                            }
                        }
                        ClientMessage::Signal {
                            target_peer_id,
                            data,
                        } => {
                            if let Some(ref peer_id) = current_peer_id {
                                let rooms = state.hub.rooms.read().await;
                                if let Some(session) = rooms.get(&slug) {
                                    session.handle_signal(peer_id, &target_peer_id, data);
                                }
                            }
                        }
                        ClientMessage::MediaState {
                            mic_muted,
                            cam_off,
                            screen_sharing,
                        } => {
                            if let Some(ref peer_id) = current_peer_id {
                                let mut rooms = state.hub.rooms.write().await;
                                if let Some(session) = rooms.get_mut(&slug) {
                                    session.handle_media_state(
                                        peer_id,
                                        mic_muted,
                                        cam_off,
                                        screen_sharing,
                                    );
                                }
                            }
                        }
                        ClientMessage::WhiteboardStroke { stroke } => {
                            if let Some(ref peer_id) = current_peer_id {
                                let rooms = state.hub.rooms.read().await;
                                if let Some(session) = rooms.get(&slug) {
                                    session.handle_whiteboard(peer_id, stroke);
                                }
                            }
                        }
                        ClientMessage::CursorMove { stage, x, y } => {
                            if let Some(ref peer_id) = current_peer_id {
                                let rooms = state.hub.rooms.read().await;
                                if let Some(session) = rooms.get(&slug) {
                                    session.handle_cursor_move(peer_id, stage, x, y);
                                }
                            }
                        }
                        ClientMessage::ScreenAnnotation { stroke } => {
                            if let Some(ref peer_id) = current_peer_id {
                                let rooms = state.hub.rooms.read().await;
                                if let Some(session) = rooms.get(&slug) {
                                    session.handle_screen_annotation(peer_id, stroke);
                                }
                            }
                        }
                        ClientMessage::ClearScreenAnnotations {} => {
                            if let Some(ref peer_id) = current_peer_id {
                                let rooms = state.hub.rooms.read().await;
                                if let Some(session) = rooms.get(&slug) {
                                    session.handle_clear_screen_annotations(peer_id);
                                }
                            }
                        }
                        ClientMessage::Emote { emoji } => {
                            if let Some(ref peer_id) = current_peer_id {
                                let rooms = state.hub.rooms.read().await;
                                if let Some(session) = rooms.get(&slug) {
                                    session.handle_emote(peer_id, emoji);
                                }
                            }
                        }
                        ClientMessage::UpdateProfile { display_name, avatar_config } => {
                            if let Some(ref peer_id) = current_peer_id {
                                let mut rooms = state.hub.rooms.write().await;
                                if let Some(session) = rooms.get_mut(&slug) {
                                    session.handle_profile_update(peer_id, display_name.clone(), avatar_config.clone());
                                }
                                if let Some(u_id) = current_user_id {
                                    let db = state.db.clone();
                                    let av_json = serde_json::to_value(&avatar_config).unwrap_or(serde_json::Value::Null);
                                    tokio::spawn(async move {
                                        let _ = db.update_user_profile(u_id, Some(display_name), Some(av_json)).await;
                                    });
                                }
                            }
                        }
                        ClientMessage::Ping { timestamp } => {
                            let _ = tx.send(ServerMessage::Pong { timestamp });
                        }

                    },
                    Err(err) => {
                        tracing::warn!(error = %err, "Failed to parse client WebSocket message");
                    }
                }
            }
            Message::Close(_) => break,
            _ => {}
        }
    }

    // Cleanup session on disconnect
    if let Some(ref peer_id) = current_peer_id {
        let mut rooms = state.hub.rooms.write().await;
        if let Some(session) = rooms.get_mut(&slug) {
            if let Some(last_peer) = session.leave(peer_id) {
                if let (Some(u_id), Some(r_id)) = (current_user_id, current_room_id) {
                    let db = state.db.clone();
                    tokio::spawn(async move {
                        let _ = db
                            .update_user_position(
                                u_id,
                                r_id,
                                last_peer.x,
                                last_peer.y,
                                &last_peer.direction,
                                &last_peer.state,
                            )
                            .await;
                    });
                }
            }
        }
    }

    send_task.abort();
    tracing::info!(room = %slug, peer = ?current_peer_id, "WebSocket connection closed");
}
