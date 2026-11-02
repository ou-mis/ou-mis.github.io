(function (root) {
  'use strict';

  const T = root.TATime;
  const S = root.TAState;

  // Sections already assigned to the student whose meeting times overlap the target section.
  function conflictsFor(state, studentId, crn, ignoreAssignmentId) {
    const target = state.sections[crn];
    if (!target) return [];
    return S.assignmentsForStudent(state, studentId)
      .filter((a) => a.id !== ignoreAssignmentId && a.crn !== crn)
      .map((a) => state.sections[a.crn])
      .filter((sec) => sec && T.overlaps(sec, target));
  }

  function evaluate(state, student, section) {
    const assigned = S.assignmentsForStudent(state, student.id);
    const already = assigned.some((a) => a.crn === section.crn);
    const conflicts = conflictsFor(state, student.id, section.crn);
    const hasMeeting = T.hasMeeting(section);
    const available = hasMeeting ? T.covers(student.availability, section) : true;
    const max = Number(state.settings.maxSections) || 0;
    const atMax = max > 0 && assigned.length >= max && !already;
    const sInfo = S.info(state, student.id);
    return {
      student,
      already,
      available,
      noAvailability: !(student.availability || []).length,
      interested: student.interested.includes(section.courseKey),
      taken: student.taken.includes(section.courseKey),
      conflicts,
      load: assigned.length,
      hours: S.studentTotals(state, student.id).hours,
      atMax,
      excluded: !!sInfo.excluded,
      eligible: student.agreed && !student.missing && !sInfo.excluded,
    };
  }

  function score(c) {
    return [
      c.already ? 1 : 0,
      c.conflicts.length ? 0 : 1,
      c.available ? 1 : 0,
      c.interested ? 1 : 0,
      c.taken ? 1 : 0,
      c.atMax ? 0 : 1,
      c.student.gpaRank,
      { major: 2, minor: 1, none: 0 }[root.TAParsers.majorStatus(c.student.major)],
      -c.load,
    ];
  }

  function lastFirst(name) {
    const parts = String(name || '').trim().split(/\s+/);
    return parts.length > 1 ? `${parts[parts.length - 1]} ${parts.slice(0, -1).join(' ')}` : parts[0] || '';
  }

  function compareBestMatch(a, b) {
    const sa = score(a);
    const sb = score(b);
    for (let i = 0; i < sa.length; i++) {
      if (sa[i] !== sb[i]) return sb[i] - sa[i];
    }
    return a.student.name.localeCompare(b.student.name);
  }

  // Students already assigned to the section stay on top in every sort.
  const SORTS = {
    best: compareBestMatch,
    first: (a, b) => (b.already - a.already) || a.student.name.localeCompare(b.student.name),
    last: (a, b) => (b.already - a.already) || lastFirst(a.student.name).localeCompare(lastFirst(b.student.name)),
  };

  // Interest is only shown as a badge; it never hides an applicant.
  // filters: { showUnavailable, showUntaken, showConflicts }; sort: 'last' | 'first' | 'best'
  function candidates(state, crn, filters, sort) {
    const section = state.sections[crn];
    if (!section) return [];
    const f = filters || {};
    return Object.values(state.students)
      .map((st) => evaluate(state, st, section))
      .filter((c) => c.eligible || c.already)
      .filter((c) => c.already || f.showUnavailable || c.available)
      .filter((c) => c.already || f.showUntaken || c.taken)
      .filter((c) => c.already || f.showConflicts || !c.conflicts.length)
      .sort(SORTS[sort] || SORTS.last);
  }

  // How many eligible applicants the current filters hide, by the first filter that hides them.
  function hiddenCounts(state, crn, filters) {
    const section = state.sections[crn];
    const out = { unavailable: 0, untaken: 0, conflicts: 0 };
    if (!section) return out;
    const f = filters || {};
    Object.values(state.students)
      .map((st) => evaluate(state, st, section))
      .filter((c) => c.eligible && !c.already)
      .forEach((c) => {
        if (!f.showUnavailable && !c.available) out.unavailable++;
        else if (!f.showUntaken && !c.taken) out.untaken++;
        else if (!f.showConflicts && c.conflicts.length) out.conflicts++;
      });
    return out;
  }

  // Problems on existing assignments, used for warnings in the TAs and Assign tabs.
  function assignmentIssues(state, assignment) {
    const issues = [];
    const st = state.students[assignment.studentId];
    const sec = state.sections[assignment.crn];
    if (!st) issues.push('Student not found');
    else if (st.missing) issues.push('Student no longer in survey CSV');
    if (!sec) issues.push('Section not found');
    else if (sec.missing) issues.push('Section no longer in schedule CSV');
    if (st && sec) {
      const c = conflictsFor(state, st.id, sec.crn, assignment.id);
      if (c.length) issues.push('Time conflict with ' + c.map((x) => `${x.subject} ${x.number}-${x.section}`).join(', '));
      if (T.hasMeeting(sec) && !T.covers(st.availability, sec)) issues.push('Outside stated availability');
    }
    if (assignment.override) issues.push('Assigned with override');
    return issues;
  }

  function overMax(state, studentId) {
    const max = Number(state.settings.maxSections) || 0;
    return max > 0 && S.assignmentsForStudent(state, studentId).length > max;
  }

  root.TAMatching = { conflictsFor, evaluate, candidates, hiddenCounts, assignmentIssues, overMax };
})(typeof window !== 'undefined' ? window : globalThis);
