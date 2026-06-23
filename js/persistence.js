/**
 * persistence.js — localStorage auto-save, form state export/import, reset.
 */
const Persistence = (() => {
  const LS_KEY = 'syllabusGenerator_autosave';
  const LS_TS  = 'syllabusGenerator_autosave_ts';

  function init() {
    // Auto-save on every state change
    State.subscribe(Utils.debounce(_autoSave, 500));

    // Save Progress → download JSON
    document.getElementById('btn-save-form').addEventListener('click', saveFormState);

    // Load Form → read JSON file
    document.getElementById('btn-load-form').addEventListener('click', () => {
      document.getElementById('input-load-form').click();
    });
    document.getElementById('input-load-form').addEventListener('change', loadFormState);

    // Reset
    document.getElementById('btn-reset').addEventListener('click', () => {
      document.getElementById('modal-reset').hidden = false;
    });
    document.getElementById('btn-reset-confirm').addEventListener('click', _doReset);
    document.getElementById('btn-reset-cancel').addEventListener('click', () => {
      document.getElementById('modal-reset').hidden = true;
    });
    document.querySelector('.modal__backdrop').addEventListener('click', () => {
      document.getElementById('modal-reset').hidden = true;
    });

    // Keyboard: close modal on Escape
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') document.getElementById('modal-reset').hidden = true;
    });
  }

  /* ── Auto-save ── */
  function _autoSave(state) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
      localStorage.setItem(LS_TS, new Date().toISOString());
    } catch (_) {
      // Storage quota exceeded — silently ignore
    }
  }

  /* ── Check for auto-saved data on load ── */
  function checkForRestore() {
    const saved = localStorage.getItem(LS_KEY);
    const ts    = localStorage.getItem(LS_TS);
    if (!saved) return null;
    try {
      const parsed = JSON.parse(saved);
      // Only restore if there's meaningful data
      if (!parsed.courseNumber && !parsed.courseTitle && !parsed.instructorName) return null;
      return { state: parsed, timestamp: ts };
    } catch (_) {
      return null;
    }
  }

  function showRestoreBanner(timestamp) {
    const banner = document.getElementById('restore-banner');
    const msg    = document.getElementById('restore-message');
    const ts = timestamp ? new Date(timestamp).toLocaleString() : 'a previous session';
    msg.textContent = `You have unsaved work from ${ts}.`;
    banner.hidden = false;
    document.getElementById('btn-restore-yes').addEventListener('click', () => {
      const saved = localStorage.getItem(LS_KEY);
      if (saved) {
        try {
          State.set(JSON.parse(saved));
          _reInitSections();
          Utils.toast('Work restored successfully.', 'success');
        } catch (_) {
          Utils.toast('Could not restore previous work.', 'error');
        }
      }
      banner.hidden = true;
    }, { once: true });
    document.getElementById('btn-restore-no').addEventListener('click', () => {
      localStorage.removeItem(LS_KEY);
      localStorage.removeItem(LS_TS);
      banner.hidden = true;
    }, { once: true });
  }

  /* ── Export Form State ── */
  function saveFormState() {
    const s = State.get();
    const json = JSON.stringify(s, null, 2);
    const courseNum = Utils.slugify(s.courseNumber || 'syllabus');
    const section  = Utils.slugify(s.sectionNumber || 'section');
    const semLabel = s.semester ? Config.getSemesterByCode(s.semester)?.label || s.semester : 'draft';
    const filename = `${courseNum}-${section}-${Utils.slugify(semLabel)}.form.json`;
    Utils.downloadFile(json, filename, 'application/json');
    Utils.toast('Form state saved.', 'success');
  }

  /* ── Import Form State ── */
  function loadFormState(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const parsed = JSON.parse(ev.target.result);
        State.set(parsed);
        _reInitSections();
        Utils.toast('Form loaded successfully. Calendar will need to be regenerated if semester changed.', 'info', 5000);
      } catch (_) {
        Utils.toast('Failed to load form — invalid JSON file.', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  /* ── Reset ── */
  function _doReset() {
    document.getElementById('modal-reset').hidden = true;
    State.reset();
    localStorage.removeItem(LS_KEY);
    localStorage.removeItem(LS_TS);
    // Reload the page for a clean slate
    window.location.reload();
  }

  /**
   * After loading state from file or localStorage, re-initialize all section UIs
   * by reloading the page. Sets a sessionStorage flag so app.js knows to
   * auto-apply the saved state without showing the restore banner.
   */
  function _reInitSections() {
    _autoSave(State.get());
    sessionStorage.setItem('_syllabusRestore', '1');
    window.location.reload();
  }

  return { init, checkForRestore, showRestoreBanner, saveFormState, loadFormState };
})();
