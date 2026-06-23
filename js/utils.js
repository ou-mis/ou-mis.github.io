/**
 * utils.js — Shared utility functions.
 */
const Utils = (() => {

  /** Format a Date object as "Mon, Jan 13, 2026" */
  function formatDate(dateObj) {
    if (!dateObj) return '';
    return dateObj.toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
    });
  }

  /** Format a policy lastUpdated ISO date for form UI (not exported). */
  function formatPolicyLastUpdated(isoStr) {
    if (!isoStr) return '';
    return formatDate(parseISODate(isoStr));
  }

  /** Format "2026-01-13" ISO string as a Date (local, no TZ shift) */
  function parseISODate(isoStr) {
    if (!isoStr) return null;
    const [y, m, d] = isoStr.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  /** Return short day name for a Date: "Mon", "Tue", etc. */
  function shortDayName(dateObj) {
    return dateObj.toLocaleDateString('en-US', { weekday: 'short' });
  }

  /** Return ISO "YYYY-MM-DD" string for a Date */
  function toISODate(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /** Format time string "13:00" → "1:00 PM" */
  function formatTime(timeStr) {
    if (!timeStr) return '';
    const [hh, mm] = timeStr.split(':').map(Number);
    const period = hh >= 12 ? 'PM' : 'AM';
    const h = hh % 12 || 12;
    return `${h}:${String(mm).padStart(2, '0')} ${period}`;
  }

  /** Debounce a function */
  function debounce(fn, ms) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  }

  /** Show a toast notification */
  function toast(message, type = 'info', durationMs = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.textContent = message;
    el.setAttribute('role', 'status');
    container.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.3s';
      setTimeout(() => el.remove(), 300);
    }, durationMs);
  }

  /** Trigger a file download with given content */
  function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Generate a safe filename component from a string */
  function slugify(str) {
    return str.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '');
  }

  /** Escape HTML special characters */
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Render markdown to HTML using marked.js (full support: tables, lists, blockquotes, etc.) */
  function mdToHtml(md) {
    if (!md) return '';
    // marked is loaded as a global from CDN
    if (typeof marked !== 'undefined') {
      return marked.parse(md);
    }
    // Fallback if marked hasn't loaded yet: plain text with line breaks
    return `<p>${escapeHtml(md).replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br />')}</p>`;
  }

  /**
   * Group calendarRows into a grid structure for the visual calendar view.
   * Returns { sortedDays, weeks, finalRow } where:
   *   sortedDays — meeting day abbreviations sorted Sun→Sat
   *   weeks      — array of { weekNum, cells: { 'Mon': row, 'Wed': row, … } }
   *   finalRow   — the final-exam row (or null)
   */
  function groupCalendarByWeek(s) {
    const DAY_ORDER = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const rows = s.calendarRows || [];
    const meetingDays = s.meetingDays || [];

    const sortedDays = [...meetingDays].sort(
      (a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b)
    );

    function mondayOf(date) {
      const d   = new Date(date);
      const day = d.getDay();
      d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
      return d;
    }

    const weekMap = new Map();
    rows.forEach(row => {
      if (row.type === 'final-exam') return;
      const date   = parseISODate(row.date);
      const monday = mondayOf(date);
      const key    = toISODate(monday);
      if (!weekMap.has(key)) weekMap.set(key, { cells: {} });
      weekMap.get(key).cells[row.day] = row;
    });

    const weeks = Array.from(weekMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v], i) => ({ weekNum: i + 1, cells: v.cells }));

    // Final exam: prefer generated row, fall back to state fields
    let finalRow = rows.find(r => r.type === 'final-exam') || null;
    if (!finalRow && s.finalExamDate) {
      const fDate = parseISODate(s.finalExamDate);
      finalRow = {
        date:  s.finalExamDate,
        day:   shortDayName(fDate),
        type:  'final-exam',
        topic: s.finalExamRoom ? `Room: ${s.finalExamRoom}` : '',
        due:   s.finalExamStart && s.finalExamEnd
                 ? `${formatTime(s.finalExamStart)} – ${formatTime(s.finalExamEnd)}` : '',
      };
    }

    return { sortedDays, weeks, finalRow };
  }

  return { formatDate, formatPolicyLastUpdated, parseISODate, shortDayName, toISODate, formatTime, debounce, toast, downloadFile, slugify, escapeHtml, mdToHtml, groupCalendarByWeek };
})();
