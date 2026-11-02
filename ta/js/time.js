(function (root) {
  'use strict';

  const DAY_ORDER = ['M', 'T', 'W', 'R', 'F', 'S', 'U'];

  function parseDays(text) {
    const letters = String(text || '').toUpperCase().replace(/[^MTWRFSU]/g, '').split('');
    return DAY_ORDER.filter((d) => letters.includes(d));
  }

  // Accepts "1330", "930", "13:30", "1:30 PM", "1:30PM", "9:00 am".
  function parseClock(text, meridiem) {
    const s = String(text || '').trim();
    if (!s) return null;
    const m = s.match(/^(\d{1,2}):?(\d{2})\s*(AM|PM)?$/i);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    const ap = (m[3] || meridiem || '').toUpperCase();
    if (ap === 'PM' && h < 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  }

  // Survey option such as "M/W/F @ 11:00 AM - 11:50 AM" or the older "T/R @ 900 - 1015".
  function parseSurveySlot(label) {
    const m = String(label || '').match(/^\s*([MTWRFSU/ ]+?)\s*@\s*([\d:]+\s*(?:AM|PM)?)\s*-\s*([\d:]+\s*(?:AM|PM)?)\s*$/i);
    if (!m) return null;
    const days = parseDays(m[1]);
    const endMer = (m[3].match(/AM|PM/i) || [])[0];
    let start = parseClock(m[2]);
    const end = parseClock(m[3]);
    if (start !== null && !/AM|PM/i.test(m[2]) && endMer) {
      // "11:00 - 12:15 PM" style: borrow meridiem from the end time when it keeps start before end.
      const guess = parseClock(m[2], endMer);
      if (guess !== null && guess < end) start = guess;
    }
    if (!days.length || start === null || end === null) return null;
    return { days, start, end, label: String(label).trim() };
  }

  function formatClock(mins) {
    if (mins === null || mins === undefined) return '';
    let h = Math.floor(mins / 60);
    const m = mins % 60;
    const ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${String(m).padStart(2, '0')} ${ap}`;
  }

  function isTimed(m) {
    return !!(m && m.days && m.days.length && m.start !== null && m.start !== undefined && m.end !== null && m.end !== undefined);
  }

  // A section may carry several meetings (e.g. lecture plus lab); a bare meeting object is treated as one.
  function timedMeetings(x) {
    const list = x && Array.isArray(x.meetings) ? x.meetings : [x];
    return list.filter(isTimed);
  }

  function formatMeeting(x) {
    const list = timedMeetings(x);
    if (!list.length) return 'No set meeting time';
    return list.map((m) => `${m.days.join('/')} ${formatClock(m.start)} - ${formatClock(m.end)}`).join('; ');
  }

  function hasMeeting(x) {
    return timedMeetings(x).length > 0;
  }

  // True when the availability slots cover every day/time of every meeting.
  function covers(slots, x) {
    return timedMeetings(x).every((m) =>
      m.days.every((d) => (slots || []).some((s) => s.days.includes(d) && s.start <= m.start && s.end >= m.end))
    );
  }

  function overlaps(a, b) {
    const mb = timedMeetings(b);
    return timedMeetings(a).some((x) => mb.some((y) =>
      x.days.some((d) => y.days.includes(d)) && x.start < y.end && y.start < x.end));
  }

  root.TATime = { parseDays, parseClock, parseSurveySlot, formatClock, formatMeeting, hasMeeting, covers, overlaps };
})(typeof window !== 'undefined' ? window : globalThis);
