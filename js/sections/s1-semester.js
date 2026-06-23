/**
 * s1-semester.js — Section 1: Semester & Course Header
 */
const S1 = (() => {
  function init() {
    _populateSemesterDropdown();
    _bindEvents();
    _restoreFromState();
    _onFieldChange(); // sync DOM → state after restore (e.g. auto-filled dates)
  }

  function _populateSemesterDropdown() {
    const sel = document.getElementById('semester');
    const sorted = [...Config.getSemesters()].sort((a, b) =>
      String(b.termCode).localeCompare(String(a.termCode))
    );
    sorted.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.termCode;
      opt.textContent = s.label;
      sel.appendChild(opt);
    });
  }

  function _bindEvents() {
    const semesterEl = document.getElementById('semester');
    if (semesterEl) {
      semesterEl.addEventListener('change', _onSemesterChange);
    }

    const fields = ['startDate', 'endDate', 'courseNumber', 'courseTitle', 'sectionNumber'];
    fields.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', _onFieldChange);
      el.addEventListener('input', Utils.debounce(_onFieldChange, 400));
    });
  }

  function _onSemesterChange() {
    const termCode = document.getElementById('semester').value;
    _applySemesterDates(termCode);
    _onFieldChange();
  }

  function _applySemesterDates(termCode) {
    const startEl = document.getElementById('startDate');
    const endEl = document.getElementById('endDate');
    const sem = Config.getSemesterByCode(termCode);

    if (sem) {
      startEl.value = sem.startDate;
      endEl.value = sem.endDate;
      startEl.disabled = false;
      endEl.disabled = false;
    } else {
      startEl.value = '';
      endEl.value = '';
      startEl.disabled = true;
      endEl.disabled = true;
    }
  }

  function _onFieldChange() {
    const state = {
      semester:      document.getElementById('semester').value,
      startDate:     document.getElementById('startDate').value,
      endDate:       document.getElementById('endDate').value,
      courseNumber:  document.getElementById('courseNumber').value.trim(),
      courseTitle:   document.getElementById('courseTitle').value.trim(),
      sectionNumber: document.getElementById('sectionNumber').value.trim(),
    };
    State.set(state);
    _updateCalendarMeta(state.semester);
  }

  function _updateCalendarMeta(termCode) {
    const sem = Config.getSemesterByCode(termCode);
    const labelEl = document.getElementById('cal-semester-label');
    if (labelEl) labelEl.textContent = sem ? sem.label : '—';
    // Propagate holidays to the calendar section meta
    const holidayEl = document.getElementById('cal-holidays-summary');
    if (holidayEl && sem) {
      const names = [...new Set(sem.holidays.map(h => h.name))];
      holidayEl.textContent = names.length ? names.join(', ') : 'None';
    }
  }

  function _restoreFromState() {
    const s = State.get();
    if (s.semester) {
      document.getElementById('semester').value = s.semester;
      _applySemesterDates(s.semester);
      if (s.startDate) document.getElementById('startDate').value = s.startDate;
      if (s.endDate) document.getElementById('endDate').value = s.endDate;
    }
    if (s.courseNumber) document.getElementById('courseNumber').value = s.courseNumber;
    if (s.courseTitle) document.getElementById('courseTitle').value = s.courseTitle;
    if (s.sectionNumber) document.getElementById('sectionNumber').value = s.sectionNumber;
    if (s.semester) _updateCalendarMeta(s.semester);
  }

  function isComplete() {
    const s = State.get();
    return !!(s.semester && s.startDate && s.endDate && s.courseNumber && s.courseTitle && s.sectionNumber);
  }

  return { init, isComplete };
})();
