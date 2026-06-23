/**
 * Collapsible form sections.
 *
 * At DOMContentLoaded this module:
 *  1. Wraps each .form-section's non-heading children in a .section-body div.
 *  2. Converts the .section-heading h2 into a full-width toggle button.
 *  3. Animates open/close with explicit height transitions.
 *  4. Persists collapsed section IDs in localStorage.
 *  5. Auto-expands a collapsed section when its sidebar link is clicked.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'syllabusCollapsed';

  /* ── persistence ──────────────────────────────────────────────────────── */

  function getCollapsed() {
    try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')); }
    catch (e) { return new Set(); }
  }

  function persistCollapsed(set) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  }

  /* ── animation helpers ────────────────────────────────────────────────── */

  function collapseSection(section, btn, bodyEl, collapsed) {
    // Snapshot current height so the transition has a start value.
    bodyEl.style.height = bodyEl.scrollHeight + 'px';
    // Two rAFs: first lets the browser register the explicit height,
    // second kicks off the transition to 0.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        bodyEl.style.height = '0';
      });
    });
    section.classList.add('section--collapsed');
    btn.setAttribute('aria-expanded', 'false');
    collapsed.add(section.id);
    persistCollapsed(collapsed);
  }

  function expandSection(section, btn, bodyEl, collapsed) {
    section.classList.remove('section--collapsed');
    btn.setAttribute('aria-expanded', 'true');
    const target = bodyEl.scrollHeight;
    bodyEl.style.height = target + 'px';
    // After the transition, clear the inline height so the body is "auto"
    // (important if content inside later changes size).
    bodyEl.addEventListener('transitionend', function onEnd() {
      bodyEl.removeEventListener('transitionend', onEnd);
      if (!section.classList.contains('section--collapsed')) {
        bodyEl.style.height = '';
      }
    });
    collapsed.delete(section.id);
    persistCollapsed(collapsed);
  }

  /* ── main init ────────────────────────────────────────────────────────── */

  function init() {
    const collapsed = getCollapsed();

    document.querySelectorAll('.form-section').forEach(section => {
      const id      = section.id;
      const heading = section.querySelector('.section-heading');
      if (!heading) return;

      /* 1 ── wrap body content */
      const bodyEl  = document.createElement('div');
      bodyEl.className = 'section-body';
      bodyEl.id        = id + '-body';
      Array.from(section.children).forEach(child => {
        if (child !== heading) bodyEl.appendChild(child);
      });
      section.appendChild(bodyEl);

      /* 2 ── build the toggle button that replaces heading content */
      const btn = document.createElement('button');
      btn.type      = 'button';
      btn.className = 'section-collapse-btn';
      btn.setAttribute('aria-controls', bodyEl.id);

      // Move every existing child node of the heading into the button
      while (heading.firstChild) btn.appendChild(heading.firstChild);

      // Chevron icon (appended last so it sits on the right via CSS)
      const ns      = 'http://www.w3.org/2000/svg';
      const svg     = document.createElementNS(ns, 'svg');
      svg.setAttribute('class',       'section-chevron');
      svg.setAttribute('viewBox',     '0 0 20 20');
      svg.setAttribute('fill',        'none');
      svg.setAttribute('aria-hidden', 'true');
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d',                'M5 8l5 5 5-5');
      path.setAttribute('stroke',           'currentColor');
      path.setAttribute('stroke-width',     '2');
      path.setAttribute('stroke-linecap',   'round');
      path.setAttribute('stroke-linejoin',  'round');
      svg.appendChild(path);
      btn.appendChild(svg);
      heading.appendChild(btn);

      /* 3 ── set initial state (no animation) */
      if (collapsed.has(id)) {
        section.classList.add('section--collapsed');
        btn.setAttribute('aria-expanded', 'false');
        bodyEl.style.height = '0';
      } else {
        btn.setAttribute('aria-expanded', 'true');
      }

      /* 4 ── enable CSS transitions only after the initial paint */
      requestAnimationFrame(() => bodyEl.classList.add('section-body--ready'));

      /* 5 ── click handler */
      btn.addEventListener('click', () => {
        if (section.classList.contains('section--collapsed')) {
          expandSection(section, btn, bodyEl, collapsed);
        } else {
          collapseSection(section, btn, bodyEl, collapsed);
        }
      });
    });

    /* 6 ── sidebar nav: auto-expand when a collapsed section is targeted */
    document.querySelectorAll('.sidebar__link').forEach(link => {
      link.addEventListener('click', () => {
        const targetId = (link.getAttribute('href') || '').slice(1);
        const section  = targetId ? document.getElementById(targetId) : null;
        if (!section || !section.classList.contains('section--collapsed')) return;
        const btn    = section.querySelector('.section-collapse-btn');
        const bodyEl = document.getElementById(targetId + '-body');
        if (btn && bodyEl) expandSection(section, btn, bodyEl, collapsed);
      });
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
