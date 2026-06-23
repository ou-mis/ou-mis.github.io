/**
 * app.js — Application bootstrap.
 * Loads config, checks for restore data, then initializes all sections.
 */
(async () => {

  /* 1. Load JSON config files */
  try {
    await Config.load();
  } catch (err) {
    Utils.toast('Failed to load configuration files. Check that config/semesters.json and config/policies.json exist.', 'error', 8000);
    console.error('Config load error:', err);
    return;
  }

  /* 2. Check for auto-saved work */
  const restored = Persistence.checkForRestore();

  /* 3. Apply saved state before initializing sections */
  if (_isComingFromRestore()) {
    // Page reloaded after Load Form / Restore — apply silently, no banner
    sessionStorage.removeItem('_syllabusRestore');
    const saved = localStorage.getItem('syllabusGenerator_autosave');
    if (saved) {
      try { State.set(JSON.parse(saved)); } catch (_) {}
    }
  } else if (restored) {
    // Previous auto-save found on fresh load — ask the user
    Persistence.showRestoreBanner(restored.timestamp);
  }

  /* 4. Initialize each section */
  S1.init();
  S2.init();
  S3.init();
  S4.init();
  S5.init();
  S6.init();
  S7.init();
  S8.init();
  S9.init();
  S10.init();

  /* 5. Initialize preview, export, persistence */
  Preview.init();
  Export.init();
  Persistence.init();

  /* 6. Set up theme picker */
  _initThemePicker();

  /* 7. Set up sidebar progress tracking */
  _initSidebarProgress();

  /* 8. Set up active section highlighting on scroll */
  _initScrollSpy();

  /* (flag already cleared above in step 3) */

  console.log('Syllabus Generator initialized.');

  /* ── Sidebar Progress ── */
  function _initSidebarProgress() {
    const sections = [
      { id: 's1', checker: S1.isComplete },
      { id: 's2', checker: S2.isComplete },
      { id: 's3', checker: S3.isComplete },
      { id: 's4', checker: S4.isComplete },
      { id: 's5', checker: S5.isComplete },
      { id: 's6', checker: S6.isComplete },
      { id: 's7', checker: S7.isComplete },
      { id: 's8', checker: S8.isComplete },
      { id: 's9', checker: S9.isComplete },
      { id: 's10', checker: S10.isComplete },
    ];

    function updateProgress() {
      let complete = 0;
      sections.forEach(({ id, checker }) => {
        const link = document.querySelector(`.sidebar__link[data-section="${id}"]`);
        if (!link) return;
        const done = checker();
        link.dataset.status = done ? 'complete' : 'partial';
        if (done) complete++;
      });
      const countEl = document.getElementById('completion-count');
      if (countEl) countEl.textContent = complete;
    }

    State.subscribe(Utils.debounce(updateProgress, 600));
    updateProgress();
  }

  /* ── Scroll Spy ── */
  function _initScrollSpy() {
    const formPane = document.getElementById('form-pane');
    const sectionEls = Array.from(document.querySelectorAll('.form-section'));
    const sidebarLinks = Array.from(document.querySelectorAll('.sidebar__link'));

    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const id = entry.target.id;
          sidebarLinks.forEach(link => {
            link.classList.toggle('active', link.dataset.section === id);
          });
        }
      });
    }, {
      root: formPane,
      rootMargin: '-20% 0px -70% 0px',
      threshold: 0,
    });

    sectionEls.forEach(el => observer.observe(el));
  }

  /* ── Theme Picker ── */
  function _initThemePicker() {
    const swatches = document.querySelectorAll('.theme-swatch');
    const STORAGE_KEY = 'syllabusTheme';

    function applyTheme(theme) {
      if (theme === 'steel') {
        document.body.removeAttribute('data-theme');
      } else {
        document.body.setAttribute('data-theme', theme);
      }
      swatches.forEach(s => {
        const active = s.dataset.theme === theme;
        s.classList.toggle('theme-swatch--active', active);
        s.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      localStorage.setItem(STORAGE_KEY, theme);
    }

    // Restore saved theme, defaulting to OU Crimson
    const saved = localStorage.getItem(STORAGE_KEY) || 'ou-crimson';
    applyTheme(saved);

    swatches.forEach(swatch => {
      swatch.addEventListener('click', () => applyTheme(swatch.dataset.theme));
    });
  }

  /* ── Utility: detect if we're coming back from a reload triggered by restore ── */
  function _isComingFromRestore() {
    return sessionStorage.getItem('_syllabusRestore') === '1';
  }

})();
