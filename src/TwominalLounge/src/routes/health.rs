use axum::Json;
use serde::Serialize;

#[derive(Serialize)]
pub struct HealthResponse {
    pub status: &'static str,
    pub service: &'static str,
    pub version: &'static str,
    pub timestamp: i64,
}

pub async fn health_check() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        service: "twominal-lounge",
        version: env!("CARGO_PKG_VERSION"),
        timestamp: chrono::Utc::now().timestamp(),
    })
}
