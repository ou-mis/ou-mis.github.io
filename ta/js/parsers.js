(function (root) {
  'use strict';

  const T = root.TATime;

  function parseCsvRows(text) {
    const res = root.Papa.parse(String(text || '').replace(/^\uFEFF/, ''), { skipEmptyLines: 'greedy' });
    return res.data;
  }

  function firstLine(h) {
    return String(h || '').split(/\r?\n/)[0].toLowerCase();
  }

  // Canvas prefixes question headers with an id that changes each semester ("11943545: What is your major?").
  const SURVEY_QUESTIONS = [
    ['major', /what is your major/],
    ['gpa', /\bgpa\b/],
    ['taken', /(courses|classes) you have taken/],
    ['interested', /interested in helping/],
    ['times', /meeting times|times (that )?you are available/],
    ['agree', /role description/],
    ['scheduleFile', /schedule for next semester/],
    ['resumeFile', /resume/],
    ['transcriptFile', /transcript/],
  ];

  function findColumns(header) {
    const cols = {};
    const lower = header.map((h) => String(h).trim().toLowerCase());
    ['name', 'id', 'sis_id', 'submitted', 'attempt'].forEach((k) => {
      cols[k] = lower.indexOf(k);
    });
    SURVEY_QUESTIONS.forEach(([key, re]) => {
      cols[key] = header.findIndex((h) => re.test(firstLine(h)));
    });
    return cols;
  }

  function splitCourses(raw) {
    if (!raw) return [];
    return String(raw)
      .split(/,(?=\s*[A-Z][A-Z ]{0,5}\s?\d{4}\s*-)/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function splitTimes(raw) {
    if (!raw) return [];
    return String(raw)
      .split(/,(?=\s*[MTWRFSU](?:\/[MTWRFSU])*\s*@)/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function courseKey(subject, number) {
    return `${String(subject || '').replace(/\s+/g, '').toUpperCase()} ${String(number || '').trim()}`;
  }

  // "MIS 2113 - Computer-Based Info Systems" -> { key: "MIS 2113", label: ... }
  function parseCourseOption(label) {
    const m = String(label).match(/^\s*([A-Z][A-Z ]*?)\s*(\d{4})\b/);
    return { key: m ? courseKey(m[1], m[2]) : label.trim(), label: label.trim() };
  }

  function gpaRank(gpa) {
    const m = String(gpa || '').match(/(\d\.\d+)/);
    return m ? parseFloat(m[1]) : 0;
  }

  // 'major' (MIS alone or one of several majors), 'minor' (other major + MIS minor), or 'none'.
  function majorStatus(major) {
    const s = String(major || '');
    if (/MIS is NOT/i.test(s)) return 'none';
    if (/^MIS$/i.test(s.trim()) || /MIS is one/i.test(s)) return 'major';
    if (/MIS minor/i.test(s)) return 'minor';
    return 'none';
  }

  function isMisMajor(major) {
    return majorStatus(major) !== 'none';
  }

  function parseSurvey(text) {
    const rows = parseCsvRows(text);
    if (!rows.length) throw new Error('Survey CSV is empty.');
    const header = rows[0];
    const cols = findColumns(header);
    if (cols.name < 0 || cols.id < 0) throw new Error('Survey CSV is missing the "name" or "id" column (expected a Canvas Student Analysis export).');
    const missing = ['taken', 'interested', 'times'].filter((k) => cols[k] < 0);
    const get = (row, k) => (cols[k] >= 0 ? String(row[cols[k]] ?? '').trim() : '');

    const byId = new Map();
    rows.slice(1).forEach((row) => {
      const id = get(row, 'id');
      if (!id) return;
      const attempt = parseInt(get(row, 'attempt'), 10) || 0;
      const submitted = get(row, 'submitted');
      const prev = byId.get(id);
      if (prev && (prev.attempt > attempt || (prev.attempt === attempt && prev.submitted >= submitted))) return;

      const takenOpts = splitCourses(get(row, 'taken')).map(parseCourseOption);
      const interestedOpts = splitCourses(get(row, 'interested')).map(parseCourseOption);
      const timeLabels = splitTimes(get(row, 'times'));
      const slots = timeLabels.map(T.parseSurveySlot).filter(Boolean);
      const agreeText = get(row, 'agree');

      byId.set(id, {
        id,
        name: get(row, 'name'),
        sisId: get(row, 'sis_id'),
        submitted,
        attempt,
        major: get(row, 'major'),
        misMajor: isMisMajor(get(row, 'major')),
        gpa: get(row, 'gpa'),
        gpaRank: gpaRank(get(row, 'gpa')),
        taken: takenOpts.map((c) => c.key),
        takenLabels: takenOpts.map((c) => c.label),
        interested: interestedOpts.map((c) => c.key),
        interestedLabels: interestedOpts.map((c) => c.label),
        availability: slots,
        unparsedTimes: timeLabels.filter((l) => !T.parseSurveySlot(l)),
        agreed: agreeText ? !/disagree/i.test(agreeText) : true,
        agreeText,
        files: {
          schedule: get(row, 'scheduleFile'),
          resume: get(row, 'resumeFile'),
          transcript: get(row, 'transcriptFile'),
        },
      });
    });

    return {
      students: Array.from(byId.values()),
      totalRows: rows.length - 1,
      warnings: missing.length ? [`Could not find survey column(s): ${missing.join(', ')}`] : [],
    };
  }

  const SCHEDULE_ALIASES = {
    term: ['term', 'semester'],
    subject: ['subject', 'subj', 'dept'],
    number: ['course number', 'course #', 'course no', 'catalog number', 'number', 'crse'],
    course: ['course'],
    section: ['section', 'section number', 'sec'],
    crn: ['crn'],
    title: ['title', 'course title', 'course name'],
    instructor: ['primary instructor', 'instructor', 'instructor name', 'faculty'],
    instructorId: ['instructor id', 'instructor emp id', 'emp id'],
    status: ['status'],
    startDate: ['start date', 'course start date'],
    endDate: ['end date', 'course end date'],
    building: ['building', 'bldg'],
    room: ['room'],
    location: ['location'],
    days: ['days', 'meeting days'],
    startTime: ['start time', 'begin time'],
    endTime: ['end time'],
    meetingTime: ['meeting time', 'time', 'times'],
    method: ['instruction method'],
    scheduleCode: ['schedule code'],
    level: ['level'],
    enrollment: ['actual enrollment', 'enrollment'],
  };

  function findScheduleColumns(header) {
    const lower = header.map((h) => String(h).trim().toLowerCase());
    const cols = {};
    Object.entries(SCHEDULE_ALIASES).forEach(([key, names]) => {
      cols[key] = -1;
      for (const n of names) {
        const i = lower.indexOf(n);
        if (i >= 0) { cols[key] = i; break; }
      }
    });
    return cols;
  }

  function parseSchedule(text) {
    const rows = parseCsvRows(text);
    if (!rows.length) throw new Error('Schedule CSV is empty.');
    const cols = findScheduleColumns(rows[0]);
    const get = (row, k) => (cols[k] >= 0 ? String(row[cols[k]] ?? '').replace(/\s+/g, ' ').trim() : '');
    if (cols.subject < 0 && cols.course < 0) throw new Error('Schedule CSV needs a "Subject" + "Course Number" (or "Course") column.');

    const byCrn = new Map();
    const warnings = [];
    let last = null;
    rows.slice(1).forEach((row, idx) => {
      let subject = get(row, 'subject');
      let number = get(row, 'number');
      if ((!subject || !number) && get(row, 'course')) {
        const m = get(row, 'course').match(/^([A-Z][A-Z ]*?)\s*(\d{4})/i);
        if (m) { subject = subject || m[1].toUpperCase(); number = number || m[2]; }
      }
      const meeting = rowMeeting(row, get);
      // OU exports list a section's extra meetings (lab, online part) on follow-up rows that start with "...".
      const isContinuation = get(row, 'term').startsWith('...');
      const rowCrn = get(row, 'crn');
      const parent = (rowCrn && byCrn.get(rowCrn)) || (isContinuation && !rowCrn ? last : null);
      if (parent) {
        addMeeting(parent, meeting);
        return;
      }
      if (!subject || !number || isContinuation) return;
      const section = get(row, 'section');
      const crn = rowCrn || `${courseKey(subject, number)}-${section || idx + 1}`;
      const sec = {
        crn,
        term: get(row, 'term'),
        subject: subject.toUpperCase(),
        number,
        courseKey: courseKey(subject, number),
        section,
        title: get(row, 'title'),
        instructor: get(row, 'instructor'),
        instructorId: get(row, 'instructorId'),
        status: get(row, 'status'),
        startDate: get(row, 'startDate'),
        endDate: get(row, 'endDate'),
        building: '',
        room: '',
        days: [],
        start: null,
        end: null,
        meetings: [],
        method: get(row, 'method'),
        scheduleCode: get(row, 'scheduleCode'),
        level: get(row, 'level'),
        enrollment: get(row, 'enrollment'),
      };
      addMeeting(sec, meeting);
      byCrn.set(crn, sec);
      last = sec;
    });
    return { sections: Array.from(byCrn.values()), totalRows: rows.length - 1, warnings };
  }

  function rowMeeting(row, get) {
    let days = T.parseDays(get(row, 'days'));
    let start = T.parseClock(get(row, 'startTime'));
    let end = T.parseClock(get(row, 'endTime'));
    if ((!days.length || start === null) && get(row, 'meetingTime')) {
      const slot = T.parseSurveySlot(get(row, 'meetingTime').replace(/^([MTWRFSU/]+)\s+(?!@)/i, '$1 @ '));
      if (slot) { days = slot.days; start = slot.start; end = slot.end; }
    }
    if (!days.length || start === null || end === null) { days = []; start = null; end = null; }
    let building = get(row, 'building');
    let room = get(row, 'room');
    if (!building && !room && get(row, 'location')) building = get(row, 'location');
    return { days, start, end, building, room };
  }

  // Keeps the first timed meeting in days/start/end and lists every distinct location.
  function addMeeting(sec, m) {
    if (!m.days.length && !m.building && !m.room) return;
    sec.meetings.push(m);
    if (sec.start === null && m.start !== null) { sec.days = m.days; sec.start = m.start; sec.end = m.end; }
    const loc = [m.building, m.room].filter(Boolean).join(' ');
    const existing = [sec.building, sec.room].filter(Boolean).join(' ');
    if (!existing) { sec.building = m.building; sec.room = m.room; }
    else if (loc && !existing.split('; ').includes(loc)) { sec.building = `${existing}; ${loc}`; sec.room = ''; }
  }

  root.TAParsers = { parseSurvey, parseSchedule, splitCourses, splitTimes, courseKey, parseCourseOption, isMisMajor, majorStatus, gpaRank };
})(typeof window !== 'undefined' ? window : globalThis);
