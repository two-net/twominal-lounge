use axum::{
    body::Body,
    http::{header, HeaderValue, StatusCode, Uri},
    response::{IntoResponse, Response},
};
use rust_embed::RustEmbed;

#[derive(RustEmbed)]
#[folder = "../TwominalLounge.Angular/dist/TwominalLounge.Angular/browser"]
pub struct FrontendAssets;

/// Serves embedded Angular frontend assets with SPA fallback for HTML5 routing.
pub async fn static_handler(uri: Uri) -> impl IntoResponse {
    let path = uri.path().trim_start_matches('/');

    // Do not serve frontend index for unhandled API or WebSocket endpoints
    if path.starts_with("api/") || path.starts_with("ws/") {
        return Response::builder()
            .status(StatusCode::NOT_FOUND)
            .header(header::CONTENT_TYPE, HeaderValue::from_static("application/json"))
            .body(Body::from(r#"{"error":"API endpoint not found"}"#))
            .unwrap();
    }

    // 1. Try serving exact static asset (e.g., .js, .css, images, fonts)
    if !path.is_empty() {
        if let Some(content) = FrontendAssets::get(path) {
            let mime = mime_guess::from_path(path).first_or_octet_stream();
            let mut res = Response::builder()
                .status(StatusCode::OK)
                .header(
                    header::CONTENT_TYPE,
                    HeaderValue::from_str(mime.as_ref())
                        .unwrap_or_else(|_| HeaderValue::from_static("application/octet-stream")),
                );

            if path.contains('.') {
                if path.ends_with(".js") || path.ends_with(".css") {
                    res = res.header(
                        header::CACHE_CONTROL,
                        HeaderValue::from_static("public, max-age=31536000, immutable"),
                    );
                } else {
                    res = res.header(
                        header::CACHE_CONTROL,
                        HeaderValue::from_static("public, max-age=3600"),
                    );
                }
            }

            return res.body(Body::from(content.data)).unwrap();
        }
    }

    // 2. SPA client-side fallback: Serve index.html for root or page navigation routes
    match FrontendAssets::get("index.html") {
        Some(content) => Response::builder()
            .status(StatusCode::OK)
            .header(
                header::CONTENT_TYPE,
                HeaderValue::from_static("text/html; charset=utf-8"),
            )
            .header(
                header::CACHE_CONTROL,
                HeaderValue::from_static("no-cache, no-store, must-revalidate"),
            )
            .body(Body::from(content.data))
            .unwrap(),
        None => Response::builder()
            .status(StatusCode::NOT_FOUND)
            .header(header::CONTENT_TYPE, HeaderValue::from_static("text/plain"))
            .body(Body::from("Frontend index.html not found"))
            .unwrap(),
    }
}
