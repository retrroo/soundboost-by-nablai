/**
 * SoundBoost by Nablai - Content Bridge Script (ISOLATED World)
 * 
 * Bridges communication between:
 * 1. Extension components (popup, background service worker, chrome.storage)
 * 2. Main world audio engine (content.js) via window.postMessage
 * 
 * Persists tab volume, chosen EQ profile, and diagnostic logs in chrome.storage.local.
 */

(function () {
  'use strict';

  if (window.__SONICBOOST_BRIDGE_INITIALIZED__) {
    return;
  }
  window.__SONICBOOST_BRIDGE_INITIALIZED__ = true;

  const RELAY_CHANNEL_TO_MAIN = 'SONICBOOST_TO_MAIN';
  const RELAY_CHANNEL_FROM_MAIN = 'SONICBOOST_TO_BRIDGE';

  const hostname = window.location.hostname || 'default';
  const storageKey = `domain_${hostname}`;

  let cachedState = {
    volume: 1.0,
    muted: false,
    preMuteVolume: 1.0,
    gains: [0, 0, 0, 0, 0],
    profileName: 'Flat',
    compressorEnabled: true,
    activeMediaCount: 0,
    hostname: hostname
  };

  let recentLogs = [];
  let saveStorageTimer = null;
  let saveLogsTimer = null;

  function postToMain(msg) {
    try {
      window.postMessage({
        channel: RELAY_CHANNEL_TO_MAIN,
        ...msg
      }, '*');
    } catch (err) {
      console.warn('[SoundBoost by Nablai Bridge] Failed to post message to MAIN world:', err);
    }
  }

  function persistStateToStorage(stateToSave) {
    if (saveStorageTimer) clearTimeout(saveStorageTimer);
    saveStorageTimer = setTimeout(() => {
      const data = {
        volume: stateToSave.volume,
        muted: stateToSave.muted,
        preMuteVolume: stateToSave.preMuteVolume,
        gains: stateToSave.gains,
        profileName: stateToSave.profileName,
        compressorEnabled: typeof stateToSave.compressorEnabled === 'boolean' ? stateToSave.compressorEnabled : true,
        lastUpdated: Date.now()
      };
      chrome.storage.local.set({ [storageKey]: data }, () => {
        if (chrome.runtime.lastError) {}
      });
    }, 150);
  }

  function queueLogPersistence(logEntry) {
    recentLogs.push(logEntry);
    if (recentLogs.length > 200) {
      recentLogs.shift();
    }

    if (saveLogsTimer) clearTimeout(saveLogsTimer);
    saveLogsTimer = setTimeout(() => {
      chrome.storage.local.set({ sonic_debug_logs: recentLogs }, () => {
        if (chrome.runtime.lastError) {}
      });
    }, 400);
  }

  function restoreDomainSettings() {
    chrome.storage.local.get([storageKey, 'sonic_debug_logs'], (result) => {
      if (chrome.runtime.lastError) return;

      if (Array.isArray(result.sonic_debug_logs)) {
        recentLogs = result.sonic_debug_logs;
      }

      const saved = result[storageKey];
      if (saved) {
        cachedState.volume = typeof saved.volume === 'number' ? saved.volume : 1.0;
        cachedState.muted = Boolean(saved.muted);
        cachedState.preMuteVolume = typeof saved.preMuteVolume === 'number' ? saved.preMuteVolume : 1.0;
        cachedState.gains = Array.isArray(saved.gains) ? saved.gains : [0, 0, 0, 0, 0];
        cachedState.profileName = saved.profileName || 'Flat';
        cachedState.compressorEnabled = typeof saved.compressorEnabled === 'boolean' ? saved.compressorEnabled : true;

        postToMain({
          action: 'SET_STATE',
          volume: cachedState.volume,
          muted: cachedState.muted,
          preMuteVolume: cachedState.preMuteVolume,
          gains: cachedState.gains,
          profileName: cachedState.profileName,
          compressorEnabled: cachedState.compressorEnabled
        });

        notifyBadgeUpdate();
      }
    });
  }

  function notifyBadgeUpdate() {
    chrome.runtime.sendMessage({
      action: 'UPDATE_BADGE',
      volume: cachedState.volume,
      muted: cachedState.muted,
      hostname: hostname
    }, () => {
      if (chrome.runtime.lastError) {}
    });
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (!event.data || event.data.channel !== RELAY_CHANNEL_FROM_MAIN) return;

    const { action, state, logEntry, logs } = event.data;

    if (action === 'ENGINE_READY') {
      restoreDomainSettings();
    } else if (action === 'STATE_CHANGED' && state) {
      cachedState = {
        ...cachedState,
        ...state,
        hostname: hostname
      };
      persistStateToStorage(cachedState);
      notifyBadgeUpdate();
    } else if (action === 'APPEND_LOG' && logEntry) {
      queueLogPersistence(logEntry);
    } else if (action === 'LOGS_DATA' && Array.isArray(logs)) {
      recentLogs = logs;
      chrome.storage.local.set({ sonic_debug_logs: recentLogs });
    }
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message !== 'object') return false;

    if (message.action === 'GET_STATE') {
      sendResponse({
        success: true,
        state: cachedState
      });
      postToMain({ action: 'GET_STATE' });
      return true;
    }

    if (message.action === 'GET_LOGS') {
      // Return currently stored debug logs
      chrome.storage.local.get(['sonic_debug_logs'], (res) => {
        const storedLogs = res.sonic_debug_logs || recentLogs;
        sendResponse({
          success: true,
          logs: storedLogs
        });
      });
      postToMain({ action: 'GET_LOGS' });
      return true;
    }

    if (message.action === 'CLEAR_LOGS') {
      recentLogs = [];
      chrome.storage.local.remove(['sonic_debug_logs']);
      postToMain({ action: 'CLEAR_LOGS' });
      sendResponse({ success: true });
      return true;
    }

    // Forward control actions to MAIN world
    postToMain(message);

    if (message.action === 'SET_VOLUME') {
      if (typeof message.volume === 'number') {
        cachedState.volume = message.volume;
        if (cachedState.volume > 0 && cachedState.muted) {
          cachedState.muted = false;
        }
      }
      if (typeof message.muted === 'boolean') {
        cachedState.muted = message.muted;
      }
      persistStateToStorage(cachedState);
      notifyBadgeUpdate();
    } else if (message.action === 'TOGGLE_MUTE') {
      cachedState.muted = !cachedState.muted;
      persistStateToStorage(cachedState);
      notifyBadgeUpdate();
    } else if (message.action === 'SET_EQ') {
      if (Array.isArray(message.gains)) cachedState.gains = message.gains;
      if (message.profileName) cachedState.profileName = message.profileName;
      persistStateToStorage(cachedState);
    } else if (message.action === 'SET_COMPRESSOR') {
      if (typeof message.enabled === 'boolean') {
        cachedState.compressorEnabled = message.enabled;
      }
      persistStateToStorage(cachedState);
    } else if (message.action === 'RESET_VOLUME') {
      cachedState.volume = 1.0;
      cachedState.muted = false;
      persistStateToStorage(cachedState);
      notifyBadgeUpdate();
    } else if (message.action === 'RESET_EQ') {
      cachedState.gains = [0, 0, 0, 0, 0];
      cachedState.profileName = 'Flat';
      persistStateToStorage(cachedState);
    }

    sendResponse({
      success: true,
      state: cachedState
    });

    return true;
  });

  restoreDomainSettings();
})();
