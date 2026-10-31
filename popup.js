/**
 * SoundBoost by Nablai - Controller
 * Fast, pure vanilla JS, zero decorative bloat.
 * Features built-in diagnostic logs viewer & clipboard export.
 */

(function () {
  'use strict';

  // 1. Built-in Equalizer Profiles
  const BUILTIN_PRESETS = {
    'Flat': [0, 0, 0, 0, 0],
    'Bass Boost': [6, 4.5, 1, -1, 0],
    'Vocal Clarity': [-2, 1, 4.5, 3.5, 2],
    'Late Night': [-5, -2, 2, 0, -4]
  };

  // 2. Application State
  let currentTabId = null;
  let currentHostname = 'default';
  let storageKey = 'domain_default';
  let customProfiles = {};
  let isEditingPreset = false;
  let editingPresetOriginalName = '';
  let cachedLogs = [];

  let currentState = {
    volume: 1.0,          // 0.0 to 6.0
    muted: false,
    preMuteVolume: 1.0,
    gains: [0, 0, 0, 0, 0],
    profileName: 'Flat',
    activeMediaCount: 0
  };

  // 3. DOM Elements
  const domainPill = document.getElementById('domainPill');
  const domainDisplay = document.getElementById('domainDisplay');

  const volumePercent = document.getElementById('volumePercent');
  const dbReadout = document.getElementById('dbReadout');
  const overdriveBadge = document.getElementById('overdriveBadge');
  const volumeSlider = document.getElementById('volumeSlider');
  const volumeFill = document.getElementById('volumeFill');
  const boostPills = document.querySelectorAll('.step-btn');

  const muteBtn = document.getElementById('muteBtn');
  const muteBtnText = document.getElementById('muteBtnText');
  const unmuteIcon = document.getElementById('unmuteIcon');
  const muteIcon = document.getElementById('muteIcon');
  const resetVolumeBtn = document.getElementById('resetVolumeBtn');

  const eqToggleBtn = document.getElementById('eqToggleBtn');
  const eqDrawer = document.getElementById('eqDrawer');
  const activeProfilePill = document.getElementById('activeProfilePill');

  const presetSelect = document.getElementById('presetSelect');
  const customOptGroup = document.getElementById('customOptGroup');
  const savePresetBtn = document.getElementById('savePresetBtn');
  const renamePresetBtn = document.getElementById('renamePresetBtn');
  const deletePresetBtn = document.getElementById('deletePresetBtn');

  const presetModal = document.getElementById('presetModal');
  const presetNameInput = document.getElementById('presetNameInput');
  const presetConfirmBtn = document.getElementById('presetConfirmBtn');
  const presetCancelBtn = document.getElementById('presetCancelBtn');

  const resetEqBtn = document.getElementById('resetEqBtn');

  const eqSliders = [
    document.getElementById('eqSlider0'),
    document.getElementById('eqSlider1'),
    document.getElementById('eqSlider2'),
    document.getElementById('eqSlider3'),
    document.getElementById('eqSlider4')
  ];

  const eqDbLabels = [
    document.getElementById('eqDb0'),
    document.getElementById('eqDb1'),
    document.getElementById('eqDb2'),
    document.getElementById('eqDb3'),
    document.getElementById('eqDb4')
  ];

  // Diagnostics DOM Elements
  const logsToggleBtn = document.getElementById('logsToggleBtn');
  const logsDrawer = document.getElementById('logsDrawer');
  const logsCountBadge = document.getElementById('logsCountBadge');
  const copyLogsBtn = document.getElementById('copyLogsBtn');
  const copyLogsBtnText = document.getElementById('copyLogsBtnText');
  const clearLogsBtn = document.getElementById('clearLogsBtn');
  const logsContainer = document.getElementById('logsContainer');

  // Theme Toggle Elements
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const sunIcon = document.getElementById('sunIcon');
  const moonIcon = document.getElementById('moonIcon');

  /**
   * Calculate decibels from linear gain.
   * dB = 20 * log10(gain)
   */
  function gainToDb(gain) {
    if (gain <= 0.0001) return '-inf';
    const db = 20 * Math.log10(gain);
    return (db >= 0 ? '+' : '') + db.toFixed(1);
  }

  /**
   * Format dB string for EQ fader indicators.
   */
  function formatDb(val) {
    const num = Number(val);
    if (num > 0) return `+${num.toFixed(1)}`;
    if (num === 0) return '0.0';
    return `${num.toFixed(1)}`;
  }

  /**
   * Update UI to reflect current volume and headroom state.
   */
  function renderVolumeUI() {
    const percent = Math.round(currentState.volume * 100);
    volumeSlider.value = percent;

    // Track Fill
    const fillPercent = (percent / 600) * 100;
    volumeFill.style.width = `${fillPercent}%`;

    const isBoost = percent > 100;
    const isOverdrive = percent > 300;

    // Headroom badge & text
    if (currentState.muted) {
      volumePercent.textContent = '0';
      dbReadout.textContent = '-inf dB';
      muteBtn.classList.add('active');
      muteBtnText.textContent = 'Unmute';
      unmuteIcon.classList.add('hidden');
      muteIcon.classList.remove('hidden');

      overdriveBadge.textContent = 'Muted';
      overdriveBadge.className = 'status-tag max';
    } else {
      volumePercent.textContent = `${percent}`;
      const dbStr = gainToDb(currentState.volume);
      dbReadout.textContent = `${dbStr} dB`;
      muteBtn.classList.remove('active');
      muteBtnText.textContent = 'Mute';
      unmuteIcon.classList.remove('hidden');
      muteIcon.classList.add('hidden');

      if (isOverdrive) {
        overdriveBadge.textContent = 'Overdrive';
        overdriveBadge.className = 'status-tag max';
      } else if (isBoost) {
        overdriveBadge.textContent = `${dbStr} dB`;
        overdriveBadge.className = 'status-tag boost';
      } else {
        overdriveBadge.textContent = 'Standard';
        overdriveBadge.className = 'status-tag';
      }
    }

    // Active segmented pill highlight
    boostPills.forEach(pill => {
      const level = Number(pill.getAttribute('data-level'));
      pill.classList.toggle('active', level === percent && !currentState.muted);
    });
  }

  /**
   * Update UI to reflect current Equalizer faders and profile name.
   */
  function renderEqUI() {
    currentState.gains.forEach((gainDb, idx) => {
      if (eqSliders[idx] && eqDbLabels[idx]) {
        eqSliders[idx].value = gainDb;
        eqDbLabels[idx].textContent = formatDb(gainDb);
      }
    });

    activeProfilePill.textContent = currentState.profileName || 'Custom';
    updatePresetSelectValue(currentState.profileName);
    updatePresetButtonsState();
  }

  /**
   * Update domain connection status.
   */
  function renderMediaStatus() {
    domainDisplay.textContent = currentHostname;
    const count = currentState.activeMediaCount || 0;
    domainPill.classList.toggle('active', count > 0);
  }

  /**
   * Synchronize dropdown options with custom profiles.
   */
  function populateCustomProfiles() {
    customOptGroup.innerHTML = '';
    const names = Object.keys(customProfiles);

    if (names.length === 0) {
      const opt = document.createElement('option');
      opt.disabled = true;
      opt.textContent = '(None saved)';
      customOptGroup.appendChild(opt);
    } else {
      names.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        customOptGroup.appendChild(opt);
      });
    }

    updatePresetSelectValue(currentState.profileName);
    updatePresetButtonsState();
  }

  function updatePresetSelectValue(profileName) {
    if (!profileName) return;
    let found = false;
    for (let i = 0; i < presetSelect.options.length; i++) {
      if (presetSelect.options[i].value === profileName) {
        presetSelect.selectedIndex = i;
        found = true;
        break;
      }
    }
    if (!found) {
      presetSelect.value = '';
    }
  }

  function updatePresetButtonsState() {
    const selected = presetSelect.value;
    const isCustom = Boolean(customProfiles[selected]);

    renamePresetBtn.disabled = !isCustom;
    deletePresetBtn.disabled = !isCustom;
  }

  /**
   * Send control message to active tab content script.
   */
  function sendTabMessage(message, callback = null) {
    if (!currentTabId) return;
    chrome.tabs.sendMessage(currentTabId, message, (response) => {
      if (chrome.runtime.lastError) return;
      if (response && response.state) {
        Object.assign(currentState, response.state);
        renderMediaStatus();
      }
      if (typeof callback === 'function') {
        callback(response);
      }
    });
  }

  /**
   * Debounced save to chrome.storage.local.
   */
  let saveTimer = null;
  function persistDomainState() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      chrome.storage.local.set({
        [storageKey]: {
          volume: currentState.volume,
          muted: currentState.muted,
          preMuteVolume: currentState.preMuteVolume,
          gains: currentState.gains,
          profileName: currentState.profileName,
          lastUpdated: Date.now()
        }
      });
    }, 100);
  }

  function persistCustomProfiles() {
    chrome.storage.local.set({ sonic_custom_profiles: customProfiles }, () => {
      populateCustomProfiles();
    });
  }

  /**
   * Load and render diagnostic logs.
   */
  function loadAndRenderLogs() {
    chrome.storage.local.get(['sonic_debug_logs'], (res) => {
      const logs = Array.isArray(res.sonic_debug_logs) ? res.sonic_debug_logs : [];
      cachedLogs = logs;
      logsCountBadge.textContent = `${logs.length} events`;

      if (logs.length === 0) {
        logsContainer.innerHTML = '<div class="log-empty">No events logged yet. Play audio or toggle fullscreen to capture telemetry.</div>';
        return;
      }

      logsContainer.innerHTML = '';
      // Render latest 50 entries
      const slice = logs.slice(-50);
      slice.forEach(item => {
        const row = document.createElement('div');
        row.className = 'log-entry';

        const catClass = ['FULLSCREEN', 'HOOK_SUCCESS', 'RECONNECT', 'WARN', 'HOOK_ERROR'].includes(item.category)
          ? `log-cat ${item.category}`
          : 'log-cat';

        const dataStr = item.data ? ` ${JSON.stringify(item.data)}` : '';
        row.innerHTML = `
          <span class="log-time">${item.timeStr || ''}</span>
          <span class="${catClass}">[${item.category}]</span>
          <span class="log-msg">${escapeHtml(item.message)}${escapeHtml(dataStr)}</span>
        `;
        logsContainer.appendChild(row);
      });

      // Scroll to bottom
      logsContainer.scrollTop = logsContainer.scrollHeight;
    });

    // Also ask tab content script for live logs
    sendTabMessage({ action: 'GET_LOGS' }, (res) => {
      if (res && Array.isArray(res.logs) && res.logs.length > 0) {
        cachedLogs = res.logs;
        logsCountBadge.textContent = `${cachedLogs.length} events`;
      }
    });
  }

  function escapeHtml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // --- Interactive Event Listeners ---

  // 1. Master Volume Slider Input
  volumeSlider.addEventListener('input', (e) => {
    const percent = Number(e.target.value);
    currentState.volume = percent / 100;
    currentState.muted = false;

    renderVolumeUI();
    sendTabMessage({
      action: 'SET_VOLUME',
      volume: currentState.volume,
      muted: false
    });
    persistDomainState();
  });

  // 2. Segmented Gain Step Buttons
  boostPills.forEach(pill => {
    pill.addEventListener('click', () => {
      const level = Number(pill.getAttribute('data-level'));
      currentState.volume = level / 100;
      currentState.muted = false;

      renderVolumeUI();
      sendTabMessage({
        action: 'SET_VOLUME',
        volume: currentState.volume,
        muted: false
      });
      persistDomainState();
    });
  });

  // 3. Mute / Unmute Button
  muteBtn.addEventListener('click', () => {
    currentState.muted = !currentState.muted;
    if (currentState.muted) {
      currentState.preMuteVolume = currentState.volume;
    } else {
      currentState.volume = currentState.preMuteVolume > 0 ? currentState.preMuteVolume : 1.0;
    }

    renderVolumeUI();
    sendTabMessage({ action: 'TOGGLE_MUTE' });
    persistDomainState();
  });

  // 4. Reset to 100% Button
  resetVolumeBtn.addEventListener('click', () => {
    currentState.volume = 1.0;
    currentState.muted = false;

    renderVolumeUI();
    sendTabMessage({ action: 'RESET_VOLUME' });
    persistDomainState();
  });

  // 5. Equalizer Drawer Toggle
  eqToggleBtn.addEventListener('click', () => {
    const isExpanded = eqToggleBtn.getAttribute('aria-expanded') === 'true';
    const nextState = !isExpanded;
    eqToggleBtn.setAttribute('aria-expanded', String(nextState));
    eqDrawer.classList.toggle('collapsed', !nextState);

    chrome.storage.local.set({ sonic_eq_drawer_open: nextState });
  });

  // 6. Diagnostics Logs Drawer Toggle
  logsToggleBtn.addEventListener('click', () => {
    const isExpanded = logsToggleBtn.getAttribute('aria-expanded') === 'true';
    const nextState = !isExpanded;
    logsToggleBtn.setAttribute('aria-expanded', String(nextState));
    logsDrawer.classList.toggle('collapsed', !nextState);

    if (nextState) {
      loadAndRenderLogs();
    }
  });

  // 7. Copy Logs to Clipboard
  copyLogsBtn.addEventListener('click', () => {
    chrome.storage.local.get(['sonic_debug_logs'], (res) => {
      const logs = Array.isArray(res.sonic_debug_logs) ? res.sonic_debug_logs : cachedLogs;
      if (logs.length === 0) {
        copyLogsBtnText.textContent = 'No logs!';
        setTimeout(() => { copyLogsBtnText.textContent = 'Copy logs'; }, 1500);
        return;
      }

      // Format as readable diagnostic report
      const formatted = logs.map(e => {
        const dataStr = e.data ? ` | ${JSON.stringify(e.data)}` : '';
        return `[${e.timeStr || ''}] [${e.category}] ${e.message}${dataStr}`;
      }).join('\n');

      const fullReport = `=== SOUNDBOOST BY NABLAI DIAGNOSTIC LOG REPORT ===\nDomain: ${currentHostname}\nExported: ${new Date().toISOString()}\nTotal Events: ${logs.length}\n\n${formatted}`;

      navigator.clipboard.writeText(fullReport).then(() => {
        copyLogsBtnText.textContent = 'Copied!';
        setTimeout(() => { copyLogsBtnText.textContent = 'Copy logs'; }, 1800);
      }).catch(() => {
        // Fallback using textarea
        const ta = document.createElement('textarea');
        ta.value = fullReport;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        copyLogsBtnText.textContent = 'Copied!';
        setTimeout(() => { copyLogsBtnText.textContent = 'Copy logs'; }, 1800);
      });
    });
  });

  // 8. Clear Logs
  clearLogsBtn.addEventListener('click', () => {
    cachedLogs = [];
    logsCountBadge.textContent = '0 events';
    logsContainer.innerHTML = '<div class="log-empty">Logs cleared.</div>';
    sendTabMessage({ action: 'CLEAR_LOGS' });
    chrome.storage.local.remove(['sonic_debug_logs']);
  });

  // 9. 5-Band Vertical Studio Faders
  eqSliders.forEach((slider, index) => {
    slider.addEventListener('input', (e) => {
      const val = Number(e.target.value);
      currentState.gains[index] = val;
      if (eqDbLabels[index]) {
        eqDbLabels[index].textContent = formatDb(val);
      }

      currentState.profileName = 'Custom';
      activeProfilePill.textContent = 'Custom';
      presetSelect.value = '';
      updatePresetButtonsState();

      sendTabMessage({
        action: 'SET_EQ',
        gains: currentState.gains,
        profileName: 'Custom'
      });
      persistDomainState();
    });
  });

  // 10. Preset Dropdown Change
  presetSelect.addEventListener('change', (e) => {
    const name = e.target.value;
    if (!name) return;

    let targetGains = null;
    if (BUILTIN_PRESETS[name]) {
      targetGains = [...BUILTIN_PRESETS[name]];
    } else if (customProfiles[name]) {
      targetGains = [...customProfiles[name]];
    }

    if (targetGains) {
      currentState.gains = targetGains;
      currentState.profileName = name;
      renderEqUI();

      sendTabMessage({
        action: 'SET_EQ',
        gains: currentState.gains,
        profileName: name
      });
      persistDomainState();
    }
  });

  // 11. Custom Preset Modal Actions
  savePresetBtn.addEventListener('click', () => {
    isEditingPreset = false;
    presetNameInput.value = '';
    presetConfirmBtn.textContent = 'Save';
    presetModal.classList.remove('hidden');
    presetNameInput.focus();
  });

  renamePresetBtn.addEventListener('click', () => {
    const currentName = presetSelect.value;
    if (!customProfiles[currentName]) return;

    isEditingPreset = true;
    editingPresetOriginalName = currentName;
    presetNameInput.value = currentName;
    presetConfirmBtn.textContent = 'Rename';
    presetModal.classList.remove('hidden');
    presetNameInput.focus();
  });

  presetCancelBtn.addEventListener('click', () => {
    presetModal.classList.add('hidden');
    presetNameInput.value = '';
  });

  presetConfirmBtn.addEventListener('click', () => {
    const name = presetNameInput.value.trim();
    if (!name) return;

    if (BUILTIN_PRESETS[name]) {
      alert('Cannot overwrite a built-in profile name.');
      return;
    }

    if (isEditingPreset && editingPresetOriginalName) {
      delete customProfiles[editingPresetOriginalName];
    }

    customProfiles[name] = [...currentState.gains];
    currentState.profileName = name;

    persistCustomProfiles();
    presetModal.classList.add('hidden');
    presetNameInput.value = '';

    sendTabMessage({
      action: 'SET_EQ',
      gains: currentState.gains,
      profileName: name
    });
    persistDomainState();
  });

  presetNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') presetConfirmBtn.click();
    if (e.key === 'Escape') presetCancelBtn.click();
  });

  deletePresetBtn.addEventListener('click', () => {
    const name = presetSelect.value;
    if (!customProfiles[name]) return;

    delete customProfiles[name];
    currentState.profileName = 'Flat';
    currentState.gains = [...BUILTIN_PRESETS['Flat']];

    persistCustomProfiles();
    renderEqUI();

    sendTabMessage({
      action: 'SET_EQ',
      gains: currentState.gains,
      profileName: 'Flat'
    });
    persistDomainState();
  });

  resetEqBtn.addEventListener('click', () => {
    currentState.gains = [0, 0, 0, 0, 0];
    currentState.profileName = 'Flat';
    renderEqUI();

    sendTabMessage({ action: 'RESET_EQ' });
    persistDomainState();
  });

  // --- 12. Theme Manager ---
  function applyTheme(theme) {
    const isDark = theme === 'dark';
    document.body.classList.toggle('dark-theme', isDark);
    if (sunIcon && moonIcon) {
      sunIcon.classList.toggle('hidden', !isDark);
      moonIcon.classList.toggle('hidden', isDark);
    }
    chrome.storage.local.set({ soundboost_theme: theme });
  }

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const isDark = document.body.classList.contains('dark-theme');
      applyTheme(isDark ? 'light' : 'dark');
    });
  }

  // --- 13. Ambient Constellation Particles Canvas ---
  function initCosmicCanvas() {
    const canvas = document.getElementById('cosmicCanvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let width = (canvas.width = window.innerWidth || 348);
    let height = (canvas.height = window.innerHeight || 500);

    const PARTICLE_COUNT = 24;
    const particles = [];

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.22,
        vy: (Math.random() - 0.5) * 0.22,
        radius: Math.random() * 1.2 + 0.6,
        alpha: Math.random() * 0.45 + 0.25
      });
    }

    let animationId = null;

    function render() {
      ctx.clearRect(0, 0, width, height);

      const isDark = document.body.classList.contains('dark-theme');

      // Connecting lines
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 75) {
            const lineAlpha = (1 - dist / 75);
            if (isDark) {
              ctx.strokeStyle = `rgba(255, 255, 255, ${lineAlpha * 0.12})`;
            } else {
              ctx.strokeStyle = `rgba(0, 0, 0, ${lineAlpha * 0.08})`;
            }
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }

      // Draw constellation dots
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;

        if (isDark) {
          ctx.fillStyle = `rgba(255, 255, 255, ${p.alpha * 0.75})`;
        } else {
          ctx.fillStyle = `rgba(0, 0, 0, ${p.alpha * 0.45})`;
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      animationId = requestAnimationFrame(render);
    }

    render();

    window.addEventListener('unload', () => {
      if (animationId) cancelAnimationFrame(animationId);
    });
  }

  // --- 14. Initialization ---
  function init() {
    initCosmicCanvas();

    // Load theme preference (defaults to dark mode if preferred or stored)
    chrome.storage.local.get(['soundboost_theme'], (res) => {
      const savedTheme = res.soundboost_theme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      applyTheme(savedTheme);
    });

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs && tabs[0];
      if (!activeTab || !activeTab.id) {
        domainDisplay.textContent = 'Unavailable';
        return;
      }

      currentTabId = activeTab.id;

      try {
        if (activeTab.url && activeTab.url.startsWith('http')) {
          currentHostname = new URL(activeTab.url).hostname;
        } else {
          currentHostname = 'System tab';
        }
      } catch (e) {
        currentHostname = 'Tab';
      }

      storageKey = `domain_${currentHostname}`;
      domainDisplay.textContent = currentHostname;

      chrome.storage.local.get(['sonic_custom_profiles', 'sonic_eq_drawer_open', storageKey, 'sonic_debug_logs'], (result) => {
        if (result.sonic_custom_profiles) {
          customProfiles = result.sonic_custom_profiles;
        }
        populateCustomProfiles();

        if (result.sonic_eq_drawer_open === true) {
          eqToggleBtn.setAttribute('aria-expanded', 'true');
          eqDrawer.classList.remove('collapsed');
        }

        if (Array.isArray(result.sonic_debug_logs)) {
          cachedLogs = result.sonic_debug_logs;
          logsCountBadge.textContent = `${cachedLogs.length} events`;
        }

        const savedDomain = result[storageKey];
        if (savedDomain) {
          if (typeof savedDomain.volume === 'number') currentState.volume = savedDomain.volume;
          if (typeof savedDomain.muted === 'boolean') currentState.muted = savedDomain.muted;
          if (typeof savedDomain.preMuteVolume === 'number') currentState.preMuteVolume = savedDomain.preMuteVolume;
          if (Array.isArray(savedDomain.gains)) currentState.gains = savedDomain.gains;
          if (savedDomain.profileName) currentState.profileName = savedDomain.profileName;
        }

        renderVolumeUI();
        renderEqUI();
        renderMediaStatus();

        sendTabMessage({ action: 'GET_STATE' });
      });
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
