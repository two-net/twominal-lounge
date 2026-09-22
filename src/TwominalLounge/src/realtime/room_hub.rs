use crate::config::SpatialConfig;
use crate::models::{AvatarConfig, PrivateZone, RoomLayout};
use crate::realtime::protocol::{PeerState, ProximityInfo, ServerMessage};
use crate::realtime::spatial::SpatialEngine;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{mpsc, RwLock};
use uuid::Uuid;

pub struct RoomSession {
    pub room_slug: String,
    pub room_name: String,
    pub layout: RoomLayout,
    pub collision_mask: Vec<Vec<bool>>,
    pub private_zones: Vec<PrivateZone>,
    pub peers: HashMap<String, PeerState>,
    pub senders: HashMap<String, mpsc::UnboundedSender<ServerMessage>>,
    pub spatial: SpatialEngine,
}

impl RoomSession {
    pub fn new(
        room_slug: String,
        room_name: String,
        layout: RoomLayout,
        spatial_config: SpatialConfig,
    ) -> Self {
        let collision_mask: Vec<Vec<bool>> = serde_json::from_value(layout.collision_mask.clone())
            .unwrap_or_else(|_| vec![vec![false; layout.width as usize]; layout.height as usize]);

        let private_zones: Vec<PrivateZone> = serde_json::from_value(layout.private_zones.clone())
            .unwrap_or_default();

        let spatial = SpatialEngine::new(spatial_config);

        Self {
            room_slug,
            room_name,
            layout,
            collision_mask,
            private_zones,
            peers: HashMap::new(),
            senders: HashMap::new(),
            spatial,
        }
    }

    pub fn join(
        &mut self,
        user_id: Uuid,
        display_name: String,
        avatar_config: AvatarConfig,
        initial_x: Option<f64>,
        initial_y: Option<f64>,
        tx: mpsc::UnboundedSender<ServerMessage>,
    ) -> (String, ServerMessage) {
        let peer_id = format!("peer-{}", Uuid::new_v4().simple());
        let x = initial_x.unwrap_or(self.layout.spawn_x as f64);
        let y = initial_y.unwrap_or(self.layout.spawn_y as f64);
        let private_zone_id = self.spatial.find_private_zone(x, y, &self.private_zones);

        let self_peer = PeerState {
            peer_id: peer_id.clone(),
            user_id,
            display_name,
            avatar_config,
            x,
            y,
            direction: "down".to_string(),
            state: "idle".to_string(),
            mic_muted: true,
            cam_off: true,
            screen_sharing: false,
            private_zone_id,
        };

        // Notify existing peers
        let joined_msg = ServerMessage::PeerJoined {
            peer: self_peer.clone(),
        };
        for (_, sender) in &self.senders {
            let _ = sender.send(joined_msg.clone());
        }

        // Prepare welcome message with all existing peers
        let existing_peers: Vec<PeerState> = self.peers.values().cloned().collect();
        let welcome = ServerMessage::Welcome {
            session_id: peer_id.clone(),
            room_slug: self.room_slug.clone(),
            room_name: self.room_name.clone(),
            layout: self.layout.clone(),
            self_peer: self_peer.clone(),
            peers: existing_peers,
        };

        self.peers.insert(peer_id.clone(), self_peer);
        self.senders.insert(peer_id.clone(), tx);

        // Recompute proximity for all peers in the room
        self.broadcast_proximity();

        tracing::info!(
            room = %self.room_slug,
            peer = %peer_id,
            user = %user_id,
            total_peers = self.peers.len(),
            "Peer joined room session"
        );

        (peer_id, welcome)
    }

    pub fn handle_move(&mut self, peer_id: &str, x: f64, y: f64, direction: String, state: String) {
        // Validate collision
        if !self.spatial.is_valid_movement(
            x,
            y,
            self.layout.width,
            self.layout.height,
            &self.collision_mask,
        ) {
            tracing::debug!(peer = %peer_id, x, y, "Movement rejected by server collision engine");
            return;
        }

        let private_zone_id = self.spatial.find_private_zone(x, y, &self.private_zones);

        if let Some(peer) = self.peers.get_mut(peer_id) {
            peer.x = x;
            peer.y = y;
            peer.direction = direction.clone();
            peer.state = state.clone();
            peer.private_zone_id = private_zone_id.clone();
        }

        let moved_msg = ServerMessage::PeerMoved {
            peer_id: peer_id.to_string(),
            x,
            y,
            direction,
            state,
            private_zone_id,
        };

        // Broadcast movement to all other peers
        for (id, sender) in &self.senders {
            if id != peer_id {
                let _ = sender.send(moved_msg.clone());
            }
        }

        // Recompute spatial proximity
        self.broadcast_proximity();
    }

