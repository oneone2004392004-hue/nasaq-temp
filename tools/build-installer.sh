#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f "$HOME/.cargo/env" ] && source "$HOME/.cargo/env"
if ! command -v cargo >/dev/null 2>&1; then echo "Rust/Cargo is required. Install rustup, then rerun: npm run tauri:build" >&2; exit 2; fi
npm run tauri:build
