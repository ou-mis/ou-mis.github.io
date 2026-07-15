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

  function _restoreMeetingDays(days) {
    document.querySelectorAll('input[name="meetingDays"]').forEach(cb => {
      const checked = days.includes(cb.value);
      cb.checked = checked;
      cb.closest('.day-label').classList.toggle('checked', checked);
    });
    const daysEl = document.getElementById('cal-meeting-days');
    if (daysEl) daysEl.textContent = days.join(', ') || '—';
  }

  function setMeetingDays(days) {
    _restoreMeetingDays(days || []);
    State.set({ meetingDays: days || [] });
  }

  /* ── Office Hours (day groups with multiple times) ── */
  function _initOfficeHours() {
    document.getElementById('btn-add-office-hours').addEventListener('click', () => {
      _addOfficeHoursDay();
      _syncOfficeHoursToState();
    });
  }

  function _addOfficeHoursDay(data = {}) {
    const list = document.getElementById('office-hours-list');
    const idx  = list.querySelectorAll('.oh-day-group').length;
    const item = document.createElement('div');
    item.className = 'repeating-item oh-day-group';
    item.setAttribute('role', 'listitem');
    item.innerHTML = `
      <div class="repeating-item__fields oh-day-group__fields">
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
            <option value="Virtual">Virtual</option>
          </select>
        </div>
        <div class="field-group field-group--grow">
          <label class="field-label" for="oh-notes-${idx}">Notes</label>
          <input type="text" id="oh-notes-${idx}" class="input oh-notes"
                 value="${Utils.escapeHtml(data.notes || '')}"
                 placeholder="e.g., Room 3213, or Zoom link in Canvas" />
        </div>
        <div class="oh-times" role="list" aria-label="Times for this day"></div>
        <button type="button" class="btn btn--ghost btn--sm btn--add oh-add-time">+ Add Time</button>
      </div>
      <button type="button" class="repeating-item__remove oh-remove-day" aria-label="Remove office hours day" title="Remove">&#10005;</button>
    `;

    if (data.day) item.querySelector('.oh-day').value = data.day;

    const timesList = item.querySelector('.oh-times');
    const times = (data.times && data.times.length) ? data.times : [{ startTime: '', endTime: '' }];
    times.forEach(t => _addOfficeHoursTime(timesList, t));

    item.querySelector('.oh-add-time').addEventListener('click', () => {
      _addOfficeHoursTime(timesList);
      _syncOfficeHoursToState();
    });
    item.querySelector('.oh-remove-day').addEventListener('click', () => {
      item.remove();
      _syncOfficeHoursToState();
    });
    item.querySelectorAll('.oh-day, .oh-notes').forEach(el => {
      el.addEventListener('change', _syncOfficeHoursToState);
      el.addEventListener('input', Utils.debounce(_syncOfficeHoursToState, 400));
    });

    list.appendChild(item);
  }

  function _addOfficeHoursTime(timesList, data = {}) {
    const row = document.createElement('div');
    row.className = 'oh-time-row';
    row.setAttribute('role', 'listitem');
    row.innerHTML = `
      <div class="field-group">
        <label class="field-label">Start</label>
        <input type="time" class="input input--time oh-start" value="${data.startTime || ''}" />
      </div>
      <div class="field-group">
        <label class="field-label">End</label>
        <input type="time" class="input input--time oh-end" value="${data.endTime || ''}" />
      </div>
      <button type="button" class="btn btn--ghost btn--sm oh-remove-time" aria-label="Remove time slot" title="Remove time">&#10005;</button>
    `;
    row.querySelector('.oh-remove-time').addEventListener('click', () => {
      const parent = timesList;
      row.remove();
      // Keep at least one empty time row for convenience
      if (!parent.querySelectorAll('.oh-time-row').length) {
        _addOfficeHoursTime(parent);
      }
      _syncOfficeHoursToState();
    });
    row.querySelectorAll('input').forEach(el => {
      el.addEventListener('change', _syncOfficeHoursToState);
      el.addEventListener('input', Utils.debounce(_syncOfficeHoursToState, 400));
    });
    timesList.appendChild(row);
  }

  function _syncOfficeHoursToState() {
    const list = document.getElementById('office-hours-list');
    const officeHours = Array.from(list.querySelectorAll('.oh-day-group')).map(item => ({
      day:   item.querySelector('.oh-day').value,
      notes: item.querySelector('.oh-notes').value.trim(),
      times: Array.from(item.querySelectorAll('.oh-time-row')).map(row => ({
        startTime: row.querySelector('.oh-start').value,
        endTime:   row.querySelector('.oh-end').value,
      })).filter(t => t.startTime || t.endTime),
    })).filter(oh => oh.day);
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
    (s.meetingDays || []).forEach(day => {
      const cb = document.querySelector(`input[name="meetingDays"][value="${day}"]`);
      if (cb) { cb.checked = true; cb.closest('.day-label').classList.add('checked'); }
    });
    // Office hours (supports legacy flat entries)
    Utils.normalizeOfficeHours(s.officeHours).forEach(oh => _addOfficeHoursDay(oh));
    if (s.officeHours?.length && !document.querySelectorAll('.oh-day-group').length) {
      // Absolute fallback: if normalize returned empty but data existed oddly
      s.officeHours.forEach(oh => _addOfficeHoursDay(oh));
    }
    const daysEl = document.getElementById('cal-meeting-days');
    if (daysEl) daysEl.textContent = (s.meetingDays || []).join(', ') || '—';
  }

  function isComplete() {
    const s = State.get();
    return !!(s.instructorName && s.officeLocation && s.classRoom &&
              s.meetingDays.length && s.meetingStart && s.meetingEnd);
  }

  return { init, isComplete, setMeetingDays };
})();
