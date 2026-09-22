use crate::models::{ActivateRoomRequest, ActivateRoomResponse, BillingTier};
use crate::AppState;
use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use std::sync::Arc;

pub async fn get_billing_tiers(
    State(state): State<Arc<AppState>>,
) -> Response {
    let cfg = &state.config.billing;

    let tiers = vec![
        BillingTier {
            id: "free".to_string(),
            name: "Free Community Tier".to_string(),
            description: "No subscription required. Perfect for casual drop-in spatial lounge chats and quick standups.".to_string(),
            price_cents: 0,
            currency: cfg.currency.clone(),
            billing_type: "free".to_string(),
            max_occupancy: cfg.free_tier_max_occupancy,
            max_rooms: 1,
            features: vec![
                format!("Up to {} concurrent spatial avatars", cfg.free_tier_max_occupancy),
                "2D top-down grid navigation".to_string(),
                "Real-time WebRTC spatial audio & video".to_string(),
                "Proximity & private sound zones".to_string(),
                "Interactive furniture & whiteboard".to_string(),
            ],
        },
        BillingTier {
            id: "pay_per_room".to_string(),
            name: "Pay-Per-Room Pass".to_string(),
            description: "One-time purchase per room. No recurring subscription. Lifetime access for your team's dedicated lounge space.".to_string(),
            price_cents: cfg.pay_per_room_price_cents,
            currency: cfg.currency.clone(),
            billing_type: "pay_per_room".to_string(),
            max_occupancy: 50,
            max_rooms: 1,
            features: vec![
                "Up to 50 concurrent participants per room".to_string(),
                "One-time payment - NO recurring subscription".to_string(),
                "Custom visual tilemap & layout editor".to_string(),
                "Persistent shared whiteboard & meeting notes".to_string(),
                "Dedicated room URL slug".to_string(),
            ],
        },
        BillingTier {
            id: "lifetime".to_string(),
            name: "Founder Lifetime License".to_string(),
            description: "Single one-time payment for unlimited rooms and enterprise-grade concurrency with zero subscriptions.".to_string(),
            price_cents: cfg.lifetime_license_price_cents,
            currency: cfg.currency.clone(),
            billing_type: "one_time".to_string(),
            max_occupancy: 100,
            max_rooms: 9999,
            features: vec![
                "Unlimited custom lounge rooms".to_string(),
                "Up to 100 concurrent participants per room".to_string(),
                "All future asset packs & procedural themes".to_string(),
                "Priority WebRTC mesh signaling".to_string(),
                "Forever license with zero monthly fees".to_string(),
            ],
        },
    ];

    (StatusCode::OK, Json(tiers)).into_response()
}

pub async fn activate_room(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<ActivateRoomRequest>,
) -> Response {
    let success = match state
        .db
        .activate_room_tier(&payload.room_slug, &payload.tier_id)
        .await
    {
        Ok(s) => s,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    if !success {
        return (StatusCode::NOT_FOUND, "Room not found").into_response();
    }

    let max_occ = match payload.tier_id.as_str() {
        "pay_per_room" => 50,
        "lifetime" => 100,
        _ => 25,
    };

    tracing::info!(
        room_slug = %payload.room_slug,
        tier = %payload.tier_id,
        "Room license activated (one-time SaaS model)"
    );

    (
        StatusCode::OK,
        Json(ActivateRoomResponse {
            success: true,
            room_slug: payload.room_slug,
            tier: payload.tier_id,
            max_occupancy: max_occ,
            message: "Room license activated successfully without recurring subscription!".to_string(),
        }),
    )
        .into_response()
}
