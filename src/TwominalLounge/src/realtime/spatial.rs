use crate::config::SpatialConfig;
use crate::models::PrivateZone;

pub struct SpatialEngine {
    pub config: SpatialConfig,
}

impl SpatialEngine {
    pub fn new(config: SpatialConfig) -> Self {
        Self { config }
    }

    /// Checks whether (x, y) collides with the room boundary or collision mask
    pub fn is_valid_movement(
        &self,
        x: f64,
        y: f64,
        width: i32,
        height: i32,
        collision_mask: &[Vec<bool>],
    ) -> bool {
        if x < 0.5 || y < 0.5 || x >= (width as f64 - 0.5) || y >= (height as f64 - 0.5) {
            return false;
        }

        let tile_x = x.round() as usize;
        let tile_y = y.round() as usize;

        if tile_y < collision_mask.len() && tile_x < collision_mask[tile_y].len() {
            !collision_mask[tile_y][tile_x]
        } else {
            false
        }
    }

    /// Determines if a position is inside a named private zone
    pub fn find_private_zone(&self, x: f64, y: f64, zones: &[PrivateZone]) -> Option<String> {
        let rounded_x = x.round() as i32;
        let rounded_y = y.round() as i32;

        for zone in zones {
            if rounded_x >= zone.x
                && rounded_x < zone.x + zone.width
                && rounded_y >= zone.y
                && rounded_y < zone.y + zone.height
            {
                return Some(zone.id.clone());
            }
        }
        None
    }

    /// Computes spatial audio volume (0.0 to 1.0), stereo pan (-1.0 to 1.0), and in_range flag
    pub fn compute_proximity(
        &self,
        x1: f64,
        y1: f64,
        zone1: &Option<String>,
        x2: f64,
        y2: f64,
        zone2: &Option<String>,
    ) -> (f64, f64, bool) {
        // Rule 1: If both are in the exact same private zone, full audio connection
        if let (Some(z1), Some(z2)) = (zone1, zone2) {
            if z1 == z2 {
                let dx = x2 - x1;
                let pan = (dx / self.config.proximity_radius_tiles).clamp(-1.0, 1.0);
                return (1.0, pan, true);
            } else {
                // In different private zones: isolated!
                return (0.0, 0.0, false);
            }
        }

        // Rule 2: If one is in a private zone and the other is outside, isolated!
        if zone1.is_some() || zone2.is_some() {
            return (0.0, 0.0, false);
        }

        // Rule 3: Both in open lounge space - spatial distance falloff
        let dx = x2 - x1;
        let dy = y2 - y1;
        let dist = (dx * dx + dy * dy).sqrt();

        if dist > self.config.proximity_falloff_tiles {
            (0.0, 0.0, false)
        } else {
            let in_range = dist <= self.config.proximity_radius_tiles;
            // Quadratic falloff for natural spatial audio experience
            let norm_dist = (dist / self.config.proximity_falloff_tiles).clamp(0.0, 1.0);
            let volume = (1.0 - norm_dist) * (1.0 - norm_dist);
            let pan = (dx / self.config.proximity_radius_tiles).clamp(-1.0, 1.0);

            (volume, pan, in_range)
        }
    }
}
