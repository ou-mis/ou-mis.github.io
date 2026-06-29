/**
 * export.js — Word (.docx) and PDF export.
 * Uses docx.js v7 (loaded as window.docx from CDN UMD build).
 */
const Export = (() => {

  function init() {
    document.getElementById('btn-export-docx').addEventListener('click', exportDocx);
    document.getElementById('btn-export-pdf').addEventListener('click', exportPDF);

    // Enable export buttons once there is a course number.
    // Also fire immediately so a restored form isn't left with disabled buttons.
    function _updateButtons(s) {
      const canExport = !!(s.courseNumber && s.courseTitle);
      document.getElementById('btn-export-docx').disabled = !canExport;
      document.getElementById('btn-export-pdf').disabled  = !canExport;
    }
    State.subscribe(_updateButtons);
    _updateButtons(State.get());   // run once with current state on init
  }

  /* ── PDF Export via pdfmake — direct .pdf download, no print dialog ── */
  function exportPDF() {
    if (typeof pdfMake === 'undefined') {
      Utils.toast('PDF library not loaded — please refresh the page.', 'error');
      return;
    }

    const s   = State.get();
    const sem = s.semester ? Config.getSemesterByCode(s.semester) : null;
    const filename = Utils.slugify(
      `${s.courseNumber || 'syllabus'}-${s.sectionNumber || ''}-${sem ? sem.label : 'semester'}`
    ) + '.pdf';

    const btn = document.getElementById('btn-export-pdf');
    btn.disabled = true;
    btn.textContent = '⏳ Generating…';

    const _resetBtn = () => {
      btn.disabled = false;
      btn.textContent = '⬇ PDF';
    };

    // Safety: always restore button after 30 s regardless of callback
    const _safetyTimer = setTimeout(_resetBtn, 30000);

    try {
      const content = _buildPdfContent(s, sem);
      const docDef  = _buildDocDef(s, content);
      pdfMake.createPdf(docDef).download(filename, () => {
        clearTimeout(_safetyTimer);
        _resetBtn();
        Utils.toast('PDF downloaded successfully.', 'success');
      });
    } catch (err) {
      clearTimeout(_safetyTimer);
      console.error('PDF export error:', err);
      Utils.toast(`PDF generation failed: ${err.message}`, 'error', 8000);
      _resetBtn();
    }
  }

  /* ── Shared colours (read from active CSS theme) ── */
  function _themeColor() {
    const c = getComputedStyle(document.body)
      .getPropertyValue('--color-primary').trim();
    return c || '#841617';
  }
  function _themeDark() {
    const c = getComputedStyle(document.body)
      .getPropertyValue('--color-primary-dark').trim();
    return c || '#681112';
  }

  /**
   * Wrap a collected array of pdfmake content items in a shaded block with a
   * left accent border — mirrors the live-preview .policy-block-preview style.
   */
  function _pdfPolicyBlock(stack) {
    if (!stack || !stack.length) return null;
    const primary = _themeColor();
    return {
      table: { widths: ['*'], body: [[{ stack }]] },
      layout: {
        hLineWidth:    () => 0,
        vLineWidth:    i  => (i === 0 ? 3 : 0),
        vLineColor:    () => primary,
        fillColor:     () => '#FAF6F6',
        paddingLeft:   () => 10,
        paddingRight:  () => 6,
        paddingTop:    () => 5,
        paddingBottom: () => 5,
      },
      marginBottom: 8,
    };
  }

  /**
   * Wrap an array of docx Paragraph objects in a single-cell table that has a
   * left accent border and a light background — mirrors _pdfPolicyBlock.
   */
  function _docxPolicyBlock(paragraphs, docxLib) {
    if (!paragraphs || !paragraphs.length) return null;
    const { Table, TableRow, TableCell, WidthType } = docxLib;
    const primaryHex = _themeColor().replace('#', '');
    const none = { style: 'none', size: 0, color: 'auto' };
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: { top: none, bottom: none, left: none, right: none, insideH: none, insideV: none },
      rows: [new TableRow({
        children: [new TableCell({
          children: paragraphs,
          shading: { fill: 'FAF6F6', type: 'solid', color: 'auto' },
          borders: {
            top:    none,
            bottom: none,
            left:   { style: 'single', size: 18, color: primaryHex },
            right:  none,
          },
          margins: { top: 70, bottom: 70, left: 130, right: 70 },
        })],
      })],
    });
  }

  /* ── pdfmake document definition ── */
  function _buildDocDef(s, content) {
    const primary = _themeColor();
    const dark    = _themeDark();
    return {
      pageSize:    'LETTER',
      pageMargins: [72, 72, 72, 72],  // 1-inch margins (points)
      content,
      defaultStyle: { font: 'Roboto', fontSize: 10.5, lineHeight: 1.45 },
      styles: {
        h1:       { fontSize: 17, bold: true, color: dark,    marginBottom: 4 },
        h1Rule:   { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 468, y2: 0, lineWidth: 1.5, lineColor: primary }], marginBottom: 10 },
        h2:       { fontSize: 13, bold: true, color: primary, marginTop: 14, marginBottom: 3 },
        h3:       { fontSize: 11, bold: true, color: '#333',  marginTop: 10, marginBottom: 2 },
        meta:     { fontSize: 9.5, color: '#555', italics: true, marginBottom: 12 },
        label:    { bold: true },
        calHeader:{ bold: true, fontSize: 9.5, fillColor: primary, color: '#ffffff' },
        calHoliday:{ italics: true, color: '#555' },
        calFinal: { bold: true },
        small:    { fontSize: 9, color: '#444', italics: true },
      },
    };
  }

  /* ── Build content array from state ── */
  function _buildPdfContent(s, sem) {
    const content = [];
    const push = (...items) => items.forEach(i => content.push(i));
    const primary = _themeColor();

    /* ── Title ── */
    push(
      { text: `${s.courseNumber || ''} — ${s.courseTitle || ''}`, style: 'h1' },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 468, y2: 0, lineWidth: 1.5, lineColor: primary }], marginBottom: 4 }
    );
    const metaParts = [
      s.sectionNumber ? `Section ${s.sectionNumber}` : '',
      sem ? sem.label : '',
    ].filter(Boolean);
    if (metaParts.length) push({ text: metaParts.join('   |   '), style: 'meta' });

    /* ── Course Information ── */
    const logRows = [];
    if (s.instructorName) logRows.push(['Instructor', s.instructorName]);
    if (s.officeLocation) logRows.push(['Office', s.officeLocation]);
    if (s.officeHours && s.officeHours.length) {
      const oh = s.officeHours.map(o => [o.day, o.startTime && o.endTime
        ? `${Utils.formatTime(o.startTime)}–${Utils.formatTime(o.endTime)}` : '', o.notes]
        .filter(Boolean).join(' ')).join('; ');
      if (oh) logRows.push(['Office Hours', oh]);
    }
    if (s.courseEmail) logRows.push(['Email',
      s.emailSubject ? `${s.courseEmail}  (include "${s.emailSubject}" in subject line)` : s.courseEmail]);
    if (s.classRoom)    logRows.push(['Location', s.classRoom]);
    if (s.meetingDays && s.meetingDays.length) {
      logRows.push(['Meeting Times',
        `${s.meetingDays.join('/')} ${Utils.formatTime(s.meetingStart)}–${Utils.formatTime(s.meetingEnd)}`]);
    }
    if (s.lmsUrl) logRows.push(['Course Site', s.lmsUrl]);
    if (s.finalExamDate) {
      let fe = Utils.formatDate(Utils.parseISODate(s.finalExamDate));
      if (s.finalExamStart && s.finalExamEnd)
        fe += `, ${Utils.formatTime(s.finalExamStart)}–${Utils.formatTime(s.finalExamEnd)}`;
      if (s.finalExamRoom) fe += `, ${s.finalExamRoom}`;
      logRows.push(['Final Exam', fe]);
    }
    if (logRows.length) {
      push({ text: 'Course Information', style: 'h2' });
      logRows.forEach(([lbl, val]) => push({
        columns: [
          { text: lbl + ':', style: 'label', width: 130 },
          { text: String(val), width: '*' },
        ],
        columnGap: 6, marginBottom: 2,
      }));
    }

    /* ── Prerequisites ── */
    if (s.prereqs && s.prereqs.some(p => p.courseNum || p.courseName)) {
      push({ text: 'Prerequisites', style: 'h2' });
      s.prereqs.forEach(p => {
        if (!p.courseNum && !p.courseName) return;
        push({ text: `${p.courseNum || ''} — ${p.courseName || ''}`, bold: true, marginLeft: 10, marginBottom: 1 });
        if (p.reason) push({ text: p.reason, italics: true, fontSize: 9.5, marginLeft: 20, marginBottom: 4 });
      });
    }

    /* ── Textbooks & Software ── */
    if (s.materials && s.materials.some(m => m.title)) {
      push({ text: 'Textbooks & Software', style: 'h2' });
      s.materials.forEach(m => {
        if (!m.title) return;
        push({ text: [
          { text: `[${m.required}] `, bold: true },
          { text: `${m.type}: `, italics: true },
          m.title,
          m.obtain ? `  —  ${m.obtain}` : '',
        ], marginLeft: 10, marginBottom: 2 });
      });
    }

    /* ── Course Description ── */
    if (s.courseDescription || s.coursePhilosophy) {
      push({ text: 'Course Description', style: 'h2' });
      if (s.courseDescription) push({ text: s.courseDescription, marginBottom: 6 });
      if (s.coursePhilosophy) {
        push({ text: 'Course Design', style: 'h3' });
        push({ text: s.coursePhilosophy, marginBottom: 6 });
      }
    }

    /* ── Modules ── */
    if (s.modules && s.modules.some(m => m.title)) {
      push({ text: 'Course Modules', style: 'h2' });
      s.modules.forEach(m => {
        if (!m.title) return;
        push({ text: [
          { text: `Module ${m.number}: `, bold: true },
          m.title,
          m.description ? { text: `  —  ${m.description}`, italics: true } : '',
        ], marginLeft: 10, marginBottom: 2 });
      });
    }

    /* ── CLOs ── */
    if (s.clos && s.clos.some(c => c.text)) {
      push({ text: 'Course Level Outcomes (CLOs)', style: 'h2' });
      s.clos.forEach((c, i) => {
        if (!c.text) return;
        const asgn = c.assignments && c.assignments.length
          ? [{ text: `  [Assessed by: ${c.assignments.join(', ')}]`, italics: true, color: '#555' }]
          : [];
        push({ text: [
          { text: `CLO-${c.number || i + 1}: `, bold: true },
          c.text,
          ...asgn,
        ], marginLeft: 10, marginBottom: 3 });
      });
    }

    /* ── Grading ── */
    if (s.assessments && s.assessments.some(a => a.name)) {
      const isPoints = s.gradingType === 'points';
      push({ text: 'Grading & Assessments', style: 'h2' });
      push({ text: 'Assessment Breakdown', style: 'h3' });
      s.assessments.forEach(a => {
        if (!a.name) return;
        const val = isPoints ? `${a.weight} pts` : `${a.weight}%`;
        const name = a.optional ? `${a.name} (optional)` : a.name;
        push({ text: [
          { text: name, bold: true },
          ` — ${val}`,
          a.notes ? `  (${a.notes})` : '',
        ], marginLeft: 10, marginBottom: 2 });
      });
      s.assessments.forEach(a => {
        if (!a.name || !a.information) return;
        push({ text: a.name, bold: true, marginTop: 6, marginBottom: 2 });
        _mdToPdf(content, a.information);
      });
      push({ text: 'Grading Scale', style: 'h3' });
      s.gradeScale.forEach(g => {
        const range = isPoints ? `${g.min} – ${g.max} pts` : `${g.min}–${g.max}%`;
        push({ text: [{ text: `${g.grade}: `, bold: true }, range], marginLeft: 10, marginBottom: 1 });
      });
    }

    /* ── Course Policies ── */
    const divPols    = _getIncludedDivisionPolicies(s);
    const customPols = Array.isArray(s.customPolicies)
      ? s.customPolicies.filter(p => p.title || p.content)
      : [];
    if (divPols.length || customPols.length) {
      push({ text: 'Course Policies', style: 'h2' });
      divPols.forEach(p => {
        const stack = [];
        _mdToPdf(stack, p.text);
        const block = _pdfPolicyBlock(stack);
        if (block) push(block);
      });
      customPols.forEach(p => {
        const stack = [];
        if (p.title)   stack.push({ text: p.title, style: 'h3', marginTop: 0 });
        if (p.content) _mdToPdf(stack, p.content);
        const block = _pdfPolicyBlock(stack);
        if (block) push(block);
      });
    }

    /* ── University Policies ── */
    const uniPolicies = Config.getPoliciesByCategory('university').filter(policy => {
      const saved = (s.universityPolicies || {})[policy.id];
      return policy.status === 'required' ? true : (saved ? saved.included : true);
    });
    if (uniPolicies.length) {
      push({ text: 'University Policies', style: 'h2' });
      uniPolicies.forEach(p => {
        const stack = [];
        _mdToPdf(stack, p.content);
        const block = _pdfPolicyBlock(stack);
        if (block) push(block);
      });
    }

    /* ── Gen AI ── */
    if (s.genAiText) {
      push({ text: 'Generative AI Policy', style: 'h2' });
      const stack = [];
      _mdToPdf(stack, s.genAiText);
      const block = _pdfPolicyBlock(stack);
      if (block) push(block);
    }

    /* ── Calendar ── */
    if (s.calendarRows && s.calendarRows.length) {
      push({ text: 'Course Calendar', style: 'h2' });
      push({
        text: 'The schedule below is tentative; adjustments may be made. Announcements in class, via email, or on Canvas supersede this outline.',
        style: 'small', marginBottom: 6,
      });
      if (s.calendarView === 'grid') {
        _buildPdfCalendarGrid(s, content, primary);
      } else {
        _buildPdfCalendarList(s, content, primary);
      }
    }

    return content;
  }

  /* ── PDF calendar: flat list ── */
  function _buildPdfCalendarList(s, content, primary) {
    const hdr = ['Date','Day','Topic','Readings / Materials','Due This Day'].map(t => ({
      text: t, bold: true, fontSize: 9.5, fillColor: primary, color: '#ffffff',
    }));
    const bodyRows = s.calendarRows.map(r => {
      const d = Utils.formatDate(Utils.parseISODate(r.date));
      if (r.type === 'holiday' || r.type === 'no-class') {
        return [{ text: d, italics: true, color: '#555' }, { text: r.day, italics: true, color: '#555' },
                { text: `${r.name} — No Class`, italics: true, color: '#555', colSpan: 3 }, {}, {}];
      }
      if (r.type === 'final-exam') {
        const label = `FINAL EXAM${r.topic ? ` — ${r.topic}` : ''}`;
        return [{ text: d, bold: true }, { text: r.day, bold: true },
                { text: label, bold: true }, { text: '' }, { text: r.due || '', bold: true }];
      }
      return [d, r.day, r.topic || '', r.readings || '', r.due || ''];
    });
    content.push({
      table: { headerRows: 1, widths: [52, 28, '*', '*', 72], body: [hdr, ...bodyRows] },
      layout: {
        hLineWidth: () => 0.5, vLineWidth: () => 0.5,
        hLineColor: () => '#cccccc', vLineColor: () => '#cccccc',
        paddingLeft: () => 4, paddingRight: () => 4,
        paddingTop: () => 3, paddingBottom: () => 3,
      },
      fontSize: 9,
    });
  }

  /* ── PDF calendar: visual weekly grid ── */
  function _buildPdfCalendarGrid(s, content, primary) {
    const { sortedDays, weeks, finalRow } = Utils.groupCalendarByWeek(s);
    if (!weeks.length) return;

    const colWidth = Math.floor(420 / sortedDays.length); // pts, letter - margins - week col

    // Header row
    const hdr = [
      { text: 'Wk', bold: true, fillColor: primary, color: '#fff', alignment: 'center' },
      ...sortedDays.map(d => ({ text: d, bold: true, fillColor: primary, color: '#fff', alignment: 'center' })),
    ];

    const bodyRows = weeks.map(({ weekNum, cells }, idx) => {
      const rowBg = idx % 2 === 0 ? '#ffffff' : '#f9f9f9';
      const cells_ = sortedDays.map(day => {
        const r = cells[day];
        if (!r) return { text: '', fillColor: '#f5f5f5' };
        const d = Utils.formatDate(Utils.parseISODate(r.date));
        if (r.type === 'holiday' || r.type === 'no-class') {
          return { stack: [
            { text: d, fontSize: 7, color: '#777', decoration: 'underline' },
            { text: r.name, bold: true, color: primary, fontSize: 8.5 },
            { text: 'No Class', italics: true, color: '#888', fontSize: 7.5 },
          ], fillColor: '#eeeeee', alignment: 'center' };
        }
        const isExam = /exam/i.test(r.topic || '');
        const cellBg = isExam ? '#fff8e1' : rowBg;
        const stack  = [{ text: d, fontSize: 7, color: '#777', decoration: 'underline' }];
        if (r.topic)    stack.push({ text: r.topic,    bold: true,    fontSize: 8.5, color: isExam ? '#e65100' : '#111' });
        if (r.readings) stack.push({ text: r.readings, italics: true, fontSize: 7.5, color: '#555' });
        if (r.due)      stack.push({ text: r.due,      fontSize: 7,   color: '#c0392b', marginTop: 2 });
        return { stack, fillColor: cellBg };
      });

      return [
        { text: String(weekNum), alignment: 'center', bold: true, fontSize: 8, color: primary, fillColor: '#f0e8e8' },
        ...cells_,
      ];
    });

    // Final exam footer
    if (finalRow) {
      const fd   = Utils.formatDate(Utils.parseISODate(finalRow.date));
      const meta = [fd, finalRow.due, finalRow.topic].filter(Boolean).join('  ·  ');
      const opt  = '';
      const empties = Array(sortedDays.length - 1).fill({});
      bodyRows.push([
        { text: 'Final', alignment: 'center', bold: true, fontSize: 8, color: '#fff', fillColor: primary },
        { stack: [
          { text: `FINAL EXAM${opt}`, bold: true, fontSize: 10, color: '#fff' },
          { text: meta, fontSize: 8, color: 'rgba(255,255,255,0.85)' },
        ], fillColor: primary, colSpan: sortedDays.length, alignment: 'center' },
        ...empties,
      ]);
    }

    const widths = [24, ...sortedDays.map(() => colWidth)];
    content.push({
      table: { headerRows: 1, widths, body: [hdr, ...bodyRows] },
      layout: {
        hLineWidth: () => 0.5, vLineWidth: () => 0.5,
        hLineColor: () => '#cccccc', vLineColor: () => '#cccccc',
        paddingLeft: () => 3, paddingRight: () => 3,
        paddingTop: () => 3, paddingBottom: () => 3,
      },
      fontSize: 8.5,
    });
  }

  /* ── Markdown → pdfmake content ── */
  function _mdToPdf(content, md) {
    if (!md) return;
    const lines = md.split('\n').map(l => l.replace(/\r$/, ''));
    let i = 0;
    let prevWasHeading = false;   // suppress blank lines immediately after headings

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trimStart();

      // ── Markdown table: detect header row followed by separator ──────────
      if (trimmed.startsWith('|')) {
        const tableLines = [];
        while (i < lines.length && lines[i].trimStart().startsWith('|')) {
          tableLines.push(lines[i]);
          i++;
        }
        if (tableLines.length >= 2) {
          const parseRow = row =>
            row.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
          const headers = parseRow(tableLines[0]);
          const dataRows = tableLines.slice(2).map(parseRow);
          const primary  = _themeColor();
          content.push({
            table: {
              headerRows: 1,
              widths: Array(headers.length).fill('*'),
              body: [
                headers.map(h => ({ text: h, bold: true, color: '#fff', fillColor: primary })),
                ...dataRows.map(row => row.map(c => ({ text: c || '' }))),
              ],
            },
            layout: {
              hLineWidth: () => 0.5, vLineWidth: () => 0.5,
              hLineColor: () => '#cccccc', vLineColor: () => '#cccccc',
              paddingLeft: () => 4, paddingRight: () => 4,
              paddingTop: () => 3, paddingBottom: () => 3,
            },
            fontSize: 9,
            marginTop: 4,
            marginBottom: 6,
          });
        }
        prevWasHeading = false;
        continue;
      }

      // ── Unordered list block ────────────────────────────────────────────
      if (/^[-*]\s+/.test(trimmed)) {
        const items = [];
        while (i < lines.length && /^[-*]\s+/.test(lines[i].trimStart())) {
          items.push(_runsToPdfItem(_parseInlinePdf(lines[i].trimStart().replace(/^[-*]\s+/, ''))));
          i++;
        }
        content.push({ ul: items, marginBottom: 4 });
        prevWasHeading = false;
        continue;
      }

      // ── Ordered list block ────────────────────────────────────────────────
      if (/^\d+\.\s/.test(trimmed)) {
        const items = [];
        while (i < lines.length && /^\d+\.\s/.test(lines[i].trimStart())) {
          items.push(_runsToPdfItem(_parseInlinePdf(lines[i].trimStart().replace(/^\d+\.\s+/, ''))));
          i++;
        }
        content.push({ ol: items, marginBottom: 4 });
        prevWasHeading = false;
        continue;
      }

      // ── Headings ──────────────────────────────────────────────────────────
      if (trimmed.startsWith('### ')) {
        content.push({ text: trimmed.slice(4), style: 'h3' });
        prevWasHeading = true;
      } else if (trimmed.startsWith('## ')) {
        content.push({ text: trimmed.slice(3), style: 'h3' });
        prevWasHeading = true;
      } else if (trimmed.startsWith('# ')) {
        content.push({ text: trimmed.slice(2), bold: true, marginTop: 8, marginBottom: 2 });
        prevWasHeading = true;

      // ── Blank line / horizontal rule ──────────────────────────────────────
      } else if (trimmed === '' || trimmed.startsWith('---')) {
        if (!prevWasHeading) {
          content.push({ text: '', marginBottom: 3 });
        }
        prevWasHeading = false;

      // ── Normal paragraph line ─────────────────────────────────────────────
      } else {
        content.push({ text: _parseInlinePdf(line), marginBottom: 2 });
        prevWasHeading = false;
      }

      i++;
    }
  }

  /** Convert inline runs to a pdfmake ul/ol item (string or rich-text object). */
  function _runsToPdfItem(runs) {
    if (!runs || !runs.length) return '';
    if (runs.length === 1 && !runs[0].bold && !runs[0].italics) {
      return runs[0].text;
    }
    return { text: runs };
  }

  function _parseInlinePdf(text) {
    const runs = [];
    const regex = /\*\*(.+?)\*\*|\*(.+?)\*/g;
    let last = 0, m;
    while ((m = regex.exec(text)) !== null) {
      if (m.index > last) runs.push({ text: text.slice(last, m.index) });
      if (m[1]) runs.push({ text: m[1], bold: true });
      else if (m[2]) runs.push({ text: m[2], italics: true });
      last = regex.lastIndex;
    }
    if (last < text.length) runs.push({ text: text.slice(last) });
    return runs.length ? runs : [{ text }];
  }

  /* ── Word (.docx) Export ── */
  async function exportDocx() {
    if (typeof docx === 'undefined') {
      Utils.toast('Word export library failed to load. Check your internet connection and refresh.', 'error', 6000);
      return;
    }

    try {
      const s = State.get();
      const sem = s.semester ? Config.getSemesterByCode(s.semester) : null;

      const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow,
              TableCell, WidthType, AlignmentType } = docx;

      const children = [];

      /* ── Course title block ── */
      children.push(new Paragraph({
        text: `${s.courseNumber || ''} — ${s.courseTitle || ''}`,
        heading: HeadingLevel.HEADING_1,
        spacing: { after: 80 },
      }));
      const subParts = [
        s.sectionNumber ? `Section ${s.sectionNumber}` : '',
        sem ? sem.label : '',
      ].filter(Boolean);
      if (subParts.length) {
        children.push(new Paragraph({
          children: [new TextRun({ text: subParts.join('  |  '), italics: true, size: 20 })],
          spacing: { after: 240 },
        }));
      }

      /* ── Logistics ── */
      children.push(_heading2('Course Information', children));
      const logRows = [];
      if (s.instructorName) logRows.push(['Instructor', s.instructorName]);
      if (s.officeLocation) logRows.push(['Office', s.officeLocation]);
      if (s.officeHours && s.officeHours.length) {
        const ohStr = s.officeHours
          .map(oh => [oh.day, oh.startTime && oh.endTime ? `${Utils.formatTime(oh.startTime)}–${Utils.formatTime(oh.endTime)}` : '', oh.notes].filter(Boolean).join(' '))
          .join('; ');
        if (ohStr) logRows.push(['Office Hours', ohStr]);
      }
      if (s.courseEmail) logRows.push(['Email',
        s.emailSubject ? `${s.courseEmail}  (include "${s.emailSubject}" in subject line)` : s.courseEmail]);
      if (s.classRoom)     logRows.push(['Location', s.classRoom]);
      if (s.meetingDays && s.meetingDays.length) {
        logRows.push(['Meeting Times', `${s.meetingDays.join('/')} ${Utils.formatTime(s.meetingStart)}–${Utils.formatTime(s.meetingEnd)}`]);
      }
      if (s.lmsUrl) logRows.push(['Course Site', s.lmsUrl]);
      if (s.finalExamDate) {
        let fe = Utils.formatDate(Utils.parseISODate(s.finalExamDate));
        if (s.finalExamStart && s.finalExamEnd) fe += `, ${Utils.formatTime(s.finalExamStart)}–${Utils.formatTime(s.finalExamEnd)}`;
        if (s.finalExamRoom) fe += `, ${s.finalExamRoom}`;
        logRows.push(['Final Exam', fe]);
      }
      logRows.forEach(([label, value]) => {
        children.push(new Paragraph({
          children: [new TextRun({ text: `${label}: `, bold: true }), new TextRun(String(value))],
          spacing: { after: 40 },
        }));
      });

      /* ── Prerequisites ── */
      if (s.prereqs && s.prereqs.length) {
        children.push(_heading2('Prerequisites'));
        s.prereqs.forEach(p => {
          if (!p.courseNum && !p.courseName) return;
          children.push(new Paragraph({
            children: [new TextRun({ text: `${p.courseNum} — ${p.courseName}`, bold: true })],
            bullet: { level: 0 },
            spacing: { after: 40 },
          }));
          if (p.reason) {
            children.push(new Paragraph({
              children: [new TextRun({ text: p.reason, italics: true, size: 20 })],
              indent: { left: 360 },
              spacing: { after: 60 },
            }));
          }
        });
      }

      /* ── Textbooks & Software ── */
      if (s.materials && s.materials.length) {
        children.push(_heading2('Textbooks & Software'));
        s.materials.forEach(m => {
          if (!m.title) return;
          children.push(new Paragraph({
            children: [
              new TextRun({ text: `[${m.required}] `, bold: true }),
              new TextRun({ text: `${m.type}: `, italics: true }),
              new TextRun(m.title),
              m.obtain ? new TextRun({ text: `  —  ${m.obtain}` }) : new TextRun(''),
            ],
            bullet: { level: 0 },
            spacing: { after: 60 },
          }));
        });
      }

      /* ── Course Description ── */
      if (s.courseDescription) {
        children.push(_heading2('Course Description'));
        s.courseDescription.split('\n').forEach(line => {
          children.push(new Paragraph({ text: line || ' ', spacing: { after: 60 } }));
        });
      }
      if (s.coursePhilosophy) {
        children.push(_heading3('Course Design'));
        s.coursePhilosophy.split('\n').forEach(line => {
          children.push(new Paragraph({ text: line || ' ', spacing: { after: 60 } }));
        });
      }

      /* ── Modules ── */
      if (s.modules && s.modules.length) {
        children.push(_heading2('Course Modules'));
        s.modules.forEach(m => {
          children.push(new Paragraph({
            children: [
              new TextRun({ text: `Module ${m.number}: `, bold: true }),
              new TextRun(m.title || ''),
              m.description ? new TextRun({ text: `  —  ${m.description}`, italics: true }) : new TextRun(''),
            ],
            bullet: { level: 0 },
            spacing: { after: 60 },
          }));
        });
      }

      /* ── CLOs ── */
      if (s.clos && s.clos.length) {
        children.push(_heading2('Course Level Outcomes (CLOs)'));
        s.clos.forEach((c, i) => {
          if (!c.text) return;
          const assignStr = c.assignments && c.assignments.length ? `  [Assessed by: ${c.assignments.join(', ')}]` : '';
          children.push(new Paragraph({
            children: [
              new TextRun({ text: `CLO-${c.number || i + 1}: `, bold: true }),
              new TextRun(c.text),
              assignStr ? new TextRun({ text: assignStr, italics: true, color: '555555' }) : new TextRun(''),
            ],
            bullet: { level: 0 },
            spacing: { after: 60 },
          }));
        });
      }

      /* ── Grading ── */
      if (s.assessments && s.assessments.length) {
        const isPoints = s.gradingType === 'points';
        children.push(_heading2('Grading & Assessments'));
        children.push(_heading3('Assessment Breakdown'));
        s.assessments.forEach(a => {
          if (!a.name) return;
          const val  = isPoints ? `${a.weight} pts` : `${a.weight}%`;
          const name = a.optional ? `${a.name} (optional)` : a.name;
          const line = [name, val, a.notes].filter(Boolean).join(' — ');
          children.push(new Paragraph({ children: [new TextRun(line)], bullet: { level: 0 }, spacing: { after: 40 } }));
        });
        s.assessments.forEach(a => {
          if (!a.name || !a.information) return;
          children.push(new Paragraph({
            children: [new TextRun({ text: a.name, bold: true })],
            spacing: { before: 120, after: 40 },
          }));
          const detailParas = [];
          _appendMarkdownToDocx(detailParas, a.information, docx);
          detailParas.forEach(p => children.push(p));
        });
        children.push(_heading3('Grading Scale'));
        s.gradeScale.forEach(g => {
          const range = isPoints ? `${g.min} – ${g.max} pts` : `${g.min}–${g.max}%`;
          children.push(new Paragraph({
            children: [new TextRun({ text: `${g.grade}: `, bold: true }), new TextRun(range)],
            bullet: { level: 0 }, spacing: { after: 40 },
          }));
        });
      }

      /* ── Course Policies ── */
      const divPols    = _getIncludedDivisionPolicies(s);
      const customPols = Array.isArray(s.customPolicies)
        ? s.customPolicies.filter(p => p.title || p.content)
        : [];
      if (divPols.length || customPols.length) {
        children.push(_heading2('Course Policies'));
        divPols.forEach(p => {
          const paras = [];
          _appendMarkdownToDocx(paras, p.text, docx);
          const block = _docxPolicyBlock(paras, docx);
          if (block) children.push(block);
        });
        customPols.forEach(p => {
          const paras = [];
          if (p.title) {
            const { Paragraph, HeadingLevel } = docx;
            paras.push(new Paragraph({ text: p.title, heading: HeadingLevel.HEADING_3, spacing: { before: 0, after: 60 } }));
          }
          if (p.content) _appendMarkdownToDocx(paras, p.content, docx);
          const block = _docxPolicyBlock(paras, docx);
          if (block) children.push(block);
        });
      }

      /* ── University Policies ── */
      const uniPolicies = Config.getPoliciesByCategory('university').filter(policy => {
        const saved = (s.universityPolicies || {})[policy.id];
        return policy.status === 'required' ? true : (saved ? saved.included : true);
      });
      if (uniPolicies.length) {
        children.push(_heading2('University Policies'));
        uniPolicies.forEach(policy => {
          const paras = [];
          _appendMarkdownToDocx(paras, policy.content, docx);
          const block = _docxPolicyBlock(paras, docx);
          if (block) children.push(block);
        });
      }

      /* ── Gen AI Policy ── */
      if (s.genAiText) {
        children.push(_heading2('Generative AI Policy'));
        const paras = [];
        _appendMarkdownToDocx(paras, s.genAiText, docx);
        const block = _docxPolicyBlock(paras, docx);
        if (block) children.push(block);
      }

      /* ── Calendar ── */
      if (s.calendarRows && s.calendarRows.length) {
        children.push(_heading2('Course Calendar'));
        children.push(new Paragraph({
          children: [new TextRun({ text: 'The schedule below is tentative; adjustments may be made. Announcements made in class, via email, or on Canvas supersede this outline.', italics: true, size: 18 })],
          spacing: { after: 120 },
        }));

        if (s.calendarView === 'grid') {
          _buildDocxCalendarGrid(s, children, docx);
        } else {
          _buildDocxCalendarList(s, children, docx);
        }
      }

      /* ── Build & Download ── */
      const doc = new Document({ sections: [{ children }] });
      const blob = await Packer.toBlob(doc);
      const filename = Utils.slugify(`${s.courseNumber || 'syllabus'}-${s.sectionNumber || ''}-${sem ? sem.label : 'semester'}`) + '.docx';
      saveAs(blob, filename);
      Utils.toast('Word document downloaded successfully.', 'success');

    } catch (err) {
      console.error('DOCX export error:', err);
      Utils.toast(`Export failed: ${err.message}`, 'error', 8000);
    }
  }

  /* ── Docx calendar: flat list ── */
  function _buildDocxCalendarList(s, children, docxLib) {
    const { Paragraph, TextRun, Table, TableRow, TableCell, WidthType } = docxLib;
    const rows = [
      new TableRow({
        tableHeader: true,
        children: ['Date','Day','Topic','Readings / Materials','Due This Day'].map(h =>
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })] })
        ),
      }),
      ...s.calendarRows.map(r => {
        const d = Utils.formatDate(Utils.parseISODate(r.date));
        if (r.type === 'holiday' || r.type === 'no-class') {
          return new TableRow({ children: [
            new TableCell({ children: [new Paragraph({ text: d })] }),
            new TableCell({ children: [new Paragraph({ text: r.day || '' })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `${r.name} — No Class`, italics: true })] })], columnSpan: 3 }),
          ]});
        }
        if (r.type === 'final-exam') {
          const label = `FINAL EXAM${r.topic ? ` — ${r.topic}` : ''}`;
          return new TableRow({ children: [
            new TableCell({ children: [new Paragraph({ text: d })] }),
            new TableCell({ children: [new Paragraph({ text: r.day || '' })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: label, bold: true })] })] }),
            new TableCell({ children: [new Paragraph({ text: '' })] }),
            new TableCell({ children: [new Paragraph({ text: r.due || '' })] }),
          ]});
        }
        return new TableRow({ children: [
          new TableCell({ children: [new Paragraph({ text: d })] }),
          new TableCell({ children: [new Paragraph({ text: r.day || '' })] }),
          new TableCell({ children: [new Paragraph({ text: r.topic || '' })] }),
          new TableCell({ children: [new Paragraph({ text: r.readings || '' })] }),
          new TableCell({ children: [new Paragraph({ text: r.due || '' })] }),
        ]});
      }),
    ];
    children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }));
  }

  /* ── Docx calendar: visual weekly grid ── */
  function _buildDocxCalendarGrid(s, children, docxLib) {
    const { Paragraph, TextRun, Table, TableRow, TableCell, WidthType } = docxLib;
    const { sortedDays, weeks, finalRow } = Utils.groupCalendarByWeek(s);
    if (!weeks.length) return;

    const hdrRow = new TableRow({
      tableHeader: true,
      children: [
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Wk', bold: true })] })] }),
        ...sortedDays.map(d =>
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: d, bold: true })] })] })
        ),
      ],
    });

    const dataRows = weeks.map(({ weekNum, cells }) =>
      new TableRow({ children: [
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(weekNum), bold: true })] })] }),
        ...sortedDays.map(day => {
          const r = cells[day];
          if (!r) return new TableCell({ children: [new Paragraph({ text: '' })] });
          const d = Utils.formatDate(Utils.parseISODate(r.date));
          if (r.type === 'holiday' || r.type === 'no-class') {
            return new TableCell({ children: [
              new Paragraph({ children: [new TextRun({ text: d, size: 16, color: '777777' })] }),
              new Paragraph({ children: [new TextRun({ text: r.name, bold: true })] }),
              new Paragraph({ children: [new TextRun({ text: 'No Class', italics: true, color: '888888' })] }),
            ]});
          }
          const parts = [new Paragraph({ children: [new TextRun({ text: d, size: 16, color: '777777' })] })];
          if (r.topic)    parts.push(new Paragraph({ children: [new TextRun({ text: r.topic, bold: true })] }));
          if (r.readings) parts.push(new Paragraph({ children: [new TextRun({ text: r.readings, italics: true, size: 16 })] }));
          if (r.due)      parts.push(new Paragraph({ children: [new TextRun({ text: r.due, color: 'C0392B', size: 16 })] }));
          return new TableCell({ children: parts });
        }),
      ]})
    );

    const tableRows = [hdrRow, ...dataRows];

    if (finalRow) {
      const fd  = Utils.formatDate(Utils.parseISODate(finalRow.date));
      const opt = '';
      const meta = [fd, finalRow.due, finalRow.topic].filter(Boolean).join('  ·  ');
      tableRows.push(new TableRow({ children: [
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Final', bold: true })] })] }),
        new TableCell({
          columnSpan: sortedDays.length,
          children: [
            new Paragraph({ children: [new TextRun({ text: `FINAL EXAM${opt}`, bold: true })] }),
            new Paragraph({ children: [new TextRun({ text: meta, size: 18 })] }),
          ],
        }),
      ]}));
    }

    children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: tableRows }));
  }

  /* ── Helpers ── */
  function _heading2(text) {
    return new docx.Paragraph({ text, heading: docx.HeadingLevel.HEADING_2, spacing: { before: 240, after: 80 } });
  }

  function _heading3(text) {
    return new docx.Paragraph({ text, heading: docx.HeadingLevel.HEADING_3, spacing: { before: 160, after: 60 } });
  }

  function _getIncludedDivisionPolicies(s) {
    const result = [];
    ['division', 'college'].forEach(cat => {
      Config.getPoliciesByCategory(cat).forEach(policy => {
        const saved = (s.divisionPolicies || {})[policy.id];
        const included = policy.status === 'required' ? true : (saved ? saved.included : false);
        if (included) {
          const text = saved && saved.customText !== undefined ? saved.customText : policy.content;
          result.push({ id: policy.id, text });
        }
      });
    });
    return result;
  }

  /**
   * Simple markdown → docx paragraphs converter.
   * Handles: # ## ### headings, **bold**, *italic*, - bullet lists, blank lines, ---
   */
  function _appendMarkdownToDocx(children, md, docxLib) {
    if (!md) return;
    const { Paragraph, TextRun, HeadingLevel } = docxLib;
    const lines = md.split('\n').map(l => l.replace(/\r$/, ''));
    lines.forEach(line => {
      const trimmed = line.trimStart();
      if (trimmed.startsWith('### ')) {
        children.push(new Paragraph({ text: trimmed.slice(4), heading: HeadingLevel.HEADING_3, spacing: { before: 120, after: 40 } }));
      } else if (trimmed.startsWith('## ')) {
        children.push(new Paragraph({ text: trimmed.slice(3), heading: HeadingLevel.HEADING_3, spacing: { before: 160, after: 60 } }));
      } else if (trimmed.startsWith('# ')) {
        children.push(new Paragraph({ text: trimmed.slice(2), heading: HeadingLevel.HEADING_2, spacing: { before: 160, after: 60 } }));
      } else if (/^[-*]\s+/.test(trimmed)) {
        children.push(new Paragraph({ children: _parseInline(trimmed.replace(/^[-*]\s+/, ''), TextRun), bullet: { level: 0 }, spacing: { after: 40 } }));
      } else if (/^\d+\.\s/.test(trimmed)) {
        children.push(new Paragraph({ children: _parseInline(trimmed.replace(/^\d+\.\s+/, ''), TextRun), bullet: { level: 0 }, spacing: { after: 40 } }));
      } else if (trimmed.startsWith('---') || trimmed.startsWith('***')) {
        children.push(new Paragraph({ text: '', spacing: { after: 40 } }));
      } else if (trimmed === '') {
        children.push(new Paragraph({ text: '', spacing: { after: 40 } }));
      } else {
        children.push(new Paragraph({ children: _parseInline(line, TextRun), spacing: { after: 60 } }));
      }
    });
  }

  function _parseInline(text, TextRun) {
    const runs = [];
    const regex = /\*\*(.+?)\*\*|\*(.+?)\*/g;
    let lastIdx = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIdx) runs.push(new TextRun(text.slice(lastIdx, match.index)));
      if (match[1]) runs.push(new TextRun({ text: match[1], bold: true }));
      else if (match[2]) runs.push(new TextRun({ text: match[2], italics: true }));
      lastIdx = regex.lastIndex;
    }
    if (lastIdx < text.length) runs.push(new TextRun(text.slice(lastIdx)));
    return runs.length ? runs : [new TextRun(text)];
  }

  return { init };
})();
