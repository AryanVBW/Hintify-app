// Accessibility helper module
// Provides: TTS for hints, keyboard navigation, font scaling, high-contrast toggle

const Store = require('electron-store');
const store = new Store();

const A11y = (function() {
  const state = {
    ttsEnabled: store.get('a11y_tts_enabled', false),
    highContrast: store.get('a11y_high_contrast', false),
    fontScale: store.get('a11y_font_scale', 1),
    synth: typeof window !== 'undefined' && window.speechSynthesis ? window.speechSynthesis : null,
    currentUtterance: null
  };

  function applyFontScale() {
    document.documentElement.style.setProperty('--app-font-scale', state.fontScale);
    document.documentElement.style.fontSize = `${Math.round(100 * state.fontScale)}%`;
    store.set('a11y_font_scale', state.fontScale);
  }

  function speak(text, options = {}) {
    if (!state.ttsEnabled || !state.synth) return;
    stopSpeaking();
    try {
      const utter = new SpeechSynthesisUtterance(text);
      if (options.lang) utter.lang = options.lang;
      if (options.rate) utter.rate = options.rate;
      if (options.pitch) utter.pitch = options.pitch;
      if (options.voice) utter.voice = options.voice;
      state.currentUtterance = utter;
      state.synth.speak(utter);
    } catch (e) {
      console.warn('TTS speak error', e);
    }
  }

  function stopSpeaking() {
    if (state.synth && state.synth.speaking) {
      state.synth.cancel();
      state.currentUtterance = null;
    }
  }

  function toggleTTS(enable) {
    state.ttsEnabled = typeof enable === 'boolean' ? enable : !state.ttsEnabled;
    store.set('a11y_tts_enabled', state.ttsEnabled);
    return state.ttsEnabled;
  }

  function toggleHighContrast(enable) {
    state.highContrast = typeof enable === 'boolean' ? enable : !state.highContrast;
    store.set('a11y_high_contrast', state.highContrast);
    if (state.highContrast) document.documentElement.classList.add('high-contrast');
    else document.documentElement.classList.remove('high-contrast');
    return state.highContrast;
  }

  function increaseFont() {
    state.fontScale = Math.min(2, +(state.fontScale + 0.1).toFixed(2));
    applyFontScale();
    return state.fontScale;
  }

  function decreaseFont() {
    state.fontScale = Math.max(0.8, +(state.fontScale - 0.1).toFixed(2));
    applyFontScale();
    return state.fontScale;
  }

  function makeHintAccessible(hintEl) {
    if (!hintEl) return;
    hintEl.setAttribute('role', 'article');
    hintEl.setAttribute('tabindex', '0');
    // Prefer label from .hint-label or aria-label
    const label = hintEl.querySelector('.hint-label');
    if (label) {
      hintEl.setAttribute('aria-label', label.textContent.trim());
    }

    // Add keyboard handlers: Enter to read, Space to activate primary action
    hintEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        // Speak hint
        const text = hintEl.querySelector('.hint-text')?.textContent || hintEl.textContent;
        speak(text);
      }
      if (e.key === ' ' || e.key === 'Spacebar') {
        // Prevent page scroll
        e.preventDefault();
        // Activate first button in hint-actions
        const btn = hintEl.querySelector('.hint-actions .icon-btn');
        if (btn) btn.click();
      }
    });

    // Ensure actions buttons have accessible names
    const actionBtns = hintEl.querySelectorAll('.hint-actions .icon-btn');
    actionBtns.forEach((btn) => {
      if (!btn.getAttribute('aria-label')) {
        btn.setAttribute('aria-label', btn.textContent.trim() || 'Hint action');
      }
      btn.setAttribute('role', 'button');
      btn.setAttribute('tabindex', '0');
    });
  }

  function setupKeyboardNavigation(container = document) {
    // Simple arrow-key navigation between focusable hint items
    container.addEventListener('keydown', (e) => {
      if (!(e.key === 'ArrowDown' || e.key === 'ArrowUp')) return;
      const focusable = Array.from(container.querySelectorAll('.hint-item[tabindex]'));
      if (!focusable.length) return;
      const idx = focusable.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') {
        const next = focusable[Math.min(focusable.length - 1, idx + 1 >= 0 ? idx + 1 : 0)];
        if (next) next.focus();
        e.preventDefault();
      } else if (e.key === 'ArrowUp') {
        const prev = focusable[Math.max(0, idx - 1)];
        if (prev) prev.focus();
        e.preventDefault();
      }
    });
  }

  function makeAllHintsAccessible() {
    const hints = Array.from(document.querySelectorAll('.hint-item'));
    hints.forEach(makeHintAccessible);
  }

  function init() {
    applyFontScale();
    if (state.highContrast) document.documentElement.classList.add('high-contrast');
    setupKeyboardNavigation(document);

    // Observe DOM for dynamic hints added later
    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.classList && node.classList.contains('hint-item')) makeHintAccessible(node);
            // Also handle descendants
            node.querySelectorAll && node.querySelectorAll('.hint-item').forEach(makeHintAccessible);
          }
        }
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });

    // Wire UI controls if present
    const ttsBtn = document.getElementById('tts-toggle');
    if (ttsBtn) {
      ttsBtn.onclick = () => {
        const enabled = toggleTTS();
        ttsBtn.setAttribute('aria-pressed', enabled);
      };
      ttsBtn.setAttribute('aria-pressed', state.ttsEnabled);
    }

    const incBtn = document.getElementById('font-increase');
    const decBtn = document.getElementById('font-decrease');
    if (incBtn) incBtn.onclick = () => increaseFont();
    if (decBtn) decBtn.onclick = () => decreaseFont();

    const hcBtn = document.getElementById('high-contrast');
    if (hcBtn) {
      hcBtn.onclick = () => {
        const enabled = toggleHighContrast();
        hcBtn.setAttribute('aria-pressed', enabled);
      };
      hcBtn.setAttribute('aria-pressed', state.highContrast);
    }

    // Initial pass
    makeAllHintsAccessible();

    return {
      speak,
      stopSpeaking,
      toggleTTS,
      increaseFont,
      decreaseFont,
      toggleHighContrast
    };
  }

  return { init, state };
})();

module.exports = A11y;
