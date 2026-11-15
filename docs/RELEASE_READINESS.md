# Rogue Desktop — Production Release Readiness Checklist

This document summarizes the remaining release-engineering steps required to ship signed multi-platform production builds of `rogue-desktop-client`.

## 1. Multi-Platform Sidecar (`externalBin`) Matrix

`src-tauri/tauri.conf.json` bundles `bin/core-rogue`. Before running `tauri build` on each target OS, place the statically linked `core-rogue` binary (built from `rogue-core-chain`) in `src-tauri/bin/` with its exact Rust target triple suffix:

| Platform | Target Triple | Expected Sidecar Filename |
| :--- | :--- | :--- |
| Linux x86_64 | `x86_64-unknown-linux-gnu` | `src-tauri/bin/core-rogue-x86_64-unknown-linux-gnu` |
| Windows x86_64 | `x86_64-pc-windows-msvc` | `src-tauri/bin/core-rogue-x86_64-pc-windows-msvc.exe` |
| macOS Apple Silicon | `aarch64-apple-darwin` | `src-tauri/bin/core-rogue-aarch64-apple-darwin` |
| macOS Intel | `x86_64-apple-darwin` | `src-tauri/bin/core-rogue-x86_64-apple-darwin` |

## 2. Binary & Installer Code Signing

- **Windows (Authenticode / NSIS)**:
  - Configure `TAURI_SIGNING_PRIVATE_KEY` (for updater) and an EV/OV Authenticode certificate (`certificateThumbprint` or `signCommand` in `tauri.conf.json -> bundle.windows`) so Windows SmartScreen does not block the installer or the `core-rogue` sidecar.
- **macOS (Developer ID + Notarization)**:
  - Set `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD` (app-specific password), and `APPLE_TEAM_ID` in CI so `tauri build` signs both `Rogue Desktop.app` and the embedded `core-rogue` sidecar and submits the `.dmg` for Apple notarization.
- **Linux (`.deb`, `.rpm`, `.AppImage`)**:
  - Verify `libayatana-appindicator3-1 | libappindicator3-1` and WebKitGTK runtime dependencies on clean VM images before publishing release assets.

## 3. Auto-Updater (`tauri-plugin-updater`) Integration

When ready to host signed release manifests (`latest.json` on GitHub Releases):
1. Generate a Tauri updater keypair (`npx tauri signer generate -w ~/.tauri/rogue-desktop.key`).
2. Add `tauri-plugin-updater = "2"` to `src-tauri/Cargo.toml` and `@tauri-apps/plugin-updater` to `package.json`.
3. Enable `bundle.createUpdaterArtifacts: true` and configure `plugins.updater.pubkey` and `plugins.updater.endpoints` in `src-tauri/tauri.conf.json`.
4. Grant `"updater:default"` in `src-tauri/capabilities/default.json`.

## 4. Pre-Release Verification Commands

Run all checks locally or in CI prior to tagging:

```bash
npm run lint
npm test
npm run build
cd src-tauri && cargo clippy --all-targets && cargo test
```

