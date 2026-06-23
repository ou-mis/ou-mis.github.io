/**
 * s2-logistics.js — Section 2: Instructor / Logistics
 */
const S2 = (() => {
  function init() {
    _bindSimpleFields();
    _bindDayCheckboxes();
    _initOfficeHours();
    _restoreFromState();
  }

  /* ── Simple text/time fields ── */
  function _bindSimpleFields() {
    const ids = [
      'instructorName','officeLocation','courseEmail','emailSubject',
      'classRoom','lmsUrl','meetingStart','meetingEnd',
      'finalExamDate','finalExamStart','finalExamEnd','finalExamRoom',
    ];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', _syncToState);
      el.addEventListener('input', Utils.debounce(_syncToState, 400));
    });
  }

  function _syncToState() {
    State.set({
      instructorName:  _val('instructorName'),
      officeLocation:  _val('officeLocation'),
      courseEmail:     _val('courseEmail'),
      emailSubject:    _val('emailSubject'),
      classRoom:       _val('classRoom'),
      lmsUrl:          _val('lmsUrl') || 'https://canvas.ou.edu',
      meetingStart:    _val('meetingStart'),
      meetingEnd:      _val('meetingEnd'),
      finalExamDate:   _val('finalExamDate'),
      finalExamStart:  _val('finalExamStart'),
      finalExamEnd:    _val('finalExamEnd'),
      finalExamRoom:   _val('finalExamRoom'),
      meetingDays:     _getCheckedDays(),
    });
    // Update calendar meta
    const daysEl = document.getElementById('cal-meeting-days');
    if (daysEl) daysEl.textContent = _getCheckedDays().join(', ') || '—';
  }

  function _val(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  /* ── Day checkboxes ── */
  function _bindDayCheckboxes() {
    document.querySelectorAll('input[name="meetingDays"]').forEach(cb => {
      cb.addEventListener('change', () => {
        // Toggle .checked class for CSS fallback
        cb.closest('.day-label').classList.toggle('checked', cb.checked);
        _syncToState();
      });
    });
  }

  function _getCheckedDays() {
    return Array.from(document.querySelectorAll('input[name="meetingDays"]:checked'))
      .map(cb => cb.value);
  }

  /* ── Office Hours (repeating) ── */
  function _initOfficeHours() {
    document.getElementById('btn-add-office-hours').addEventListener('click', () => {
      _addOfficeHoursRow();
      _syncOfficeHoursToState();
    });
  }

  function _addOfficeHoursRow(data = {}) {
    const list = document.getElementById('office-hours-list');
    const idx  = list.querySelectorAll('.repeating-item').length;
    const item = document.createElement('div');
    item.className = 'repeating-item';
    item.setAttribute('role', 'listitem');
    item.innerHTML = `
      <div class="repeating-item__fields">
        <div class="field-group">
          <label class="field-label" for="oh-day-${idx}">Day</label>
          <select id="oh-day-${idx}" class="input input--select oh-day">
            <option value="">—</option>
            <option value="Monday">Monday</option>
            <option value="Tuesday">Tuesday</option>
            <option value="Wednesday">Wednesday</option>
            <option value="Thursday">Thursday</option>
            <option value="Friday">Friday</option>
            <option value="By Appointment">By Appointment</option>
            <option value="Virtual">Virtual (Zoom)</option>
          </select>
        </div>
        <div class="field-group">
          <label class="field-label" for="oh-start-${idx}">Start</label>
          <input type="time" id="oh-start-${idx}" class="input input--time oh-start" value="${data.startTime||''}" />
        </div>
        <div class="field-group">
          <label class="field-label" for="oh-end-${idx}">End</label>
          <input type="time" id="oh-end-${idx}" class="input input--time oh-end" value="${data.endTime||''}" />
        </div>
        <div class="field-group field-group--grow">
          <label class="field-label" for="oh-notes-${idx}">Notes</label>
          <input type="text" id="oh-notes-${idx}" class="input oh-notes"
                 value="${Utils.escapeHtml(data.notes||'')}" placeholder="e.g., Room 3213, or Zoom link in Canvas" />
        </div>
      </div>
      <button type="button" class="repeating-item__remove" aria-label="Remove office hours slot" title="Remove">&#10005;</button>
    `;
    // Set the day select value after insertion
    if (data.day) item.querySelector('.oh-day').value = data.day;
    item.querySelector('.repeating-item__remove').addEventListener('click', () => {
      item.remove();
      _syncOfficeHoursToState();
    });
    item.querySelectorAll('input, select').forEach(el => {
      el.addEventListener('change', _syncOfficeHoursToState);
      el.addEventListener('input', Utils.debounce(_syncOfficeHoursToState, 400));
    });
    list.appendChild(item);
  }

  function _syncOfficeHoursToState() {
    const list = document.getElementById('office-hours-list');
    const officeHours = Array.from(list.querySelectorAll('.repeating-item')).map(item => ({
      day:       item.querySelector('.oh-day').value,
      startTime: item.querySelector('.oh-start').value,
      endTime:   item.querySelector('.oh-end').value,
      notes:     item.querySelector('.oh-notes').value.trim(),
    }));
    State.set({ officeHours });
  }

  /* ── Restore from state ── */
  function _restoreFromState() {
    const s = State.get();
    const setVal = (id, v) => { const el = document.getElementById(id); if (el && v) el.value = v; };
    setVal('instructorName', s.instructorName);
    setVal('officeLocation', s.officeLocation);
    setVal('courseEmail', s.courseEmail);
    setVal('emailSubject', s.emailSubject);
    setVal('classRoom', s.classRoom);
    setVal('lmsUrl', s.lmsUrl);
    setVal('meetingStart', s.meetingStart);
    setVal('meetingEnd', s.meetingEnd);
    setVal('finalExamDate', s.finalExamDate);
    setVal('finalExamStart', s.finalExamStart);
    setVal('finalExamEnd', s.finalExamEnd);
    setVal('finalExamRoom', s.finalExamRoom);
    // Days
    s.meetingDays.forEach(day => {
      const cb = document.querySelector(`input[name="meetingDays"][value="${day}"]`);
      if (cb) { cb.checked = true; cb.closest('.day-label').classList.add('checked'); }
    });
    // Office hours
    s.officeHours.forEach(oh => _addOfficeHoursRow(oh));
    const daysEl = document.getElementById('cal-meeting-days');
    if (daysEl) daysEl.textContent = s.meetingDays.join(', ') || '—';
  }

  function isComplete() {
    const s = State.get();
    return !!(s.instructorName && s.officeLocation && s.classRoom &&
              s.meetingDays.length && s.meetingStart && s.meetingEnd);
  }

  return { init, isComplete };
})();
