/**
 * s10-calendar.js — Section 10: Course Calendar
 */
const S10 = (() => {
  const DAY_ORDER = CalendarEngine.DAY_ORDER;
  const PATTERN_TTH = CalendarEngine.PATTERN_TTH;
  const PATTERN_MWF = CalendarEngine.PATTERN_MWF;
  const DEFAULT_VIEW = 'grid';
  let _lastFinalExamKey = '';
  let _lastDateKey = '';
  let _suppressAutoBuild = false;
  let _patternModalContext = null;

  function _getCalendarView() {
    const view = State.get().calendarView || DEFAULT_VIEW;
    return view === 'flat' || view === 'week' || view === 'grid' ? view : DEFAULT_VIEW;
  }

  function _syncViewButtons(view) {
    document.getElementById('btn-view-flat').classList.toggle('btn--active', view === 'flat');
    document.getElementById('btn-view-week').classList.toggle('btn--active', view === 'week');
    document.getElementById('btn-view-grid').classList.toggle('btn--active', view === 'grid');
  }

  function _renderCalendar(view) {
    const s = State.get();
    const activeView = view || _getCalendarView();
    const wrapper = document.getElementById('calendar-table-wrapper');

    if (!s.calendarRows.length) {
      wrapper.innerHTML = '<p class="calendar-placeholder">No calendar data to display. Click <strong>Generate Calendar</strong>.</p>';
      return;
    }

    if (activeView === 'grid') {
      _renderCalendarGrid(s);
    } else {
      _renderCalendarTable(s.calendarRows, activeView);
    }
  }

  function _buildFinalExamRow(s) {
    if (!s.finalExamDate) return null;
    const fDate = Utils.parseISODate(s.finalExamDate);
    if (!fDate) return null;
    return {
      date:     s.finalExamDate,
      day:      Utils.shortDayName(fDate),
      type:     'final-exam',
      name:     'Final Exam',
      topic:    s.finalExamRoom ? `Room: ${s.finalExamRoom}` : '',
      readings: '',
      due:      s.finalExamStart && s.finalExamEnd
        ? `${Utils.formatTime(s.finalExamStart)} – ${Utils.formatTime(s.finalExamEnd)}`
        : '',
    };
  }

  function _resolveFinalExamRow(s, rows) {
    return rows.find(r => r.type === 'final-exam') || _buildFinalExamRow(s);
  }

  function _upsertFinalExamRow() {
    const s = State.get();
    if (!s.calendarRows.length) return false;

    const withoutFinal = s.calendarRows.filter(r => r.type !== 'final-exam');
    const finalRow = _buildFinalExamRow(s);
    const nextRows = finalRow ? [...withoutFinal, finalRow] : withoutFinal;

    const changed = nextRows.length !== s.calendarRows.length
      || nextRows.some((row, i) => JSON.stringify(row) !== JSON.stringify(s.calendarRows[i]));
    if (!changed) return false;

    State.set({ calendarRows: nextRows });
    return true;
  }

  function _enableCsvButtons() {
    document.getElementById('btn-download-csv').disabled = false;
    document.getElementById('input-import-csv').disabled = false;
    document.getElementById('label-import-csv').setAttribute('aria-disabled', 'false');
    document.getElementById('label-import-csv').style.opacity = '';
    _syncClearButton();
  }

  function _disableCsvButtons() {
    document.getElementById('btn-download-csv').disabled = true;
    document.getElementById('input-import-csv').disabled = true;
    document.getElementById('label-import-csv').setAttribute('aria-disabled', 'true');
    document.getElementById('label-import-csv').style.opacity = '';
    _syncClearButton();
  }

  function _syncClearButton() {
    const btn = document.getElementById('btn-clear-calendar');
    if (!btn) return;
    const s = State.get();
    btn.disabled = !(s.calendarRows?.length || s.sessionPlan?.length);
  }

  function _canBuildCalendar(s) {
    return !!CalendarEngine.getSemesterContext(s, Config);
  }

  function _buildDateKey(s) {
    return [
      s.semester,
      s.startDate,
      s.endDate,
      JSON.stringify(s.noClassDays || []),
    ].join('|');
  }

  function _planHasContent(sessionPlan) {
    return (sessionPlan || []).some(p =>
      (p.topic || '').trim() || (p.readings || '').trim() || (p.due || '').trim()
    );
  }

  function _getEffectiveSessionPlan(s) {
    if (s.sessionPlan?.length) return s.sessionPlan;
    return CalendarEngine.rowsToPlan(s.calendarRows);
  }

  function _canConvertPattern() {
    const s = State.get();
    if (!_canBuildCalendar(s)) return false;
    const plan = _getEffectiveSessionPlan(s);
    return plan.length > 0 && _planHasContent(plan);
  }

  function _syncConvertButtons() {
    const btnMwf = document.getElementById('btn-convert-mwf');
    const btnTth = document.getElementById('btn-convert-tth');
    if (!btnMwf || !btnTth) return;

    const s = State.get();
    const canConvert = _canConvertPattern();
    const onMwf = CalendarEngine.meetingDaysEqual(s.meetingDays, PATTERN_MWF);
    const onTth = CalendarEngine.meetingDaysEqual(s.meetingDays, PATTERN_TTH);

    btnMwf.disabled = !canConvert || onMwf;
    btnTth.disabled = !canConvert || onTth;
  }

  function buildCalendar(options = {}) {
    const { silent = false, trimPlan = true } = options;
    const s = State.get();
    const ctx = CalendarEngine.getSemesterContext(s, Config);

    if (!ctx) {
      if (!silent) {
        if (!Config.getSemesterByCode(s.semester)) {
          Utils.toast('Please select a semester first (Section 1).', 'error');
        } else if (!s.meetingDays.length) {
          Utils.toast('Please select meeting days first (Section 2).', 'error');
        } else {
          Utils.toast('Please set course start and end dates (Section 1).', 'error');
        }
      }
      return false;
    }

    const skeleton = CalendarEngine.enumerateMeetingDates(ctx);
    const classCount = CalendarEngine.countClassMeetings(skeleton);
    let sessionPlan = s.sessionPlan?.length
      ? s.sessionPlan.map(p => ({ ...p }))
      : CalendarEngine.rowsToPlan(s.calendarRows);

    if (trimPlan && sessionPlan.length > classCount) {
      const dropped = sessionPlan.length - classCount;
      sessionPlan = CalendarEngine.normalizePlan(sessionPlan, classCount);
      if (!silent) {
        Utils.toast(`Trimmed ${dropped} period(s) — calendar has fewer class meetings.`, 'info', 4500);
      }
    }

    const rows = CalendarEngine.mapPlanToRows(skeleton, sessionPlan);
    const meetingDays = [...s.meetingDays];

    _suppressAutoBuild = true;
    State.set({
      sessionPlan,
      calendarRows: rows,
      lastMeetingDays: meetingDays,
    });
    _suppressAutoBuild = false;

    _lastDateKey = _buildDateKey(State.get());
    _upsertFinalExamRow();
    _renderCalendar(_getCalendarView());
    _syncViewButtons(_getCalendarView());
    _enableCsvButtons();
    _syncConvertButtons();

    if (!silent) {
      const planLen = sessionPlan.length;
      if (classCount > planLen && planLen > 0) {
        Utils.toast(
          `Calendar generated — ${classCount} class meetings; ${classCount - planLen} blank period(s).`,
          'success'
        );
      } else {
        Utils.toast(`Calendar generated — ${classCount} class meetings.`, 'success');
      }
    }

    return true;
  }

  function generateCalendar() {
    buildCalendar({ silent: false, trimPlan: true });
  }

  function clearCalendar() {
    const s = State.get();
    if (!s.calendarRows?.length && !s.sessionPlan?.length) {
      Utils.toast('Calendar is already empty.', 'info');
      return;
    }

    _suppressAutoBuild = true;
    State.set({
      calendarRows: [],
      sessionPlan: [],
      lastMeetingDays: [],
    });
    _suppressAutoBuild = false;

    _lastDateKey = _buildDateKey(State.get());
    _lastFinalExamKey = '';
    _disableCsvButtons();
    _syncConvertButtons();
    _syncViewButtons(_getCalendarView());
    _renderCalendar(_getCalendarView());
    Utils.toast('Calendar cleared.', 'success');
  }

  function _initClearCalendarModal() {
    const modal = document.getElementById('modal-clear-calendar');
    if (!modal) return;
    const backdrop = modal.querySelector('.modal__backdrop');

    document.getElementById('btn-clear-calendar').addEventListener('click', () => {
      const s = State.get();
      if (!s.calendarRows?.length && !s.sessionPlan?.length) {
        Utils.toast('Calendar is already empty.', 'info');
        return;
      }
      modal.hidden = false;
    });

    document.getElementById('btn-clear-calendar-confirm').addEventListener('click', () => {
      modal.hidden = true;
      clearCalendar();
    });

    document.getElementById('btn-clear-calendar-cancel').addEventListener('click', () => {
      modal.hidden = true;
    });

    backdrop.addEventListener('click', () => {
      modal.hidden = true;
    });
  }

  function rebuildIfNeeded() {
    const s = State.get();
    if (!s.sessionPlan?.length && !s.calendarRows?.length) return;
    if (!_canBuildCalendar(s)) return;
    buildCalendar({ silent: true, trimPlan: true });
  }

  function _updateCalendarField(rowRef, field, value) {
    const s = State.get();
    const rows = s.calendarRows.map(row => {
      if (row.type !== 'class') return row;
      if (rowRef.period && row.period === rowRef.period) return { ...row, [field]: value };
      if (rowRef.date && row.date === rowRef.date) return { ...row, [field]: value };
      return row;
    });

    let sessionPlan = s.sessionPlan || [];
    const period = rowRef.period || rows.find(r => r.date === rowRef.date)?.period;
    if (period) {
      sessionPlan = CalendarEngine.syncRowEdit(sessionPlan, period, { [field]: value });
    }

    State.set({ calendarRows: rows, sessionPlan });
    _syncConvertButtons();
  }

  function _reorderPeriods(fromPeriod, toPeriod) {
    if (!fromPeriod || !toPeriod || fromPeriod === toPeriod) return;

    const s = State.get();
    let sessionPlan = s.sessionPlan?.length
      ? s.sessionPlan.map(p => ({ ...p }))
      : CalendarEngine.rowsToPlan(s.calendarRows);

    sessionPlan = CalendarEngine.reorderPlan(sessionPlan, fromPeriod, toPeriod);
    _suppressAutoBuild = true;
    State.set({ sessionPlan });
    _suppressAutoBuild = false;
    buildCalendar({ silent: true, trimPlan: false });
    Utils.toast(`Moved period #${fromPeriod} → #${toPeriod}.`, 'success');
  }

  function _bindPeriodDrag(el, period) {
    if (!period) return;

    el.dataset.period = String(period);
    el.classList.add('cal-draggable');

    const handle = el.querySelector('.cal-drag-handle');
    if (handle) {
      handle.addEventListener('mousedown', () => { el.draggable = true; });
      handle.addEventListener('mouseup', () => { el.draggable = false; });
      handle.addEventListener('mouseleave', () => {
        if (!el.classList.contains('cal-dragging')) el.draggable = false;
      });
    } else {
      el.draggable = true;
    }

    el.addEventListener('dragstart', e => {
      // Don't start a period drag when selecting text inside a textarea
      if (e.target.closest('textarea, input')) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.setData('text/plain', String(period));
      e.dataTransfer.effectAllowed = 'move';
      el.classList.add('cal-dragging');
      el.draggable = true;
    });

    el.addEventListener('dragend', () => {
      el.classList.remove('cal-dragging');
      el.draggable = false;
      document.querySelectorAll('.cal-drop-target').forEach(n => n.classList.remove('cal-drop-target'));
    });

    el.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      el.classList.add('cal-drop-target');
    });

    el.addEventListener('dragleave', e => {
      if (!el.contains(e.relatedTarget)) {
        el.classList.remove('cal-drop-target');
      }
    });

    el.addEventListener('drop', e => {
      e.preventDefault();
      el.classList.remove('cal-drop-target');
      const fromPeriod = parseInt(e.dataTransfer.getData('text/plain'), 10);
      const toPeriod = period;
      if (fromPeriod && toPeriod) _reorderPeriods(fromPeriod, toPeriod);
    });
  }

  function convertSchedulePattern(fromDays, toDays) {
    const s = State.get();
    const ctx = CalendarEngine.getSemesterContext(s, Config);
    if (!ctx) {
      Utils.toast('Please select a semester and course dates first (Section 1).', 'error');
      return;
    }

    let sessionPlan = s.sessionPlan?.length
      ? s.sessionPlan.map(p => ({ ...p }))
      : CalendarEngine.rowsToPlan(s.calendarRows);

    if (!sessionPlan.length || !_planHasContent(sessionPlan)) {
      Utils.toast('Add topics to the calendar before converting patterns.', 'error');
      return;
    }

    // Convert using the source pattern dates (not current meetingDays, which may already differ)
    const sourceCtx = { ...ctx, meetingDays: fromDays };
    const fromCount = sessionPlan.length;
    const converted = CalendarEngine.convertPlanByWeek(sessionPlan, fromDays, toDays, sourceCtx);

    _suppressAutoBuild = true;
    S2.setMeetingDays(toDays);
    State.set({ sessionPlan: converted, lastMeetingDays: [...toDays] });
    _suppressAutoBuild = false;

    buildCalendar({ silent: false, trimPlan: true });

    Utils.toast(
      `Converted ${fromCount} period(s) → ${converted.length} period(s) (${CalendarEngine.formatMeetingDays(fromDays)} → ${CalendarEngine.formatMeetingDays(toDays)}).`,
      'success',
      5000
    );
  }

  function _requestPatternConversion(fromDays, toDays) {
    if (!_canBuildCalendar(State.get())) {
      Utils.toast('Please select a semester and course dates first (Section 1).', 'error');
      return;
    }

    const plan = _getEffectiveSessionPlan(State.get());
    if (!plan.length || !_planHasContent(plan)) {
      Utils.toast('Add topics to the calendar before converting patterns.', 'error');
      return;
    }

    const modal = document.getElementById('modal-pattern-convert');
    const body = document.getElementById('modal-pattern-body');
    const filledCount = plan.filter(p =>
      (p.topic || '').trim() || (p.readings || '').trim() || (p.due || '').trim()
    ).length;

    body.textContent =
      `Convert ${filledCount} class topic(s) from ${CalendarEngine.formatMeetingDays(fromDays)} to ${CalendarEngine.formatMeetingDays(toDays)}? ` +
      'Section 2 meeting days will be updated automatically. Expanding leaves extra days blank; compressing merges the 2nd and 3rd topics into the 2nd day.';
    _patternModalContext = { fromDays: [...fromDays], toDays: [...toDays] };
    modal.hidden = false;
  }

  function _initPatternConversionModal() {
    const modal = document.getElementById('modal-pattern-convert');
    const backdrop = modal.querySelector('.modal__backdrop');

    document.getElementById('btn-pattern-convert').addEventListener('click', () => {
      if (!_patternModalContext) return;
      const { fromDays, toDays } = _patternModalContext;
      modal.hidden = true;
      _patternModalContext = null;
      convertSchedulePattern(fromDays, toDays);
    });

    document.getElementById('btn-pattern-cancel').addEventListener('click', () => {
      modal.hidden = true;
      _patternModalContext = null;
    });

    backdrop.addEventListener('click', () => {
      document.getElementById('btn-pattern-cancel').click();
    });
  }

  function _handleStateCalendarChanges(s) {
    if (_suppressAutoBuild) return;
    if (!s.sessionPlan?.length) return;

    const dateKey = _buildDateKey(s);
    if (dateKey === _lastDateKey) return;
    if (!_canBuildCalendar(s)) return;

    // Semester/date/no-class changes only — not meeting-day checkbox toggles
    buildCalendar({ silent: true, trimPlan: true });
  }

  function init() {
    document.getElementById('btn-generate-calendar').addEventListener('click', generateCalendar);
    document.getElementById('btn-convert-mwf').addEventListener('click', () => {
      _requestPatternConversion(PATTERN_TTH, PATTERN_MWF);
    });
    document.getElementById('btn-convert-tth').addEventListener('click', () => {
      _requestPatternConversion(PATTERN_MWF, PATTERN_TTH);
    });
    document.getElementById('btn-download-csv').addEventListener('click', downloadCSVTemplate);
    document.getElementById('input-import-csv').addEventListener('change', importCSV);
    document.getElementById('btn-add-no-class').addEventListener('click', () => {
      _addNoClassRow();
      _syncNoClassDays();
    });
    document.getElementById('btn-view-flat').addEventListener('click', () => _setView('flat'));
    document.getElementById('btn-view-week').addEventListener('click', () => _setView('week'));
    document.getElementById('btn-view-grid').addEventListener('click', () => _setView('grid'));
    _initPatternConversionModal();
    _initClearCalendarModal();

    State.subscribe(Utils.debounce((s) => {
      if (!s.calendarRows.length) return;
      const key = [s.finalExamDate, s.finalExamStart, s.finalExamEnd, s.finalExamRoom].join('|');
      if (key === _lastFinalExamKey) return;
      _lastFinalExamKey = key;
      if (_upsertFinalExamRow()) _renderCalendar(_getCalendarView());
    }, 400));

    State.subscribe(Utils.debounce(_handleStateCalendarChanges, 400));
    State.subscribe(Utils.debounce(_syncConvertButtons, 400));
    State.subscribe(Utils.debounce(_syncClearButton, 400));

    _restoreFromState();
  }

  /* ── No-Class Days ── */
  function _addNoClassRow(data = {}) {
    const list = document.getElementById('no-class-days-list');
    const idx  = list.querySelectorAll('.repeating-item').length;
    const item = document.createElement('div');
    item.className = 'repeating-item';
    item.setAttribute('role', 'listitem');
    item.innerHTML = `
      <div class="repeating-item__fields">
        <div class="field-group">
          <label class="field-label" for="ncd-date-${idx}">Date</label>
          <input type="date" id="ncd-date-${idx}" class="input ncd-date" value="${data.date||''}" />
        </div>
        <div class="field-group field-group--grow">
          <label class="field-label" for="ncd-reason-${idx}">Reason <span class="field-label__optional">(optional)</span></label>
          <input type="text" id="ncd-reason-${idx}" class="input ncd-reason"
                 value="${Utils.escapeHtml(data.reason||'')}" placeholder="e.g., Department Symposium" />
        </div>
      </div>
      <button type="button" class="repeating-item__remove" aria-label="Remove no-class day" title="Remove">&#10005;</button>
    `;
    item.querySelector('.repeating-item__remove').addEventListener('click', () => {
      item.remove();
      _syncNoClassDays();
    });
    item.querySelectorAll('input').forEach(el => {
      el.addEventListener('change', _syncNoClassDays);
      el.addEventListener('input', Utils.debounce(_syncNoClassDays, 400));
    });
    list.appendChild(item);
  }

  function _syncNoClassDays() {
    const list = document.getElementById('no-class-days-list');
    const noClassDays = Array.from(list.querySelectorAll('.repeating-item')).map(item => ({
      date:   item.querySelector('.ncd-date').value,
      reason: item.querySelector('.ncd-reason').value.trim(),
    })).filter(d => d.date);
    State.set({ noClassDays });

    const s = State.get();
    if (s.sessionPlan?.length || s.calendarRows.length) {
      buildCalendar({ silent: true, trimPlan: true });
    }
  }

  /* ── Render Table ── */
  function _renderCalendarTable(rows, view) {
    const wrapper = document.getElementById('calendar-table-wrapper');
    if (!rows || rows.length === 0) {
      wrapper.innerHTML = '<p class="calendar-placeholder">No calendar data to display. Click <strong>Generate Calendar</strong>.</p>';
      return;
    }

    const table = document.createElement('table');
    table.className = 'calendar-table';
    table.setAttribute('role', 'grid');
    table.innerHTML = `
      <thead>
        <tr>
          <th scope="col">Period</th>
          <th scope="col">Date</th>
          <th scope="col">Day</th>
          <th scope="col">Topic</th>
          <th scope="col">Readings / Materials</th>
          <th scope="col">Due This Day</th>
        </tr>
      </thead>
      <tbody id="calendar-tbody"></tbody>
    `;
    const tbody = table.querySelector('tbody');

    if (view === 'week') {
      _renderByWeek(tbody, rows);
    } else {
      _renderFlat(tbody, rows);
    }

    wrapper.innerHTML = '';
    wrapper.appendChild(table);
  }

  function _renderFlat(tbody, rows) {
    rows.forEach((row, i) => _appendRow(tbody, row, i));
  }

  function _renderByWeek(tbody, rows) {
    let currentWeek = null;
    let weekNum     = 0;
    rows.forEach((row, i) => {
      const date     = Utils.parseISODate(row.date);
      const weekStart = _getWeekStart(date);
      const weekKey  = Utils.toISODate(weekStart);
      if (weekKey !== currentWeek) {
        currentWeek = weekKey;
        weekNum++;
        const headerRow = document.createElement('tr');
        headerRow.className = 'row--week-header';
        headerRow.innerHTML = `<td colspan="6">Week ${weekNum}</td>`;
        tbody.appendChild(headerRow);
      }
      _appendRow(tbody, row, i);
    });
  }

  function _getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay(); // 0=Sun
    d.setDate(d.getDate() - day + 1); // Monday
    return d;
  }

  function _appendRow(tbody, row) {
    const tr = document.createElement('tr');
    if (row.type === 'holiday' || row.type === 'no-class') {
      tr.className = 'row--holiday';
      const friendlyDate = Utils.formatDate(Utils.parseISODate(row.date));
      tr.innerHTML = `
        <td>—</td>
        <td>${friendlyDate}</td>
        <td>${Utils.escapeHtml(row.day)}</td>
        <td colspan="3"><em>${Utils.escapeHtml(row.name)} — No Class</em></td>
      `;
    } else if (row.type === 'final-exam') {
      tr.className = 'row--final';
      const friendlyDate = Utils.formatDate(Utils.parseISODate(row.date));
      tr.innerHTML = `
        <td>—</td>
        <td>${friendlyDate}</td>
        <td>${Utils.escapeHtml(row.day)}</td>
        <td><strong>FINAL EXAM</strong>${row.topic ? ` — ${Utils.escapeHtml(row.topic)}` : ''}</td>
        <td></td>
        <td>${Utils.escapeHtml(row.due)}</td>
      `;
    } else {
      const friendlyDate = Utils.formatDate(Utils.parseISODate(row.date));
      const periodLabel = row.period ? `#${row.period}` : '—';
      tr.className = 'row--class';
      tr.innerHTML = `
        <td class="cal-period">
          <span class="cal-drag-handle" title="Drag to reorder" aria-label="Drag period ${row.period || ''} to reorder">⠿</span>
          ${periodLabel}
        </td>
        <td>${friendlyDate}</td>
        <td>${Utils.escapeHtml(row.day)}</td>
        <td><textarea class="cal-topic" data-period="${row.period || ''}" data-field="topic" rows="2"
                      aria-label="Topic for period ${row.period || ''}">${Utils.escapeHtml(row.topic)}</textarea></td>
        <td><textarea class="cal-readings" data-period="${row.period || ''}" data-field="readings" rows="2"
                      aria-label="Readings for period ${row.period || ''}">${Utils.escapeHtml(row.readings)}</textarea></td>
        <td><textarea class="cal-due" data-period="${row.period || ''}" data-field="due" rows="2"
                      aria-label="Due for period ${row.period || ''}">${Utils.escapeHtml(row.due)}</textarea></td>
      `;
      tr.querySelectorAll('textarea').forEach(ta => {
        ta.addEventListener('input', Utils.debounce(() => {
          const period = parseInt(ta.dataset.period, 10);
          _updateCalendarField({ period }, ta.dataset.field, ta.value);
        }, 300));
      });
      tr.querySelectorAll('textarea').forEach(ta => {
        ta.addEventListener('input', () => {
          ta.style.height = 'auto';
          ta.style.height = ta.scrollHeight + 'px';
        });
      });
      _bindPeriodDrag(tr, row.period);
    }
    tbody.appendChild(tr);
  }

  /* ── CSV Download Template ── */
  function downloadCSVTemplate() {
    const s    = State.get();
    const rows = s.calendarRows;
    const lines = ['Period,Date,Day,Type,Name,Topic,Readings,Due'];
    rows.forEach(r => {
      const isNonClass = r.type === 'holiday' || r.type === 'no-class' || r.type === 'final-exam';
      const cols = [
        isNonClass ? '' : (r.period || ''),
        r.date,
        r.day,
        r.type,
        isNonClass ? (r.name || '') : '',
        isNonClass ? '' : (r.topic || ''),
        r.readings || '',
        r.due || '',
      ].map(v => `"${String(v).replace(/"/g, '""')}"`);
      lines.push(cols.join(','));
    });
    const csv      = lines.join('\r\n');
    const filename = Utils.slugify(`${s.courseNumber || 'course'}-${s.sectionNumber || 'section'}-calendar`) + '.csv';
    Utils.downloadFile(csv, filename, 'text/csv;charset=utf-8');
    Utils.toast('CSV template downloaded.', 'success');
  }

  /* ── CSV Import ── */
  function importCSV(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const csvRows = _parseCSV(ev.target.result);
        if (!csvRows.length) {
          Utils.toast('CSV appears to be empty or has no data rows.', 'error');
          e.target.value = '';
          return;
        }

        const hasPeriodCol = Object.prototype.hasOwnProperty.call(csvRows[0], 'period');
        const existing = State.get().calendarRows;
        const rowMap = {};
        existing.forEach(r => { rowMap[r.date] = { ...r }; });

        let created = 0, updated = 0, skipped = 0;
        const planByPeriod = {};
        (State.get().sessionPlan || []).forEach(p => { planByPeriod[p.period] = { ...p }; });

        csvRows.forEach(r => {
          const periodRaw = (r.period || '').trim();
          const periodNum = periodRaw ? parseInt(periodRaw, 10) : NaN;
          const iso = _normaliseDateStr(r.date || r['date'] || '');
          const type = (r.type || 'class').toLowerCase().trim();
          const topicOrName = (r.topic || r.name || '').trim();
          const readings    = (r.readings || '').trim();
          const due         = (r.due || '').trim();

          if (hasPeriodCol && periodNum && type === 'class') {
            planByPeriod[periodNum] = {
              period: periodNum,
              topic: topicOrName,
              readings,
              due,
            };
            updated++;
          }

          if (!iso) {
            if (!(hasPeriodCol && periodNum)) skipped++;
            return;
          }

          if (rowMap[iso]) {
            const ex = rowMap[iso];
            if (ex.type === 'class') {
              if (topicOrName) ex.topic    = topicOrName;
              if (readings)    ex.readings = readings;
              if (due)         ex.due      = due;
              if (periodNum)   ex.period   = periodNum;
            }
            if (!hasPeriodCol || !periodNum) updated++;
          } else {
            const dayName = (r.day || '').trim() || _dayNameFromISO(iso);
            rowMap[iso] = {
              date:     iso,
              day:      dayName,
              type:     type,
              name:     (type === 'holiday' || type === 'no-class' || type === 'final-exam')
                          ? topicOrName : '',
              topic:    type === 'class' ? topicOrName : '',
              readings: readings,
              due:      due,
              period:   periodNum || undefined,
            };
            created++;
          }
        });

        let sessionPlan = Object.values(planByPeriod).sort((a, b) => a.period - b.period);
        if (!sessionPlan.length) {
          sessionPlan = CalendarEngine.rowsToPlan(Object.values(rowMap));
        }

        _suppressAutoBuild = true;
        State.set({
          sessionPlan,
          calendarRows: Object.values(rowMap).sort((a, b) => a.date.localeCompare(b.date)),
        });
        _suppressAutoBuild = false;
        buildCalendar({ silent: true, trimPlan: false });

        const parts = [];
        if (created) parts.push(`${created} added`);
        if (updated) parts.push(`${updated} updated`);
        if (skipped) parts.push(`${skipped} skipped (bad date)`);
        Utils.toast(`CSV imported — ${parts.join(', ')}.`, skipped && !created && !updated ? 'error' : 'success');
      } catch (err) {
        console.error('CSV import error:', err);
        Utils.toast('Failed to parse CSV. Check that it uses the correct column headers.', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset so same file can be re-imported
  }

  /**
   * Accept common date formats and return YYYY-MM-DD, or null on failure.
   *   - Already ISO:   2025-08-26  →  2025-08-26
   *   - US slash:      8/26/2025   →  2025-08-26
   *   - Zero-padded:  08/26/2025  →  2025-08-26
   */
  function _normaliseDateStr(raw) {
    const s = (raw || '').trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slash) {
      const [, m, d, y] = slash;
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    // Fall back to native Date parse (handles "Aug 26, 2025" etc.)
    const dt = new Date(s);
    if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
    return null;
  }

  function _dayNameFromISO(iso) {
    const d = Utils.parseISODate(iso);
    return d ? Utils.shortDayName(d) : '';
  }

  function _parseCSV(text) {
    const lines = text.split(/\r?\n/).filter(Boolean);
    const headers = _splitCSVRow(lines[0]).map(h => h.trim().toLowerCase());
    return lines.slice(1).map(line => {
      const vals = _splitCSVRow(line);
      const obj = {};
      headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim(); });
      return obj;
    });
  }

  function _splitCSVRow(row) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '"') {
        if (inQuotes && row[i+1] === '"') { current += '"'; i++; }
        else { inQuotes = !inQuotes; }
      } else if (ch === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current);
    return result;
  }

  /* ── View Toggle ── */
  function _setView(view) {
    State.set({ calendarView: view });
    _syncViewButtons(view);
    _renderCalendar(view);
  }

  /* ── Restore ── */
  function _restoreFromState() {
    const s = State.get();
    _lastFinalExamKey = [s.finalExamDate, s.finalExamStart, s.finalExamEnd, s.finalExamRoom].join('|');
    _lastDateKey = _buildDateKey(s);
    s.noClassDays.forEach(d => _addNoClassRow(d));
    if (s.calendarRows.length) {
      _enableCsvButtons();
      _renderCalendar(_getCalendarView());
    }
    _syncViewButtons(_getCalendarView());
    _syncConvertButtons();
    _syncClearButton();
  }

  /* ── Visual Calendar Grid ── */
  function _renderCalendarGrid(s) {
    const rows       = s.calendarRows;
    const meetingDays = s.meetingDays;
    const wrapper    = document.getElementById('calendar-table-wrapper');

    if (!rows || rows.length === 0) {
      wrapper.innerHTML = '<p class="calendar-placeholder">No calendar data. Click <strong>Generate Calendar</strong>.</p>';
      return;
    }

    // Sort meeting days Sun→Sat
    const sortedDays = [...meetingDays].sort(
      (a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b)
    );

    // Group class/holiday rows by the Monday of their calendar week
    const weekMap = new Map();
    rows.forEach(row => {
      if (row.type === 'final-exam') return;
      const date   = Utils.parseISODate(row.date);
      const monday = _mondayOf(date);
      const key    = Utils.toISODate(monday);
      if (!weekMap.has(key)) weekMap.set(key, { monday, cells: {} });
      weekMap.get(key).cells[row.day] = row;
    });

    const weeks = Array.from(weekMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v);

    const finalRow = _resolveFinalExamRow(s, rows);

    // ── Table ──
    const table = document.createElement('table');
    table.className = 'calendar-grid';

    const thead = document.createElement('thead');
    const htr   = document.createElement('tr');
    htr.innerHTML = '<th class="cgrid-week-col">Week</th>' +
      sortedDays.map(d => `<th>${d}</th>`).join('');
    thead.appendChild(htr);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    weeks.forEach((week, idx) => {
      const tr = document.createElement('tr');
      // Alternate row colour every week
      tr.className = idx % 2 === 0 ? 'cgrid-row--even' : 'cgrid-row--odd';

      const weekTd = document.createElement('td');
      weekTd.className = 'cgrid-week-num';
      weekTd.textContent = idx + 1;
      tr.appendChild(weekTd);

      sortedDays.forEach(day => {
        const row = week.cells[day];
        const td  = document.createElement('td');
        td.className = 'cgrid-cell';

        if (!row) {
          td.classList.add('cgrid-cell--empty');
          tr.appendChild(td);
          return;
        }

        const friendly = Utils.formatDate(Utils.parseISODate(row.date));

        if (row.type === 'holiday' || row.type === 'no-class') {
          td.classList.add('cgrid-cell--noclass');
          td.innerHTML =
            `<div class="cgrid-date">${friendly}</div>` +
            `<div class="cgrid-holiday-name">${Utils.escapeHtml(row.name)}</div>` +
            `<div class="cgrid-noclass-label">No Class</div>`;
        } else {
          const isExam = /exam/i.test(row.topic || '');
          if (isExam) td.classList.add('cgrid-cell--midterm');
          const periodLabel = row.period ? `#${row.period}` : '';

          td.innerHTML =
            `<div class="cgrid-date">` +
            `<span class="cal-drag-handle" title="Drag to reorder" aria-label="Drag period ${row.period || ''} to reorder">⠿</span>` +
            `${periodLabel ? `<span class="cgrid-period">${periodLabel}</span> · ` : ''}${friendly}` +
            `</div>` +
            `<textarea class="cgrid-topic cal-topic" data-date="${row.date}" data-period="${row.period || ''}" data-field="topic"` +
            ` rows="2" placeholder="Topic…" aria-label="Topic for ${friendly}">${Utils.escapeHtml(row.topic || '')}</textarea>` +
            `<textarea class="cgrid-readings cal-readings" data-date="${row.date}" data-period="${row.period || ''}" data-field="readings"` +
            ` rows="1" placeholder="Readings…" aria-label="Readings for ${friendly}">${Utils.escapeHtml(row.readings || '')}</textarea>` +
            `<textarea class="cgrid-due-input cal-due" data-date="${row.date}" data-period="${row.period || ''}" data-field="due"` +
            ` rows="1" placeholder="Due…" aria-label="Due for ${friendly}">${Utils.escapeHtml(row.due || '')}</textarea>`;

          td.querySelectorAll('textarea').forEach(ta => {
            ta.addEventListener('input', Utils.debounce(() => {
              const period = parseInt(ta.dataset.period, 10);
              _updateCalendarField({ date: ta.dataset.date, period }, ta.dataset.field, ta.value);
              if (ta.dataset.field === 'topic') {
                td.classList.toggle('cgrid-cell--midterm', /exam/i.test(ta.value));
              }
            }, 300));
          });
          _bindPeriodDrag(td, row.period);
        }

        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);

    // ── Final Exam footer ──
    if (finalRow) {
      const tfoot = document.createElement('tfoot');
      const tr = document.createElement('tr');
      tr.className = 'cgrid-final-row';

      const label = document.createElement('td');
      label.className = 'cgrid-week-num';
      label.textContent = 'Final';
      tr.appendChild(label);

      const examTd = document.createElement('td');
      examTd.className = 'cgrid-cell cgrid-cell--exam';
      examTd.colSpan   = sortedDays.length;

      const fd = Utils.formatDate(Utils.parseISODate(finalRow.date));
      const metaParts = [
        fd,
        finalRow.due   || '',
        finalRow.topic || '',
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');

      examTd.innerHTML =
        `<div class="cgrid-exam-label">FINAL EXAM</div>` +
        `<div class="cgrid-exam-meta">${metaParts}</div>`;

      tr.appendChild(examTd);
      tfoot.appendChild(tr);
      table.appendChild(tfoot);
    }
    wrapper.innerHTML = '';
    wrapper.appendChild(table);
  }

  // Return the Monday of the week containing `date`
  function _mondayOf(date) {
    return CalendarEngine.mondayOf(date);
  }

  function isComplete() {
    const rows = State.get().calendarRows;
    return rows.length > 0;
  }

  return { init, isComplete, generateCalendar, clearCalendar, buildCalendar, rebuildIfNeeded };
})();
