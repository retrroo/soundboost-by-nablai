# Privacy Policy for SoundBoost by Nablai

*Last updated: November 1, 2026*

**SoundBoost by Nablai** ("we", "our", or "the Extension") is committed to protecting your privacy. This Privacy Policy explains our practices regarding user data, permissions, and security.

---

## 1. Summary (No Data Collection)

**SoundBoost does not collect, store, transmit, or sell any personal data, browsing history, or user activity.** 

All audio processing and volume adjustments take place 100% locally on your device within your browser session using standard Web Audio APIs.

---

## 2. Information We Do NOT Collect

- We do NOT collect personally identifiable information (such as name, email, IP address, or location).
- We do NOT monitor, record, or transmit browsing history, tab URLs, or website contents.
- We do NOT intercept, record, or transmit audio or video media playback streams.
- We do NOT use cookies, web beacons, or tracking technologies.
- We do NOT use third-party analytics services (such as Google Analytics, Mixpanel, or telemetry trackers).

---

## 3. Chrome Permissions & Why They Are Needed

SoundBoost requests only the minimal set of permissions required to function:

| Permission | Purpose & Scope |
| :--- | :--- |
| **`storage`** | Used exclusively to save your volume levels, equalizer presets, and active theme preference locally on your device using `chrome.storage.local`. This data never leaves your computer. |
| **`activeTab`** | Used when you click the extension icon to identify the active tab's domain name (e.g. `youtube.com`) so volume preferences can be applied to that specific site. |
| **`host_permissions` (`<all_urls>`)** | Used to hook into HTML5 `<video>` and `<audio>` elements across websites where media plays (e.g., YouTube, Twitch, Netflix, podcasts). Audio routing occurs strictly in-memory within the local Web Audio pipeline. |

---

## 4. Data Storage & Security

- **Local Storage:** All settings (gain level, mute state, custom EQ profiles) are stored locally in your browser's sandboxed storage (`chrome.storage.local`).
- **No Remote Servers:** The extension does not connect to external servers or cloud databases. It functions completely offline once installed.

---

## 5. Third-Party Sharing

We do not sell, rent, trade, or transfer any user data to third parties. We do not display ads or affiliate links.

---

## 6. Children's Privacy

SoundBoost does not knowingly collect or solicit any information from anyone under the age of 13.

---

## 7. Changes to This Policy

If this Privacy Policy is updated, the revised version will be published on this page with an updated revision date.

---

## 8. Contact & Open Source Auditing

SoundBoost is open-source and auditable on GitHub:  
- **GitHub Repository:** [https://github.com/retrroo/soundboost-by-nablai](https://github.com/retrroo/soundboost-by-nablai)
- **Developer:** Nablai ([https://nablai.app](https://nablai.app))
- **Issues & Inquiries:** [https://github.com/retrroo/soundboost-by-nablai/issues](https://github.com/retrroo/soundboost-by-nablai/issues)
