use crate::config::DatabaseConfig;
use crate::models::{InteractiveObject, PrivateZone, Room, RoomLayout, User};
use serde_json::json;
use sqlx::migrate::MigrateDatabase;
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use uuid::Uuid;

#[derive(Clone)]
pub struct Database {
    pool: PgPool,
}

impl Database {
    pub async fn connect_and_migrate(config: &DatabaseConfig) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        if config.auto_migrate {
            if !sqlx::Postgres::database_exists(&config.url).await.unwrap_or(false) {
                tracing::info!("Target database does not exist. Creating database automatically...");
                match sqlx::Postgres::create_database(&config.url).await {
                    Ok(()) => tracing::info!("Database created successfully"),
                    Err(e) => tracing::warn!(error = %e, "Attempted to auto-create database; proceeding with connection"),
                }
            }
        }

        tracing::info!(
            url = %config.url,
            max_conn = config.max_connections,
            "Connecting to PostgreSQL database..."
        );

        let pool = PgPoolOptions::new()
            .max_connections(config.max_connections)
            .min_connections(config.min_connections)
            .acquire_timeout(std::time::Duration::from_secs(5))
            .connect(&config.url)
            .await?;

        tracing::info!("Connected to PostgreSQL successfully");

        if config.auto_migrate {
            tracing::info!("Executing database auto-migrations via sqlx::migrate!()...");
            sqlx::migrate!("./migrations").run(&pool).await?;
            tracing::info!("Database auto-migrations executed successfully");
        }

        let db = Self { pool };
        db.seed_defaults_if_needed().await?;