    pub fn handle_media_state(
        &mut self,
        peer_id: &str,
        mic_muted: bool,
        cam_off: bool,
        screen_sharing: bool,
    ) {
        if let Some(peer) = self.peers.get_mut(peer_id) {
            peer.mic_muted = mic_muted;
            peer.cam_off = cam_off;
            peer.screen_sharing = screen_sharing;
        }

        let msg = ServerMessage::MediaStateChanged {
            peer_id: peer_id.to_string(),
            mic_muted,
            cam_off,
            screen_sharing,
        };

        for (id, sender) in &self.senders {
            if id != peer_id {
                let _ = sender.send(msg.clone());
            }
        }
    }

    pub fn handle_chat(&self, peer_id: &str, text: String, channel: String) {
        let Some(sender_peer) = self.peers.get(peer_id) else {
            return;
        };

        let chat_id = format!("msg-{}", Uuid::new_v4().simple());
        let timestamp = chrono::Utc::now().timestamp_millis();

        let msg = ServerMessage::ChatMessage {
            id: chat_id,
            from_peer_id: peer_id.to_string(),
            display_name: sender_peer.display_name.clone(),
            text,
            channel: channel.clone(),
            timestamp,
        };

        if channel == "proximity" {
            // Only send to sender and peers in spatial proximity
            for (id, peer) in &self.peers {
                let (_, _, in_range) = self.spatial.compute_proximity(
                    sender_peer.x,
                    sender_peer.y,
                    &sender_peer.private_zone_id,
                    peer.x,
                    peer.y,
                    &peer.private_zone_id,
                );

                if id == peer_id || in_range {
                    if let Some(sender) = self.senders.get(id) {
                        let _ = sender.send(msg.clone());
                    }
                }
            }
        } else {
            // Room-wide chat
            for (_, sender) in &self.senders {
                let _ = sender.send(msg.clone());
            }
        }
    }

    pub fn handle_signal(&self, from_peer_id: &str, target_peer_id: &str, data: serde_json::Value) {
        if let Some(target_sender) = self.senders.get(target_peer_id) {
            let msg = ServerMessage::SignalRelay {
                from_peer_id: from_peer_id.to_string(),
                data,
            };
            let _ = target_sender.send(msg);
        }
    }

    pub fn handle_whiteboard(&self, from_peer_id: &str, stroke: serde_json::Value) {
        let msg = ServerMessage::WhiteboardSync {
            from_peer_id: from_peer_id.to_string(),
            stroke,
        };
        for (id, sender) in &self.senders {
            if id != from_peer_id {
                let _ = sender.send(msg.clone());
            }
        }
    }

    pub fn handle_cursor_move(&self, from_peer_id: &str, stage: String, x: f64, y: f64) {
        let (display_name, color) = if let Some(peer) = self.peers.get(from_peer_id) {
            let color = if !peer.avatar_config.outfit_color.is_empty() {
                peer.avatar_config.outfit_color.clone()
            } else if !peer.avatar_config.hair_color.is_empty() {
                peer.avatar_config.hair_color.clone()
            } else {
                "#14b8a6".to_string()
            };
            (peer.display_name.clone(), color)
        } else {
            ("Anonymous".to_string(), "#14b8a6".to_string())
        };

        let msg = ServerMessage::PeerCursorMoved {
            peer_id: from_peer_id.to_string(),
            display_name,
            color,
            stage,
            x,
            y,
        };
        for (id, sender) in &self.senders {
            if id != from_peer_id {
                let _ = sender.send(msg.clone());
            }
        }
    }

    pub fn handle_screen_annotation(&self, from_peer_id: &str, stroke: serde_json::Value) {
        let msg = ServerMessage::ScreenAnnotationSync {
            from_peer_id: from_peer_id.to_string(),
            stroke,
        };
        for (id, sender) in &self.senders {
            if id != from_peer_id {
                let _ = sender.send(msg.clone());
            }
        }
    }

    pub fn handle_clear_screen_annotations(&self, from_peer_id: &str) {
        let msg = ServerMessage::ScreenAnnotationsCleared {
            from_peer_id: from_peer_id.to_string(),
        };
        for (_, sender) in &self.senders {
            let _ = sender.send(msg.clone());
        }
    }

    pub fn handle_emote(&self, from_peer_id: &str, emoji: String) {
        let msg = ServerMessage::PeerEmoted {
            peer_id: from_peer_id.to_string(),
            emoji,
        };
        for (_, sender) in &self.senders {
            let _ = sender.send(msg.clone());
        }
    }

