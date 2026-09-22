use crate::models::{AvatarConfig, RoomLayout};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeerState {
    pub peer_id: String,
    pub user_id: Uuid,
    pub display_name: String,
    pub avatar_config: AvatarConfig,
    pub x: f64,
    pub y: f64,
    pub direction: String,
    pub state: String,
    pub mic_muted: bool,
    pub cam_off: bool,
    pub screen_sharing: bool,
    pub private_zone_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProximityInfo {
    pub peer_id: String,
    pub distance: f64,
    pub in_range: bool,
    pub private_zone_id: Option<String>,
    pub volume: f64, // 0.0 to 1.0 based on distance falloff
    pub pan: f64,    // -1.0 (left) to 1.0 (right) stereo panning
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum ClientMessage {
    Join {
        user_id: Uuid,
        display_name: String,
        avatar_config: AvatarConfig,
        initial_x: Option<f64>,
        initial_y: Option<f64>,
    },
    Move {
        x: f64,
        y: f64,
        direction: String,
        state: String,
    },
    Interact {
        object_id: String,
        action: String,
        data: Option<serde_json::Value>,
    },
    ChatMessage {
        text: String,
        channel: String, // "room" or "proximity"
    },
    Signal {
        target_peer_id: String,
        data: serde_json::Value,
    },
    MediaState {
        mic_muted: bool,
        cam_off: bool,
        screen_sharing: bool,
    },
    WhiteboardStroke {
        stroke: serde_json::Value,
    },
    CursorMove {
        stage: String,
        x: f64,
        y: f64,
    },
    ScreenAnnotation {
        stroke: serde_json::Value,
    },
    ClearScreenAnnotations {},
    Emote {
        emoji: String,
    },
    UpdateProfile {
        display_name: String,
        avatar_config: AvatarConfig,
    },
    Ping {
        timestamp: i64,
    },
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", content = "payload")]
pub enum ServerMessage {
    Welcome {
        session_id: String,
        room_slug: String,
        room_name: String,
        layout: RoomLayout,
        self_peer: PeerState,
        peers: Vec<PeerState>,
    },
    PeerJoined {
        peer: PeerState,
    },
    PeerMoved {
        peer_id: String,
        x: f64,
        y: f64,
        direction: String,
        state: String,
        private_zone_id: Option<String>,
    },
    PeerLeft {
        peer_id: String,
    },
    PeerEmoted {
        peer_id: String,
        emoji: String,
    },
    PeerProfileUpdated {
        peer_id: String,
        display_name: String,
        avatar_config: AvatarConfig,
    },
    ProximityUpdate {
        peers: Vec<ProximityInfo>,
    },
    SignalRelay {
        from_peer_id: String,
        data: serde_json::Value,
    },
    ChatMessage {
        id: String,
        from_peer_id: String,
        display_name: String,
        text: String,
        channel: String,
        timestamp: i64,
    },
    ObjectInteracted {
        object_id: String,
        peer_id: String,
        action: String,
        state: serde_json::Value,
    },
    MediaStateChanged {
        peer_id: String,
        mic_muted: bool,
        cam_off: bool,
        screen_sharing: bool,
    },
    WhiteboardSync {
        from_peer_id: String,
        stroke: serde_json::Value,
    },
    PeerCursorMoved {
        peer_id: String,
        display_name: String,
        color: String,
        stage: String,
        x: f64,
        y: f64,
    },
    ScreenAnnotationSync {
        from_peer_id: String,
        stroke: serde_json::Value,
    },
    ScreenAnnotationsCleared {
        from_peer_id: String,
    },
    WhiteboardNoteAdded {
        note: crate::models::WhiteboardNote,
    },
    WhiteboardNoteRemoved {
        note_id: String,
    },
    Pong {
        timestamp: i64,
    },
    Error {
        message: String,
    },
}

