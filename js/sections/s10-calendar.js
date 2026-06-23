/**
 * s10-calendar.js — Section 10: Course Calendar
 */
const S10 = (() => {
  const DAY_ORDER = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  function init() {
    document.getElementById('btn-generate-calendar').addEventListener('click', generateCalendar);
    document.getElementById('btn-download-csv').addEventListener('click', downloadCSVTemplate);
    document.getElementById('input-import-csv').addEventListener('change', importCSV);
    document.getElementById('btn-add-no-class').addEventListener('click', () => {
      _addNoClassRow();
      _syncNoClassDays();
    });
    document.getElementById('btn-view-flat').addEventListener('click', () => _setView('flat'));
    document.getElementById('btn-view-week').addEventListener('click', () => _setView('week'));
    document.getElementById('btn-view-grid').addEventListener('click', () => _setView('grid'));
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

    // ── Live-patch the calendar rows so users don't have to regenerate ──
    const s = State.get();
    if (!s.calendarRows.length) return;

    // Build lookup: date → reason for every current no-class entry
    const noClassMap = {};
    noClassDays.forEach(d => { noClassMap[d.date] = d.reason || 'No Class'; });

    // Build lookup of semester-defined holidays so we never overwrite them
    const sem = Config.getSemesterByCode(s.semester);
    const semHolidayDates = new Set((sem ? sem.holidays : []).map(h => h.date));

    const updatedRows = s.calendarRows.map(row => {
      if (noClassMap[row.date]) {
        // Date is in the no-class list — mark as no-class (unless it's a semester holiday)
        if (row.type === 'class') {
          return { ...row, type: 'no-class', name: noClassMap[row.date] };
        }
        if (row.type === 'no-class') {
          return { ...row, name: noClassMap[row.date] }; // update reason
        }
      } else if (row.type === 'no-class' && !semHolidayDates.has(row.date)) {
        // Was a custom no-class but has been removed — restore to regular class
        return { ...row, type: 'class', name: '' };
      }
      return row;
    });

    State.set({ calendarRows: updatedRows });
    const view = State.get().calendarView || 'flat';
    if (view === 'grid') {
      _renderCalendarGrid(State.get());
    } else {
      _renderCalendarTable(updatedRows, view);
    }
  }

  /* ── Calendar Generation ── */
  function generateCalendar() {
    const s = State.get();
    const sem = Config.getSemesterByCode(s.semester);
    if (!sem) {
      Utils.toast('Please select a semester first (Section 1).', 'error');
      return;
    }
    if (!s.meetingDays.length) {
      Utils.toast('Please select meeting days first (Section 2).', 'error');
      return;
    }

    const startIso = s.startDate || sem.startDate;
    const endIso   = s.endDate   || sem.endDate;
    if (!startIso || !endIso) {
      Utils.toast('Please set course start and end dates (Section 1).', 'error');
      return;
    }
    if (startIso > endIso) {
      Utils.toast('Course start date must be on or before the end date (Section 1).', 'error');
      return;
    }

    const startDate = Utils.parseISODate(startIso);
    const endDate   = Utils.parseISODate(endIso);
    const holidaySet = new Set(sem.holidays.map(h => h.date));
    const holidayNames = {};
    sem.holidays.forEach(h => { holidayNames[h.date] = h.name; });
    const noClassSet = new Set(s.noClassDays.map(d => d.date));
    const noClassNames = {};
    s.noClassDays.forEach(d => { noClassNames[d.date] = d.reason || 'No Class'; });

    const meetingDayNums = s.meetingDays.map(d => DAY_ORDER.indexOf(d));
    const existingRows = {};
    s.calendarRows.forEach(r => { existingRows[r.date] = r; });

    const rows = [];
    const cur = new Date(startDate);
    while (cur <= endDate) {
      const iso = Utils.toISODate(cur);
      const dayNum = cur.getDay();
      const dayLabel = Utils.shortDayName(cur);
      if (meetingDayNums.includes(dayNum)) {
        if (holidaySet.has(iso)) {
          rows.push({ date: iso, day: dayLabel, type: 'holiday', name: holidayNames[iso], topic: '', readings: '', due: '' });
        } else if (noClassSet.has(iso)) {
          rows.push({ date: iso, day: dayLabel, type: 'no-class', name: noClassNames[iso] || 'No Class', topic: '', readings: '', due: '' });
        } else {
          const existing = existingRows[iso] || {};
          rows.push({ date: iso, day: dayLabel, type: 'class', name: '', topic: existing.topic || '', readings: existing.readings || '', due: existing.due || '' });
        }
      }
      cur.setDate(cur.getDate() + 1);
    }

    // Add final exam row if date is set
    if (s.finalExamDate) {
      const fDate = Utils.parseISODate(s.finalExamDate);
      rows.push({
        date:     s.finalExamDate,
        day:      Utils.shortDayName(fDate),
        type:     'final-exam',
        name:     'Final Exam',
        topic:    s.finalExamRoom ? `Room: ${s.finalExamRoom}` : '',
        readings: '',
        due:      s.finalExamStart && s.finalExamEnd
                    ? `${Utils.formatTime(s.finalExamStart)} – ${Utils.formatTime(s.finalExamEnd)}`
                    : '',
      });
    }

    State.set({ calendarRows: rows });
    _renderCalendarTable(rows, s.calendarView || 'flat');

    // Enable CSV buttons
    document.getElementById('btn-download-csv').disabled = false;
    document.getElementById('input-import-csv').disabled = false;
    document.getElementById('label-import-csv').setAttribute('aria-disabled', 'false');
    document.getElementById('label-import-csv').style.opacity = '';
    Utils.toast(`Calendar generated — ${rows.filter(r => r.type === 'class').length} class meetings.`, 'success');
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
        headerRow.innerHTML = `<td colspan="5">Week ${weekNum}</td>`;
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

  function _appendRow(tbody, row, idx) {
    const tr = document.createElement('tr');
    if (row.type === 'holiday' || row.type === 'no-class') {
      tr.className = 'row--holiday';
      const friendlyDate = Utils.formatDate(Utils.parseISODate(row.date));
      tr.innerHTML = `
        <td>${friendlyDate}</td>
        <td>${Utils.escapeHtml(row.day)}</td>
        <td colspan="3"><em>${Utils.escapeHtml(row.name)} — No Class</em></td>
      `;
    } else if (row.type === 'final-exam') {
      tr.className = 'row--final';
      const friendlyDate = Utils.formatDate(Utils.parseISODate(row.date));
      tr.innerHTML = `
        <td>${friendlyDate}</td>
        <td>${Utils.escapeHtml(row.day)}</td>
        <td><strong>FINAL EXAM</strong>${row.topic ? ` — ${Utils.escapeHtml(row.topic)}` : ''}</td>
        <td></td>
        <td>${Utils.escapeHtml(row.due)}</td>
      `;
    } else {
      const friendlyDate = Utils.formatDate(Utils.parseISODate(row.date));
      tr.innerHTML = `
        <td>${friendlyDate}</td>
        <td>${Utils.escapeHtml(row.day)}</td>
        <td><textarea class="cal-topic" data-idx="${idx}" data-field="topic" rows="2"
                      aria-label="Topic for ${friendlyDate}">${Utils.escapeHtml(row.topic)}</textarea></td>
        <td><textarea class="cal-readings" data-idx="${idx}" data-field="readings" rows="2"
                      aria-label="Readings for ${friendlyDate}">${Utils.escapeHtml(row.readings)}</textarea></td>
        <td><textarea class="cal-due" data-idx="${idx}" data-field="due" rows="2"
                      aria-label="Due for ${friendlyDate}">${Utils.escapeHtml(row.due)}</textarea></td>
      `;
      // Attach input listeners
      tr.querySelectorAll('textarea').forEach(ta => {
        ta.addEventListener('input', Utils.debounce(() => {
          const rows = State.get().calendarRows;
          const i = parseInt(ta.dataset.idx, 10);
          if (rows[i]) rows[i][ta.dataset.field] = ta.value;
          State.set({ calendarRows: rows });
        }, 300));
      });
      // Auto-grow textareas
      tr.querySelectorAll('textarea').forEach(ta => {
        ta.addEventListener('input', () => {
          ta.style.height = 'auto';
          ta.style.height = ta.scrollHeight + 'px';
        });
      });
    }
    tbody.appendChild(tr);
  }

  /* ── CSV Download Template ── */
  function downloadCSVTemplate() {
    const s    = State.get();
    const rows = s.calendarRows;
    // Headers: Date, Day, Type, Name (for holidays/no-class/final-exam), Topic, Readings, Due
    const lines = ['Date,Day,Type,Name,Topic,Readings,Due'];
    rows.forEach(r => {
      const isNonClass = r.type === 'holiday' || r.type === 'no-class' || r.type === 'final-exam';
      const cols = [
        r.date,
        r.day,
        r.type,
        isNonClass ? (r.name || '') : '',   // Name column
        isNonClass ? '' : (r.topic || ''),  // Topic column
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

        // Build a mutable map of existing rows keyed by ISO date
        const existing = State.get().calendarRows;
        const rowMap = {};
        existing.forEach(r => { rowMap[r.date] = { ...r }; });

        let created = 0, updated = 0, skipped = 0;

        csvRows.forEach(r => {
          // Normalise date to YYYY-MM-DD regardless of input format
          const iso = _normaliseDateStr(r.date || r['date'] || '');
          if (!iso) { skipped++; return; }

          const type = (r.type || 'class').toLowerCase().trim();

          // The 4th column is "topic" in the header but doubles as "name" for
          // holiday / no-class rows when exporting.  Accept both column names.
          const topicOrName = (r.topic || r.name || '').trim();
          const readings    = (r.readings || '').trim();
          const due         = (r.due || '').trim();

          if (rowMap[iso]) {
            // ── Merge into existing row ──────────────────────────────────
            const ex = rowMap[iso];
            if (ex.type === 'class') {
              if (topicOrName) ex.topic    = topicOrName;
              if (readings)    ex.readings = readings;
              if (due)         ex.due      = due;
            }
            updated++;
          } else {
            // ── Create a brand-new row from CSV data ─────────────────────
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
            };
            created++;
          }
        });

        const allRows = Object.values(rowMap).sort((a, b) => a.date.localeCompare(b.date));
        State.set({ calendarRows: allRows });
        _renderCalendarTable(allRows, State.get().calendarView || 'flat');

        // Ensure import/download buttons are always enabled after a successful import
        document.getElementById('btn-download-csv').disabled = false;
        document.getElementById('input-import-csv').disabled = false;
        document.getElementById('label-import-csv').setAttribute('aria-disabled', 'false');
        document.getElementById('label-import-csv').style.opacity = '';

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
    document.getElementById('btn-view-flat').classList.toggle('btn--active', view === 'flat');
    document.getElementById('btn-view-week').classList.toggle('btn--active', view === 'week');
    document.getElementById('btn-view-grid').classList.toggle('btn--active', view === 'grid');
    const s = State.get();
    if (s.calendarRows.length) {
      if (view === 'grid') {
        _renderCalendarGrid(s);
      } else {
        _renderCalendarTable(s.calendarRows, view);
      }
    }
  }

  /* ── Restore ── */
  function _restoreFromState() {
    const s = State.get();
    s.noClassDays.forEach(d => _addNoClassRow(d));
    if (s.calendarRows.length) {
      document.getElementById('btn-download-csv').disabled = false;
      document.getElementById('input-import-csv').disabled = false;
      const importLabel = document.getElementById('label-import-csv');
      importLabel.setAttribute('aria-disabled', 'false');
      importLabel.style.opacity = '';
      const view = s.calendarView || 'flat';
      if (view === 'grid') {
        _renderCalendarGrid(s);
      } else {
        _renderCalendarTable(s.calendarRows, view);
      }
    }
    const view = s.calendarView || 'flat';
    document.getElementById('btn-view-flat').classList.toggle('btn--active', view === 'flat');
    document.getElementById('btn-view-week').classList.toggle('btn--active', view === 'week');
    document.getElementById('btn-view-grid').classList.toggle('btn--active', view === 'grid');
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

    // Final exam: prefer the generated row, fall back to state fields
    let finalRow = rows.find(r => r.type === 'final-exam');
    if (!finalRow && s.finalExamDate) {
      const fDate = Utils.parseISODate(s.finalExamDate);
      finalRow = {
        date:  s.finalExamDate,
        day:   Utils.shortDayName(fDate),
        type:  'final-exam',
        topic: s.finalExamRoom ? `Room: ${s.finalExamRoom}` : '',
        due:   s.finalExamStart && s.finalExamEnd
                 ? `${Utils.formatTime(s.finalExamStart)} – ${Utils.formatTime(s.finalExamEnd)}`
                 : '',
      };
    }

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
          // Highlight cells whose topic contains "exam"
          const isExam = /exam/i.test(row.topic || '');
          if (isExam) td.classList.add('cgrid-cell--midterm');

          td.innerHTML =
            `<div class="cgrid-date">${friendly}</div>` +
            `<textarea class="cgrid-topic cal-topic" data-date="${row.date}" data-field="topic"` +
            ` rows="2" placeholder="Topic…" aria-label="Topic for ${friendly}">${Utils.escapeHtml(row.topic || '')}</textarea>` +
            `<textarea class="cgrid-readings cal-readings" data-date="${row.date}" data-field="readings"` +
            ` rows="1" placeholder="Readings…" aria-label="Readings for ${friendly}">${Utils.escapeHtml(row.readings || '')}</textarea>` +
            `<textarea class="cgrid-due-input cal-due" data-date="${row.date}" data-field="due"` +
            ` rows="1" placeholder="Due…" aria-label="Due for ${friendly}">${Utils.escapeHtml(row.due || '')}</textarea>`;

          td.querySelectorAll('textarea').forEach(ta => {
            ta.addEventListener('input', Utils.debounce(() => {
              const allRows = State.get().calendarRows;
              const target  = allRows.find(r => r.date === ta.dataset.date);
              if (target) {
                target[ta.dataset.field] = ta.value;
                // Re-apply exam highlight if topic changed
                if (ta.dataset.field === 'topic') {
                  td.classList.toggle('cgrid-cell--midterm', /exam/i.test(ta.value));
                }
              }
              State.set({ calendarRows: allRows });
            }, 300));
          });
        }

        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });

    // ── Final Exam row ──
    if (finalRow) {
      const tr = document.createElement('tr');
      tr.className = 'cgrid-final-row';

      const label = document.createElement('td');
      label.className = 'cgrid-week-num';
      label.textContent = 'Final';
      tr.appendChild(label);

      const examTd = document.createElement('td');
      examTd.className = 'cgrid-cell cgrid-cell--exam';
      examTd.colSpan   = sortedDays.length;

      const fd          = Utils.formatDate(Utils.parseISODate(finalRow.date));
      const optionalTag = '';
      const metaParts   = [
        fd,
        finalRow.due   || '',
        finalRow.topic || '',
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');

      examTd.innerHTML =
        `<div class="cgrid-exam-label">FINAL EXAM${optionalTag}</div>` +
        `<div class="cgrid-exam-meta">${metaParts}</div>`;

      tr.appendChild(examTd);
      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    wrapper.innerHTML = '';
    wrapper.appendChild(table);
  }

  // Return the Monday of the week containing `date`
  function _mondayOf(date) {
    const d   = new Date(date);
    const day = d.getDay();   // 0 = Sun
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    return d;
  }

  function isComplete() {
    const rows = State.get().calendarRows;
    // Complete as soon as the calendar has been generated (rows exist).
    // Requiring every single topic to be filled is too strict for form loads.
    return rows.length > 0;
  }

  return { init, isComplete, generateCalendar };
})();
