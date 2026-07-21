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
  const comingFromRestore = _isComingFromRestore();
  const shouldRebuildCalendar = sessionStorage.getItem('_syllabusCalendarRebuild') === '1';

  if (comingFromRestore) {
    // Page reloaded after Load Form / Restore — apply silently, no banner
    sessionStorage.removeItem('_syllabusRestore');
    const saved = localStorage.getItem('syllabusGenerator_autosave');
    if (saved) {
      try {
        const parsed = CalendarEngine.migrateLoadedState(JSON.parse(saved));
        if (parsed.officeHours) {
          parsed.officeHours = Utils.normalizeOfficeHours(parsed.officeHours);
        }
        State.set(parsed);
      } catch (_) {}
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

  if (shouldRebuildCalendar) {
    sessionStorage.removeItem('_syllabusCalendarRebuild');
    S10.rebuildIfNeeded();
  }
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
    const isMobileNav = () => window.matchMedia('(max-width: 768px)').matches;
    let currentId = null;

    function setActive(id) {
      if (!id || id === currentId) return;
      currentId = id;
      sidebarLinks.forEach(link => {
        const active = link.dataset.section === id;
        link.classList.toggle('active', active);
        if (active && isMobileNav()) {
          link.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
        }
      });
    }

    function getActivationY() {
      // Prefer form-pane when it is the actual scroll container
      if (formPane && formPane.scrollHeight > formPane.clientHeight + 1) {
        return formPane.getBoundingClientRect().top + Math.min(140, formPane.clientHeight * 0.22);
      }
      const headerH = parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--header-height')
      ) || 62;
      const sidebar = document.querySelector('.sidebar');
      const sidebarH = isMobileNav() ? (sidebar?.offsetHeight || 0) : 0;
      return headerH + sidebarH + 24;
    }

    function updateActiveSection() {
      if (!sectionEls.length) return;
      const marker = getActivationY();
      let activeEl = sectionEls[0];
      for (const el of sectionEls) {
        if (el.getBoundingClientRect().top <= marker) activeEl = el;
      }
      setActive(activeEl.id);
    }

    const onScroll = Utils.debounce(updateActiveSection, 40);
    formPane?.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    sidebarLinks.forEach(link => {
      link.addEventListener('click', () => {
        const id = link.dataset.section;
        if (id) setActive(id);
      });
    });

    updateActiveSection();
  }

  /* ── Theme Picker ── */
  function _initThemePicker() {
    const swatches = document.querySelectorAll('.theme-swatch');
    const STORAGE_KEY = 'syllabusTheme';
    const MIGRATE_KEY = 'syllabusThemeDefaultV2';
    const DEFAULT_THEME = 'ou-crimson';
    const VALID_THEMES = new Set(['ou-crimson', 'steel', 'ou-gold', 'navy']);

    function applyTheme(theme) {
      const next = VALID_THEMES.has(theme) ? theme : DEFAULT_THEME;
      document.body.setAttribute('data-theme', next);
      swatches.forEach(s => {
        const active = s.dataset.theme === next;
        s.classList.toggle('theme-swatch--active', active);
        s.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      localStorage.setItem(STORAGE_KEY, next);
    }

    // One-time: when Crimson became the default, reset old Steel saves from
    // the previous default so the picker matches the new product default.
    if (!localStorage.getItem(MIGRATE_KEY)) {
      localStorage.setItem(STORAGE_KEY, DEFAULT_THEME);
      localStorage.setItem(MIGRATE_KEY, '1');
    }

    const saved = localStorage.getItem(STORAGE_KEY);
    applyTheme(VALID_THEMES.has(saved) ? saved : DEFAULT_THEME);

    swatches.forEach(swatch => {
      swatch.addEventListener('click', () => applyTheme(swatch.dataset.theme));
    });
  }

  /* ── Utility: detect if we're coming back from a reload triggered by restore ── */
  function _isComingFromRestore() {
    return sessionStorage.getItem('_syllabusRestore') === '1';
  }

})();
