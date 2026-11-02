(function (root) {
  'use strict';

  const STORAGE_KEY = 'ta-assignment-tool-state-v1';
  const STATE_VERSION = 1;

  function defaultSettings() {
    return {
      term: 'Spring 2027',
      hourlyRate: 15,
      payPeriods: 10,
      defaultHours: 5,
      defaultTasPerCourse: 1,
      courseHours: {},
      maxSections: 3,
      blockOverMax: false,
      letterDate: '',
      startDate: '',
      endDate: '',
      acceptByDate: '',
      division: 'MIS',
      taType: 'UGTA',
      fte: '',
      org: '',
      fund: '',
      functionCode: '',
      account: '',
      entity: '',
      project: '',
      source: '',
      purpose: '',
    };
  }

  function emptyState() {
    return {
      version: STATE_VERSION,
      savedAt: null,
      settings: defaultSettings(),
      students: {},
      studentInfo: {},
      sections: {},
      sectionInfo: {},
      courseInfo: {},
      assignments: [],
      imports: {},
    };
  }

  function defaultStudentInfo() {
    return {
      email: '',
      employeeStatus: 'New',
      previouslyWorked: 'No',
      jobType: '',
      outsideUS: 'No',
      country: '',
      notes: '',
      excluded: false,
    };
  }

  function normalize(raw) {
    const s = Object.assign(emptyState(), raw || {});
    s.settings = Object.assign(defaultSettings(), (raw && raw.settings) || {});
    s.settings.courseHours = Object.assign({}, s.settings.courseHours || {});
    ['students', 'studentInfo', 'sections', 'sectionInfo', 'courseInfo', 'imports'].forEach((k) => {
      s[k] = s[k] && typeof s[k] === 'object' ? s[k] : {};
    });
    s.assignments = Array.isArray(s.assignments) ? s.assignments : [];
    Object.keys(s.students).forEach((id) => {
      s.studentInfo[id] = Object.assign(defaultStudentInfo(), s.studentInfo[id] || {});
    });
    return s;
  }

  function info(state, studentId) {
    if (!state.studentInfo[studentId]) state.studentInfo[studentId] = defaultStudentInfo();
    return state.studentInfo[studentId];
  }

  function sectionInfo(state, crn) {
    if (!state.sectionInfo[crn]) state.sectionInfo[crn] = { hidden: false };
    return state.sectionInfo[crn];
  }

  // tasNeeded is the course-wide TA target ('' = use settings.defaultTasPerCourse); noTas marks a course that gets no TAs.
  function courseInfo(state, key) {
    if (!state.courseInfo) state.courseInfo = {};
    if (!state.courseInfo[key]) state.courseInfo[key] = { tasNeeded: '', noTas: false };
    return state.courseInfo[key];
  }

  // Assigned/needed counts for a course, counting one per TA-section assignment and skipping hidden sections.
  function courseStatus(state, key) {
    const sections = Object.values(state.sections).filter((s) => s.courseKey === key && !sectionInfo(state, s.crn).hidden);
    const crns = new Set(sections.map((s) => s.crn));
    const assigned = state.assignments.filter((a) => crns.has(a.crn)).length;
    const sectionsCovered = sections.filter((s) => state.assignments.some((a) => a.crn === s.crn)).length;
    const ci = courseInfo(state, key);
    const raw = ci.tasNeeded === '' || ci.tasNeeded === null || ci.tasNeeded === undefined ? state.settings.defaultTasPerCourse : ci.tasNeeded;
    const needed = ci.noTas ? 0 : Math.max(0, Number(raw) || 0);
    const remaining = Math.max(0, needed - assigned);
    let status = assigned > needed ? 'over' : remaining === 0 ? 'complete' : 'open';
    if (ci.noTas || (needed === 0 && assigned === 0)) status = 'none';
    return { sections: sections.length, sectionsCovered, assigned, needed, remaining, status, noTas: !!ci.noTas, usingDefault: ci.tasNeeded === '' || ci.tasNeeded === undefined };
  }

  // Re-import keeps assignments and per-student edits; anything no longer in the CSV is flagged, not deleted.
  function mergeSurvey(state, parsed, fileName) {
    const incoming = new Set();
    let added = 0;
    parsed.students.forEach((st) => {
      incoming.add(st.id);
      if (!state.students[st.id]) added++;
      state.students[st.id] = Object.assign({}, st, { missing: false });
      info(state, st.id);
    });
    let missing = 0;
    Object.values(state.students).forEach((st) => {
      if (!incoming.has(st.id)) { st.missing = true; missing++; }
    });
    state.imports.survey = { fileName, at: new Date().toISOString(), count: parsed.students.length };
    return { added, updated: parsed.students.length - added, missing };
  }

  function mergeSchedule(state, parsed, fileName) {
    const incoming = new Set();
    let added = 0;
    parsed.sections.forEach((sec) => {
      incoming.add(sec.crn);
      if (!state.sections[sec.crn]) added++;
      state.sections[sec.crn] = Object.assign({}, sec, { missing: false });
      sectionInfo(state, sec.crn);
    });
    let missing = 0;
    Object.values(state.sections).forEach((sec) => {
      if (!incoming.has(sec.crn)) { sec.missing = true; missing++; }
    });
    state.imports.schedule = { fileName, at: new Date().toISOString(), count: parsed.sections.length };
    if (!state.settings.startDate || !state.settings.endDate) {
      const first = parsed.sections.find((x) => x.startDate && x.endDate);
      if (first) {
        state.settings.startDate = state.settings.startDate || toIsoDate(first.startDate);
        state.settings.endDate = state.settings.endDate || toIsoDate(first.endDate);
      }
    }
    return { added, updated: parsed.sections.length - added, missing };
  }

  // "08/16/2027" -> "2027-08-16"; ISO input is returned unchanged.
  function toIsoDate(text) {
    const s = String(text || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : '';
  }

  // "2027-08-16" -> "08/16/2027"; non-ISO input is returned unchanged.
  function toUsDate(text) {
    const m = String(text || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[2]}/${m[3]}/${m[1]}` : String(text || '');
  }

  function newId() {
    return 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function addAssignment(state, studentId, crn, extra) {
    const a = Object.assign({ id: newId(), studentId, crn, hours: null, override: false, note: '', createdAt: new Date().toISOString() }, extra || {});
    state.assignments.push(a);
    return a;
  }

  function removeAssignment(state, assignmentId) {
    state.assignments = state.assignments.filter((a) => a.id !== assignmentId);
  }

  function assignmentsForStudent(state, studentId) {
    return state.assignments.filter((a) => a.studentId === studentId);
  }

  function assignmentsForSection(state, crn) {
    return state.assignments.filter((a) => a.crn === crn);
  }

  function hoursFor(state, assignment) {
    if (assignment.hours !== null && assignment.hours !== undefined && assignment.hours !== '') return Number(assignment.hours);
    const sec = state.sections[assignment.crn];
    const key = sec ? sec.courseKey : '';
    const override = state.settings.courseHours[key];
    if (override !== undefined && override !== null && override !== '') return Number(override);
    return Number(state.settings.defaultHours) || 0;
  }

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  function payFor(state, hours) {
    const rate = Number(state.settings.hourlyRate) || 0;
    const periods = Number(state.settings.payPeriods) || 0;
    const biweekly = round2(hours * 2 * rate);
    return { hours, biweekly, total: round2(biweekly * periods), fte: round2(hours / 40 * 1000) / 1000 };
  }

  function studentTotals(state, studentId) {
    const list = assignmentsForStudent(state, studentId);
    const hours = list.reduce((sum, a) => sum + hoursFor(state, a), 0);
    return Object.assign({ count: list.length }, payFor(state, hours));
  }

  function save(state) {
    state.savedAt = new Date().toISOString();
    try {
      root.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Autosave failed', e);
    }
  }

  function load() {
    try {
      const raw = root.localStorage.getItem(STORAGE_KEY);
      return raw ? normalize(JSON.parse(raw)) : emptyState();
    } catch (e) {
      console.warn('Could not read autosave', e);
      return emptyState();
    }
  }

  function clearSaved() {
    try { root.localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
  }

  function fromJson(text) {
    const raw = JSON.parse(text);
    if (!raw || typeof raw !== 'object' || !('students' in raw) || !('assignments' in raw)) {
      throw new Error('This file does not look like a TA Assignment Tool save file.');
    }
    return normalize(raw);
  }

  function toJson(state) {
    state.savedAt = new Date().toISOString();
    return JSON.stringify(state, null, 2);
  }

  root.TAState = {
    emptyState, normalize, info, sectionInfo, courseInfo, courseStatus, mergeSurvey, mergeSchedule,
    addAssignment, removeAssignment, assignmentsForStudent, assignmentsForSection,
    hoursFor, payFor, studentTotals, save, load, clearSaved, fromJson, toJson, defaultStudentInfo,
    toIsoDate, toUsDate,
  };
})(typeof window !== 'undefined' ? window : globalThis);
