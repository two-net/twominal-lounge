# =============================================================================
# Production Runtime Dockerfile for Twominal Lounge
# Pre-built by GitHub Actions runner (strictly NO building in Dockerfile)
# Zero Source Code, Pure Runtime
# =============================================================================
FROM ubuntu:noble

# Install minimal runtime shared libraries and CA certificates
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libssl3 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create dedicated unprivileged runtime user
RUN groupadd -g 10001 twominal && \
    useradd -u 10001 -g twominal -s /bin/bash -m twominal

WORKDIR /app

# Copy the pre-compiled binary built by GitHub Actions workflow
COPY target/release/twominal_lounge /usr/local/bin/twominal_lounge
COPY config.json /app/config.json

# Assert zero source code leakage in final runtime image
RUN ! find /app /usr/local/bin -name "*.rs" -o -name "*.ts" -o -name "node_modules" | grep .

# Set unprivileged ownership
RUN chown -R twominal:twominal /app /usr/local/bin/twominal_lounge

USER twominal

# Twominal Lounge Gateway Port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

ENTRYPOINT ["/usr/local/bin/twominal_lounge"]
