# SoundBoost by Nablai ⚡

> **The Next-Generation Tab Volume Booster & 5-Band Studio EQ for Google Chrome (Manifest V3)**  
> Boost tab volume up to **600%** with studio-grade dynamics compression, a 5-band parametric equalizer, custom presets, and **zero audio clipping** — all without breaking native HTML5 fullscreen or triggering WebRTC screen-share warnings.

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-black?style=flat-square&logo=googlechrome)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Web Audio API](https://img.shields.io/badge/Audio-Web%20Audio%20API-blue?style=flat-square)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
[![Zero Dependencies](https://img.shields.io/badge/Dependencies-0%20(Pure%20Vanilla%20JS)-green?style=flat-square)](#)
[![Design Standard](https://img.shields.io/badge/Design-Unslop%20Craft-black?style=flat-square)](https://github.com/heydamir/unslop)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

---

## Why SoundBoost? (SoundBoost vs. Legacy Boosters)

Most popular Chrome volume boosters (such as *Volume Master* and its clones) were architected around outdated Chrome APIs that introduce severe friction, audio-video lag, and broken browser ergonomics. 

**SoundBoost by Nablai** was engineered from the ground up to solve every single one of these structural flaws:

| Feature / Capability | Legacy Boosters (Volume Master, etc.) | SoundBoost by Nablai ⚡ |
| :--- | :--- | :--- |
| **Native OS Fullscreen** | ❌ **Broken.** Traps tab in simulated WebRTC stream window. | ✅ **100% Native.** Full OS-level HTML5 `requestFullscreen()` with hardware acceleration. |
| **Capture Method** | `chrome.tabCapture.capture()` (Simulated screen recording). | **Direct DOM Web Audio Hook** (`world: "MAIN"` via `createMediaElementSource`). |
| **Browser Stream Warning** | ❌ **Annoying blue banner** ("This tab is being shared/recorded"). | ✅ **Zero warnings or banners.** Runs invisibly and natively. |
| **Audio Latency & Lip Sync** | ❌ 150ms – 300ms WebRTC buffer delay (noticeable desync). | ✅ **0ms delay.** Real-time direct Web Audio node routing. |
| **High Gain Audio Quality** | ❌ **Horrible digital clipping** & harsh square-wave distortion. | ✅ **Dynamics Compressor Protection** (-6dB threshold, 8:1 ratio) for crisp, punchy audio. |
| **Equalizer (EQ)** | ❌ None, or crude 3-band slider without Q-factor control. | ✅ **Studio 5-Band Parametric EQ** with customizable profiles & presets. |
| **SPA & DOM Recovery** | ❌ Audio drops out when entering fullscreen on YouTube/Twitch. | ✅ **Resilient Node Caching** with automatic `fullscreenchange` context recovery. |
| **Design & Experience** | ❌ Bloated, sluggish UI with third-party ads & trackers. | ✅ **Unslop Craft:** Dual Dark/Light themes, Nablai ambient particles, 0 ads, 0 trackers. |

---

## The Technical Deep-Dive

### 1. Eliminating the `chrome.tabCapture` Fullscreen Trap
Traditional volume boosters call `chrome.tabCapture.capture()` to intercept a tab's audio output. While easy to implement, this forces Chrome to treat the tab as an active WebRTC broadcast stream. As a result:
- Native OS-level HTML5 fullscreen is completely disabled; videos cannot stretch across your full monitor natively or take advantage of GPU display scaling.
- Chrome plasters a persistent blue streaming banner at the top of your tab.
- Audio is encoded and decoded through WebRTC buffers, introducing noticeable audio-video latency and lip-sync issues.
- Picture-in-Picture (PiP) and media session hardware keys often break.

**How SoundBoost fixes it:**  
SoundBoost runs directly in the tab's execution context (`"world": "MAIN"`). It intercepts media elements (`<video>` and `<audio>`) using `AudioContext.createMediaElementSource(element)`. Native video rendering pipelines, GPU hardware acceleration, Picture-in-Picture, and native OS fullscreen remain completely untouched and flawless.

### 2. Solving the Fullscreen Audio Drop Bug (DOM Reparenting)
Single-Page Applications (SPAs) like **YouTube, Twitch, Netflix, and Disney+** frequently reparent or swap media elements in the DOM when toggling fullscreen or switching theater modes. 

Under the Web Audio API specification:
- Calling `createMediaElementSource(element)` twice on the same element throws a fatal `InvalidStateError: HTMLMediaElement already connected to an AudioNode`.
- Disconnecting a source node on element removal leaves the tab permanently muted when the element is re-attached.

**SoundBoost's solution:**  
SoundBoost maintains a persistent `WeakSet` / internal node registry of attached media elements. Media sources are linked to a centralized `MasterInputBus` and preserved across DOM reparenting. In addition, SoundBoost binds directly to `fullscreenchange` and `webkitfullscreenchange` lifecycle events to immediately verify context state and invoke `audioCtx.resume()` without interrupting audio playback.

### 3. Studio Dynamics Compressor (Zero Clipping up to 600%)
Boosting audio signals past 100% naturally pushes decibel peaks beyond 0 dBFS (Full Scale), resulting in harsh digital clipping and listener fatigue.

SoundBoost places a studio-grade `DynamicsCompressorNode` at the final stage before output:
- **Threshold:** `-6 dB` (initiates compression only when signal enters dangerous territory)
- **Knee:** `12 dB` (smooth, musical transition between uncompressed and compressed dynamics)
- **Ratio:** `8:1` (authoritative peak management preventing square-wave distortion)
- **Attack:** `0.003 s` (sub-millisecond transient response to catch sudden explosions or claps)
- **Release:** `0.25 s` (transparent release curve that breathes naturally with speech and music)

### 4. 5-Band Parametric Equalizer & Sound Profiles
Fine-tune sound for cheap laptop speakers, high-end studio monitors, or bass-heavy headphones:
- **60 Hz (Low Shelf):** Deep sub-bass, kick drum weight, and cinematic rumble.
- **250 Hz (Peaking, Q: 1.0):** Low-mid warmth, guitar thickness, and chest resonance.
- **1,000 Hz (Peaking, Q: 1.0):** Dialogue articulation and vocal presence.
- **4,000 Hz (Peaking, Q: 1.0):** Treble bite, clarity, snare snap, and consonant recognition.
- **12,000 Hz (High Shelf):** Air, sparkle, cymbal shimmer, and high-frequency acoustic space.

Includes built-in presets:
- **Flat:** Transparent reference response (0 dB across all bands).
- **Bass Boost:** Deep low-end accentuation (+5 dB @ 60Hz, +2 dB @ 250Hz).
- **Vocal Clarity:** Enhanced dialogue crispness for podcasts, tutorials, and YouTube lectures (+3 dB @ 1kHz, +4 dB @ 4kHz, -2 dB @ 60Hz).
- **Late Night:** Dialogue boost with suppressed sub frequencies (-5 dB @ 60Hz, +3 dB @ 1kHz) for night listening without waking housemates.
- **Custom Profiles:** Save, rename, and delete your own custom presets with instant synchronization.

---

## Audio Pipeline Architecture

```
[ HTMLMediaElement (<video> / <audio>) ]
                     │
                     ▼
          [ Master Input Bus ]
                     │
                     ▼
       ┌───────────────────────────┐
       │   5-Band Parametric EQ    │
       ├───────────────────────────┤
       │ Band 1: LowShelf  (60Hz)  │
       │ Band 2: Peaking   (250Hz) │
       │ Band 3: Peaking   (1kHz)  │
       │ Band 4: Peaking   (4kHz)  │
       │ Band 5: HighShelf (12kHz) │
       └───────────────────────────┘
                     │
                     ▼
          [ Master GainNode ]
       (Volume: 0% to 600% / 0.0 to 6.0)
                     │
                     ▼
     [ DynamicsCompressorNode ]
     (Anti-Clipping & Anti-Distortion)
                     │
                     ▼
       [ AudioContext.destination ]
          (Speakers / Headphones)
```

---

## Unslop Design System

Crafted in alignment with the [unslop](https://github.com/heydamir/unslop) design philosophy:

- **Dual-Theme Support:**
  - **Dark Mode:** Deep pitch-black base (`#000000`) with subtle elevated surfaces (`#121214`), muted borders (`#27272a`), and glowing white primary metrics.
  - **Light Mode:** High-contrast clean white surface (`#ffffff`) with crisp neutral card steps (`#f4f4f5`) and refined zinc typography.
- **Adaptive Ambient Particles:**
  - Lightweight HTML5 canvas rendering interactive constellation particles that seamlessly flip between dark and light modes, paying homage to the [Nablai](https://nablai.app) web design language.
- **Monospace Tabular Figures:**
  - Decibel values (`+6.0 dB`), gain readouts (`340%`), and frequencies (`1.0 kHz`) utilize `ui-monospace` tabular numerals to prevent layout shifting and visual jitter during rapid slider drags.
- **Instant Diagnostics Drawer:**
  - Built-in live telemetry logger with one-click clipboard export for effortless debugging across complex web applications.

---

## Installation Guide

### Option 1: Load Directly into Chrome (Developer Mode)

1. Clone or download this repository:
   ```bash
   git clone https://github.com/retrroo/soundboost-by-nablai.git
   ```
2. Open Google Chrome (or any Chromium browser: Brave, Edge, Opera, Arc).
3. Navigate to `chrome://extensions/` in the address bar.
4. Enable the **Developer mode** toggle in the top-right corner.
5. Click **Load unpacked** in the top-left corner.
6. Select the cloned `soundboost-by-nablai` directory.
7. Pin **SoundBoost by Nablai** to your toolbar and enjoy pure, distortion-free sound!

---

## Project Structure

```
soundboost-by-nablai/
├── manifest.json         # Manifest V3 configuration with isolated & main worlds
├── content.js            # Main-world script: Web Audio graph, EQ, compressor, observer
├── content-bridge.js     # Isolated-world bridge: chrome.storage & background messaging
├── background.js         # Service worker: toolbar badge updates (volume % & MUTE)
├── popup.html            # Unslop UI: master volume, faders rack, profile manager
├── popup.css             # Dual theme CSS: typography, custom range sliders, micro-transitions
├── popup.js              # UI controller: audio calculations, profile storage, particle engine
├── fonts/                # Self-hosted web fonts
├── icons/                # Waveform audio branding icons (16px, 32px, 48px, 128px)
├── .gitignore            # Git exclusion rules
├── LICENSE               # MIT License
└── README.md             # Documentation & architecture breakdown
```

---

## Privacy & Security

- **0 Trackers, 0 Analytics, 0 External Requests:** SoundBoost does not transmit any information across the network. All volume adjustments, domain configurations, and equalizer profiles are kept 100% local to your machine via `chrome.storage.local`.
- **Open Source:** Clean, readable, and fully auditable vanilla JavaScript without minified obfuscation or third-party bundle bloat.

---

## Contributing

Contributions, feature requests, and bug reports are welcome!  
Feel free to open an issue or submit a pull request on GitHub: [retrroo/soundboost-by-nablai](https://github.com/retrroo/soundboost-by-nablai).

---

## License

Released under the [MIT License](LICENSE).  
Engineered with precision by [Nablai](https://nablai.app).
