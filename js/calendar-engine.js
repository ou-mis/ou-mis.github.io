/**
 * calendar-engine.js — Period-first calendar logic (date skeleton + session plan).
 */
const CalendarEngine = (() => {
  const DAY_ORDER = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const PATTERN_TTH = ['Tue', 'Thu'];
  const PATTERN_MWF = ['Mon', 'Wed', 'Fri'];

  function mondayOf(date) {
    const d = new Date(date);
    const day = d.getDay();
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    return d;
  }

  function weekKey(isoDate) {
    const date = Utils.parseISODate(isoDate);
    if (!date) return '';
    return Utils.toISODate(mondayOf(date));
  }

  function meetingDaysEqual(a, b) {
    const sa = [...(a || [])].sort().join(',');
    const sb = [...(b || [])].sort().join(',');
    return sa === sb;
  }

  function formatMeetingDays(days) {
    return [...(days || [])].sort(
      (x, y) => DAY_ORDER.indexOf(x) - DAY_ORDER.indexOf(y)
    ).join('/');
  }

  function getSemesterContext(state, config) {
    const sem = config.getSemesterByCode(state.semester);
    if (!sem || !state.meetingDays?.length) return null;

    const startDate = state.startDate || sem.startDate;
    const endDate = state.endDate || sem.endDate;
    if (!startDate || !endDate || startDate > endDate) return null;

    return {
      startDate,
      endDate,
      meetingDays: state.meetingDays,
      holidays: sem.holidays || [],
      noClassDays: state.noClassDays || [],
    };
  }

  function enumerateMeetingDates({ startDate, endDate, meetingDays, holidays, noClassDays }) {
    const start = typeof startDate === 'string' ? Utils.parseISODate(startDate) : startDate;
    const end = typeof endDate === 'string' ? Utils.parseISODate(endDate) : endDate;
    if (!start || !end) return [];

    const holidaySet = new Set((holidays || []).map(h => h.date));
    const holidayNames = {};
    (holidays || []).forEach(h => { holidayNames[h.date] = h.name; });

    const noClassSet = new Set((noClassDays || []).map(d => d.date));
    const noClassNames = {};
    (noClassDays || []).forEach(d => { noClassNames[d.date] = d.reason || 'No Class'; });

    const meetingDayNums = meetingDays.map(d => DAY_ORDER.indexOf(d));
    const rows = [];
    const cur = new Date(start);

    while (cur <= end) {
      const iso = Utils.toISODate(cur);
      const dayNum = cur.getDay();
      const dayLabel = Utils.shortDayName(cur);

      if (meetingDayNums.includes(dayNum)) {
        if (holidaySet.has(iso)) {
          rows.push({
            date: iso, day: dayLabel, type: 'holiday', name: holidayNames[iso],
            topic: '', readings: '', due: '',
          });
        } else if (noClassSet.has(iso)) {
          rows.push({
            date: iso, day: dayLabel, type: 'no-class', name: noClassNames[iso] || 'No Class',
            topic: '', readings: '', due: '',
          });
        } else {
          rows.push({
            date: iso, day: dayLabel, type: 'class', name: '',
            topic: '', readings: '', due: '',
          });
        }
      }
      cur.setDate(cur.getDate() + 1);
    }

    return rows;
  }

  function emptyItem() {
    return { topic: '', readings: '', due: '' };
  }

  function mergeFieldValues(values, separator) {
    return values.map(v => (v || '').trim()).filter(Boolean).join(separator);
  }

  function mergeItems(items) {
    return {
      topic: mergeFieldValues(items.map(i => i.topic), ' / '),
      readings: mergeFieldValues(items.map(i => i.readings), ' | '),
      due: mergeFieldValues(items.map(i => i.due), ' | '),
    };
  }

  /**
   * Expand or compress a week's topic slots.
   * 2→3: leave extra days blank.
   * 3→2: keep day 1; combine day 2 + day 3 into day 2.
   */
  function convertWeekSlots(sourceItems, targetCount) {
    const sources = (sourceItems || []).map(i => ({ ...i }));
    if (targetCount <= 0) return [];

    if (sources.length <= targetCount) {
      const result = [];
      for (let i = 0; i < targetCount; i++) {
        result.push(sources[i] ? { ...sources[i] } : emptyItem());
      }
      return result;
    }

    // Keep first (targetCount - 1) slots; merge remaining into the last slot
    // e.g. MWF [A,B,C] → TTh [A, B/C]
    const keepCount = targetCount - 1;
    const result = sources.slice(0, keepCount).map(i => ({ ...i }));
    result.push(mergeItems(sources.slice(keepCount)));
    return result;
  }

  function getPlanEntry(sessionPlan, period) {
    if (!sessionPlan?.length || period < 1) return null;
    return sessionPlan.find(p => p.period === period) || sessionPlan[period - 1] || null;
  }

  function mapPlanToRows(dateSkeleton, sessionPlan) {
    let classIndex = 0;
    return dateSkeleton.map(row => {
      if (row.type !== 'class') {
        return { ...row, topic: row.topic || '', readings: row.readings || '', due: row.due || '' };
      }
      classIndex += 1;
      const plan = getPlanEntry(sessionPlan, classIndex);
      return {
        ...row,
        period: classIndex,
        topic: plan?.topic || '',
        readings: plan?.readings || '',
        due: plan?.due || '',
      };
    });
  }

  function rowsToPlan(calendarRows) {
    return (calendarRows || [])
      .filter(r => r.type === 'class')
      .map((r, i) => ({
        period: r.period || i + 1,
        topic: r.topic || '',
        readings: r.readings || '',
        due: r.due || '',
      }));
  }

  function normalizePlan(sessionPlan, classCount) {
    const result = [];
    for (let i = 1; i <= classCount; i++) {
      const existing = getPlanEntry(sessionPlan, i);
      result.push({
        period: i,
        topic: existing?.topic || '',
        readings: existing?.readings || '',
        due: existing?.due || '',
      });
    }
    return result;
  }

  function countClassMeetings(rows) {
    return (rows || []).filter(r => r.type === 'class').length;
  }

  function syncRowEdit(sessionPlan, period, fields) {
    const plan = (sessionPlan || []).map(p => ({ ...p }));
    while (plan.length < period) {
      plan.push({ period: plan.length + 1, topic: '', readings: '', due: '' });
    }
    const idx = period - 1;
    plan[idx] = { ...plan[idx], period, ...fields };
    return plan;
  }

  /**
   * Move a period's content to a new period index (1-based). Dates stay fixed;
   * content is re-ordered by splicing the plan array.
   */
  function reorderPlan(sessionPlan, fromPeriod, toPeriod) {
    if (!fromPeriod || !toPeriod || fromPeriod === toPeriod) {
      return (sessionPlan || []).map(p => ({ ...p }));
    }

    const maxNeeded = Math.max(
      fromPeriod,
      toPeriod,
      ...(sessionPlan || []).map(p => p.period || 0)
    );
    const items = normalizePlan(sessionPlan, maxNeeded).map(p => ({
      topic: p.topic || '',
      readings: p.readings || '',
      due: p.due || '',
    }));

    const fromIdx = fromPeriod - 1;
    const toIdx = toPeriod - 1;
    if (fromIdx < 0 || fromIdx >= items.length || toIdx < 0 || toIdx >= items.length) {
      return normalizePlan(sessionPlan, maxNeeded);
    }

    const [moved] = items.splice(fromIdx, 1);
    items.splice(toIdx, 0, moved);
    return items.map((item, i) => ({ period: i + 1, ...item }));
  }

  function groupClassRowsByWeek(classRows) {
    const groups = new Map();
    classRows.forEach(row => {
      const key = weekKey(row.date);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({
        topic: row.topic || '',
        readings: row.readings || '',
        due: row.due || '',
      });
    });
    return groups;
  }

  function convertPlanByWeek(sessionPlan, fromMeetingDays, toMeetingDays, semesterContext) {
    const sourceSkeleton = enumerateMeetingDates({
      ...semesterContext,
      meetingDays: fromMeetingDays,
    });
    const targetSkeleton = enumerateMeetingDates({
      ...semesterContext,
      meetingDays: toMeetingDays,
    });

    const sourceRows = mapPlanToRows(sourceSkeleton, sessionPlan)
      .filter(r => r.type === 'class');
    const targetClassRows = targetSkeleton.filter(r => r.type === 'class');

    const sourceByWeek = groupClassRowsByWeek(sourceRows);
    const targetByWeek = new Map();
    targetClassRows.forEach(row => {
      const key = weekKey(row.date);
      if (!targetByWeek.has(key)) targetByWeek.set(key, 0);
      targetByWeek.set(key, targetByWeek.get(key) + 1);
    });

    const weekKeys = [...new Set([
      ...targetByWeek.keys(),
      ...sourceByWeek.keys(),
    ])].sort();

    const convertedItems = [];
    weekKeys.forEach(key => {
      const sourceItems = sourceByWeek.get(key) || [];
      const targetCount = targetByWeek.get(key) || 0;
      convertedItems.push(...convertWeekSlots(sourceItems, targetCount));
    });

    return normalizePlan(
      convertedItems.map((item, i) => ({ period: i + 1, ...item })),
      targetClassRows.length
    );
  }

  function migrateLoadedState(state) {
    const next = { ...state };
    if (!next.sessionPlan?.length && next.calendarRows?.length) {
      next.sessionPlan = rowsToPlan(next.calendarRows);
    }
    if (!Array.isArray(next.sessionPlan)) next.sessionPlan = [];
    if (!Array.isArray(next.lastMeetingDays)) {
      next.lastMeetingDays = next.meetingDays ? [...next.meetingDays] : [];
    }
    return next;
  }

  return {
    DAY_ORDER,
    PATTERN_TTH,
    PATTERN_MWF,
    mondayOf,
    weekKey,
    meetingDaysEqual,
    formatMeetingDays,
    getSemesterContext,
    enumerateMeetingDates,
    mapPlanToRows,
    rowsToPlan,
    normalizePlan,
    countClassMeetings,
    syncRowEdit,
    reorderPlan,
    convertPlanByWeek,
    convertWeekSlots,
    migrateLoadedState,
  };
})();
