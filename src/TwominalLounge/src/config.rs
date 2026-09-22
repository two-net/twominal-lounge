use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    pub host: String,
    pub port: u16,
    pub cors_allowed_origins: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseConfig {
    pub url: String,
    pub max_connections: u32,
    pub min_connections: u32,
    pub auto_migrate: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BillingConfig {
    pub model: String,
    pub currency: String,
    pub free_tier_max_occupancy: i32,
    pub pay_per_room_price_cents: i32,
    pub lifetime_license_price_cents: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpatialConfig {
    pub tile_size: u32,
    pub proximity_radius_tiles: f64,
    pub proximity_falloff_tiles: f64,
    pub max_room_width: u32,
    pub max_room_height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoggingConfig {
    pub level: String,
    pub format: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub server: ServerConfig,
    pub database: DatabaseConfig,
    pub billing: BillingConfig,
    pub spatial: SpatialConfig,
    pub logging: LoggingConfig,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            server: ServerConfig {
                host: "0.0.0.0".to_string(),
                port: 3000,
                cors_allowed_origins: vec![
                    "http://localhost:4200".to_string(),
                    "http://127.0.0.1:4200".to_string(),
                    "http://localhost:3000".to_string(),
                ],
            },
            database: DatabaseConfig {
                url: "postgres://postgres:postgres@localhost:5432/twominal_lounge".to_string(),
                max_connections: 10,
                min_connections: 2,
                auto_migrate: true,
            },
            billing: BillingConfig {
                model: "one-time-and-pay-per-room".to_string(),
                currency: "USD".to_string(),
                free_tier_max_occupancy: 5,
                pay_per_room_price_cents: 499,
                lifetime_license_price_cents: 4900,
            },
            spatial: SpatialConfig {
                tile_size: 32,
                proximity_radius_tiles: 5.0,
                proximity_falloff_tiles: 8.0,
                max_room_width: 50,
                max_room_height: 50,
            },
            logging: LoggingConfig {
                level: "debug".to_string(),
                format: "json".to_string(),
            },
        }
    }
}

impl AppConfig {
    /// Load static configuration from file.
    /// Strictly respects the no-.env and no-secret-manager constraint.
    pub fn load() -> Self {
        let mut possible_paths = vec![
            "config.json".to_string(),
            "src/TwominalLounge/config.json".to_string(),
            "../config.json".to_string(),
            "../../config.json".to_string(),
        ];

        if let Ok(env_path) = std::env::var("CONFIG_PATH") {
            possible_paths.insert(0, env_path);
        }

        let mut config = Self::default();
        let mut loaded = false;

        for path_str in &possible_paths {
            let path = Path::new(path_str);
            if path.exists() {
                match fs::read_to_string(path) {
                    Ok(content) => match serde_json::from_str::<AppConfig>(&content) {
                        Ok(cfg) => {
                            tracing::info!(path = %path_str, "Static configuration loaded successfully");
                            config = cfg;
                            loaded = true;
                            break;
                        }
                        Err(err) => {
                            tracing::warn!(path = %path_str, error = %err, "Failed to parse config file, falling back to defaults");
                        }
                    },
                    Err(err) => {
                        tracing::warn!(path = %path_str, error = %err, "Failed to read config file");
                    }
                }
            }
        }

        if !loaded {
            tracing::info!("No static config.json found at expected locations; using built-in static defaults");
        }

        if let Ok(db_url) = std::env::var("DATABASE_URL") {
            if !db_url.trim().is_empty() {
                tracing::info!(url = %db_url, "Using DATABASE_URL from environment");
                config.database.url = db_url;
            }
        }

        config
    }
}
