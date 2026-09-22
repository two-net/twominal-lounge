# Twominal Lounge

A 2D spatial video, audio, and interactive virtual office meeting platform inspired by Gather.town.

Built with **Rust (Axum + Tokio + SQLx)** and **Angular 22 (HTML5 Canvas + Web Audio API + WebRTC)**.

![Twominal Lounge Interface](assets/twominal_lounge_screenshot.png)

---

## Features

- **2D Top-Down Spatial Navigation:** Smooth 60 FPS in-canvas rendering with keyboard controls (WASD / Arrows) and click-to-move pathfinding.
- **3D Spatial Audio & Dynamic Proximity:** Real-time stereo panning and distance volume attenuation via Web Audio API `StereoPannerNode` and `GainNode`.
- **Private Audio Zones:** Acoustically isolated meeting pods (e.g. Conference Pods, Fireside Lounge).
- **Procedural Pixel-Art Pipeline:** 100% in-canvas procedural sprite rendering for avatars (4-directional 4-frame walk cycles, skin/hair/outfit customizer), tilesets (wood parquet, acoustic carpet, marble, patio, rugs), and interactive furniture (chairs, desks, laptops, whiteboard, water cooler, plants, sofa).
- **High-Definition Screensharing & Presentation Stage:** Real-time WebRTC display media capture with seamless fallback, Picture-in-Picture (PiP), and full-stage broadcast.
- **Collaborative Shared Cursors:** Real-time normalized pointer broadcasting displaying peer name badges, custom avatar palette colors, and smooth 60 FPS interpolation across screenshare stages and interactive whiteboards.
- **Interactive Live Drawing & Screen Annotations:** Glassmorphic toolbar with Laser Pointer (auto-fading glowing trail), Pen, Highlighter, Arrows, Bounding Box frames, Eraser, and instant canvas undo/clear.
- **Live Collaborative Whiteboard:** Real-time stroke and sticky note synchronization across connected participants.
- **In-Game Room Architect:** Interactive modal to add/remove furniture, configure private sound zones, and set avatar spawn points.
- **PostgreSQL Persistence & Auto-Migrations:** Embedded startup migration using `sqlx::migrate!()` without partitioning (`users`, `rooms`, `room_layouts`, `user_positions`).
- **Static Configuration:** Version-controlled [`config.json`](file:///Users/two/repos/twominal-lounge-gemini/config.json). Strictly NO `.env` files or secret managers.
- **Structured Observability:** Tracing logs for application lifecycle, migrations, and WebSocket connections, with an in-app Telemetry & Diagnostics modal.

---

## Quick Start

### 1. Prerequisites

- **Rust** (1.80+)
- **Node.js** (v20+) & **pnpm** (10+)
- **PostgreSQL** (running on `localhost:5432`)

### 2. Start Backend Server

```bash
cargo run -p twominal_lounge
```

The server connects to PostgreSQL, executes embedded migrations via `sqlx::migrate!()`, and starts listening on `http://0.0.0.0:3000` (strictly no default room; rooms are created on-demand or joined via room code or shared URL).

### 3. Start Frontend Client

```bash
cd src/TwominalLounge.Angular
pnpm start
```

Open `http://localhost:4200` in your browser.

---

## Running Automated Tests

### Rust Backend Tests
```bash
cargo test
```

### Angular Frontend Tests
```bash
cd src/TwominalLounge.Angular
pnpm run test --watch=false
```

---

## Docker & GitHub Packages (GHCR)

The application is built directly inside the **GitHub Actions runner** (frontend SPA build + Rust release compilation with embedded assets) and packaged into a minimal runtime Docker image:

1. **Frontend Build:** Angular 22 SPA compiled to static assets via `pnpm run build`.
2. **Backend Compilation:** Rust Axum server compiled in release mode via `cargo build --release`, embedding the frontend assets and database migrations.
3. **Runtime Docker Packaging (Zero Compilation in Dockerfile):** A minimal runtime container containing **only the compiled binary** and `config.json` (zero source code, zero compilers, zero `node_modules`).

### Local Build & Package
```bash
# 1. Build frontend
cd src/TwominalLounge.Angular && pnpm run build && cd ../..

# 2. Build release binary embedding frontend
cargo build --release --bin twominal_lounge

# 3. Package pure runtime Docker image
docker build -t twominal-lounge:latest .
```

### Run Container
```bash
docker run -p 3000:3000 \
  -e DATABASE_URL="postgres://postgres:postgres@host.docker.internal:5432/twominal_lounge" \
  twominal-lounge:latest
```

### GitHub Actions CI/CD Workflow
The workflow [`.github/workflows/docker-build-push.yml`](file:///Users/two/repos/twominal-lounge-gemini/.github/workflows/docker-build-push.yml) automatically:
1. Runs automated test suites for both Angular frontend and Rust backend.
2. Compiles the frontend SPA and embeds it into the Rust release binary on the GitHub Actions runner.
3. Packages the pre-built binary into the pure runtime Docker image without compiling in Docker.
4. Authenticates and pushes the runtime container image to **GitHub Packages (GHCR)**: `ghcr.io/<owner>/<repo>:latest`.
5. Executes an automated security audit verifying zero source code (`.rs`, `.ts`, `node_modules`) leaks into the image.



## Architecture Report

For detailed architectural diagrams, math models, and database DDL, see the [Architecture Report](file:///Users/two/.gemini/antigravity-cli/brain/77256bb4-a645-47b3-9ab9-a518b88a2ab9/twominal_lounge_architecture_report.md).
