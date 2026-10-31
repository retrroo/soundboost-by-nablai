/**
 * SoundBoost by Nablai - Background Service Worker (Manifest V3)
 * 
 * Responsibilities:
 * 1. Lifecycle management for active tabs and domain navigation.
 * 2. Tab audio status badge updates (showing volume percentage / MUTE state).
 * 3. Dynamic badge coloring (Cyan for boost, Fiery Red for overdrive, Crimson for Mute).
 */

// Helper to extract hostname from a tab URL
function getHostname(url) {
  try {
    if (!url || !url.startsWith('http')) return null;
    return new URL(url).hostname;
  } catch (e) {
    return null;
  }
}

/**
 * Format badge text and color based on volume and mute state.
 * @param {number} volume - 0.0 to 6.0
 * @param {boolean} muted - Whether audio is muted
 * @returns {{ text: string, color: string }}
 */
function getBadgeDetails(volume, muted) {
  if (muted) {
    return { text: 'MUTE', color: '#ef4444' }; // Crimson red
  }

  const percentage = Math.round(volume * 100);

  if (percentage === 100) {
    return { text: '', color: '#000000' }; // Standard 100% has no cluttering badge
  }

  if (percentage > 300) {
    // Extreme overdrive (301% - 600%)
    return { text: `${percentage}`, color: '#f43f5e' }; // Fiery Rose
  }

  if (percentage > 100) {
    // Boosted audio (101% - 300%)
    return { text: `${percentage}`, color: '#06b6d4' }; // Electric Cyan
  }

  // Attenuated volume (< 100%)
  return { text: `${percentage}`, color: '#64748b' }; // Slate Gray
}

/**
 * Update the extension icon badge for a specific tab.
 * @param {number} tabId 
 * @param {number} volume 
 * @param {boolean} muted 
 */
function updateBadge(tabId, volume, muted) {
  if (typeof tabId !== 'number' || tabId < 0) return;

  const { text, color } = getBadgeDetails(volume, muted);

  chrome.action.setBadgeText({ tabId, text: text }, () => {
    if (chrome.runtime.lastError) return;
  });

  if (text) {
    chrome.action.setBadgeBackgroundColor({ tabId, color: color }, () => {
      if (chrome.runtime.lastError) return;
    });
  }
}

/**
 * Synchronize badge for a given tab using domain settings in chrome.storage.local.
 * @param {chrome.tabs.Tab} tab 
 */
function syncTabBadge(tab) {
  if (!tab || !tab.id || !tab.url) return;

  const hostname = getHostname(tab.url);
  if (!hostname) {
    chrome.action.setBadgeText({ tabId: tab.id, text: '' }, () => {
      if (chrome.runtime.lastError) return;
    });
    return;
  }

  const storageKey = `domain_${hostname}`;
  chrome.storage.local.get([storageKey], (result) => {
    if (chrome.runtime.lastError) return;
    const data = result[storageKey];
    if (data && typeof data.volume === 'number') {
      updateBadge(tab.id, data.volume, Boolean(data.muted));
    } else {
      updateBadge(tab.id, 1.0, false);
    }
  });
}

// 1. Tab activated (switched tabs)
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (chrome.runtime.lastError || !tab) return;
    syncTabBadge(tab);
  });
});

// 2. Tab updated (navigation or reload completed)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab) {
    syncTabBadge(tab);
  }
});

// 3. Listen for direct messages from content scripts or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.action === 'UPDATE_BADGE') {
    const tabId = sender.tab ? sender.tab.id : null;
    if (tabId) {
      updateBadge(tabId, message.volume, message.muted);
    } else {
      // If sent from popup without sender.tab, query active tab
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0]) {
          updateBadge(tabs[0].id, message.volume, message.muted);
        }
      });
    }
    sendResponse({ success: true });
    return true;
  }
});

// 4. Storage changes listener to update badges across tabs on the same domain
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;

  for (const key of Object.keys(changes)) {
    if (key.startsWith('domain_')) {
      const hostname = key.replace('domain_', '');
      const newValue = changes[key].newValue;
      if (!newValue) continue;

      // Find any tabs matching this domain and update their badges
      chrome.tabs.query({}, (tabs) => {
        if (chrome.runtime.lastError || !tabs) return;
        for (const tab of tabs) {
          if (getHostname(tab.url) === hostname) {
            updateBadge(tab.id, newValue.volume, Boolean(newValue.muted));
          }
        }
      });
    }
  }
});

// 5. Initial setup on worker start
chrome.runtime.onInstalled.addListener(() => {
  console.log('[SoundBoost by Nablai] Service Worker installed and ready.');
});
