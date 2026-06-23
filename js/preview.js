/**
 * preview.js — Live preview pane.
 * Subscribes to State and re-renders the syllabus preview on every change.
 */
const Preview = (() => {

  function init() {
    State.subscribe(Utils.debounce(_render, 300));
    _render(State.get());

    // Toggle preview panel
    document.getElementById('btn-toggle-preview').addEventListener('click', () => {
      const content = document.getElementById('preview-content');
      const btn = document.getElementById('btn-toggle-preview');
      const isHidden = content.hidden;
      content.hidden = !isHidden;
      btn.textContent = isHidden ? 'Hide' : 'Show';
      btn.setAttribute('aria-expanded', String(isHidden));
    });
  }

  function _render(s) {
    const container = document.getElementById('syllabus-preview');
    if (!container) return;
    const html = _buildHTML(s);
    container.innerHTML = html;
  }

  function _buildHTML(s) {
    if (!s.courseNumber && !s.courseTitle) {
      return '<p class="preview-empty">Fill out the form to see your syllabus preview here.</p>';
    }

    const parts = [];

    /* ── Header ── */
    const sem = s.semester ? Config.getSemesterByCode(s.semester) : null;
    parts.push(`<h1>${Utils.escapeHtml(s.courseNumber || '')} — ${Utils.escapeHtml(s.courseTitle || '')}</h1>`);
    if (s.sectionNumber || sem) {
      parts.push(`<p style="margin-bottom:0.5rem; color:var(--color-gray-600); font-size:0.8rem">
        ${s.sectionNumber ? `Section ${Utils.escapeHtml(s.sectionNumber)}` : ''}
        ${s.sectionNumber && sem ? ' &bull; ' : ''}
        ${sem ? Utils.escapeHtml(sem.label) : ''}
      </p>`);
    }

    /* ── Logistics ── */
    if (s.instructorName || s.classRoom) {
      parts.push('<h2>Course Information</h2>');
      parts.push('<div class="logistics-block">');
      const rows = [];
      if (s.instructorName) rows.push(`<strong>Instructor:</strong> ${Utils.escapeHtml(s.instructorName)}`);
      if (s.officeLocation)  rows.push(`<strong>Office:</strong> ${Utils.escapeHtml(s.officeLocation)}`);
      if (s.officeHours && s.officeHours.length) {
        const ohStr = s.officeHours.map(oh => {
          let str = oh.day || '';
          if (oh.startTime && oh.endTime) str += ` ${Utils.formatTime(oh.startTime)}–${Utils.formatTime(oh.endTime)}`;
          if (oh.notes) str += ` (${oh.notes})`;
          return str;
        }).filter(Boolean).join('; ');
        if (ohStr) rows.push(`<strong>Office Hours:</strong> ${Utils.escapeHtml(ohStr)}`);
      }
      if (s.courseEmail) {
        const subj = s.emailSubject ? ` <span style="color:var(--color-gray-600);font-size:0.85em">(include <em>${Utils.escapeHtml(s.emailSubject)}</em> in subject line)</span>` : '';
        rows.push(`<strong>Email:</strong> ${Utils.escapeHtml(s.courseEmail)}${subj}`);
      }
      if (s.classRoom)      rows.push(`<strong>Location:</strong> ${Utils.escapeHtml(s.classRoom)}`);
      if (s.meetingDays && s.meetingDays.length && s.meetingStart && s.meetingEnd) {
        rows.push(`<strong>Meeting Times:</strong> ${s.meetingDays.join('/')} ${Utils.formatTime(s.meetingStart)}–${Utils.formatTime(s.meetingEnd)}`);
      }
      if (s.lmsUrl) rows.push(`<strong>Course Site:</strong> <a href="${Utils.escapeHtml(s.lmsUrl)}">${Utils.escapeHtml(s.lmsUrl)}</a>`);
      if (s.finalExamDate) {
        let fe = Utils.formatDate(Utils.parseISODate(s.finalExamDate));
        if (s.finalExamStart && s.finalExamEnd) fe += `, ${Utils.formatTime(s.finalExamStart)}–${Utils.formatTime(s.finalExamEnd)}`;
        if (s.finalExamRoom) fe += `, ${s.finalExamRoom}`;
        rows.push(`<strong>Final Exam:</strong> ${Utils.escapeHtml(fe)}`);
      }
      parts.push(rows.join('<br />'));
      parts.push('</div>');
    }

    /* ── Prerequisites ── */
    if (s.prereqs && s.prereqs.length) {
      parts.push('<h2>Prerequisites</h2>');
      parts.push('<ul>');
      s.prereqs.forEach(p => {
        if (!p.courseNum && !p.courseName) return;
        let str = `<strong>${Utils.escapeHtml(p.courseNum || '')}</strong> — ${Utils.escapeHtml(p.courseName || '')}`;
        if (p.reason) str += `<br /><em style="font-size:0.8em">${Utils.escapeHtml(p.reason)}</em>`;
        parts.push(`<li>${str}</li>`);
      });
      parts.push('</ul>');
    }

    /* ── Texts & Software ── */
    if (s.materials && s.materials.length) {
      parts.push('<h2>Required Texts &amp; Software</h2>');
      parts.push('<table><thead><tr><th>Type</th><th>Title / Name</th><th>Where to Obtain</th><th>Status</th></tr></thead><tbody>');
      s.materials.forEach(m => {
        if (!m.title) return;
        parts.push(`<tr>
          <td>${Utils.escapeHtml(m.type||'')}</td>
          <td>${Utils.escapeHtml(m.title)}</td>
          <td>${m.obtain ? `<a href="${Utils.escapeHtml(m.obtain)}" target="_blank">${Utils.escapeHtml(m.obtain)}</a>` : ''}</td>
          <td>${Utils.escapeHtml(m.required||'Required')}</td>
        </tr>`);
      });
      parts.push('</tbody></table>');
    }

    /* ── Course Overview ── */
    if (s.courseDescription) {
      parts.push('<h2>Course Description</h2>');
      parts.push(`<p>${Utils.escapeHtml(s.courseDescription).replace(/\n/g,'<br/>')}</p>`);
    }
    if (s.coursePhilosophy) {
      parts.push('<h3>Course Design</h3>');
      parts.push(`<p>${Utils.escapeHtml(s.coursePhilosophy).replace(/\n/g,'<br/>')}</p>`);
    }

    /* ── Modules ── */
    if (s.modules && s.modules.length) {
      parts.push('<h2>Course Modules</h2>');
      parts.push('<table><thead><tr><th>#</th><th>Module</th><th>Description</th></tr></thead><tbody>');
      s.modules.forEach(m => {
        parts.push(`<tr>
          <td>${Utils.escapeHtml(String(m.number||''))}</td>
          <td><strong>${Utils.escapeHtml(m.title||'')}</strong></td>
          <td>${Utils.escapeHtml(m.description||'')}</td>
        </tr>`);
      });
      parts.push('</tbody></table>');
    }

    /* ── CLOs ── */
    if (s.clos && s.clos.length) {
      parts.push('<h2>Course Level Outcomes (CLOs)</h2>');
      parts.push('<ol class="clo-list">');
      s.clos.forEach(c => {
        if (!c.text) return;
        let item = Utils.escapeHtml(c.text);
        if (c.assignments && c.assignments.length) {
          item += ` <em style="color:var(--color-gray-600);font-size:0.9em">[Assessed by: ${Utils.escapeHtml(c.assignments.join(', '))}]</em>`;
        }
        parts.push(`<li>${item}</li>`);
      });
      parts.push('</ol>');
    }

    /* ── Grading ── */
    if (s.assessments && s.assessments.length) {
      const isPoints = s.gradingType === 'points';
      parts.push('<h2>Grading &amp; Assessments</h2>');
      parts.push('<h3>Grading Scale</h3>');
      const scaleHdr = isPoints ? '<th>Grade</th><th>Points Required</th>' : '<th>Grade</th><th>Range</th>';
      parts.push(`<table><thead><tr>${scaleHdr}</tr></thead><tbody>`);
      s.gradeScale.forEach(g => {
        const range = isPoints ? `${g.min} – ${g.max} pts` : `${g.min}–${g.max}%`;
        parts.push(`<tr><td><strong>${Utils.escapeHtml(g.grade)}</strong></td><td>${range}</td></tr>`);
      });
      parts.push('</tbody></table>');
      parts.push('<h3>Assessment Breakdown</h3>');
      const asmntHdr = isPoints ? '<th>Component</th><th>Points</th><th>Notes</th>' : '<th>Component</th><th>Weight</th><th>Notes</th>';
      parts.push(`<table><thead><tr>${asmntHdr}</tr></thead><tbody>`);
      s.assessments.forEach(a => {
        if (!a.name) return;
        const val = isPoints ? `${a.weight} pts` : `${a.weight}%`;
        parts.push(`<tr>
          <td>${Utils.escapeHtml(a.name)}</td>
          <td>${val}</td>
          <td>${Utils.escapeHtml(a.notes||'')}</td>
        </tr>`);
      });
      parts.push('</tbody></table>');
    }

    /* ── Course Policies (division + custom) ── */
    const divPols    = _getIncludedDivisionPolicies(s);
    const customPols = Array.isArray(s.customPolicies)
      ? s.customPolicies.filter(p => p.title || p.content)
      : [];
    if (divPols.length || customPols.length) {
      parts.push('<h2>Course Policies</h2>');
      divPols.forEach(p => {
        parts.push(`<div class="policy-block-preview">${Utils.mdToHtml(p.text)}</div>`);
      });
      customPols.forEach(p => {
        parts.push('<div class="policy-block-preview">');
        if (p.title)   parts.push(`<h3 class="preview-policy-title">${Utils.escapeHtml(p.title)}</h3>`);
        if (p.content) parts.push(Utils.mdToHtml(p.content));
        parts.push('</div>');
      });
    }

    /* ── University Policies ── */
    const uniPols = _getIncludedUniversityPolicies(s);
    if (uniPols.length) {
      parts.push('<h2>University Policies</h2>');
      uniPols.forEach(p => {
        parts.push(`<div class="policy-block-preview">${Utils.mdToHtml(p.content)}</div>`);
      });
    }

    /* ── Gen AI Policy ── */
    if (s.genAiText) {
      parts.push('<h2>Generative AI Policy</h2>');
      parts.push(`<div class="policy-block-preview">${Utils.mdToHtml(s.genAiText)}</div>`);
    }

    /* ── Calendar ── */
    if (s.calendarRows && s.calendarRows.length) {
      parts.push('<h2>Course Calendar</h2>');
      parts.push('<p style="font-size:0.75rem;font-style:italic;margin-bottom:0.5rem">The schedule below is tentative; adjustments may be made. Announcements in class, via email, or on Canvas supersede this outline.</p>');
      if (s.calendarView === 'grid') {
        parts.push(_buildCalendarGridHTML(s));
      } else {
        parts.push(_buildCalendarListHTML(s));
      }
    }

    return parts.join('\n');
  }

  /* ── Calendar: flat list ── */
  function _buildCalendarListHTML(s) {
    const rows = [];
    rows.push('<table><thead><tr><th>Date</th><th>Day</th><th>Topic</th><th>Readings</th><th>Due</th></tr></thead><tbody>');
    s.calendarRows.forEach(r => {
      const d = Utils.formatDate(Utils.parseISODate(r.date));
      if (r.type === 'holiday' || r.type === 'no-class') {
        rows.push(`<tr style="font-style:italic;background:#fef9e7"><td>${d}</td><td>${Utils.escapeHtml(r.day)}</td><td colspan="3"><em>${Utils.escapeHtml(r.name)} — No Class</em></td></tr>`);
      } else if (r.type === 'final-exam') {
        rows.push(`<tr style="font-weight:bold;background:var(--color-primary-light)"><td>${d}</td><td>${Utils.escapeHtml(r.day)}</td><td>FINAL EXAM${r.topic ? ` — ${Utils.escapeHtml(r.topic)}` : ''}</td><td></td><td>${Utils.escapeHtml(r.due||'')}</td></tr>`);
      } else {
        rows.push(`<tr><td>${d}</td><td>${Utils.escapeHtml(r.day)}</td><td>${Utils.escapeHtml(r.topic||'')}</td><td>${Utils.escapeHtml(r.readings||'')}</td><td>${Utils.escapeHtml(r.due||'')}</td></tr>`);
      }
    });
    rows.push('</tbody></table>');
    return rows.join('\n');
  }

  /* ── Calendar: visual weekly grid ── */
  function _buildCalendarGridHTML(s) {
    const { sortedDays, weeks, finalRow } = Utils.groupCalendarByWeek(s);
    if (!weeks.length) return '';

    const colWidth = Math.floor(88 / sortedDays.length);
    const parts = [];

    parts.push(`<table style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:0.75rem">`);

    // Header
    parts.push('<thead><tr>');
    parts.push(`<th style="width:36px;background:var(--color-primary);color:#fff;padding:4px 3px;text-align:center;border:1px solid var(--color-primary-dark)">Wk</th>`);
    sortedDays.forEach(d => {
      parts.push(`<th style="width:${colWidth}%;background:var(--color-primary);color:#fff;padding:4px 6px;text-align:center;border:1px solid var(--color-primary-dark)">${d}</th>`);
    });
    parts.push('</tr></thead><tbody>');

    // Week rows
    weeks.forEach(({ weekNum, cells }, idx) => {
      const bg = idx % 2 === 0 ? '#fff' : '#fafafa';
      parts.push(`<tr style="background:${bg}">`);
      parts.push(`<td style="text-align:center;font-weight:700;font-size:0.7rem;color:var(--color-primary-dark);background:var(--color-primary-light);border:1px solid var(--color-gray-200);padding:3px 2px;vertical-align:middle">${weekNum}</td>`);
      sortedDays.forEach(day => {
        const r = cells[day];
        if (!r) {
          parts.push(`<td style="background:var(--color-gray-50);border:1px solid var(--color-gray-200)"></td>`);
          return;
        }
        const d = Utils.formatDate(Utils.parseISODate(r.date));
        if (r.type === 'holiday' || r.type === 'no-class') {
          parts.push(`<td style="background:var(--color-gray-100);border:1px solid var(--color-gray-200);padding:4px 5px;text-align:center;vertical-align:top">`);
          parts.push(`<div style="font-size:0.65rem;text-decoration:underline;color:var(--color-gray-600);margin-bottom:2px">${d}</div>`);
          parts.push(`<div style="font-weight:700;color:var(--color-primary)">${Utils.escapeHtml(r.name)}</div>`);
          parts.push(`<div style="font-style:italic;color:var(--color-gray-500);font-size:0.7rem">No Class</div>`);
          parts.push('</td>');
        } else {
          const isExam = /exam/i.test(r.topic || '');
          const cellBg = isExam ? '#fff8e1' : bg;
          const cellBorder = isExam ? '1px solid #f9a825' : '1px solid var(--color-gray-200)';
          parts.push(`<td style="background:${cellBg};border:${cellBorder};padding:4px 5px;vertical-align:top">`);
          parts.push(`<div style="font-size:0.65rem;text-decoration:underline;color:var(--color-gray-600);margin-bottom:2px">${d}</div>`);
          if (r.topic) parts.push(`<div style="font-weight:600;font-size:0.75rem${isExam ? ';color:#e65100' : ''}">${Utils.escapeHtml(r.topic)}</div>`);
          if (r.readings) parts.push(`<div style="font-style:italic;color:var(--color-gray-600);font-size:0.7rem">${Utils.escapeHtml(r.readings)}</div>`);
          if (r.due) parts.push(`<div style="color:var(--color-danger);font-size:0.68rem;margin-top:2px">${Utils.escapeHtml(r.due)}</div>`);
          parts.push('</td>');
        }
      });
      parts.push('</tr>');
    });

    // Final exam row
    if (finalRow) {
      const fd = Utils.formatDate(Utils.parseISODate(finalRow.date));
      const meta = [fd, finalRow.due, finalRow.topic].filter(Boolean).join(' · ');
      const optTag = '';
      parts.push('<tr>');
      parts.push(`<td style="text-align:center;font-weight:700;font-size:0.7rem;color:var(--color-primary-dark);background:var(--color-primary-light);border:2px solid var(--color-primary);border-top:2px solid var(--color-primary);padding:3px 2px;vertical-align:middle">Final</td>`);
      parts.push(`<td colspan="${sortedDays.length}" style="background:var(--color-primary);border:2px solid var(--color-primary);padding:8px 12px;text-align:center">`);
      parts.push(`<div style="font-weight:700;font-size:0.9rem;color:#fff">FINAL EXAM${optTag}</div>`);
      parts.push(`<div style="font-size:0.75rem;color:rgba(255,255,255,.85);margin-top:2px">${Utils.escapeHtml(meta)}</div>`);
      parts.push('</td></tr>');
    }

    parts.push('</tbody></table>');
    return parts.join('');
  }

  function _getIncludedDivisionPolicies(s) {
    const result = [];
    const categories = ['division','college'];
    categories.forEach(cat => {
      Config.getPoliciesByCategory(cat).forEach(policy => {
        const saved = s.divisionPolicies[policy.id];
        const included = policy.status === 'required'
          ? true
          : (saved ? saved.included : false);
        if (included) {
          const text = saved && saved.customText !== undefined ? saved.customText : policy.content;
          result.push({ id: policy.id, text });
        }
      });
    });
    return result;
  }

  function _getIncludedUniversityPolicies(s) {
    return Config.getPoliciesByCategory('university').filter(policy => {
      const saved = s.universityPolicies[policy.id];
      if (policy.status === 'required') return true;
      return saved ? saved.included : true; // default on
    });
  }

  return { init };
})();
