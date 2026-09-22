export interface AvatarConfig {
  skin: string;
  hair: string;
  hair_color: string;
  outfit: string;
  outfit_color: string;
  hat: string;
  character?: string;
}

export interface User {
  id: string;
  username: string;
  display_name: string;
  avatar_config: AvatarConfig;
  license_type: string;
  license_key?: string;
  created_at: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface InteractiveObject {
  id: string;
  object_type: string; // "chair" | "desk" | "whiteboard" | "water_cooler" | "plant" | "couch"
  x: number;
  y: number;
  width: number;
  height: number;
  direction?: string;
  properties: Record<string, any>;
}

export interface PrivateZone {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

export interface RoomLayout {
  id: string;
  room_id: string;
  width: number;
  height: number;
  spawn_x: number;
  spawn_y: number;
  tilemap_data: {
    ground: number[][];
    walls: number[][];
  };
  collision_mask: boolean[][];
  interactive_objects: InteractiveObject[];
  private_zones: PrivateZone[];
}

export interface UpdateLayoutRequest {
  spawn_x?: number;
  spawn_y?: number;
  tilemap_data?: {
    ground?: number[][];
    walls?: number[][];
  };
  collision_mask?: boolean[][];
  interactive_objects?: InteractiveObject[];
  private_zones?: PrivateZone[];
}

export interface Room {
  id: string;
  slug: string;
  name: string;
  description: string;
  owner_id?: string;
  max_occupancy: number;
  pricing_tier: string;
  active_occupancy: number;
  created_at: string;
}

export interface RoomDetails {
  id: string;
  slug: string;
  name: string;
  description: string;
  owner_id?: string;
  max_occupancy: number;
  pricing_tier: string;
  is_active: boolean;
  created_at: string;
  layout: RoomLayout;
  active_occupancy: number;
}

export interface PeerState {
  peer_id: string;
  user_id: string;
  display_name: string;
  avatar_config: AvatarConfig;
  x: number;
  y: number;
  direction: 'up' | 'down' | 'left' | 'right';
  state: 'idle' | 'walking' | 'sitting';
  mic_muted: boolean;
  cam_off: boolean;
  screen_sharing: boolean;
  private_zone_id?: string;
  // Client-side interpolation state
  target_x?: number;
  target_y?: number;
  anim_frame?: number;
  currentEmote?: string | null;
  emoteTimer?: number;
  avatarImg?: string;
  role?: string;
}

export interface ProximityInfo {
  peer_id: string;
  distance: number;
  in_range: boolean;
  private_zone_id?: string;
  volume: number;
  pan: number;
}

export interface ChatMessage {
  id: string;
  from_peer_id: string;
  display_name: string;
  text: string;
  channel: 'room' | 'proximity' | 'system';
  timestamp: number;
}

export interface WhiteboardNote {
  id: string;
  room_id: string;
  author_name: string;
  content: string;
  color_class: string;
  created_at: string;
}

export interface OrmLogEntry {
  id: string;
  timestamp: string;
  action: string;
  payload: any;
  colorClass: string;
}

export interface BillingTier {
  id: string;
  name: string;
  description: string;
  price_cents: number;
  currency: string;
  billing_type: 'free' | 'pay_per_room' | 'one_time';
  max_occupancy: number;
  max_rooms: number;
  features: string[];
}

export interface PublicConfig {
  app_name: string;
  version: string;
  tile_size: number;
  proximity_radius_tiles: number;
  proximity_falloff_tiles: number;
  ice_servers: { urls: string[] }[];
}

export type WallOrientation =
  | 'horizontal'
  | 'vertical'
  | 'side-left'
  | 'side-right'
  | 'side'
  | 'left'
  | 'right'
  | 'corner-top-left'
  | 'corner-top-right'
  | 'corner-bottom-left'
  | 'corner-bottom-right'
  | number;

export interface SharedCursor {
  peer_id: string;
  display_name: string;
  color: string;
  stage: string; // 'screen' | 'whiteboard' | 'world'
  x: number; // normalized 0.0 to 1.0
  y: number; // normalized 0.0 to 1.0
  lastUpdated?: number;
}

export type AnnotationTool = 'pointer' | 'pen' | 'highlighter' | 'laser' | 'arrow' | 'rect' | 'eraser';

export interface AnnotationPoint {
  x: number; // normalized 0..1
  y: number; // normalized 0..1
  timestamp?: number;
}

export interface AnnotationStroke {
  id: string;
  tool: AnnotationTool;
  color: string;
  size: number;
  points: AnnotationPoint[];
  from_peer_id?: string;
  createdAt?: number;
}



