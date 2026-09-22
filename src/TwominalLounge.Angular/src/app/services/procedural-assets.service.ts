import { Injectable } from '@angular/core';
import { AvatarConfig, InteractiveObject, PrivateZone, WallOrientation } from '../models/lounge.models';

export type { WallOrientation } from '../models/lounge.models';

@Injectable({
  providedIn: 'root',
})
export class ProceduralAssetsService {
  // Cached pre-rendered tile canvas buffers for maximum performance
  private readonly tileCache = new Map<string, HTMLCanvasElement>();
  private readonly imageCache = new Map<string, HTMLImageElement>();
  private hdEnabled = true;

  constructor() {
    this.preloadAssets();
  }

  public setHdGraphics(enabled: boolean): void {
    this.hdEnabled = enabled;
  }

  public isHdGraphics(): boolean {
    return this.hdEnabled;
  }

  private preloadAssets(): void {
    if (typeof window === 'undefined') return;

    // 1. Preload Floor Tiles
    const tilePaths: Record<number, string> = {
      1: '/assets/tiles/tile_parquet.png',
      2: '/assets/tiles/tile_carpet.png',
      3: '/assets/tiles/tile_cobblestone.png',
      4: '/assets/tiles/tile_marble.png',
    };
    for (const [id, path] of Object.entries(tilePaths)) {
      const img = new Image();
      img.src = path;
      this.imageCache.set(`tile_${id}`, img);
    }

    // 2. Preload Furniture & Props
    const propPaths: Record<string, string> = {
      desk: '/assets/props/desk_monitors.png',
      chair: '/assets/props/office_chair.png',
      whiteboard: '/assets/props/whiteboard.png',
      water_cooler: '/assets/props/water_cooler.png',
      plant: '/assets/props/plant_monstera.png',
      couch: '/assets/props/leather_sofa.png',
      espresso: '/assets/props/espresso_machine.png',
      arcade: '/assets/props/arcade_cabinet.png',
    };
    for (const [key, path] of Object.entries(propPaths)) {
      const img = new Image();
      img.src = path;
      this.imageCache.set(`prop_${key}`, img);
    }

    // 3. Preload Character Sprites & Directional Walk Frames
    const chars = ['hoodie', 'architect', 'director', 'engineer', 'designer', 'logician'];
    const directions = ['down', 'up', 'left', 'right'];
    for (const c of chars) {
      for (const d of directions) {
        const img = new Image();
        img.src = `/assets/sprites/characters/${c}_${d}.png`;
        this.imageCache.set(`char_${c}_${d}`, img);

        const img0 = new Image();
        img0.src = `/assets/sprites/characters/${c}_${d}_0.png`;
        this.imageCache.set(`char_${c}_${d}_0`, img0);

        const img1 = new Image();
        img1.src = `/assets/sprites/characters/${c}_${d}_1.png`;
        this.imageCache.set(`char_${c}_${d}_1`, img1);
      }
    }
  }

