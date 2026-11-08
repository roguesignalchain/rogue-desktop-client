# Rogue Signal Desktop (Tauri v2 + React 19)

**Rogue Signal Desktop** is the official all-in-one desktop client, node manager, and non-custodial wallet for the **Rogue Signal (ROGUE)** blockchain (Chain ID: `800055`).

Built with **Tauri v2**, **Rust**, **React 19**, **TypeScript**, and **Tailwind CSS**, it combines lightweight native performance with an advanced cyberpunk interface.

---

## 🚀 Key Features

* **Dual Connection Architecture (Hybrid Mode)**:
  * **Managed Local Node (Sidecar)**: Supervise, start, and stop `geth --rogue` and `rogue-stratum` processes with real-time log streaming (`stdout`/`stderr`).
  * **Remote RPC Mode**: Connect seamlessly to any external Rogue Signal node via standard JSON-RPC HTTP (`:38845`) and WebSocket (`:38846`).
* **Non-Custodial Cryptographic Keystore (Rust Core)**:
  * Hierarchical Deterministic (HD) key derivation conforming to **BIP-39** (12-word seed phrases) and **BIP-44** standard EVM path:
    $$\text{Derivation Path} = m/44'/60'/0'/0/x$$
  * Military-grade local vault encryption using **Argon2id** password-based key derivation function (KDF) and **AES-256-GCM** authenticated symmetric encryption.
  * Local offline signing for EVM EIP-155 transactions (`secp256k1` recoverable signatures with Chain ID `800055`).
* **Complete RandomX Mining & Stratum Control Center**:
  * **Internal CPU Miner**: Toggle internal multithreaded sealing directly from the UI with real-time thread adjustments.
  * **Memory Profiles**: Switch between **Light Mode** (~256 MB RAM cache, ideal for low-end hardware) and **Fast Mode** (`--randomx.fast`, ~2.1 GB dataset for maximum hash performance).
  * **Stratum v1 Bridge Supervisor**: Manage the native `cmd/rogue-stratum` TCP bridge on port `3333`.
  * **One-Click XMRig Integration**: Instant export of preconfigured `config.json` for external standalone mining rigs.
* **EIP-1559 Gas Estimation & Transaction Engine**:
  * Dynamic priority fee calculations (**Slow**, **Normal**, **Fast**) adhering to Rogue Signal's 60M block gas limit and 10s target block time.
  * Real-time balance and gas tracking in native ROGUE (18 decimals).
* **Mini On-Chain Explorer**:
  * Live monitoring of recent blocks, LWMA-1 difficulty adjustments, miner coinbase payouts, and transaction throughput.
* **Security & Inactivity Auto-Lock**:
  * Configurable auto-lock timers (5, 15, or 30 minutes) clearing decrypted secrets from RAM upon user inactivity.

---

## 🛠️ Binary Provisioning & Resolution

The application automatically resolves local node and bridge binaries with zero configuration:

1. **Adjacent Build Directory**: Resolves `../rogue-core-chain/build/bin/geth` and `../rogue-core-chain/build/bin/rogue-stratum`.
2. **Workspace Root**: Resolves `rogue-core-chain/build/bin/geth`.
3. **System PATH**: Falls back to global `geth` or `rogue-stratum` if installed system-wide.

To build the binaries from source before launching the client:
```bash
cd ../rogue-core-chain
make geth
make rogue-stratum
```

---

## 🔐 Keystore Architecture & Cryptographic Security

Private keys are never stored in plaintext or exposed to the JavaScript frontend. The keystore is isolated within the compiled Rust backend:

```
[Master Password] ---> Argon2id (Salt, Memory=64MB, Iterations=3) ---> 256-bit Key
                                                                           |
[BIP-39 Mnemonic] ---> JSON Payload ---> AES-256-GCM (12-byte Nonce) <------+
                                              |
                                     [.rogue-wallet.vault]
```

### Key Derivation Specifications:
* **Mnemonic**: 128-bit entropy generating 12 English words (BIP-39).
* **Master Seed**: 512-bit HMAC-SHA512 seed.
* **Account 0 Path**: `m/44'/60'/0'/0/0` (Standard Ethereum compatible).
* **Public Key to Address**: Keccak-256 hash of the uncompressed 64-byte public key (last 20 bytes with `0x` prefix).

---

## ⛏️ RandomX Mining & Stratum Bridge Workflow

```
+-------------------------------------------------------------------+
|                       Rogue Signal Desktop                        |
|                                                                   |
|  [Internal Miner] --------RPC miner_start------> [Core-Geth Node] |
|                                                        |          |
|  [Stratum Bridge :3333] <--eth_getWork / submitWork----+          |
+-------------------------------------------------------------------+
             ^
             | Stratum v1 Protocol
     [External XMRig Miners]
```

### XMRig Configuration
Export `config.json` directly from the Mining tab or connect manually:
```json
{
  "pools": [
    {
      "algo": "rx/0",
      "url": "127.0.0.1:3333",
      "user": "0xYourRogueAddressHere",
      "pass": "x"
    }
  ]
}
```

---

## 💸 EIP-1559 Transaction Fees

Rogue Signal executes EVM Cancun contracts and enforces EIP-1559 base fee burning. The client calculates gas parameters according to network conditions:
* **Base Fee**: Dynamically queried from the latest block header.
* **Priority Fee (Miner Tip)**:
  * **Slow**: $1 \text{ Gwei}$ ($\approx 20\text{s}$)
  * **Normal**: $2 \text{ Gwei}$ ($\approx 10\text{s}$)
  * **Fast**: $5 \text{ Gwei}$ ($< 10\text{s}$)
* **Total Max Fee**: $\text{Base Fee} \times 2 + \text{Priority Fee}$.

---

## 💻 Development & Building

### Prerequisites
* **Rust**: `rustc >= 1.75` and `cargo`
* **Node.js**: `node >= 18` and `npm >= 9`
* **Webkit2GTK & Build Tools** (on Debian/Ubuntu):
  ```bash
  sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libssl-dev libayatana-appindicator3-dev librsvg2-dev
  ```

### Development Mode
```bash
npm run dev          # Run frontend in Vite dev server (port 1420)
npm run tauri dev    # Launch full Tauri v2 desktop application with live reload
```

### Production Release
To compile native release binaries and installers (`.deb`, `.AppImage`):
```bash
npm run tauri build
```
Binaries will be output to `src-tauri/target/release/bundle/`.