    pub fn handle_profile_update(
        &mut self,
        peer_id: &str,
        display_name: String,
        avatar_config: AvatarConfig,
    ) {
        if let Some(peer) = self.peers.get_mut(peer_id) {
            peer.display_name = display_name.clone();
            peer.avatar_config = avatar_config.clone();
        }

        let msg = ServerMessage::PeerProfileUpdated {
            peer_id: peer_id.to_string(),
            display_name,
            avatar_config,
        };
        for (id, sender) in &self.senders {
            if id != peer_id {
                let _ = sender.send(msg.clone());
            }
        }
    }

    pub fn handle_interact(&self, peer_id: &str, object_id: String, action: String, data: Option<serde_json::Value>) {
        let msg = ServerMessage::ObjectInteracted {
            object_id,
            peer_id: peer_id.to_string(),
            action,
            state: data.unwrap_or(serde_json::Value::Null),
        };
        for (_, sender) in &self.senders {
            let _ = sender.send(msg.clone());
        }
    }


    pub fn leave(&mut self, peer_id: &str) -> Option<PeerState> {
        self.senders.remove(peer_id);
        let removed = self.peers.remove(peer_id);

        if removed.is_some() {
            let msg = ServerMessage::PeerLeft {
                peer_id: peer_id.to_string(),
            };
            for (_, sender) in &self.senders {
                let _ = sender.send(msg.clone());
            }

            self.broadcast_proximity();

            tracing::info!(
                room = %self.room_slug,
                peer = %peer_id,
                remaining = self.peers.len(),
                "Peer left room session"
            );
        }

        removed
    }

    /// Broadcasts individual proximity lists to each peer in the room
    fn broadcast_proximity(&self) {
        for (id_a, peer_a) in &self.peers {
            let mut list = Vec::new();

            for (id_b, peer_b) in &self.peers {
                if id_a == id_b {
                    continue;
                }

                let dx = peer_b.x - peer_a.x;
                let dy = peer_b.y - peer_a.y;
                let distance = (dx * dx + dy * dy).sqrt();

                let (volume, pan, in_range) = self.spatial.compute_proximity(
                    peer_a.x,
                    peer_a.y,
                    &peer_a.private_zone_id,
                    peer_b.x,
                    peer_b.y,
                    &peer_b.private_zone_id,
                );

                list.push(ProximityInfo {
                    peer_id: id_b.clone(),
                    distance,
                    in_range,
                    private_zone_id: peer_b.private_zone_id.clone(),
                    volume,
                    pan,
                });
            }

            if let Some(sender) = self.senders.get(id_a) {
                let _ = sender.send(ServerMessage::ProximityUpdate { peers: list });
            }
        }
    }
}

pub struct RoomHub {
    pub rooms: Arc<RwLock<HashMap<String, RoomSession>>>,
    pub spatial_config: SpatialConfig,
}

impl RoomHub {
    pub fn new(spatial_config: SpatialConfig) -> Self {
        Self {
            rooms: Arc::new(RwLock::new(HashMap::new())),
            spatial_config,
        }
    }

    pub async fn get_or_create_room(
        &self,
        slug: &str,
        name: &str,
        layout: RoomLayout,
    ) {
        let mut map = self.rooms.write().await;
        if !map.contains_key(slug) {
            let session = RoomSession::new(
                slug.to_string(),
                name.to_string(),
                layout,
                self.spatial_config.clone(),
            );
            map.insert(slug.to_string(), session);
        }
    }

    pub async fn active_occupancy(&self, slug: &str) -> usize {
        let map = self.rooms.read().await;
        map.get(slug).map(|r| r.peers.len()).unwrap_or(0)
    }

    pub async fn broadcast_whiteboard_note(&self, slug: &str, note: &crate::models::WhiteboardNote) {
        let map = self.rooms.read().await;
        if let Some(session) = map.get(slug) {
            let msg = ServerMessage::WhiteboardNoteAdded {
                note: note.clone(),
            };
            for (_, sender) in &session.senders {
                let _ = sender.send(msg.clone());
            }
        }
    }

    pub async fn broadcast_whiteboard_note_deleted(&self, slug: &str, note_id: uuid::Uuid) {
        let map = self.rooms.read().await;
        if let Some(session) = map.get(slug) {
            let msg = ServerMessage::WhiteboardNoteRemoved {
                note_id: note_id.to_string(),
            };
            for (_, sender) in &session.senders {
                let _ = sender.send(msg.clone());
            }
        }
    }
}

