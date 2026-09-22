use std::fs;
use std::path::Path;

fn main() {
    println!("cargo:rerun-if-changed=../TwominalLounge.Angular/dist/TwominalLounge.Angular/browser");
    let dist_dir = Path::new("../TwominalLounge.Angular/dist/TwominalLounge.Angular/browser");
    if !dist_dir.exists() {
        let _ = fs::create_dir_all(dist_dir);
    }
    let index_file = dist_dir.join("index.html");
    if !index_file.exists() {
        let _ = fs::write(
            &index_file,
            r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Twominal Lounge</title>
</head>
<body>
  <h1>Twominal Lounge</h1>
  <p>Frontend assets placeholder. Run pnpm build to compile the Angular application.</p>
</body>
</html>"#,
        );
    }
}