  /**
   * Procedurally draws a high-detail 2D top-down character avatar with walking animations
   */
  drawAvatar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    direction: 'up' | 'down' | 'left' | 'right',
    animFrame: number, // 0..3 (0: idle, 1: left leg, 2: idle, 3: right leg)
    config: AvatarConfig,
    scale: number = 1.0,
    isLocalPlayer: boolean = false
  ): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    // Drop shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.beginPath();
    ctx.ellipse(0, 10, 11, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Check if HD character sprite is available
    let charType = config.character || 'hoodie';
    if (!config.character) {
      if (config.skin === 'fair' || config.hair === 'spiky') charType = 'architect';
      else if (config.skin === 'dark' || config.hat === 'headset') charType = 'engineer';
      else if (config.hair === 'bun' || config.outfit_color === '#10b981') charType = 'director';
      else if (config.hair === 'short' && config.skin === 'cyber') charType = 'designer';
      else if (config.hair === 'messy' || config.outfit === 'sweater') charType = 'logician';
    }

    // Distinct walk frame: frame 0 or 1 based on walking leg offset
    const frameIdx = animFrame === 1 ? 0 : animFrame === 3 ? 1 : 0;
    const charImg = this.hdEnabled
      ? (this.imageCache.get(`char_${charType}_${direction}_${frameIdx}`) || this.imageCache.get(`char_${charType}_${direction}`))
      : null;

    if (charImg && charImg.complete && charImg.naturalWidth > 0) {
      const isMoving = animFrame % 2 !== 0;
      const bob = isMoving ? -2 : 0;

      // Draw distinct directional pixel art avatar (left faces left, right faces right)
      ctx.drawImage(charImg, -16, -26 + bob, 32, 42);

      // Local player indicator ring
      if (isLocalPlayer) {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.ellipse(0, 10, 14, 7, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
      return;
    }

    // Walking bob offset
    const isMoving = animFrame % 2 !== 0;
    const bob = isMoving ? -2 : 0;
    const legOffset = animFrame === 1 ? -3 : animFrame === 3 ? 3 : 0;

    // Skin tone mapping
    const skinTones: Record<string, { base: string; shadow: string }> = {
      fair: { base: '#fed7aa', shadow: '#fcd34d' },
      tan: { base: '#f59e0b', shadow: '#d97706' },
      dark: { base: '#854d0e', shadow: '#713f12' },
      alien: { base: '#34d399', shadow: '#059669' },
      cyber: { base: '#94a3b8', shadow: '#64748b' },
    };
    const skin = skinTones[config.skin] || skinTones['tan'];
    const outfitColor = config.outfit_color || '#6366f1';
    const hairColor = config.hair_color || '#2563eb';

    // 2. Legs / Shoes
    ctx.fillStyle = '#1e293b';
    if (direction === 'down' || direction === 'up') {
      ctx.fillRect(-6, 6 + bob + (direction === 'up' ? -legOffset : legOffset), 4, 6);
      ctx.fillRect(2, 6 + bob + (direction === 'up' ? legOffset : -legOffset), 4, 6);
    } else if (direction === 'left' || direction === 'right') {
      const sign = direction === 'left' ? -1 : 1;
      ctx.fillRect(-4 * sign - 2, 6 + bob + legOffset, 4, 6);
      ctx.fillRect(2 * sign - 2, 6 + bob - legOffset, 4, 6);
    }

    // 3. Torso / Outfit
    ctx.fillStyle = outfitColor;
    ctx.beginPath();
    ctx.roundRect(-8, -6 + bob, 16, 13, 3);
    ctx.fill();

    // Outfit details (collar/zipper/stripe)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    if (direction === 'down') {
      ctx.fillRect(-1, -6 + bob, 2, 10);
    } else if (direction === 'right') {
      ctx.fillRect(2, -6 + bob, 2, 10);
    } else if (direction === 'left') {
      ctx.fillRect(-4, -6 + bob, 2, 10);
    }

    // 4. Head & Face
    ctx.fillStyle = skin.base;
    ctx.beginPath();
    ctx.arc(0, -14 + bob, 8, 0, Math.PI * 2);
    ctx.fill();

    // Eyes and orientation details
    ctx.fillStyle = '#0f172a';
    if (direction === 'down') {
      ctx.beginPath();
      ctx.arc(-3, -14 + bob, 1.2, 0, Math.PI * 2);
      ctx.arc(3, -14 + bob, 1.2, 0, Math.PI * 2);
      ctx.fill();
    } else if (direction === 'left') {
      ctx.beginPath();
      ctx.arc(-5, -14 + bob, 1.2, 0, Math.PI * 2);
      ctx.fill();
    } else if (direction === 'right') {
      ctx.beginPath();
      ctx.arc(5, -14 + bob, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // 5. Hair
    ctx.fillStyle = hairColor;
    if (config.hair === 'short') {
      ctx.beginPath();
      ctx.arc(0, -17 + bob, 8.5, Math.PI, Math.PI * 2);
      if (direction === 'left') ctx.lineTo(-8, -13 + bob);
      if (direction === 'right') ctx.lineTo(8, -13 + bob);
      ctx.fill();
    } else if (config.hair === 'spiky') {
      ctx.beginPath();
      ctx.moveTo(-8, -16 + bob);
      ctx.lineTo(-5, -24 + bob);
      ctx.lineTo(-2, -18 + bob);
      ctx.lineTo(1, -25 + bob);
      ctx.lineTo(4, -18 + bob);
      ctx.lineTo(8, -23 + bob);
      ctx.lineTo(8, -15 + bob);
      ctx.closePath();
      ctx.fill();
    } else if (config.hair === 'bun') {
      ctx.beginPath();
      ctx.arc(0, -17 + bob, 8.5, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, -25 + bob, 4.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Default sleek style
      ctx.beginPath();
      ctx.arc(0, -17 + bob, 8.5, Math.PI * 0.9, Math.PI * 2.1);
      ctx.fill();
    }

    // 6. Accessories (Hats / Headsets)
    if (config.hat === 'headset') {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, -15 + bob, 9.5, Math.PI, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(-10, -16 + bob, 3, 5);
      ctx.fillRect(7, -16 + bob, 3, 5);
    } else if (config.hat === 'cap') {
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(0, -18 + bob, 8.5, Math.PI, Math.PI * 2);
      ctx.fill();
      const brimSign = direction === 'left' ? -1 : 1;
      ctx.fillRect(direction === 'down' ? -8 : -2, -18 + bob, direction === 'down' ? 16 : 10 * brimSign, 3);
    }

    // 7. Local player indicator ring
    if (isLocalPlayer) {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.ellipse(0, 10, 14, 7, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();
  }

  /**
   * Procedural Ground Tile renderer
   */
  drawGroundTile(ctx: CanvasRenderingContext2D, type: number, x: number, y: number, size: number): void {
    const tileImg = this.hdEnabled ? this.imageCache.get(`tile_${type}`) : null;
    if (tileImg && tileImg.complete && tileImg.naturalWidth > 0) {
      ctx.drawImage(tileImg, x, y, size, size);
      return;
    }

    const key = `ground_${type}_${size}`;
    let cached = this.tileCache.get(key);

    if (!cached) {
      cached = document.createElement('canvas');
      cached.width = size;
      cached.height = size;
      const cCtx = cached.getContext('2d')!;

      if (type === 1) {
        // Wood Parquet
        cCtx.fillStyle = '#78350f';
        cCtx.fillRect(0, 0, size, size);
        cCtx.fillStyle = '#92400e';
        cCtx.fillRect(1, 1, size / 2 - 1, size / 2 - 1);
        cCtx.fillRect(size / 2 + 1, size / 2 + 1, size / 2 - 2, size / 2 - 2);
        cCtx.fillStyle = '#b45309';
        cCtx.fillRect(size / 2 + 1, 1, size / 2 - 2, size / 2 - 1);
        cCtx.fillRect(1, size / 2 + 1, size / 2 - 1, size / 2 - 2);

        // Wood grain lines
        cCtx.strokeStyle = 'rgba(0,0,0,0.15)';
        cCtx.lineWidth = 1;
        cCtx.beginPath();
        cCtx.moveTo(0, size / 2);
        cCtx.lineTo(size, size / 2);
        cCtx.moveTo(size / 2, 0);
        cCtx.lineTo(size / 2, size);
        cCtx.stroke();
      } else if (type === 2) {
        // Slate Carpet
        cCtx.fillStyle = '#1e293b';
        cCtx.fillRect(0, 0, size, size);
        cCtx.fillStyle = '#334155';
        for (let i = 2; i < size; i += 4) {
          for (let j = 2; j < size; j += 4) {
            cCtx.fillRect(i, j, 2, 2);
          }
        }
      } else if (type === 3) {
        // Plush Rug / Lounge Area
        cCtx.fillStyle = '#065f46';
        cCtx.fillRect(0, 0, size, size);
        cCtx.strokeStyle = '#047857';
        cCtx.lineWidth = 2;
        cCtx.strokeRect(2, 2, size - 4, size - 4);
        cCtx.fillStyle = '#10b981';
        cCtx.fillRect(size / 2 - 2, size / 2 - 2, 4, 4);
      } else {
        // Marble Executive
        cCtx.fillStyle = '#f8fafc';
        cCtx.fillRect(0, 0, size, size);
        cCtx.strokeStyle = '#e2e8f0';
        cCtx.lineWidth = 1;
        cCtx.strokeRect(0, 0, size, size);
        cCtx.strokeStyle = '#cbd5e1';
        cCtx.beginPath();
        cCtx.moveTo(2, 4);
        cCtx.bezierCurveTo(size * 0.4, size * 0.2, size * 0.6, size * 0.8, size - 2, size - 4);
        cCtx.stroke();
      }

      this.tileCache.set(key, cached);
    }

    ctx.drawImage(cached, x, y);
  }

  /**
   * Procedural Wall Tile renderer with orientation and rotation support
   */
  drawWallTile(
    ctx: CanvasRenderingContext2D,
    type: number,
    x: number,
    y: number,
    size: number,
    orientation: WallOrientation = 'horizontal'
  ): void {
    if (type === 0) return;

    let normOrientation: string = 'horizontal';
    if (typeof orientation === 'number') {
      const deg = ((orientation % 360) + 360) % 360;
      if (deg === 90) normOrientation = 'side-right';
      else if (deg === 270) normOrientation = 'side-left';
      else if (deg === 180) normOrientation = 'horizontal';
      else normOrientation = deg === 0 ? 'horizontal' : `rot_${deg}`;
    } else if (orientation === 'left' || orientation === 'side-left') {
      normOrientation = 'side-left';
    } else if (orientation === 'right' || orientation === 'side-right') {
      normOrientation = 'side-right';
    } else if (orientation === 'side' || orientation === 'vertical') {
      normOrientation = 'vertical';
    } else if (orientation) {
      normOrientation = orientation;
    }

    const key = `wall_${type}_${size}_${normOrientation}`;
    let cached = this.tileCache.get(key);

    if (!cached) {
      cached = document.createElement('canvas');
      cached.width = size;
      cached.height = size;
      const cCtx = cached.getContext('2d')!;

      if (type === 1) {
        // Modern Drywall
        cCtx.fillStyle = '#0f172a';
        cCtx.fillRect(0, 0, size, size);

        if (normOrientation === 'side-left') {
          // Left side wall: rotated 90° counter-clockwise
          // Outer highlight on left, room interior baseboard on right
          cCtx.fillStyle = '#334155';
          cCtx.fillRect(0, 0, 4, size);
          cCtx.fillStyle = '#64748b';
          cCtx.fillRect(size - 6, 0, 6, size);
          cCtx.fillStyle = '#94a3b8';
          cCtx.fillRect(size - 6, 0, 1, size);
        } else if (normOrientation === 'side-right') {
          // Right side wall: rotated 90° clockwise
          // Room interior baseboard on left, outer highlight on right
          cCtx.fillStyle = '#334155';
          cCtx.fillRect(size - 4, 0, 4, size);
          cCtx.fillStyle = '#64748b';
          cCtx.fillRect(0, 0, 6, size);
          cCtx.fillStyle = '#94a3b8';
          cCtx.fillRect(5, 0, 1, size);
        } else if (normOrientation === 'vertical') {
          // Vertical partition wall (running north-south)
          cCtx.fillStyle = '#334155';
          cCtx.fillRect(0, 0, 3, size);
          cCtx.fillStyle = '#64748b';
          cCtx.fillRect(size - 4, 0, 4, size);
          cCtx.fillStyle = '#94a3b8';
          cCtx.fillRect(size - 4, 0, 1, size);
        } else if (normOrientation === 'corner-top-left') {
          // Outer top-left corner
          cCtx.fillStyle = '#334155';
          cCtx.fillRect(0, 0, size, 4);
          cCtx.fillRect(0, 0, 4, size);
          cCtx.fillStyle = '#64748b';
          cCtx.fillRect(size - 6, size - 6, 6, 6);
          cCtx.fillStyle = '#94a3b8';
          cCtx.fillRect(size - 6, size - 6, 6, 1);
          cCtx.fillRect(size - 6, size - 6, 1, 6);
        } else if (normOrientation === 'corner-top-right') {
          // Outer top-right corner
          cCtx.fillStyle = '#334155';
          cCtx.fillRect(0, 0, size, 4);
          cCtx.fillRect(size - 4, 0, 4, size);
          cCtx.fillStyle = '#64748b';
          cCtx.fillRect(0, size - 6, 6, 6);
          cCtx.fillStyle = '#94a3b8';
          cCtx.fillRect(0, size - 6, 6, 1);
          cCtx.fillRect(5, size - 6, 1, 6);
        } else if (normOrientation === 'corner-bottom-left') {
          // Outer bottom-left corner
          cCtx.fillStyle = '#334155';
          cCtx.fillRect(0, 0, 4, size);
          cCtx.fillRect(0, size - 4, size, 4);
          cCtx.fillStyle = '#64748b';
          cCtx.fillRect(size - 6, 0, 6, 6);
          cCtx.fillStyle = '#94a3b8';
          cCtx.fillRect(size - 6, 5, 6, 1);
          cCtx.fillRect(size - 6, 0, 1, 6);
        } else if (normOrientation === 'corner-bottom-right') {
          // Outer bottom-right corner
          cCtx.fillStyle = '#334155';
          cCtx.fillRect(size - 4, 0, 4, size);
          cCtx.fillRect(0, size - 4, size, 4);
          cCtx.fillStyle = '#64748b';
          cCtx.fillRect(0, 0, 6, 6);
          cCtx.fillStyle = '#94a3b8';
          cCtx.fillRect(0, 5, 6, 1);
          cCtx.fillRect(5, 0, 1, 6);
        } else if (normOrientation.startsWith('rot_')) {
          // Arbitrary angle rotation
          const deg = parseFloat(normOrientation.replace('rot_', ''));
          cCtx.clearRect(0, 0, size, size);
          cCtx.save();
          cCtx.translate(size / 2, size / 2);
          cCtx.rotate((deg * Math.PI) / 180);
          cCtx.translate(-size / 2, -size / 2);
          cCtx.fillStyle = '#0f172a';
          cCtx.fillRect(0, 0, size, size);
          cCtx.fillStyle = '#334155';
          cCtx.fillRect(0, 0, size, 4);
          cCtx.fillStyle = '#64748b';
          cCtx.fillRect(0, size - 6, size, 6);
          cCtx.fillStyle = '#94a3b8';
          cCtx.fillRect(0, size - 6, size, 1);
          cCtx.restore();
        } else {
          // Default horizontal wall
          cCtx.fillStyle = '#334155';
          cCtx.fillRect(0, 0, size, 4);
          cCtx.fillStyle = '#64748b';
          cCtx.fillRect(0, size - 6, size, 6);
          cCtx.fillStyle = '#94a3b8';
          cCtx.fillRect(0, size - 6, size, 1);
        }
      } else if (type === 2) {
        // Glass Architectural Partition
        cCtx.fillStyle = 'rgba(14, 116, 144, 0.45)';
        cCtx.fillRect(0, 0, size, size);

        if (normOrientation === 'vertical' || normOrientation === 'side-left' || normOrientation === 'side-right') {
          // Vertical partition running north-south (posts on left and right edges)
          cCtx.strokeStyle = '#0891b2';
          cCtx.lineWidth = 2;
          cCtx.beginPath();
          cCtx.moveTo(1, 0);
          cCtx.lineTo(1, size);
          cCtx.moveTo(size - 1, 0);
          cCtx.lineTo(size - 1, size);
          cCtx.stroke();

          // Rotated glass reflection streak
          cCtx.fillStyle = 'rgba(255, 255, 255, 0.35)';
          cCtx.beginPath();
          cCtx.moveTo(size - 4, size - 4);
          cCtx.lineTo(4, 4);
          cCtx.lineTo(4, 8);
          cCtx.lineTo(size - 8, size - 4);
          cCtx.closePath();
          cCtx.fill();
        } else {
          // Horizontal glass partition
          cCtx.strokeStyle = '#0891b2';
          cCtx.lineWidth = 2;
          cCtx.strokeRect(1, 1, size - 2, size - 2);

          // Diagonal glass reflection streak
          cCtx.fillStyle = 'rgba(255, 255, 255, 0.35)';
          cCtx.beginPath();
          cCtx.moveTo(4, size - 4);
          cCtx.lineTo(size - 4, 4);
          cCtx.lineTo(size - 8, 4);
          cCtx.lineTo(4, size - 8);
          cCtx.closePath();
          cCtx.fill();
        }
      }

      this.tileCache.set(key, cached);
    }

    ctx.drawImage(cached, x, y);
  }

  /**
   * Procedural Interactive Furniture Renderer
   */
  drawFurniture(
    ctx: CanvasRenderingContext2D,
    obj: InteractiveObject,
    pixelX: number,
    pixelY: number,
    tileSize: number,
    tick: number
  ): void {
    ctx.save();
    ctx.translate(pixelX, pixelY);

    const w = obj.width * tileSize;
    const h = obj.height * tileSize;

    let propKey = obj.object_type;
    if (obj.object_type === 'water_fountain') propKey = 'plant';
    if (obj.object_type === 'coffee') propKey = 'espresso';

    const propImg = this.hdEnabled ? this.imageCache.get(`prop_${propKey}`) : null;
    if (propImg && propImg.complete && propImg.naturalWidth > 0) {
      // Soft drop shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.beginPath();
      ctx.ellipse(w / 2, h - 2, w * 0.45, Math.min(8, h * 0.25), 0, 0, Math.PI * 2);
      ctx.fill();

      // Draw HD prop
      ctx.drawImage(propImg, 0, 0, w, h);
      ctx.restore();
      return;
    }

    switch (obj.object_type) {
      case 'desk': {
        // Large executive table
        ctx.fillStyle = '#451a03';
        ctx.beginPath();
        ctx.roundRect(2, 2, w - 4, h - 4, 6);
        ctx.fill();
        ctx.strokeStyle = '#78350f';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Laptops on desk
        const laptopCount = Math.max(1, Math.floor(w / 36));
        for (let i = 0; i < laptopCount; i++) {
          const lx = 8 + i * 36;
          const ly = 6;
          // Laptop base
          ctx.fillStyle = '#64748b';
          ctx.fillRect(lx, ly + 8, 18, 10);
          // Glowing screen
          ctx.fillStyle = '#38bdf8';
          ctx.fillRect(lx + 2, ly, 14, 8);
        }
        break;
      }

      case 'chair': {
        // Ergonomic chair with direction
        const dir = obj.direction || 'down';
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(tileSize / 2, tileSize / 2, 10, 0, Math.PI * 2);
        ctx.fill();

        // Cushion
        ctx.fillStyle = '#475569';
        ctx.beginPath();
        ctx.arc(tileSize / 2, tileSize / 2, 8, 0, Math.PI * 2);
        ctx.fill();

        // Backrest oriented to chair direction
        ctx.fillStyle = '#1e293b';
        if (dir === 'down') {
          ctx.fillRect(tileSize / 2 - 8, tileSize / 2 - 10, 16, 4);
        } else if (dir === 'up') {
          ctx.fillRect(tileSize / 2 - 8, tileSize / 2 + 6, 16, 4);
        } else if (dir === 'left') {
          ctx.fillRect(tileSize / 2 + 6, tileSize / 2 - 8, 4, 16);
        } else {
          ctx.fillRect(tileSize / 2 - 10, tileSize / 2 - 8, 4, 16);
        }
        break;
      }

      case 'whiteboard': {
        // Presentation Whiteboard with stand and metal frame
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(3, 3, w - 6, h - 6);

        // Marker tray
        ctx.fillStyle = '#64748b';
        ctx.fillRect(4, h - 3, w - 8, 3);

        // Content doodle / notes
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(8, 8);
        ctx.lineTo(w * 0.4, 8);
        ctx.moveTo(8, 14);
        ctx.lineTo(w * 0.7, 14);
        ctx.stroke();

        ctx.strokeStyle = '#dc2626';
        ctx.beginPath();
        ctx.arc(w - 18, 12, 6, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }

      case 'water_cooler': {
        // Water Cooler
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(6, 16, tileSize - 12, 14);

        // Transparent jug with bubbling water
        const bubble = Math.sin(tick * 0.05) * 1.5;
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(tileSize / 2, 10 + bubble, 7, 0, Math.PI * 2);
        ctx.fill();

        // Spigot
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(tileSize / 2 - 3, 20, 2, 3);
        ctx.fillStyle = '#0284c7';
        ctx.fillRect(tileSize / 2 + 1, 20, 2, 3);
        break;
      }

      case 'plant': {
        // Potted Monstera / Fig
        ctx.fillStyle = '#b45309';
        ctx.beginPath();
        ctx.arc(tileSize / 2, tileSize / 2 + 4, 8, 0, Math.PI * 2);
        ctx.fill();

        // Leaves with natural breathing bob
        const leafBob = Math.sin(tick * 0.03) * 1;
        ctx.fillStyle = '#15803d';
        ctx.beginPath();
        ctx.ellipse(tileSize / 2 - 5, tileSize / 2 - 4 + leafBob, 5, 8, -Math.PI / 4, 0, Math.PI * 2);
        ctx.ellipse(tileSize / 2 + 5, tileSize / 2 - 4 - leafBob, 5, 8, Math.PI / 4, 0, Math.PI * 2);
        ctx.ellipse(tileSize / 2, tileSize / 2 - 8, 6, 9, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case 'couch': {
        // Plush lounge sofa
        ctx.fillStyle = '#334155';
        ctx.beginPath();
        ctx.roundRect(2, 2, w - 4, h - 4, 6);
        ctx.fill();
        // Cushions
        ctx.fillStyle = '#475569';
        const cushions = 3;
        const cw = (w - 12) / cushions;
        for (let i = 0; i < cushions; i++) {
          ctx.beginPath();
          ctx.roundRect(6 + i * cw, 8, cw - 2, h - 14, 3);
          ctx.fill();
        }
        break;
      }
    }

    ctx.restore();
  }

  /**
   * Renders the spatial audio proximity halo around the avatar
   */
  drawProximityHalo(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radiusPx: number,
    falloffPx: number,
    tick: number
  ): void {
    ctx.save();
    const pulse = Math.sin(tick * 0.04) * 2.5;

    // Outer falloff gradient
    const grad = ctx.createRadialGradient(x, y, 10, x, y, falloffPx + pulse);
    grad.addColorStop(0, 'rgba(56, 189, 248, 0.12)');
    grad.addColorStop(radiusPx / falloffPx, 'rgba(56, 189, 248, 0.06)');
    grad.addColorStop(1, 'rgba(56, 189, 248, 0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, falloffPx + pulse, 0, Math.PI * 2);
    ctx.fill();

    // Inner conversation boundary ring
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.28)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(x, y, radiusPx, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();
  }

  /**
   * Renders a dashed boundary and subtle tint for private conversation zones
   */
  drawPrivateZoneOverlay(
    ctx: CanvasRenderingContext2D,
    zone: PrivateZone,
    tileSize: number,
    isPlayerInside: boolean
  ): void {
    const x = zone.x * tileSize;
    const y = zone.y * tileSize;
    const w = zone.width * tileSize;
    const h = zone.height * tileSize;

    ctx.save();

    // Subtle ambient background tint
    ctx.fillStyle = isPlayerInside ? 'rgba(59, 130, 246, 0.12)' : 'rgba(59, 130, 246, 0.04)';
    ctx.fillRect(x, y, w, h);

    // Dashed border
    ctx.strokeStyle = isPlayerInside ? '#3b82f6' : 'rgba(59, 130, 246, 0.4)';
    ctx.lineWidth = isPlayerInside ? 2.5 : 1.5;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);

    // Zone badge at top-left
    ctx.fillStyle = isPlayerInside ? '#2563eb' : 'rgba(30, 41, 59, 0.85)';
    ctx.beginPath();
    ctx.roundRect(x + 4, y + 4, Math.min(w - 8, zone.name.length * 8 + 24), 20, 4);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillText(`🔒 ${zone.name}`, x + 10, y + 18);

    ctx.restore();
  }
}