        Ok(db)
    }

    pub fn connect_lazy(config: &DatabaseConfig) -> Result<Self, sqlx::Error> {
        let pool = PgPoolOptions::new()
            .max_connections(config.max_connections)
            .connect_lazy(&config.url)?;

        Ok(Self { pool })
    }

    pub fn pool(&self) -> &PgPool {
        &self.pool
    }

    /// Initialization hook on database connection. Strictly NO default room is seeded;
    /// users must create rooms on-demand or join via room code / shared URL.
    pub async fn seed_defaults_if_needed(&self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        tracing::info!("Database initialized. Strictly NO default room seeded; users create rooms or join via room code / shared URL.");
        Ok(())
    }


    pub async fn create_user(&self, username: &str, display_name: &str, avatar: serde_json::Value) -> Result<User, sqlx::Error> {
        let user = sqlx::query_as::<_, User>(
            r#"
            INSERT INTO users (username, display_name, avatar_config, license_type)
            VALUES ($1, $2, $3, 'free')
            ON CONFLICT (username) DO UPDATE
            SET display_name = EXCLUDED.display_name, avatar_config = EXCLUDED.avatar_config, updated_at = NOW()
            RETURNING *
            "#,
        )
        .bind(username)
        .bind(display_name)
        .bind(avatar)
        .fetch_one(&self.pool)
        .await?;

        Ok(user)
    }

    pub async fn get_user(&self, id: Uuid) -> Result<Option<User>, sqlx::Error> {
        sqlx::query_as::<_, User>("SELECT * FROM users WHERE id = $1")
            .bind(id)
            .fetch_optional(&self.pool)
            .await
    }

    pub async fn update_user_profile(
        &self,
        user_id: Uuid,
        display_name: Option<String>,
        avatar_config: Option<serde_json::Value>,
    ) -> Result<Option<User>, sqlx::Error> {
        let current = self.get_user(user_id).await?;
        if let Some(user) = current {
            let new_name = display_name.unwrap_or(user.display_name);
            let new_avatar = avatar_config.unwrap_or(user.avatar_config);
            let updated = sqlx::query_as::<_, User>(
                r#"
                UPDATE users
                SET display_name = $1, avatar_config = $2, updated_at = NOW()
                WHERE id = $3
                RETURNING *
                "#,
            )
            .bind(new_name)
            .bind(new_avatar)
            .bind(user_id)
            .fetch_one(&self.pool)
            .await?;
            Ok(Some(updated))
        } else {
            Ok(None)
        }
    }

    pub async fn list_whiteboard_notes(&self, room_id: Uuid) -> Result<Vec<crate::models::WhiteboardNote>, sqlx::Error> {
        sqlx::query_as::<_, crate::models::WhiteboardNote>(
            "SELECT * FROM whiteboard_notes WHERE room_id = $1 ORDER BY created_at DESC"
        )
        .bind(room_id)
        .fetch_all(&self.pool)
        .await
    }

    pub async fn create_whiteboard_note(
        &self,
        room_id: Uuid,
        author_name: &str,
        content: &str,
        color_class: &str,
    ) -> Result<crate::models::WhiteboardNote, sqlx::Error> {
        sqlx::query_as::<_, crate::models::WhiteboardNote>(
            r#"
            INSERT INTO whiteboard_notes (room_id, author_name, content, color_class)
            VALUES ($1, $2, $3, $4)
            RETURNING *
            "#,
        )
        .bind(room_id)
        .bind(author_name)
        .bind(content)
        .bind(color_class)
        .fetch_one(&self.pool)
        .await
    }

    pub async fn delete_whiteboard_note(&self, note_id: Uuid) -> Result<bool, sqlx::Error> {
        let rows = sqlx::query("DELETE FROM whiteboard_notes WHERE id = $1")
            .bind(note_id)
            .execute(&self.pool)
            .await?
            .rows_affected();
        Ok(rows > 0)
    }

    pub async fn list_rooms(&self) -> Result<Vec<Room>, sqlx::Error> {
        sqlx::query_as::<_, Room>("SELECT * FROM rooms WHERE is_active = true ORDER BY created_at ASC")
            .fetch_all(&self.pool)
            .await
    }

    pub async fn get_room_by_slug(&self, slug: &str) -> Result<Option<Room>, sqlx::Error> {
        let trimmed = slug.trim();
        if let Ok(id) = Uuid::parse_str(trimmed) {
            sqlx::query_as::<_, Room>(
                "SELECT * FROM rooms WHERE (id = $1 OR LOWER(slug) = LOWER($2)) AND is_active = true",
            )
            .bind(id)
            .bind(trimmed)
            .fetch_optional(&self.pool)
            .await
        } else {
            sqlx::query_as::<_, Room>(
                "SELECT * FROM rooms WHERE LOWER(slug) = LOWER($1) AND is_active = true",
            )
            .bind(trimmed)
            .fetch_optional(&self.pool)
            .await
        }
    }

    pub async fn get_room_layout(&self, room_id: Uuid) -> Result<Option<RoomLayout>, sqlx::Error> {
        sqlx::query_as::<_, RoomLayout>("SELECT * FROM room_layouts WHERE room_id = $1")
            .bind(room_id)
            .fetch_optional(&self.pool)
            .await
    }

    pub async fn update_room_layout(&self, room_id: Uuid, layout: &crate::models::UpdateLayoutRequest) -> Result<(), sqlx::Error> {
        let current = self.get_room_layout(room_id).await?;
        if let Some(curr) = current {
            let spawn_x = layout.spawn_x.unwrap_or(curr.spawn_x);
            let spawn_y = layout.spawn_y.unwrap_or(curr.spawn_y);
            let tilemap_data = layout.tilemap_data.clone().unwrap_or(curr.tilemap_data);
            let collision_mask = layout.collision_mask.clone().unwrap_or(curr.collision_mask);
            let interactive_objects = layout
                .interactive_objects
                .as_ref()
                .map(|objs| json!(objs))
                .unwrap_or(curr.interactive_objects);
            let private_zones = layout
                .private_zones
                .as_ref()
                .map(|zones| json!(zones))
                .unwrap_or(curr.private_zones);

            sqlx::query(
                r#"
                UPDATE room_layouts
                SET spawn_x = $1, spawn_y = $2, tilemap_data = $3,
                    collision_mask = $4, interactive_objects = $5, private_zones = $6, updated_at = NOW()
                WHERE room_id = $7
                "#,
            )
            .bind(spawn_x)
            .bind(spawn_y)
            .bind(tilemap_data)
            .bind(collision_mask)
            .bind(interactive_objects)
            .bind(private_zones)
            .bind(room_id)
            .execute(&self.pool)
            .await?;
        }
        Ok(())
    }

    pub async fn create_room(&self, req: &crate::models::CreateRoomRequest, owner_id: Option<Uuid>) -> Result<(Room, RoomLayout), sqlx::Error> {
        let base_slug = match &req.slug {
            Some(s) if !s.trim().is_empty() => s
                .trim()
                .to_lowercase()
                .replace(|c: char| !c.is_alphanumeric() && c != '-' && c != '_', "-")
                .trim_matches('-')
                .to_string(),
            _ => {
                let s = req
                    .name
                    .trim()
                    .to_lowercase()
                    .replace(|c: char| !c.is_alphanumeric(), "-")
                    .trim_matches('-')
                    .to_string();
                if s.is_empty() {
                    format!("room-{}", &Uuid::new_v4().to_string()[..6])
                } else {
                    s
                }
            }
        };

        // Ensure unique slug
        let mut slug = base_slug.clone();
        let mut attempt = 0;
        while self.get_room_by_slug(&slug).await?.is_some() {
            attempt += 1;
            let suffix = &Uuid::new_v4().to_string()[..4];
            slug = format!("{}-{}", base_slug, suffix);
            if attempt > 10 {
                slug = format!("{}-{}", base_slug, Uuid::new_v4());
                break;
            }
        }

        let room_id = Uuid::new_v4();
        let width = req.width.unwrap_or(30).clamp(15, 60);
        let height = req.height.unwrap_or(20).clamp(12, 50);
        let pricing = req.pricing_tier.clone().unwrap_or_else(|| "free".to_string());
        let desc = req.description.clone().unwrap_or_default();

        let room = sqlx::query_as::<_, Room>(
            r#"
            INSERT INTO rooms (id, slug, name, description, owner_id, max_occupancy, pricing_tier, is_active)
            VALUES ($1, $2, $3, $4, $5, 25, $6, true)
            RETURNING *
            "#,
        )
        .bind(room_id)
        .bind(&slug)
        .bind(&req.name)
        .bind(desc)
        .bind(owner_id)
        .bind(pricing)
        .fetch_one(&self.pool)
        .await?;

        // Generate baseline floor and collision
        let ground = vec![vec![1; width as usize]; height as usize];
        let mut walls = vec![vec![0; width as usize]; height as usize];
        let mut collision = vec![vec![false; width as usize]; height as usize];

        // Outer perimeter walls
        for x in 0..width as usize {
            walls[0][x] = 1;
            walls[height as usize - 1][x] = 1;
            collision[0][x] = true;
            collision[height as usize - 1][x] = true;
        }
        for y in 0..height as usize {
            walls[y][0] = 1;
            walls[y][width as usize - 1] = 1;
            collision[y][0] = true;
            collision[y][width as usize - 1] = true;
        }

        // Functional starter furniture
        let whiteboard_x = (width / 2).max(4);
        let table_x = (width - 9).max(10);
        let table_y = 4;

        let interactive_objects = vec![
            InteractiveObject {
                id: "obj-whiteboard".to_string(),
                object_type: "whiteboard".to_string(),
                x: whiteboard_x,
                y: 2,
                width: 3,
                height: 1,
                direction: Some("down".to_string()),
                properties: json!({ "name": "Team Whiteboard" }),
            },
            InteractiveObject {
                id: "obj-table".to_string(),
                object_type: "desk".to_string(),
                x: table_x,
                y: table_y,
                width: 4,
                height: 2,
                direction: Some("down".to_string()),
                properties: json!({ "name": "Discussion Table" }),
            },
            InteractiveObject {
                id: "obj-chair-1".to_string(),
                object_type: "chair".to_string(),
                x: table_x,
                y: table_y - 1,
                width: 1,
                height: 1,
                direction: Some("down".to_string()),
                properties: json!({ "seat_direction": "down" }),
            },
            InteractiveObject {
                id: "obj-chair-2".to_string(),
                object_type: "chair".to_string(),
                x: table_x + 2,
                y: table_y - 1,
                width: 1,
                height: 1,
                direction: Some("down".to_string()),
                properties: json!({ "seat_direction": "down" }),
            },
            InteractiveObject {
                id: "obj-water-cooler".to_string(),
                object_type: "water_cooler".to_string(),
                x: 4,
                y: 2,
                width: 1,
                height: 1,
                direction: Some("down".to_string()),
                properties: json!({ "name": "Water Cooler" }),
            },
            InteractiveObject {
                id: "obj-couch".to_string(),
                object_type: "couch".to_string(),
                x: 4,
                y: height - 5,
                width: 3,
                height: 1,
                direction: Some("down".to_string()),
                properties: json!({ "name": "Lounge Couch" }),
            },
        ];

        // Mark obstacles as collision
        if (table_y as usize + 1) < height as usize && (table_x as usize + 3) < width as usize {
            for dy in 0..2 {
                for dx in 0..4 {
                    collision[table_y as usize + dy][table_x as usize + dx] = true;
                }
            }
        }
        if 2 < height as usize && 4 < width as usize {
            collision[2][4] = true; // water cooler
        }
        if (height as usize) > 5 && 6 < width as usize {
            for dx in 0..3 {
                collision[height as usize - 5][4 + dx] = true; // couch
            }
        }

        // Private Zone
        let private_zones = vec![PrivateZone {
            id: "zone-pod-1".to_string(),
            name: "Discussion Pod".to_string(),
            x: table_x - 1,
            y: table_y - 2,
            width: 6,
            height: 6,
            color: "#3b82f6".to_string(),
        }];

        let layout = sqlx::query_as::<_, RoomLayout>(
            r#"
            INSERT INTO room_layouts (
                room_id, width, height, spawn_x, spawn_y,
                tilemap_data, collision_mask, interactive_objects, private_zones
            )
            VALUES ($1, $2, $3, 4, 4, $4, $5, $6, $7)
            RETURNING *
            "#,
        )
        .bind(room_id)
        .bind(width)
        .bind(height)
        .bind(json!({ "ground": ground, "walls": walls }))
        .bind(json!(collision))
        .bind(json!(interactive_objects))
        .bind(json!(private_zones))
        .fetch_one(&self.pool)
        .await?;

        // Seed initial whiteboard note for the room
        let _ = self
            .create_whiteboard_note(
                room.id,
                "Twominal System",
                &format!("Welcome to {}! Share this room code: {}", room.name, room.slug),
                "bg-teal-100 text-teal-950 border-teal-300",
            )
            .await;

        Ok((room, layout))
    }

    pub async fn update_user_position(&self, user_id: Uuid, room_id: Uuid, x: f64, y: f64, direction: &str, state: &str) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO user_positions (user_id, room_id, x, y, direction, state, last_seen_at)
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
            ON CONFLICT (user_id, room_id) DO UPDATE
            SET x = EXCLUDED.x, y = EXCLUDED.y, direction = EXCLUDED.direction, state = EXCLUDED.state, last_seen_at = NOW()
            "#,
        )
        .bind(user_id)
        .bind(room_id)
        .bind(x)
        .bind(y)
        .bind(direction)
        .bind(state)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn activate_room_tier(&self, slug: &str, tier: &str) -> Result<bool, sqlx::Error> {
        let max_occ = match tier {
            "pay_per_room" => 50,
            "lifetime" => 100,
            _ => 25,
        };

        let rows = sqlx::query(
            r#"
            UPDATE rooms
            SET pricing_tier = $1, max_occupancy = $2, updated_at = NOW()
            WHERE slug = $3
            "#,
        )
        .bind(tier)
        .bind(max_occ)
        .bind(slug)
        .execute(&self.pool)
        .await?
        .rows_affected();

        Ok(rows > 0)
    }
}
