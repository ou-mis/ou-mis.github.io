/**
 * state.js — Central reactive state store for the syllabus form.
 *
 * Usage:
 *   State.get()                   → full state snapshot
 *   State.set(partialState)       → deep-merge and notify listeners
 *   State.subscribe(fn)           → register a change listener
 *   State.reset()                 → clear state to defaults
 */
const State = (() => {
  const DEFAULT_STATE = {
    // Section 1
    semester: '',
    startDate: '',
    endDate: '',
    courseNumber: '',
    courseTitle: '',
    sectionNumber: '',

    // Section 2
    instructorName: '',
    officeLocation: '',
    officeHours: [],           // [{ day, startTime, endTime }]
    courseEmail: '',
    emailSubject: '',
    classRoom: '',
    meetingDays: [],           // ['Mon','Wed','Fri']
    meetingStart: '',
    meetingEnd: '',
    lmsUrl: 'https://canvas.ou.edu',
    finalExamDate: '',
    finalExamStart: '',
    finalExamEnd: '',
    finalExamRoom: '',

    // Section 3
    materials: [],             // [{ type, title, obtain, required }]

    // Section 4
    prereqs: [],               // [{ courseNum, courseName, reason }]

    // Section 5
    courseDescription: '',
    coursePhilosophy: '',
    modules: [],               // [{ number, title, description }]
    clos: [],                  // [{ number, text, assignments[] }]

    // Section 6
    gradingType: 'weighted',   // 'weighted' | 'points'
    gradeScale: [
      { grade: 'A', min: 90, max: 100 },
      { grade: 'B', min: 80, max: 89 },
      { grade: 'C', min: 70, max: 79 },
      { grade: 'D', min: 60, max: 69 },
      { grade: 'F', min: 0,  max: 59 },
    ],
    assessments: [],           // [{ name, weight, notes, optional }]

    // Section 7
    divisionPolicies: {},      // { policyId: { included, customText } }
    customPolicies: [          // [{ title, content }]
      {
        title: 'Timeliness / Late Work',
        content: 'Late work will not be accepted. Assignments submitted after the deadline will receive a grade of zero. If you anticipate a conflict with a deadline, you must contact the instructor **at least 48 hours in advance** to discuss possible arrangements.',
      },
      {
        title: 'Grade / Score Appeals',
        content: 'Students wishing to appeal a grade or score must submit the appeal to the instructor **in writing within 48 hours** of receiving the graded work. Appeals submitted after this window will not be considered. The instructor reserves the right to re-evaluate the entire submission; the score may go up or down as a result of the re-evaluation. Grade appeals must go to the instructor directly, not to the TAs.',
      },
      {
        title: 'Missed Exams / Make-Up Policy',
        content: 'Make-up exams are only available under extraordinary circumstances (e.g., documented medical emergency, family emergency). If you need to miss an exam, you must contact the instructor **at least 48 hours before** the scheduled exam and provide documentation. Conflicts known in advance (e.g., travel, other exams) do not qualify as extraordinary circumstances.',
      },
      {
        title: 'Incomplete Grades',
        content: 'A grade of Incomplete (I) may be awarded only when a student has been unable to complete coursework due to a legitimate emergency that occurs near the end of the semester. Incompletes will not be awarded to students who simply need more time to master the material or to improve their grade. Any request for an incomplete must be discussed with the instructor prior to the end of the semester.',
      },
    ],

    // Section 8
    universityPolicies: {},    // { policyId: { included } }

    // Section 9
    genAiTier: '',
    genAiText: '',

    // Section 10
    noClassDays: [],           // [{ date, reason }]
    calendarRows: [],          // [{ date, day, type, name, topic, readings, due }]
    calendarView: 'flat',      // 'flat' | 'week'
  };

  let _state = deepClone(DEFAULT_STATE);
  const _listeners = [];

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function deepMerge(target, source) {
    const result = deepClone(target);
    for (const key of Object.keys(source)) {
      if (
        source[key] !== null &&
        typeof source[key] === 'object' &&
        !Array.isArray(source[key]) &&
        typeof result[key] === 'object' &&
        !Array.isArray(result[key])
      ) {
        result[key] = deepMerge(result[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }

  function get() {
    return deepClone(_state);
  }

  function set(partial) {
    _state = deepMerge(_state, partial);
    _listeners.forEach(fn => fn(deepClone(_state)));
  }

  function subscribe(fn) {
    _listeners.push(fn);
    return () => {
      const idx = _listeners.indexOf(fn);
      if (idx > -1) _listeners.splice(idx, 1);
    };
  }

  function reset() {
    _state = deepClone(DEFAULT_STATE);
    _listeners.forEach(fn => fn(deepClone(_state)));
  }

  return { get, set, subscribe, reset, DEFAULT_STATE: deepClone(DEFAULT_STATE) };
})();
