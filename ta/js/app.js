(function () {
  'use strict';

  const T = window.TATime;
  const P = window.TAParsers;
  const S = window.TAState;
  const M = window.TAMatching;
  const X = window.TAExports;

  let state = S.load();
  const ui = {
    tab: 'setup',
    selectedCrn: null,
    sectionSearch: '',
    expanded: new Set(),
    onlyUnfilled: false,
    showHidden: false,
    candFilters: { showUnavailable: false, showUntaken: false, showConflicts: false },
    candSort: 'last',
    taSearch: '',
    candSearch: '',
    applicantSearch: '',
    taFilter: 'assigned',
    templates: { xlsx: null, xlsxName: '', docx: null, docxName: '' },
  };

  const TEMPLATE_PATHS = {
    xlsx: 'templates/appointment-template.xlsx',
    docx: 'templates/offer-letter-template.docx',
  };

  // ---------- helpers ----------
  function esc(v) {
    return String(v === null || v === undefined ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function $(sel, rootEl) { return (rootEl || document).querySelector(sel); }

  let saveTimer = null;
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      S.save(state);
      renderHeader();
    }, 250);
  }

  function changed() {
    persist();
    render();
  }

  function toast(msg, kind) {
    const el = $('#toast');
    el.textContent = msg;
    el.className = 'toast ' + (kind || '');
    el.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { el.hidden = true; }, 4000);
  }

  function readFile(file, asText) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      if (asText) r.readAsText(file); else r.readAsArrayBuffer(file);
    });
  }

  function download(data, name, type) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: type || 'application/octet-stream' });
    window.saveAs(blob, name);
  }

  function sectionLabel(sec) {
    return sec ? `${sec.subject} ${sec.number}-${sec.section}` : '(missing section)';
  }

  function location(sec) {
    return [sec.building, sec.room].filter(Boolean).join(' ') || '—';
  }

  function sortedSections() {
    return Object.values(state.sections).sort((a, b) =>
      a.courseKey.localeCompare(b.courseKey) || String(a.section).localeCompare(String(b.section)));
  }

  function courseKeys() {
    const map = new Map();
    sortedSections().forEach((s) => { if (!map.has(s.courseKey)) map.set(s.courseKey, `${s.subject} ${s.number} - ${s.title}`); });
    return map;
  }

  function badge(text, kind, title) {
    return `<span class="badge ${kind || ''}"${title ? ` title="${esc(title)}"` : ''}>${esc(text)}</span>`;
  }

  // Every typed word must appear somewhere in the name or OU ID, so "smi jo" finds "John Smith".
  function nameMatches(st, query) {
    const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return true;
    const hay = `${st.name} ${st.sisId}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  }

  function majorBadge(st) {
    const status = P.majorStatus(st.major);
    if (status === 'major') return '';
    if (status === 'minor') return badge('MIS minor only', 'b-minor', st.major);
    return badge('Not MIS major', 'b-nonmis', st.major || 'No major given');
  }

  // ---------- header / tabs ----------
  function renderHeader() {
    $('#term-label').textContent = state.settings.term || '';
    const counts = `${Object.keys(state.students).length} applicants · ${Object.keys(state.sections).length} sections · ${state.assignments.length} assignments`;
    const saved = state.savedAt ? `Autosaved ${new Date(state.savedAt).toLocaleTimeString()}` : 'Not saved yet';
    $('#save-status').textContent = `${counts} · ${saved}`;
  }

  function setTab(tab) {
    ui.tab = tab;
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + tab));
    render();
  }

  function render() {
    renderHeader();
    const fn = { setup: renderSetup, import: renderImport, assign: renderAssign, tas: renderTas, export: renderExport }[ui.tab];
    fn();
  }

  // ---------- setup ----------
  function field(label, key, type, extra) {
    const v = state.settings[key];
    const attrs = extra || '';
    if (type === 'checkbox') {
      return `<label class="field check"><input type="checkbox" data-setting="${key}" ${v ? 'checked' : ''}> ${esc(label)}</label>`;
    }
    return `<label class="field"><span>${esc(label)}</span><input type="${type || 'text'}" data-setting="${key}" value="${esc(v)}" ${attrs}></label>`;
  }

  function renderSetup() {
    const s = state.settings;
    const rate = Number(s.hourlyRate) || 0;
    const exHours = Number(s.defaultHours) || 0;
    const ex = S.payFor(state, exHours);
    const keys = courseKeys();
    const courseRows = keys.size
      ? Array.from(keys.entries()).map(([k, label]) => `
          <tr><td>${esc(label)}</td>
          <td><input type="number" min="0" step="0.5" class="narrow" data-course-hours="${esc(k)}" value="${esc(s.courseHours[k] ?? '')}" placeholder="${esc(s.defaultHours)}"></td></tr>`).join('')
      : '<tr><td colspan="2" class="muted">Import a class schedule to set hours for specific courses.</td></tr>';

    $('#tab-setup').innerHTML = `
      <div class="grid two">
        <div class="card">
          <h2>Semester & letters</h2>
          ${field('Term (used in letters and file names)', 'term')}
          ${field('Offer letter date', 'letterDate', 'date')}
          ${field('Duties start date', 'startDate', 'date')}
          ${field('Duties end date', 'endDate', 'date')}
          ${field('Accept offer by', 'acceptByDate', 'date')}
          <p class="hint">Start and end dates fill in automatically from the first section in the schedule CSV if left blank.</p>
        </div>
        <div class="card">
          <h2>Pay & load</h2>
          ${field('Default hours per week per section', 'defaultHours', 'number', 'min="0" step="0.5"')}
          ${field('Hourly rate ($)', 'hourlyRate', 'number', 'min="0" step="0.01"')}
          ${field('Biweekly pay periods in the semester', 'payPeriods', 'number', 'min="1" step="1"')}
          ${field('Default TAs needed per course (editable per course on the Assign tab)', 'defaultTasPerCourse', 'number', 'min="0" step="1"')}
          ${field('Max sections per TA (0 = no limit)', 'maxSections', 'number', 'min="0" step="1"')}
          ${field('Block (instead of warn) when a TA is over the max', 'blockOverMax', 'checkbox')}
          <p class="hint">Example at ${esc(exHours)} hrs/week: biweekly ${X.money(ex.biweekly)} (hours × 2 × ${X.money(rate)}), total ${X.money(ex.total)} over ${esc(s.payPeriods)} pay periods, FTE ${ex.fte}.</p>
        </div>
        <div class="card">
          <h2>Hours per course</h2>
          <p class="hint">Leave blank to use the default (${esc(s.defaultHours)} hrs). Set a value for any course that differs. A single assignment can also be overridden on the TAs tab.</p>
          <table class="table compact"><thead><tr><th>Course</th><th>Hrs/week</th></tr></thead><tbody>${courseRows}</tbody></table>
        </div>
        <div class="card">
          <h2>Appointment workbook defaults (UGTA sheet)</h2>
          ${field('Division', 'division')}
          ${field('Teaching assistant type', 'taType')}
          ${field('FTE override (blank = hours ÷ 40)', 'fte')}
          <div class="grid two tight">
            ${field('Org #', 'org')}
            ${field('Fund', 'fund')}
            ${field('Function', 'functionCode')}
            ${field('Account', 'account')}
            ${field('Entity', 'entity')}
            ${field('Project', 'project')}
            ${field('Source', 'source')}
            ${field('Purpose', 'purpose')}
          </div>
        </div>
      </div>`;
  }

  // ---------- import ----------
  function renderImport() {
    const sv = state.imports.survey;
    const sc = state.imports.schedule;
    const students = Object.values(state.students);
    const noAvail = students.filter((s) => !s.availability.length);
    const disagreed = students.filter((s) => !s.agreed);
    const missingSt = students.filter((s) => s.missing);
    const sections = Object.values(state.sections);
    const noTime = sections.filter((s) => !T.hasMeeting(s));
    const missingSec = sections.filter((s) => s.missing);
    const unparsed = students.filter((s) => (s.unparsedTimes || []).length);

    const list = (items, fmt) => items.length ? `<ul class="list">${items.map((i) => `<li>${fmt(i)}</li>`).join('')}</ul>` : '';

    $('#tab-import').innerHTML = `
      <div class="grid two">
        <div class="card">
          <h2>TA application survey (Canvas)</h2>
          <p class="hint">Canvas → Quiz → Student Analysis report (.csv). If a student submitted more than once, only the latest attempt is kept.</p>
          <label class="dropzone">Choose survey CSV<input type="file" accept=".csv,text/csv" data-import="survey" hidden></label>
          ${sv ? `<p class="ok">Loaded <b>${esc(sv.fileName)}</b>: ${sv.count} applicants (${new Date(sv.at).toLocaleString()})</p>` : '<p class="muted">Not loaded yet.</p>'}
          ${noAvail.length ? `<p class="warn">${noAvail.length} applicant(s) gave no availability:</p>${list(noAvail, (s) => esc(s.name))}` : ''}
          ${unparsed.length ? `<p class="warn">Unrecognized time options:</p>${list(unparsed, (s) => `${esc(s.name)}: ${esc(s.unparsedTimes.join('; '))}`)}` : ''}
          ${disagreed.length ? `<p class="warn">${disagreed.length} applicant(s) disagreed with the TA terms and are excluded:</p>${list(disagreed, (s) => esc(s.name))}` : ''}
          ${missingSt.length ? `<p class="error">${missingSt.length} applicant(s) were in an earlier import but not the latest file:</p>${list(missingSt, (s) => esc(s.name))}` : ''}
        </div>
        <div class="card">
          <h2>Class schedule</h2>
          <p class="hint">OU schedule export (Term, Subject, Course Number, Section, CRN, Title, Primary Instructor, Building, Room, Days, Start Time, End Time, Start Date, End Date). See <a href="samples/schedule-template.csv" download>samples/schedule-template.csv</a> for the minimum columns.</p>
          <label class="dropzone">Choose schedule CSV<input type="file" accept=".csv,text/csv" data-import="schedule" hidden></label>
          ${sc ? `<p class="ok">Loaded <b>${esc(sc.fileName)}</b>: ${sc.count} sections (${new Date(sc.at).toLocaleString()})</p>` : '<p class="muted">Not loaded yet.</p>'}
          ${noTime.length ? `<p class="hint">${noTime.length} section(s) have no meeting time (no conflict checks):</p>${list(noTime, (s) => `${esc(sectionLabel(s))} ${esc(s.title)}`)}` : ''}
          ${missingSec.length ? `<p class="error">${missingSec.length} section(s) were in an earlier import but not the latest file:</p>${list(missingSec, (s) => esc(sectionLabel(s)))}` : ''}
        </div>
      </div>
      <div class="card">
        <div class="toolbar">
          <h2>Applicants</h2>
          <input type="search" placeholder="Search first or last name, or OU ID…" data-ui="applicantSearch" value="${esc(ui.applicantSearch)}">
        </div>
        ${students.length ? `
        <table class="table compact">
          <thead><tr><th>Name</th><th>OU ID</th><th>Major</th><th>GPA</th><th>Interested in</th><th>Availability</th></tr></thead>
          <tbody>${students.filter((s) => nameMatches(s, ui.applicantSearch)).sort((a, b) => X.lastFirst(a.name).localeCompare(X.lastFirst(b.name))).map((s) => `
            <tr class="${s.missing ? 'row-missing' : ''}">
              <td>${esc(s.name)}</td><td>${esc(s.sisId)}</td><td>${esc(s.major)}</td><td>${esc(s.gpa)}</td>
              <td>${esc(s.interestedLabels.map((l) => l.split(' - ')[0]).join(', '))}</td>
              <td class="small">${esc(s.availability.map((a) => a.label).join('; ')) || '<span class="warn">none</span>'}</td>
            </tr>`).join('') || '<tr><td colspan="6" class="muted">No applicants match that search.</td></tr>'}</tbody>
        </table>` : '<p class="muted">No applicants loaded.</p>'}
      </div>`;
  }

  async function handleImport(kind, file) {
    try {
      const text = await readFile(file, true);
      if (kind === 'survey') {
        const parsed = P.parseSurvey(text);
        const r = S.mergeSurvey(state, parsed, file.name);
        toast(`Survey: ${parsed.students.length} applicants (${r.added} new, ${r.updated} updated${r.missing ? `, ${r.missing} no longer present` : ''}).${parsed.warnings.length ? ' ' + parsed.warnings.join(' ') : ''}`, parsed.warnings.length ? 'warn' : 'ok');
      } else {
        const parsed = P.parseSchedule(text);
        const r = S.mergeSchedule(state, parsed, file.name);
        toast(`Schedule: ${parsed.sections.length} sections (${r.added} new, ${r.updated} updated${r.missing ? `, ${r.missing} no longer present` : ''}).`, 'ok');
      }
      changed();
    } catch (e) {
      console.error(e);
      toast(`Import failed: ${e.message}`, 'error');
    }
  }

  // ---------- assign ----------
  // Courses (in order) with the sections to show under each; search matches course or section text.
  function courseGroups() {
    const q = ui.sectionSearch.trim().toLowerCase();
    const groups = new Map();
    sortedSections().forEach((sec) => {
      if (!groups.has(sec.courseKey)) groups.set(sec.courseKey, { key: sec.courseKey, first: sec, all: [], shown: [] });
      groups.get(sec.courseKey).all.push(sec);
    });
    const out = [];
    groups.forEach((g) => {
      const courseText = `${g.first.subject} ${g.first.number} ${g.first.title}`.toLowerCase();
      const courseMatch = !q || courseText.includes(q);
      g.shown = g.all.filter((sec) => {
        if (S.sectionInfo(state, sec.crn).hidden && !ui.showHidden) return false;
        if (courseMatch) return true;
        return [sectionLabel(sec), sec.title, sec.instructor, sec.crn, location(sec), T.formatMeeting(sec)].join(' ').toLowerCase().includes(q);
      });
      g.status = S.courseStatus(state, g.key);
      if (!g.shown.length && !(courseMatch && ui.showHidden)) return;
      if (ui.onlyUnfilled && g.status.status !== 'open') return;
      out.push(g);
    });
    return out;
  }

  function courseStatusPill(st) {
    if (st.status === 'none') {
      return st.assigned
        ? `<span class="pill pill-over">No TAs needed · ${st.assigned} still assigned</span>`
        : '<span class="pill pill-none">No TAs needed</span>';
    }
    if (st.status === 'open') return `<span class="pill pill-open">${st.assigned} of ${st.needed} assigned · <b>${st.remaining} still needed</b></span>`;
    if (st.status === 'over') return `<span class="pill pill-over">${st.assigned} of ${st.needed} assigned · ${st.assigned - st.needed} over</span>`;
    return `<span class="pill pill-complete">${st.assigned} of ${st.needed} assigned · complete</span>`;
  }

  function renderAssign() {
    if (!Object.keys(state.sections).length) {
      $('#tab-assign').innerHTML = '<div class="card"><p class="muted">Import a class schedule (and the survey) on the Import tab first.</p></div>';
      return;
    }
    if (ui.selectedCrn && !state.sections[ui.selectedCrn]) ui.selectedCrn = null;
    const groups = courseGroups();
    const searching = !!ui.sectionSearch.trim();

    const allStatuses = Array.from(new Set(sortedSections().map((s) => s.courseKey))).map((k) => S.courseStatus(state, k));
    const withTarget = allStatuses.filter((s) => s.status !== 'none');
    const complete = withTarget.filter((s) => s.status === 'complete' || s.status === 'over').length;
    const stillNeeded = withTarget.reduce((n, s) => n + s.remaining, 0);
    const noTaCount = allStatuses.filter((s) => s.noTas).length;

    const sectionRow = (sec) => {
      const si = S.sectionInfo(state, sec.crn);
      const asg = S.assignmentsForSection(state, sec.crn);
      const chips = asg.map((a) => {
        const st = state.students[a.studentId];
        const issues = M.assignmentIssues(state, a);
        const ms = st ? P.majorStatus(st.major) : 'major';
        const tag = ms === 'none' ? '<span class="chip-tag tag-nonmis">non-MIS</span>' : ms === 'minor' ? '<span class="chip-tag tag-minor">minor</span>' : '';
        const tip = issues.concat(st && ms !== 'major' ? [`Major: ${st.major || 'not given'}`] : []);
        return `<span class="chip ${issues.length ? 'chip-warn' : ''}" title="${esc(tip.join('\n'))}">${esc(st ? st.name : 'Unknown')}${tag}<button type="button" class="chip-x" data-action="unassign" data-id="${a.id}" title="Remove">×</button></span>`;
      }).join('');
      return `
        <tr class="sec-row ${ui.selectedCrn === sec.crn ? 'selected' : ''} ${sec.missing ? 'row-missing' : ''} ${si.hidden ? 'row-hidden' : ''}" data-action="select-section" data-crn="${esc(sec.crn)}">
          <td class="sec-indent"><b>${esc(sectionLabel(sec))}</b><div class="small muted">CRN ${esc(sec.crn)}</div></td>
          <td>${esc(sec.instructor || 'TBA')}</td>
          <td class="nowrap">${esc(T.formatMeeting(sec))}</td>
          <td>${esc(location(sec))}</td>
          <td class="tas-cell">${chips || '<span class="small muted">No TA yet</span>'}</td>
        </tr>`;
    };

    const courseBlock = (g) => {
      const open = searching || ui.expanded.has(g.key);
      const ci = S.courseInfo(state, g.key);
      const st = g.status;
      const head = `
        <tr class="course-row ${open ? 'open' : ''} course-${st.status} ${st.noTas ? 'course-off' : ''}" data-action="toggle-course" data-course="${esc(g.key)}">
          <td colspan="5">
            <div class="course-head">
              <span class="caret">${open ? '▼' : '▶'}</span>
              <div class="course-name"><b>${esc(`${g.first.subject} ${g.first.number}`)}</b> ${esc(g.first.title)}
                <div class="small muted">${st.sections} section(s) · ${st.sectionsCovered} with a TA</div></div>
              ${st.noTas ? '' : `<label class="small course-target">TAs needed
                <input type="number" min="0" step="1" class="tiny" data-course-needed="${esc(g.key)}" value="${esc(ci.tasNeeded === '' || ci.tasNeeded === undefined ? state.settings.defaultTasPerCourse : ci.tasNeeded)}"></label>`}
              <label class="small check course-notas" title="Move this course to the bottom and leave it out of the totals"><input type="checkbox" data-course-notas="${esc(g.key)}" ${st.noTas ? 'checked' : ''}> No TAs</label>
              ${courseStatusPill(st)}
            </div>
          </td>
        </tr>`;
      return head + (open ? g.shown.map(sectionRow).join('') : '');
    };
    const active = groups.filter((g) => !g.status.noTas);
    const off = groups.filter((g) => g.status.noTas);
    const rows = active.map(courseBlock).join('') + (off.length ? `
        <tr class="off-divider"><td colspan="5">Courses marked "No TAs" (${off.length}) · uncheck to bring a course back</td></tr>
        ${off.map(courseBlock).join('')}` : '');

    $('#tab-assign').innerHTML = `
      <div class="assign-layout">
        <div class="card sections-card">
          <div class="toolbar">
            <input type="search" placeholder="Search course, instructor, time, room…" data-ui="sectionSearch" value="${esc(ui.sectionSearch)}">
            <label class="check"><input type="checkbox" data-ui="onlyUnfilled" ${ui.onlyUnfilled ? 'checked' : ''}> Still needs TAs</label>
            <label class="check"><input type="checkbox" data-ui="showHidden" ${ui.showHidden ? 'checked' : ''}> Show hidden</label>
            <button type="button" class="btn btn-secondary btn-sm" data-action="expand-all">Expand all</button>
            <button type="button" class="btn btn-secondary btn-sm" data-action="collapse-all">Collapse all</button>
          </div>
          <p class="small assign-summary">
            <b>${complete}</b> of ${withTarget.length} course(s) fully staffed ·
            <b class="${stillNeeded ? 'error' : 'ok'}">${stillNeeded}</b> TA assignment(s) still needed${noTaCount ? ` · <span class="muted">${noTaCount} course(s) marked No TAs</span>` : ''}
          </p>
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>Section</th><th>Instructor</th><th>Meets</th><th>Room</th><th>TAs</th></tr></thead>
              <tbody>${rows || '<tr><td colspan="5" class="muted">No courses match.</td></tr>'}</tbody>
            </table>
          </div>
        </div>
        <div class="card candidates-card" id="candidates">${renderCandidates()}</div>
      </div>`;
  }

  function renderCandidates() {
    const sec = state.sections[ui.selectedCrn];
    if (!sec) return '<p class="muted">Select a section to see TA candidates.</p>';
    const si = S.sectionInfo(state, sec.crn);
    const f = ui.candFilters;
    const searching = !!ui.candSearch.trim();
    const list = searching
      ? M.candidates(state, sec.crn, { showUnavailable: true, showUntaken: true, showConflicts: true }, ui.candSort).filter((c) => nameMatches(c.student, ui.candSearch))
      : M.candidates(state, sec.crn, f, ui.candSort);
    const hidden = searching ? {} : M.hiddenCounts(state, sec.crn, f);
    const hiddenParts = [
      hidden.unavailable ? `${hidden.unavailable} not available` : '',
      hidden.untaken ? `${hidden.untaken} free at this time but have not taken the course` : '',
      hidden.conflicts ? `${hidden.conflicts} with a time conflict` : '',
    ].filter(Boolean);
    const max = Number(state.settings.maxSections) || 0;
    const hours = S.hoursFor(state, { crn: sec.crn, hours: null });

    const rows = list.map((c) => {
      const st = c.student;
      const badges = [
        c.already ? badge('Assigned', 'b-assigned') : '',
        c.noAvailability ? badge('No availability given', 'b-bad') : c.available ? badge('Available', 'b-good') : badge('Not available', 'b-bad'),
        c.interested ? badge('Interested', 'b-good') : badge('Interest not listed', 'b-mute'),
        c.taken ? badge('Took course', 'b-good') : badge('Has not taken', 'b-bad'),
        c.conflicts.length ? badge('Conflict: ' + c.conflicts.map(sectionLabel).join(', '), 'b-bad') : '',
        c.atMax ? badge(`At max (${max})`, 'b-warn') : '',
      ].join('');
      const current = S.assignmentsForStudent(state, st.id)
        .filter((a) => a.crn !== sec.crn)
        .map((a) => state.sections[a.crn])
        .filter(Boolean)
        .map((s) => `${sectionLabel(s)} (${T.formatMeeting(s)})`);
      return `
        <tr class="${c.already ? 'cand-assigned' : ''}">
          <td><b>${esc(st.name)}</b> ${majorBadge(st)}<div class="small muted">GPA ${esc(st.gpa)}</div></td>
          <td>${badges}</td>
          <td class="nowrap">${c.load}${max ? ' / ' + max : ''} sections<div class="small muted">${c.hours} hrs/wk</div></td>
          <td class="small">${esc(current.join('; ')) || '<span class="muted">—</span>'}</td>
          <td>${c.already
            ? `<button type="button" class="btn btn-danger btn-sm" data-action="unassign-student" data-student="${esc(st.id)}">Remove</button>`
            : `<button type="button" class="btn btn-sm" data-action="assign" data-student="${esc(st.id)}">Assign</button>`}</td>
        </tr>`;
    }).join('');

    return `
      <div class="cand-head">
        <div>
          <h2>${esc(sectionLabel(sec))} · ${esc(sec.title)}</h2>
          <p class="small">${esc(sec.instructor || 'Instructor TBA')} · ${esc(T.formatMeeting(sec))} · ${esc(location(sec))} · ${hours} hrs/wk per TA</p>
          <p class="small">${esc(`${sec.subject} ${sec.number}`)} overall: ${courseStatusPill(S.courseStatus(state, sec.courseKey))}</p>
        </div>
        <label class="check"><input type="checkbox" data-section-hidden="${esc(sec.crn)}" ${si.hidden ? 'checked' : ''}> Hide section (no TA)</label>
      </div>
      <div class="toolbar">
        <span class="small muted">Also show:</span>
        <label class="check"><input type="checkbox" data-cand="showUnavailable" ${f.showUnavailable ? 'checked' : ''}> Not available</label>
        <label class="check"><input type="checkbox" data-cand="showUntaken" ${f.showUntaken ? 'checked' : ''}> Has not taken</label>
        <label class="check"><input type="checkbox" data-cand="showConflicts" ${f.showConflicts ? 'checked' : ''}> Time conflicts</label>
        <label class="check sort-by">Sort
          <select data-ui="candSort">
            <option value="last" ${ui.candSort === 'last' ? 'selected' : ''}>Last name</option>
            <option value="first" ${ui.candSort === 'first' ? 'selected' : ''}>First name</option>
            <option value="best" ${ui.candSort === 'best' ? 'selected' : ''}>Best match</option>
          </select></label>
      </div>
      <div class="toolbar">
        <input type="search" placeholder="Find an applicant by first or last name…" data-ui="candSearch" value="${esc(ui.candSearch)}">
      </div>
      <p class="small muted">${searching
        ? `${list.length} applicant(s) match "${esc(ui.candSearch.trim())}". The search ignores the filters above, so check the badges for availability and conflicts.`
        : `${list.length} applicant(s) shown, including those who did not list interest in this course (interest is a preference only).`}</p>
      ${hiddenParts.length ? `<p class="small hidden-note">Hidden by the filters above: ${esc(hiddenParts.join(' · '))}.</p>` : ''}
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Applicant</th><th>Fit</th><th>Load</th><th>Already TA for</th><th></th></tr></thead>
          <tbody>${rows || `<tr><td colspan="5" class="muted">${searching ? 'No applicant with that name.' : 'No applicants match these filters. Try enabling more options above.'}</td></tr>`}</tbody>
        </table>
      </div>`;
  }

  function assign(studentId, crn) {
    const st = state.students[studentId];
    const sec = state.sections[crn];
    if (!st || !sec) return;
    const c = M.evaluate(state, st, sec);
    if (c.already) return;
    let override = false;
    if (c.conflicts.length) {
      const msg = `${st.name} is already assigned to ${c.conflicts.map((x) => `${sectionLabel(x)} (${T.formatMeeting(x)})`).join(', ')}, which overlaps ${sectionLabel(sec)} (${T.formatMeeting(sec)}).\n\nAssign anyway?`;
      if (!window.confirm(msg)) return;
      override = true;
    }
    if (c.atMax) {
      if (state.settings.blockOverMax) {
        toast(`${st.name} already has ${c.load} section(s), the maximum. Raise the max on the Setup tab to assign more.`, 'error');
        return;
      }
      if (!window.confirm(`${st.name} already has ${c.load} section(s) (max ${state.settings.maxSections}). Assign anyway?`)) return;
      override = true;
    }
    if (!c.available) {
      if (!window.confirm(`${st.name} did not list availability covering ${T.formatMeeting(sec)}. Assign anyway?`)) return;
      override = true;
    }
    if (!st.agreed && !window.confirm(`${st.name} did not agree to the TA terms. Assign anyway?`)) return;
    S.addAssignment(state, studentId, crn, { override });
    toast(`Assigned ${st.name} to ${sectionLabel(sec)}.`, 'ok');
    changed();
  }

  function unassign(assignmentId) {
    const a = state.assignments.find((x) => x.id === assignmentId);
    if (!a) return;
    const st = state.students[a.studentId];
    if (!window.confirm(`Remove ${st ? st.name : 'this TA'} from ${sectionLabel(state.sections[a.crn])}?`)) return;
    S.removeAssignment(state, assignmentId);
    changed();
  }

  // ---------- TAs ----------
  function renderTas() {
    const students = Object.values(state.students)
      .filter((st) => {
        const n = S.assignmentsForStudent(state, st.id).length;
        if (ui.taFilter === 'assigned' && !n) return false;
        if (ui.taFilter === 'unassigned' && n) return false;
        return nameMatches(st, ui.taSearch);
      })
      .sort((a, b) => X.lastFirst(a.name).localeCompare(X.lastFirst(b.name)));

    const sel = (key, id, value, options) => `<select data-info="${key}" data-student="${esc(id)}">${options.map((o) => `<option ${o === value ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;

    const cards = students.map((st) => {
      const inf = S.info(state, st.id);
      const totals = S.studentTotals(state, st.id);
      const asg = S.assignmentsForStudent(state, st.id);
      const over = M.overMax(state, st.id);
      const asgRows = asg.map((a) => {
        const sec = state.sections[a.crn];
        const issues = M.assignmentIssues(state, a);
        const defHours = S.hoursFor(state, Object.assign({}, a, { hours: null }));
        return `<tr>
          <td><b>${esc(sectionLabel(sec))}</b> ${sec ? esc(sec.title) : ''}<div class="small muted">${sec ? esc(`${sec.instructor || 'TBA'} · ${T.formatMeeting(sec)} · ${location(sec)}`) : ''}</div>
            ${issues.length ? `<div class="small warn">${esc(issues.join(' · '))}</div>` : ''}</td>
          <td><input type="number" class="tiny" min="0" step="0.5" data-asg-hours="${a.id}" value="${esc(a.hours ?? '')}" placeholder="${esc(defHours)}" title="Hours/week (blank = course default)"></td>
          <td><input type="text" data-asg-note="${a.id}" value="${esc(a.note)}" placeholder="Note for workbook"></td>
          <td><button type="button" class="btn btn-danger btn-sm" data-action="unassign" data-id="${a.id}">Remove</button></td>
        </tr>`;
      }).join('');

      return `
        <div class="card ta-card ${st.missing ? 'row-missing' : ''}">
          <div class="ta-head">
            <div>
              <h3>${esc(st.name)} ${majorBadge(st)} ${inf.excluded ? badge('Excluded', 'b-bad') : ''} ${st.missing ? badge('Not in latest survey', 'b-bad') : ''}</h3>
              <div class="small muted">OU ID ${esc(st.sisId)} · ${esc(st.major)} · GPA ${esc(st.gpa)}</div>
            </div>
            <div class="ta-totals ${over ? 'warn' : ''}">
              <b>${totals.count}</b> section(s) · <b>${totals.hours}</b> hrs/wk · ${X.money(totals.biweekly)} biweekly · <b>${X.money(totals.total)}</b> total
            </div>
          </div>
          ${asg.length ? `<table class="table compact"><thead><tr><th>Section</th><th>Hrs/wk</th><th>Note</th><th></th></tr></thead><tbody>${asgRows}</tbody></table>` : '<p class="muted small">No assignments.</p>'}
          <div class="grid four tight">
            <label class="field"><span>Email</span><input type="email" data-info="email" data-student="${esc(st.id)}" value="${esc(inf.email)}" placeholder="name@ou.edu"></label>
            <label class="field"><span>Employee status</span>${sel('employeeStatus', st.id, inf.employeeStatus, ['New', 'Current'])}</label>
            <label class="field"><span>Previously worked on campus?</span>${sel('previouslyWorked', st.id, inf.previouslyWorked, ['No', 'Yes'])}</label>
            <label class="field"><span>If yes: additional job or transfer</span>${sel('jobType', st.id, inf.jobType, ['', 'Additional Job', 'Transfer'])}</label>
            <label class="field"><span>Primary residence outside US?</span>${sel('outsideUS', st.id, inf.outsideUS, ['No', 'Yes'])}</label>
            <label class="field"><span>Country of residence</span><input type="text" data-info="country" data-student="${esc(st.id)}" value="${esc(inf.country)}"></label>
            <label class="field wide"><span>Notes (workbook)</span><input type="text" data-info="notes" data-student="${esc(st.id)}" value="${esc(inf.notes)}"></label>
          </div>
          <details>
            <summary>Survey answers</summary>
            <p class="small"><b>Taken:</b> ${esc(st.takenLabels.join('; ')) || '—'}</p>
            <p class="small"><b>Interested:</b> ${esc(st.interestedLabels.join('; ')) || '—'}</p>
            <p class="small"><b>Available:</b> ${esc(st.availability.map((a) => a.label).join('; ')) || '—'}</p>
            <p class="small"><b>Uploads:</b> ${esc([st.files.schedule, st.files.resume, st.files.transcript].filter(Boolean).join('; ')) || '—'}</p>
            <label class="check small"><input type="checkbox" data-info="excluded" data-student="${esc(st.id)}" ${inf.excluded ? 'checked' : ''}> Exclude from candidate lists</label>
          </details>
        </div>`;
    }).join('');

    $('#tab-tas').innerHTML = `
      <div class="toolbar card">
        <input type="search" placeholder="Search first or last name, or OU ID…" data-ui="taSearch" value="${esc(ui.taSearch)}">
        <select data-ui="taFilter">
          <option value="assigned" ${ui.taFilter === 'assigned' ? 'selected' : ''}>Assigned TAs</option>
          <option value="unassigned" ${ui.taFilter === 'unassigned' ? 'selected' : ''}>Unassigned applicants</option>
          <option value="all" ${ui.taFilter === 'all' ? 'selected' : ''}>All applicants</option>
        </select>
        <span class="small muted">${students.length} shown</span>
      </div>
      ${cards || '<div class="card"><p class="muted">Nobody matches. Assign TAs on the Assign tab, or switch the filter to "All applicants".</p></div>'}`;
  }

  // ---------- export ----------
  async function loadBundledTemplates() {
    for (const kind of ['xlsx', 'docx']) {
      if (ui.templates[kind]) continue;
      try {
        const res = await fetch(TEMPLATE_PATHS[kind]);
        if (!res.ok) throw new Error(res.statusText);
        ui.templates[kind] = await res.arrayBuffer();
        ui.templates[kind + 'Name'] = TEMPLATE_PATHS[kind] + ' (bundled)';
      } catch (e) {
        // file:// pages cannot fetch; the user uploads the template instead.
      }
    }
    if (ui.tab === 'export') renderExport();
  }

  function exportChecks() {
    const s = state.settings;
    const out = [];
    const assigned = Object.values(state.students).filter((st) => S.assignmentsForStudent(state, st.id).length);
    if (!assigned.length) out.push(['error', 'No TAs have been assigned yet.']);
    ['letterDate', 'startDate', 'endDate', 'acceptByDate'].forEach((k) => {
      if (!s[k]) out.push(['warn', `Setup: "${{ letterDate: 'Offer letter date', startDate: 'Duties start date', endDate: 'Duties end date', acceptByDate: 'Accept offer by' }[k]}" is blank.`]);
    });
    if (!Number(s.hourlyRate)) out.push(['warn', 'Setup: hourly rate is 0, so stipends will be $0.']);
    const noEmail = assigned.filter((st) => !S.info(state, st.id).email);
    if (noEmail.length) out.push(['warn', `${noEmail.length} assigned TA(s) have no email: ${noEmail.map((x) => x.name).join(', ')}`]);
    const issues = state.assignments.map((a) => ({ a, issues: M.assignmentIssues(state, a).filter((i) => i !== 'Assigned with override') })).filter((x) => x.issues.length);
    issues.forEach(({ a, issues: list }) => {
      const st = state.students[a.studentId];
      out.push(['warn', `${st ? st.name : 'Unknown'} → ${sectionLabel(state.sections[a.crn])}: ${list.join('; ')}`]);
    });
    assigned.filter((st) => M.overMax(state, st.id)).forEach((st) => out.push(['warn', `${st.name} is over the max sections per TA.`]));
    Array.from(courseKeys().keys()).forEach((k) => {
      const cs = S.courseStatus(state, k);
      if (cs.status === 'open') out.push(['warn', `${k} still needs ${cs.remaining} TA(s) (${cs.assigned} of ${cs.needed} assigned).`]);
    });
    return out;
  }

  function renderExport() {
    const t = ui.templates;
    const checks = exportChecks();
    $('#tab-export').innerHTML = `
      <div class="grid two">
        <div class="card">
          <h2>Templates</h2>
          <p><b>Appointment workbook:</b> ${t.xlsx ? esc(t.xlsxName) : '<span class="warn">not loaded</span>'}</p>
          <label class="btn btn-secondary file-btn">Use a different workbook…<input type="file" accept=".xlsx" data-template="xlsx" hidden></label>
          <p><b>Offer letter:</b> ${t.docx ? esc(t.docxName) : '<span class="warn">not loaded</span>'}</p>
          <label class="btn btn-secondary file-btn">Use a different letter…<input type="file" accept=".docx" data-template="docx" hidden></label>
          <p class="hint">A replacement letter must use these tags where values go: <code>{letter_date}</code> <code>{ta_name}</code> <code>{biweekly_rate}</code> <code>{term}</code> <code>{total_stipend}</code> <code>{start_date}</code> <code>{end_date}</code> <code>{hours_per_week}</code> <code>{accept_by_date}</code>. A replacement workbook needs a sheet named "UGTA".</p>
        </div>
        <div class="card">
          <h2>Generate</h2>
          <div class="stack">
            <button type="button" class="btn" data-action="export-xlsx">Download appointment workbook (UGTA filled)</button>
            <button type="button" class="btn" data-action="export-letters">Download offer letters (.zip of .docx)</button>
            <button type="button" class="btn btn-secondary" data-action="export-csv">Download assignments list (.csv)</button>
          </div>
          <h3>Before you export</h3>
          ${checks.length ? `<ul class="list">${checks.map(([k, m]) => `<li class="${k}">${esc(m)}</li>`).join('')}</ul>` : '<p class="ok">Everything looks complete.</p>'}
        </div>
        <div class="card">
          <h2>Save & restore</h2>
          <p class="hint">Work autosaves in this browser. Use the JSON file to keep a copy on your computer, move to another computer, or pick up next time. Keep it private: it contains student data.</p>
          <div class="stack">
            <button type="button" class="btn" data-action="save-json">Save state (.json)</button>
            <label class="btn btn-secondary file-btn">Load state (.json)<input type="file" accept=".json,application/json" data-action-file="load-json" hidden></label>
            <button type="button" class="btn btn-danger" data-action="reset">Clear everything in this browser</button>
          </div>
        </div>
      </div>`;
  }

  function stamp() {
    return new Date().toISOString().slice(0, 10);
  }

  async function exportXlsx() {
    if (!ui.templates.xlsx) { toast('Load the appointment workbook template first.', 'error'); return; }
    try {
      const { buffer, rowCount } = await X.buildAppointmentWorkbook(state, ui.templates.xlsx);
      download(buffer, `${state.settings.term} Appointment - Filled.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      toast(`Workbook created with ${rowCount} UGTA row(s).`, 'ok');
    } catch (e) {
      console.error(e);
      toast(`Workbook export failed: ${e.message}`, 'error');
    }
  }

  async function exportLetters() {
    if (!ui.templates.docx) { toast('Load the offer letter template first.', 'error'); return; }
    try {
      const { buffer, count } = await X.buildOfferLetters(state, ui.templates.docx);
      if (!count) { toast('No assigned TAs, so no letters were created.', 'warn'); return; }
      download(buffer, `${state.settings.term} TA Offer Letters.zip`, 'application/zip');
      toast(`Created ${count} offer letter(s).`, 'ok');
    } catch (e) {
      console.error(e);
      const detail = e.properties && e.properties.errors ? e.properties.errors.map((x) => x.properties.explanation).join('; ') : e.message;
      toast(`Letter export failed: ${detail}`, 'error');
    }
  }

  function saveJson() {
    const text = S.toJson(state);
    S.save(state);
    download(text, `ta-assignments-${state.settings.term.replace(/\s+/g, '-')}-${stamp()}.json`, 'application/json');
    renderHeader();
  }

  async function loadJson(file) {
    try {
      const text = await readFile(file, true);
      const next = S.fromJson(text);
      if (state.assignments.length && !window.confirm(`Replace the current work (${state.assignments.length} assignments) with ${file.name}?`)) return;
      state = next;
      ui.selectedCrn = null;
      S.save(state);
      toast(`Loaded ${file.name}: ${Object.keys(state.students).length} applicants, ${state.assignments.length} assignments.`, 'ok');
      render();
    } catch (e) {
      toast(`Could not load state: ${e.message}`, 'error');
    }
  }

  // ---------- events ----------
  function numberOrBlank(v) {
    return v === '' ? '' : Number(v);
  }

  document.addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (tab) { setTab(tab.dataset.tab); return; }
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    if (action === 'select-section') {
      if (e.target.closest('input, button, select, label')) return;
      ui.selectedCrn = el.dataset.crn;
      render();
    } else if (action === 'toggle-course') {
      if (e.target.closest('input, button, select, label')) return;
      const key = el.dataset.course;
      if (ui.expanded.has(key)) ui.expanded.delete(key); else ui.expanded.add(key);
      render();
    } else if (action === 'expand-all') {
      sortedSections().forEach((s) => ui.expanded.add(s.courseKey));
      render();
    } else if (action === 'collapse-all') {
      ui.expanded.clear();
      render();
    } else if (action === 'assign') {
      assign(el.dataset.student, ui.selectedCrn);
    } else if (action === 'unassign') {
      e.stopPropagation();
      unassign(el.dataset.id);
    } else if (action === 'unassign-student') {
      const a = state.assignments.find((x) => x.studentId === el.dataset.student && x.crn === ui.selectedCrn);
      if (a) unassign(a.id);
    } else if (action === 'save-json') {
      saveJson();
    } else if (action === 'export-xlsx') {
      exportXlsx();
    } else if (action === 'export-letters') {
      exportLetters();
    } else if (action === 'export-csv') {
      download(X.assignmentsCsv(state), `${state.settings.term} TA Assignments.csv`, 'text/csv');
    } else if (action === 'reset') {
      if (!window.confirm('Clear all applicants, sections, assignments, and settings saved in this browser? Save a JSON copy first if you need it.')) return;
      S.clearSaved();
      state = S.emptyState();
      ui.selectedCrn = null;
      render();
    }
  });

  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.setting && t.type !== 'checkbox') {
      state.settings[t.dataset.setting] = t.type === 'number' ? numberOrBlank(t.value) : t.value;
      persist();
      renderHeader();
    } else if (['sectionSearch', 'taSearch', 'candSearch', 'applicantSearch'].includes(t.dataset.ui)) {
      ui[t.dataset.ui] = t.value;
      const pos = t.selectionStart;
      // Redraw only the candidate panel so the course list keeps its scroll position while typing.
      if (t.dataset.ui === 'candSearch') $('#candidates').innerHTML = renderCandidates();
      else render();
      const again = document.querySelector(`[data-ui="${t.dataset.ui}"]`);
      if (again) { again.focus(); again.setSelectionRange(pos, pos); }
    } else if (t.dataset.info && t.tagName === 'INPUT' && t.type !== 'checkbox') {
      S.info(state, t.dataset.student)[t.dataset.info] = t.value;
      persist();
    } else if (t.dataset.asgNote) {
      const a = state.assignments.find((x) => x.id === t.dataset.asgNote);
      if (a) { a.note = t.value; persist(); }
    }
  });

  document.addEventListener('change', async (e) => {
    const t = e.target;
    if (t.dataset.setting) {
      state.settings[t.dataset.setting] = t.type === 'checkbox' ? t.checked : (t.type === 'number' ? numberOrBlank(t.value) : t.value);
      changed();
    } else if (t.dataset.courseHours !== undefined) {
      const v = t.value;
      if (v === '') delete state.settings.courseHours[t.dataset.courseHours];
      else state.settings.courseHours[t.dataset.courseHours] = Number(v);
      changed();
    } else if (t.dataset.import) {
      const file = t.files[0];
      if (file) await handleImport(t.dataset.import, file);
      t.value = '';
    } else if (t.id === 'load-json' || t.dataset.actionFile === 'load-json') {
      const file = t.files[0];
      if (file) await loadJson(file);
      t.value = '';
    } else if (t.dataset.template) {
      const file = t.files[0];
      if (!file) return;
      ui.templates[t.dataset.template] = await readFile(file, false);
      ui.templates[t.dataset.template + 'Name'] = file.name + ' (uploaded)';
      renderExport();
    } else if (t.dataset.ui === 'taFilter' || t.dataset.ui === 'candSort') {
      ui[t.dataset.ui] = t.value;
      render();
    } else if (t.dataset.ui === 'onlyUnfilled' || t.dataset.ui === 'showHidden') {
      ui[t.dataset.ui] = t.checked;
      render();
    } else if (t.dataset.cand) {
      ui.candFilters[t.dataset.cand] = t.checked;
      render();
    } else if (t.dataset.courseNeeded) {
      S.courseInfo(state, t.dataset.courseNeeded).tasNeeded = t.value === '' ? '' : Math.max(0, Math.floor(Number(t.value) || 0));
      changed();
    } else if (t.dataset.courseNotas) {
      S.courseInfo(state, t.dataset.courseNotas).noTas = t.checked;
      if (t.checked) ui.expanded.delete(t.dataset.courseNotas);
      changed();
    } else if (t.dataset.sectionHidden) {
      S.sectionInfo(state, t.dataset.sectionHidden).hidden = t.checked;
      changed();
    } else if (t.dataset.info) {
      const inf = S.info(state, t.dataset.student);
      inf[t.dataset.info] = t.type === 'checkbox' ? t.checked : t.value;
      changed();
    } else if (t.dataset.asgHours) {
      const a = state.assignments.find((x) => x.id === t.dataset.asgHours);
      if (a) { a.hours = t.value === '' ? null : Number(t.value); changed(); }
    } else if (t.dataset.asgNote) {
      persist();
    }
  });

  window.addEventListener('beforeunload', () => S.save(state));

  render();
  loadBundledTemplates();
})();
