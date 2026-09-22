use std::net::SocketAddr;
use std::sync::Arc;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};
use twominal_lounge::config::AppConfig;
use twominal_lounge::db::Database;
use twominal_lounge::realtime::RoomHub;
use twominal_lounge::{create_app, AppState};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // 1. Structured Logging Initialization (Observability requirement)
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| "twominal_lounge=debug,tower_http=info,sqlx=warn".into());

    tracing_subscriber::registry()
        .with(filter)
        .with(tracing_subscriber::fmt::layer().with_target(true))
        .init();

    tracing::info!(
        app = "Twominal Lounge",
        version = env!("CARGO_PKG_VERSION"),
        "Starting 2D Spatial Video & Interactive Lounge Service..."
    );

    // 2. Static Configuration Loading (Strictly NO .env constraint)
    let config = AppConfig::load();

    // 3. PostgreSQL Database Connection & Auto-migration
    let db = Database::connect_and_migrate(&config.database).await?;

    // 4. Real-time Spatial Room Hub Setup
    let hub = Arc::new(RoomHub::new(config.spatial.clone()));

    let app_state = Arc::new(AppState {
        db,
        hub,
        config: config.clone(),
    });

    let app = create_app(app_state);

    let addr = SocketAddr::new(
        config.server.host.parse()?,
        config.server.port,
    );

    tracing::info!(
        address = %addr,
        "Twominal Lounge HTTP & WebSocket gateway listening"
    );

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
