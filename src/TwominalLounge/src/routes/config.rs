use crate::AppState;
use axum::{extract::State, Json};
use serde::Serialize;
use std::sync::Arc;

#[derive(Serialize)]
pub struct PublicConfig {
    pub app_name: &'static str,
    pub version: &'static str,
    pub tile_size: u32,
    pub proximity_radius_tiles: f64,
    pub proximity_falloff_tiles: f64,
    pub ice_servers: Vec<IceServer>,
}

#[derive(Serialize)]
pub struct IceServer {
    pub urls: Vec<&'static str>,
}

pub async fn get_public_config(
    State(state): State<Arc<AppState>>,
) -> Json<PublicConfig> {
    let cfg = &state.config.spatial;

    Json(PublicConfig {
        app_name: "Twominal Lounge",
        version: env!("CARGO_PKG_VERSION"),
        tile_size: cfg.tile_size,
        proximity_radius_tiles: cfg.proximity_radius_tiles,
        proximity_falloff_tiles: cfg.proximity_falloff_tiles,
        ice_servers: vec![
            IceServer {
                urls: vec![
                    "stun:stun.l.google.com:19302",
                    "stun:stun1.l.google.com:19302",
                ],
            },
        ],
    })
}

pub async fn get_raw_config(
    State(state): State<Arc<AppState>>,
) -> Json<crate::config::AppConfig> {
    Json(state.config.clone())
}

