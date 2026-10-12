# NASAQ POS v1.0.2 — Windows Build & Packaging Instructions

## Build Environment Status
- **Current Runtime**: Cloud Linux Container (`x86_64-linux`)
- **Windows Build Status**: `WINDOWS BUILD: NOT EXECUTABLE IN CURRENT ENVIRONMENT`
- **Reason**: The build of the native Windows NSIS installer (`.exe`) requires Rust, Cargo, Tauri CLI (`@tauri-apps/cli`), and the Windows SDK (`winspool.drv`, `WebView2Loader.dll`). In this Linux container environment, `cargo` is not installed.

## Windows Host Packaging Prerequisites
To compile the official Windows production installer from source on a Windows 10/11 x64 machine:

1. **Prerequisites**:
   - Node.js v18+ LTS
   - Rust toolchain (stable-x86_64-pc-windows-msvc) via `rustup`
   - Microsoft Visual Studio C++ Build Tools 2022 (with Windows 10/11 SDK)
   - WebView2 Runtime (pre-installed on Windows 10/11)

2. **Build Steps**:
   ```cmd
   git clone <repo-url>
   cd nasaq-pos
   npm install
   npm run build
   npx tauri build
   ```

3. **Generated Installer Output**:
   - Target: `src-tauri/target/release/bundle/nsis/NasaqPOS_1.0.2_x64-setup.exe`
   - NSIS Mode: `currentUser` (installs to `%LOCALAPPDATA%\Programs\NasaqPOS` without requiring Windows UAC admin prompt)
   - Application Data: `%APPDATA%\com.nasaq.pos\data\nasaq.db`
   - Backups Folder: `%APPDATA%\com.nasaq.pos\backups\`
