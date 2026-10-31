/**
 * SoundBoost by Nablai - Content Script (MAIN Execution World)
 * 
 * Direct Web Audio hook into HTMLMediaElements without chrome.tabCapture.
 * Features comprehensive diagnostic logging for debugging fullscreen transitions,
 * SPA media swaps (YouTube/Twitch/Netflix), and AudioContext lifecycle.
 */

(function () {
  'use strict';

  // Prevent duplicate injections
  if (window.__SONICBOOST_INITIALIZED__) {
    return;
  }
  window.__SONICBOOST_INITIALIZED__ = true;

  // Constants
  const RELAY_CHANNEL_IN = 'SONICBOOST_TO_MAIN';
  const RELAY_CHANNEL_OUT = 'SONICBOOST_TO_BRIDGE';

  const EQ_FREQUENCIES = [
    { type: 'lowshelf', freq: 60, q: 1.0, name: '60Hz' },
    { type: 'peaking', freq: 250, q: 1.0, name: '250Hz' },
    { type: 'peaking', freq: 1000, q: 1.0, name: '1kHz' },
    { type: 'peaking', freq: 4000, q: 1.0, name: '4kHz' },
    { type: 'highshelf', freq: 12000, q: 1.0, name: '12kHz' }
  ];

  // --- DIAGNOSTIC LOGGING SUBSYSTEM ---
  const MAX_LOGS = 300;
  window.__SONICBOOST_LOGS__ = [];

  function formatTime(date) {
    const pad = (n, z = 2) => String(n).padStart(z, '0');
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
  }

  function log(category, message, data = null) {
    const now = new Date();
    const timeStr = formatTime(now);

    const logEntry = {
      timestamp: now.getTime(),
      timeStr: timeStr,
      category: category,
      message: message,
      data: data ? sanitizeData(data) : null
    };

    // Keep circular buffer in memory
    window.__SONICBOOST_LOGS__.push(logEntry);
    if (window.__SONICBOOST_LOGS__.length > MAX_LOGS) {
      window.__SONICBOOST_LOGS__.shift();
    }

    // High-visibility console output
    const consolePrefix = `%c[SoundBoost by Nablai ${timeStr}]%c [${category}]`;
    const stylePrefix = 'color: #0284c7; font-weight: bold;';
    const styleCategory = 'color: #0f172a; font-weight: 600;';

    if (data) {
      console.log(consolePrefix, stylePrefix, styleCategory, message, data);
    } else {
      console.log(consolePrefix, stylePrefix, styleCategory, message);
    }

    // Forward to bridge for storage persistence
    try {
      window.postMessage({
        channel: RELAY_CHANNEL_OUT,
        action: 'APPEND_LOG',
        logEntry: logEntry
      }, '*');
    } catch (e) {}
  }

  function sanitizeData(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    try {
      if (obj instanceof HTMLElement) {
        return `<${obj.tagName.toLowerCase()}${obj.id ? '#' + obj.id : ''}${obj.className ? '.' + String(obj.className).slice(0, 30) : ''}>`;
      }
      return JSON.parse(JSON.stringify(obj, (key, value) => {
        if (value instanceof HTMLElement) {
          return `<${value.tagName.toLowerCase()}${value.id ? '#' + value.id : ''}>`;
        }
        if (typeof value === 'function') return '[Function]';
        return value;
      }));
    } catch (e) {
      return String(obj);
    }
  }

  // Quick console copy helper for user: copy(__SOUNDBOOST_LOGS__)
  window.__SOUNDBOOST_LOGS__ = window.__SONICBOOST_LOGS__;
  window.__SOUNDBOOST_COPY_LOGS__ = function () {
    return JSON.stringify(window.__SOUNDBOOST_LOGS__, null, 2);
  };
  window.__SONICBOOST_COPY_LOGS__ = window.__SOUNDBOOST_COPY_LOGS__;

  log('INIT', 'Content script loaded in MAIN world', {
    url: window.location.href,
    readyState: document.readyState
  });

  // Pipeline State
  const state = {
    volume: 1.0,          // 0.0 to 6.0
    muted: false,
    preMuteVolume: 1.0,
    gains: [0, 0, 0, 0, 0],
    profileName: 'Flat',
    activeMediaCount: 0
  };

  let audioCtx = null;
  let inputBus = null;
  let eqFilters = [];
  let masterGain = null;
  let compressor = null;

  // Track connected elements: HTMLMediaElement -> MediaElementAudioSourceNode
  const mediaSourceMap = new WeakMap();
  const trackedElements = new Set();

  /**
   * Initialize or retrieve the unified AudioContext.
   */
  function getAudioContext() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        log('ERROR', 'Web Audio API is not supported in this browser context');
        return null;
      }

      audioCtx = new AudioContextClass();
      log('AUDIO_CTX', `AudioContext created (SampleRate: ${audioCtx.sampleRate}Hz, Initial state: ${audioCtx.state})`);

      // AudioContext state change listener
      audioCtx.onstatechange = () => {
        log('AUDIO_CTX', `AudioContext state changed to: '${audioCtx.state}'`);
        broadcastState();
      };

      // 1. Input Bus
      inputBus = audioCtx.createGain();
      inputBus.gain.setValueAtTime(1.0, audioCtx.currentTime);

      // 2. 5-Band Parametric EQ
      eqFilters = EQ_FREQUENCIES.map((band, idx) => {
        const filter = audioCtx.createBiquadFilter();
        filter.type = band.type;
        filter.frequency.setValueAtTime(band.freq, audioCtx.currentTime);
        filter.Q.setValueAtTime(band.q, audioCtx.currentTime);
        filter.gain.setValueAtTime(state.gains[idx] || 0, audioCtx.currentTime);
        return filter;
      });

      let lastNode = inputBus;
      for (const filter of eqFilters) {
        lastNode.connect(filter);
        lastNode = filter;
      }

      // 3. Master Gain
      masterGain = audioCtx.createGain();
      const initialGain = state.muted ? 0.0 : state.volume;
      masterGain.gain.setValueAtTime(initialGain, audioCtx.currentTime);
      lastNode.connect(masterGain);

      // 4. Dynamics Compressor (Threshold: -6dB, Knee: 12dB, Ratio: 8:1, Attack: 0.003s, Release: 0.25s)
      compressor = audioCtx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-6, audioCtx.currentTime);
      compressor.knee.setValueAtTime(12, audioCtx.currentTime);
      compressor.ratio.setValueAtTime(8, audioCtx.currentTime);
      compressor.attack.setValueAtTime(0.003, audioCtx.currentTime);
      compressor.release.setValueAtTime(0.25, audioCtx.currentTime);

      masterGain.connect(compressor);
      compressor.connect(audioCtx.destination);
      log('AUDIO_CTX', 'Web Audio pipeline nodes connected successfully');
    }

    if (audioCtx.state === 'suspended') {
      audioCtx.resume().then(() => {
        log('AUDIO_CTX', 'AudioContext auto-resumed successfully');
      }).catch(err => {
        log('WARN', 'AudioContext auto-resume blocked by browser policy:', err.message);
      });
    }

    return audioCtx;
  }

  function applyVolume(targetVolume, immediate = false) {
    if (!masterGain || !audioCtx) return;
    const effectiveVolume = state.muted ? 0.0 : Math.max(0.0, Math.min(6.0, targetVolume));
    
    if (immediate) {
      masterGain.gain.setValueAtTime(effectiveVolume, audioCtx.currentTime);
    } else {
      masterGain.gain.cancelScheduledValues(audioCtx.currentTime);
      masterGain.gain.setTargetAtTime(effectiveVolume, audioCtx.currentTime, 0.02);
    }
    log('VOLUME', `Applied gain: ${effectiveVolume.toFixed(2)} (${Math.round(effectiveVolume * 100)}%)`);
  }

  function applyEQ(gains) {
    if (!eqFilters.length || !audioCtx) return;
    gains.forEach((gainDb, index) => {
      if (eqFilters[index]) {
        const clamped = Math.max(-12, Math.min(12, Number(gainDb) || 0));
        eqFilters[index].gain.cancelScheduledValues(audioCtx.currentTime);
        eqFilters[index].gain.setTargetAtTime(clamped, audioCtx.currentTime, 0.02);
      }
    });
    log('EQ', 'Applied EQ band gains', gains);
  }

  /**
   * Hook an HTMLMediaElement.
   * CRITICAL BUGFIX: We NEVER disconnect an existing MediaElementAudioSourceNode
   * because HTMLMediaElements permanently route audio into Web Audio once hooked.
   * If already hooked, we re-verify and re-connect to inputBus.
   */
  function hookMediaElement(element) {
    if (!(element instanceof HTMLMediaElement)) return;

    const ctx = getAudioContext();
    if (!ctx || !inputBus) {
      log('WARN', 'Cannot hook media element: AudioContext unavailable');
      return;
    }

    // 1. If element was already hooked previously, ensure source is connected to inputBus!
    if (mediaSourceMap.has(element)) {
      const existingSource = mediaSourceMap.get(element);
      try {
        existingSource.connect(inputBus);
        log('RECONNECT', 'Reconnected existing source node to inputBus', {
          tagName: element.tagName,
          id: element.id || null,
          src: (element.currentSrc || element.src || '').slice(0, 60),
          paused: element.paused,
          muted: element.muted,
          volume: element.volume
        });
      } catch (err) {
        log('WARN', 'Error reconnecting existing source node:', err.message);
      }
      trackedElements.add(element);
      state.activeMediaCount = trackedElements.size;
      return;
    }

    // 2. New element hook
    try {
      const source = ctx.createMediaElementSource(element);
      source.connect(inputBus);
      mediaSourceMap.set(element, source);
      trackedElements.add(element);
      state.activeMediaCount = trackedElements.size;

      log('HOOK_SUCCESS', `Hooked <${element.tagName.toLowerCase()}> into AudioContext`, {
        id: element.id || null,
        className: element.className ? String(element.className).slice(0, 30) : null,
        currentSrc: (element.currentSrc || element.src || '').slice(0, 60),
        paused: element.paused,
        muted: element.muted,
        volume: element.volume,
        readyState: element.readyState
      });

      // Attach detailed event monitors
      const ensureResumed = (eventName) => {
        log('MEDIA_EVENT', `Event '${eventName}' on <${element.tagName.toLowerCase()}>`, {
          paused: element.paused,
          muted: element.muted,
          volume: element.volume,
          ctxState: ctx.state
        });
        if (ctx.state === 'suspended') {
          ctx.resume().then(() => {
            log('AUDIO_CTX', `Resumed AudioContext on ${eventName}`);
          }).catch(err => {
            log('WARN', `Resume failed on ${eventName}:`, err.message);
          });
        }
      };

      element.addEventListener('play', () => ensureResumed('play'), { passive: true });
      element.addEventListener('playing', () => ensureResumed('playing'), { passive: true });
      element.addEventListener('pause', () => log('MEDIA_EVENT', 'Element paused'), { passive: true });
      element.addEventListener('volumechange', () => {
        log('MEDIA_EVENT', 'Element native volumechange', {
          nativeVolume: element.volume,
          nativeMuted: element.muted
        });
      }, { passive: true });

      // Emptied/loadstart happens during quality changes or fullscreen transitions
      element.addEventListener('emptied', () => {
        log('MEDIA_EVENT', 'Element emptied (stream reset/mode transition)');
        // Re-ensure connection!
        try {
          source.connect(inputBus);
        } catch (e) {}
      }, { passive: true });

      element.addEventListener('loadstart', () => {
        log('MEDIA_EVENT', 'Element loadstart');
        try {
          source.connect(inputBus);
        } catch (e) {}
      }, { passive: true });

      if (!element.paused) {
        ensureResumed('initial_playing');
      }

      broadcastState();
    } catch (err) {
      if (err.name === 'InvalidStateError') {
        log('HOOK_NOTICE', 'Element already connected to an AudioSourceNode (will reuse)', {
          id: element.id,
          error: err.message
        });
      } else {
        log('HOOK_ERROR', 'Failed to hook media element:', {
          error: err.message,
          name: err.name
        });
      }
    }
  }

  /**
   * FULLSCREEN LIFECYCLE MONITOR & RECOVERY
   * Crucial fix: When fullscreen is entered or exited on YouTube/Twitch/Netflix,
   * DOM elements are wrapped/moved and AudioContext might get suspended.
   */
  function handleFullscreenChange(eventType) {
    const fsElement = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement;
    log('FULLSCREEN', `Event '${eventType}' triggered`, {
      isFullscreen: Boolean(fsElement),
      fullscreenElement: fsElement ? `<${fsElement.tagName.toLowerCase()}${fsElement.id ? '#' + fsElement.id : ''}>` : 'none',
      audioContextState: audioCtx ? audioCtx.state : 'uninitialized',
      activeMediaCount: trackedElements.size
    });

    // 1. Immediately resume AudioContext if suspended
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().then(() => {
        log('AUDIO_CTX', 'AudioContext resumed after fullscreen change');
      }).catch(err => {
        log('WARN', 'Failed to resume AudioContext after fullscreen change:', err.message);
      });
    }

    // 2. Scan and re-verify all media elements in the DOM
    scanForMedia(document);

    // 3. For any tracked element, re-verify connection to inputBus
    trackedElements.forEach(el => {
      if (mediaSourceMap.has(el)) {
        const source = mediaSourceMap.get(el);
        try {
          source.connect(inputBus);
        } catch (e) {}
      }
      // Check native mute state
      if (el.muted) {
        log('WARN', 'Notice: Video element has native muted=true during fullscreen transition');
      }
    });

    broadcastState();
  }

  document.addEventListener('fullscreenchange', () => handleFullscreenChange('fullscreenchange'), true);
  document.addEventListener('webkitfullscreenchange', () => handleFullscreenChange('webkitfullscreenchange'), true);
  document.addEventListener('mozfullscreenchange', () => handleFullscreenChange('mozfullscreenchange'), true);

  /**
   * Scan root node for media elements.
   */
  function scanForMedia(root) {
    if (!root) return;

    if (root instanceof HTMLMediaElement) {
      hookMediaElement(root);
      return;
    }

    if (root.querySelectorAll) {
      const elements = root.querySelectorAll('video, audio');
      if (elements.length > 0) {
        log('SCAN', `Discovered ${elements.length} media element(s) in subtree`);
        for (let i = 0; i < elements.length; i++) {
          hookMediaElement(elements[i]);
        }
      }
    }

    // Shadow DOM support (e.g. custom web players)
    if (root.shadowRoot) {
      scanForMedia(root.shadowRoot);
    }
    if (root.children) {
      for (let i = 0; i < root.children.length; i++) {
        if (root.children[i].shadowRoot) {
          scanForMedia(root.children[i].shadowRoot);
        }
      }
    }
  }

  /**
   * MutationObserver across SPAs
   * Note: We NEVER disconnect nodes on removal! In SPAs, elements are frequently
   * reparented or toggled. Disconnecting them breaks Web Audio permanence.
   */
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            scanForMedia(node);
          }
        }
      }
    }
  });

  function startObserver() {
    const target = document.documentElement || document.body || document;
    observer.observe(target, {
      childList: true,
      subtree: true
    });
    log('INIT', 'MutationObserver started on documentElement');
  }

  function setupUserGestureResume() {
    const resume = () => {
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().then(() => {
          log('AUDIO_CTX', 'Resumed AudioContext via user gesture event');
        }).catch(() => {});
      }
    };
    window.addEventListener('pointerdown', resume, { capture: true, passive: true });
    window.addEventListener('keydown', resume, { capture: true, passive: true });
    document.addEventListener('play', (e) => {
      if (e.target instanceof HTMLMediaElement) {
        hookMediaElement(e.target);
        resume();
      }
    }, { capture: true, passive: true });
  }

  function broadcastState() {
    window.postMessage({
      channel: RELAY_CHANNEL_OUT,
      action: 'STATE_CHANGED',
      state: {
        volume: state.volume,
        muted: state.muted,
        preMuteVolume: state.preMuteVolume,
        gains: [...state.gains],
        profileName: state.profileName,
        activeMediaCount: trackedElements.size,
        audioContextState: audioCtx ? audioCtx.state : 'uninitialized',
        logCount: window.__SONICBOOST_LOGS__.length
      }
    }, '*');
  }

  function handleCommand(msg) {
    if (!msg || typeof msg !== 'object') return;
    getAudioContext();

    log('CMD', `Received command: ${msg.action}`, msg);

    switch (msg.action) {
      case 'SET_VOLUME': {
        if (typeof msg.volume === 'number') {
          state.volume = Math.max(0.0, Math.min(6.0, msg.volume));
          if (state.volume > 0 && state.muted) {
            state.muted = false;
          }
          applyVolume(state.volume);
        }
        if (typeof msg.muted === 'boolean') {
          if (msg.muted && !state.muted) {
            state.preMuteVolume = state.volume;
            state.muted = true;
          } else if (!msg.muted && state.muted) {
            state.muted = false;
            state.volume = state.preMuteVolume > 0 ? state.preMuteVolume : 1.0;
          }
          applyVolume(state.volume);
        }
        broadcastState();
        break;
      }

      case 'TOGGLE_MUTE': {
        if (state.muted) {
          state.muted = false;
          state.volume = state.preMuteVolume > 0 ? state.preMuteVolume : 1.0;
        } else {
          state.preMuteVolume = state.volume;
          state.muted = true;
        }
        applyVolume(state.volume);
        broadcastState();
        break;
      }

      case 'SET_EQ': {
        if (Array.isArray(msg.gains)) {
          state.gains = msg.gains.map(g => Math.max(-12, Math.min(12, Number(g) || 0)));
          applyEQ(state.gains);
        }
        if (msg.profileName) {
          state.profileName = String(msg.profileName);
        }
        broadcastState();
        break;
      }

      case 'SET_STATE': {
        if (typeof msg.volume === 'number') state.volume = Math.max(0.0, Math.min(6.0, msg.volume));
        if (typeof msg.muted === 'boolean') state.muted = msg.muted;
        if (typeof msg.preMuteVolume === 'number') state.preMuteVolume = msg.preMuteVolume;
        if (Array.isArray(msg.gains)) {
          state.gains = msg.gains.map(g => Math.max(-12, Math.min(12, Number(g) || 0)));
          applyEQ(state.gains);
        }
        if (msg.profileName) state.profileName = String(msg.profileName);
        applyVolume(state.volume);
        broadcastState();
        break;
      }

      case 'RESET_VOLUME': {
        state.volume = 1.0;
        state.muted = false;
        applyVolume(1.0);
        broadcastState();
        break;
      }

      case 'RESET_EQ': {
        state.gains = [0, 0, 0, 0, 0];
        state.profileName = 'Flat';
        applyEQ(state.gains);
        broadcastState();
        break;
      }

      case 'GET_STATE': {
        broadcastState();
        break;
      }

      case 'GET_LOGS': {
        window.postMessage({
          channel: RELAY_CHANNEL_OUT,
          action: 'LOGS_DATA',
          logs: window.__SONICBOOST_LOGS__
        }, '*');
        break;
      }

      case 'CLEAR_LOGS': {
        window.__SONICBOOST_LOGS__ = [];
        log('INIT', 'Diagnostic logs cleared by user request');
        break;
      }

      default:
        break;
    }
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data && event.data.channel === RELAY_CHANNEL_IN) {
      handleCommand(event.data);
    }
  });

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      handleCommand(message);
      sendResponse({ success: true, state: { ...state, activeMediaCount: trackedElements.size } });
      return true;
    });
  }

  function init() {
    scanForMedia(document);
    startObserver();
    setupUserGestureResume();

    window.postMessage({
      channel: RELAY_CHANNEL_OUT,
      action: 'ENGINE_READY'
    }, '*');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
