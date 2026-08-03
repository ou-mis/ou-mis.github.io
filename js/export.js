/**
 * export.js — Word (.docx) and PDF export.
 * Uses docx (UMD) and pdfmake with a shared professional layout system.
 */
const Export = (() => {

  /* ── Design tokens ── */
  const LETTERHEAD   = 'MIS · Price College of Business · University of Oklahoma';
  const CONTENT_WIDTH = 504;   // letter 612 − 2×54 (0.75″ side margins), points
  const PANEL_FILL   = '#F7F4F4';
  const PANEL_BORDER = '#DDD5D5';
  const ZEBRA_FILL  = '#F9F9F9';
  const EXAM_FILL   = '#FFF8E1';
  const MUTED       = '#555555';

  /* ═══════════════════════════════════════════════════════════════════════
   * WORD_EXPORT_GATE (BEGIN)
   * Hides the Word download button until unlocked with a secret.
   *
   * Unlock options:
   *   1. Type the SECRET phrase while focus is not in an input/textarea
   *   2. Open the app with ?word=1 in the URL
   *   3. In the browser console: Export.unlockWord()
   *
   * TO REMOVE LATER (pick one):
   *   A. Set ENABLED to false below, OR
   *   B. Delete this entire BEGIN…END block and the _initWordExportGate()
   *      call inside init() (search for WORD_EXPORT_GATE).
   * ═══════════════════════════════════════════════════════════════════════ */
  const WORD_EXPORT_GATE = {
    ENABLED: true,
    SECRET: 'misdocx',
    STORAGE_KEY: 'syllabusGenerator_wordUnlocked',
  };

  function _isWordUnlocked() {
    if (!WORD_EXPORT_GATE.ENABLED) return true;
    try {
      return sessionStorage.getItem(WORD_EXPORT_GATE.STORAGE_KEY) === '1';
    } catch (_) {
      return false;
    }
  }

  function _setWordButtonVisible(visible) {
    const btn = document.getElementById('btn-export-docx');
    if (!btn) return;
    btn.hidden = !visible;
    btn.setAttribute('aria-hidden', visible ? 'false' : 'true');
  }

  function unlockWord() {
    if (!WORD_EXPORT_GATE.ENABLED) return;
    try { sessionStorage.setItem(WORD_EXPORT_GATE.STORAGE_KEY, '1'); } catch (_) { /* ignore */ }
    _setWordButtonVisible(true);
    const s = State.get();
    document.getElementById('btn-export-docx').disabled =
      !(s.courseNumber && s.courseTitle);
    Utils.toast('Word export unlocked.', 'success');
  }

  function _initWordExportGate() {
    if (!WORD_EXPORT_GATE.ENABLED) {
      _setWordButtonVisible(true);
      return;
    }

    // Already unlocked this session, or ?word=1 / #word in the URL
    const params = new URLSearchParams(location.search);
    const urlUnlock = params.get('word') === '1' || location.hash === '#word';
    if (_isWordUnlocked() || urlUnlock) {
      if (urlUnlock) {
        try { sessionStorage.setItem(WORD_EXPORT_GATE.STORAGE_KEY, '1'); } catch (_) { /* ignore */ }
      }
      _setWordButtonVisible(true);
      return;
    }

    _setWordButtonVisible(false);

    // Type-to-unlock: accumulate keystrokes outside form fields
    let buffer = '';
    const secret = WORD_EXPORT_GATE.SECRET.toLowerCase();
    document.addEventListener('keydown', (e) => {
      if (_isWordUnlocked()) return;
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) {
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.length !== 1) return;
      buffer = (buffer + e.key.toLowerCase()).slice(-secret.length);
      if (buffer === secret) {
        buffer = '';
        unlockWord();
      }
    });
  }
  /* ═══ WORD_EXPORT_GATE (END) ═══ */

  function init() {
    document.getElementById('btn-export-docx').addEventListener('click', exportDocx);
    document.getElementById('btn-export-pdf').addEventListener('click', exportPDF);

    _initWordExportGate(); // WORD_EXPORT_GATE — remove this line if deleting the gate block

    function _updateButtons(s) {
      const canExport = !!(s.courseNumber && s.courseTitle);
      const docxBtn = document.getElementById('btn-export-docx');
      // Keep Word disabled while gated+locked; otherwise normal canExport rules
      if (WORD_EXPORT_GATE.ENABLED && !_isWordUnlocked()) {
        docxBtn.disabled = true;
      } else {
        docxBtn.disabled = !canExport;
      }
      // Don't fight the in-progress PDF export UI
      if (!_pdfBusy) {
        document.getElementById('btn-export-pdf').disabled = !canExport;
      }
    }
    State.subscribe(_updateButtons);
    _updateButtons(State.get());
  }

  let _pdfBusy = false;

  /* ── Shared theme colours (from active CSS theme) ── */
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
  function _themeHex() {
    return _themeColor().replace('#', '').toUpperCase();
  }
  function _themeDarkHex() {
    return _themeDark().replace('#', '').toUpperCase();
  }
  function _footerLeft(s, sem) {
    return [s.courseNumber, sem ? sem.label : ''].filter(Boolean).join(' · ');
  }

  /* ── Collect logistics rows from state ── */
  function _logisticsRows(s) {
    const rows = [];
    if (s.instructorName) rows.push(['Instructor', s.instructorName]);
    if (s.officeLocation) rows.push(['Office', s.officeLocation]);
    if (s.officeHours && s.officeHours.length) {
      const oh = Utils.formatOfficeHours(s.officeHours);
      if (oh) rows.push(['Office Hours', oh]);
    }
    if (s.courseEmail) {
      rows.push(['Email',
        s.emailSubject
          ? `${s.courseEmail}  (include "${s.emailSubject}" in subject line)`
          : s.courseEmail]);
    }
    if (s.classRoom) rows.push(['Location', s.classRoom]);
    if (s.meetingDays && s.meetingDays.length) {
      rows.push(['Meeting Times',
        `${s.meetingDays.join('/')} ${Utils.formatTime(s.meetingStart)}–${Utils.formatTime(s.meetingEnd)}`]);
    }
    if (s.lmsUrl) rows.push(['Course Site', s.lmsUrl]);
    if (s.finalExamDate) {
      let fe = Utils.formatDate(Utils.parseISODate(s.finalExamDate));
      if (s.finalExamStart && s.finalExamEnd)
        fe += `, ${Utils.formatTime(s.finalExamStart)}–${Utils.formatTime(s.finalExamEnd)}`;
      if (s.finalExamRoom) fe += `, ${s.finalExamRoom}`;
      rows.push(['Final Exam', fe]);
    }
    return rows;
  }

  /* ══════════════════════════════════════════════════════════════════════
     PDF helpers
     ══════════════════════════════════════════════════════════════════════ */

  function _pdfTableLayout() {
    return {
      hLineWidth: () => 0.5, vLineWidth: () => 0.5,
      hLineColor: () => '#CCCCCC', vLineColor: () => '#CCCCCC',
      paddingLeft: () => 5, paddingRight: () => 5,
      paddingTop: () => 4, paddingBottom: () => 4,
    };
  }

  function _pdfH2(text) {
    const primary = _themeColor();
    return [
      { text, style: 'h2', marginBottom: 2 },
      {
        canvas: [{ type: 'line', x1: 0, y1: 0, x2: CONTENT_WIDTH, y2: 0,
                   lineWidth: 0.75, lineColor: primary }],
        marginBottom: 8,
      },
    ];
  }

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

  /** Bordered label/value logistics panel. */
  function _pdfLogisticsPanel(rows) {
    return {
      table: {
        widths: [115, '*'],
        body: rows.map(([lbl, val]) => [
          { text: lbl, bold: true, color: '#444', fontSize: 10 },
          { text: String(val), fontSize: 10 },
        ]),
      },
      layout: {
        hLineWidth: () => 0.5, vLineWidth: () => 0.5,
        hLineColor: () => PANEL_BORDER, vLineColor: () => PANEL_BORDER,
        fillColor:  () => PANEL_FILL,
        paddingLeft: () => 8, paddingRight: () => 8,
        paddingTop: () => 5, paddingBottom: () => 5,
      },
      marginBottom: 10,
    };
  }

  /** Themed data table with header fill + zebra rows. */
  function _pdfDataTable(headers, rows, widths) {
    const primary = _themeColor();
    const body = [
      headers.map(h => ({
        text: h, bold: true, color: '#ffffff', fillColor: primary, fontSize: 9.5,
      })),
      ...rows.map((row, idx) => row.map(cell => {
        const cellDef = {
          text: cell == null ? '' : String(cell),
          fontSize: 9.5,
        };
        if (idx % 2 === 1) cellDef.fillColor = ZEBRA_FILL;
        return cellDef;
      })),
    ];
    return {
      table: {
        headerRows: 1,
        widths: widths || headers.map(() => '*'),
        body,
      },
      layout: _pdfTableLayout(),
      marginBottom: 10,
    };
  }

  /* ── PDF Export ── */
  async function exportPDF() {
    if (typeof pdfMake === 'undefined') {
      Utils.toast('PDF library not loaded — please refresh the page.', 'error');
      return;
    }
    if (_pdfBusy) return;

    const s   = State.get();
    const sem = s.semester ? Config.getSemesterByCode(s.semester) : null;
    const filename = Utils.slugify(
      `${s.courseNumber || 'syllabus'}-${s.sectionNumber || ''}-${sem ? sem.label : 'semester'}`
    ) + '.pdf';

    const btn = document.getElementById('btn-export-pdf');
    _pdfBusy = true;
    btn.disabled = true;
    btn.textContent = '⏳ Generating…';

    let settled = false;
    const _resetBtn = () => {
      if (settled) return;
      settled = true;
      _pdfBusy = false;
      clearTimeout(_safetyTimer);
      const canExport = !!(State.get().courseNumber && State.get().courseTitle);
      btn.disabled = !canExport;
      btn.textContent = '⬇ PDF';
    };

    const _safetyTimer = setTimeout(() => {
      console.warn('PDF export timed out — resetting button.');
      Utils.toast('PDF generation timed out. Please try again.', 'error', 6000);
      _resetBtn();
    }, 20000);

    try {
      const content = _buildPdfContent(s, sem);
      const docDef  = _buildDocDef(s, sem, content);
      // pdfmake 0.3+: download()/getBlob() return Promises (no callbacks).
      await pdfMake.createPdf(docDef).download(filename);
      Utils.toast('PDF downloaded successfully.', 'success');
    } catch (err) {
      console.error('PDF export error:', err);
      Utils.toast(`PDF generation failed: ${err.message}`, 'error', 8000);
    } finally {
      _resetBtn();
    }
  }

  function _buildDocDef(s, sem, content) {
    const primary = _themeColor();
    const dark    = _themeDark();
    const foot    = _footerLeft(s, sem);
    const slimHdr = [s.courseNumber, s.courseTitle].filter(Boolean).join(' — ');

    return {
      pageSize:    'LETTER',
      pageMargins: [54, 61, 54, 61],  // 0.75″ sides, 0.85″ top/bottom
      content,
      defaultStyle: { font: 'Roboto', fontSize: 10.5, lineHeight: 1.45 },
      styles: {
        letterhead: { fontSize: 8, bold: true, color: primary, characterSpacing: 0.8 },
        courseNum:  { fontSize: 11, bold: true, color: primary, marginBottom: 2 },
        h1:         { fontSize: 18, bold: true, color: dark,    marginBottom: 4 },
        h2:         { fontSize: 13, bold: true, color: primary, marginTop: 16, marginBottom: 0 },
        h3:         { fontSize: 11, bold: true, color: '#333',  marginTop: 10, marginBottom: 2 },
        meta:       { fontSize: 9.5, color: MUTED, italics: true, marginBottom: 14 },
        label:      { bold: true },
        calHeader:  { bold: true, fontSize: 9.5, fillColor: primary, color: '#ffffff' },
        calHoliday: { italics: true, color: MUTED },
        calFinal:   { bold: true },
        small:      { fontSize: 9, color: '#444', italics: true },
      },
      header(currentPage) {
        if (currentPage === 1) return { text: '' };
        return {
          margin: [54, 22, 54, 0],
          stack: [
            { text: slimHdr, fontSize: 8, color: MUTED },
            {
              canvas: [{ type: 'line', x1: 0, y1: 3, x2: CONTENT_WIDTH, y2: 3,
                         lineWidth: 0.5, lineColor: primary }],
            },
          ],
        };
      },
      footer(currentPage, pageCount) {
        return {
          margin: [54, 10, 54, 0],
          columns: [
            { text: foot, fontSize: 8, color: '#777777' },
            {
              text: `Page ${currentPage} of ${pageCount}`,
              alignment: 'right',
              fontSize: 8,
              color: '#777777',
            },
          ],
        };
      },
    };
  }

  function _buildPdfContent(s, sem) {
    const content = [];
    const push = (...items) => { items.forEach(i => content.push(i)); };
    const primary = _themeColor();

    /* ── Letterhead + title block ── */
    push(
      { text: LETTERHEAD.toUpperCase(), style: 'letterhead', marginBottom: 3 },
      {
        canvas: [{ type: 'line', x1: 0, y1: 0, x2: CONTENT_WIDTH, y2: 0,
                   lineWidth: 1.25, lineColor: primary }],
        marginBottom: 12,
      }
    );
    if (s.courseNumber) {
      push({ text: s.courseNumber, style: 'courseNum' });
    }
    push(
      { text: s.courseTitle || '', style: 'h1' },
      {
        canvas: [{ type: 'line', x1: 0, y1: 0, x2: CONTENT_WIDTH, y2: 0,
                   lineWidth: 1.5, lineColor: primary }],
        marginBottom: 4,
      }
    );
    const metaParts = [
      s.sectionNumber ? `Section ${s.sectionNumber}` : '',
      sem ? sem.label : '',
    ].filter(Boolean);
    if (metaParts.length) push({ text: metaParts.join('   |   '), style: 'meta' });

    /* ── Course Information ── */
    const logRows = _logisticsRows(s);
    if (logRows.length) {
      push(..._pdfH2('Course Information'));
      push(_pdfLogisticsPanel(logRows));
    }

    /* ── Prerequisites ── */
    if (s.prereqs && s.prereqs.some(p => p.courseNum || p.courseName)) {
      push(..._pdfH2('Prerequisites'));
      s.prereqs.forEach(p => {
        if (!p.courseNum && !p.courseName) return;
        push({ text: `${p.courseNum || ''} — ${p.courseName || ''}`, bold: true, marginLeft: 6, marginBottom: 1 });
        if (p.reason) push({ text: p.reason, italics: true, fontSize: 9.5, marginLeft: 16, marginBottom: 4 });
      });
    }

    /* ── Textbooks & Software ── */
    if (s.materials && s.materials.some(m => m.title)) {
      push(..._pdfH2('Textbooks & Software'));
      const matRows = s.materials.filter(m => m.title).map(m => [
        m.required || 'Required',
        m.type || '',
        m.title || '',
        m.obtain || '',
      ]);
      push(_pdfDataTable(
        ['Status', 'Type', 'Title / Name', 'Where to Obtain'],
        matRows,
        [60, 70, '*', '*']
      ));
    }

    /* ── Course Description ── */
    if (s.courseDescription || s.coursePhilosophy) {
      push(..._pdfH2('Course Description'));
      if (s.courseDescription) push({ text: s.courseDescription, marginBottom: 6 });
      if (s.coursePhilosophy) {
        push({ text: 'Course Design', style: 'h3' });
        push({ text: s.coursePhilosophy, marginBottom: 6 });
      }
    }

    /* ── Modules ── */
    if (s.modules && s.modules.some(m => m.title)) {
      push(..._pdfH2('Course Modules'));
      const modRows = s.modules.filter(m => m.title).map(m => [
        String(m.number || ''),
        m.title || '',
        m.description || '',
      ]);
      push(_pdfDataTable(['#', 'Module', 'Description'], modRows, [28, 150, '*']));
    }

    /* ── CLOs ── */
    if (s.clos && s.clos.some(c => c.text)) {
      push(..._pdfH2('Course Level Outcomes (CLOs)'));
      s.clos.forEach((c, i) => {
        if (!c.text) return;
        const asgn = c.assignments && c.assignments.length
          ? [{ text: `  [Assessed by: ${c.assignments.join(', ')}]`, italics: true, color: MUTED }]
          : [];
        push({ text: [
          { text: `CLO-${c.number || i + 1}: `, bold: true },
          c.text,
          ...asgn,
        ], marginLeft: 6, marginBottom: 3 });
      });
    }

    /* ── Grading ── */
    if (s.assessments && s.assessments.some(a => a.name)) {
      const isPoints = s.gradingType === 'points';
      push(..._pdfH2('Grading & Assessments'));
      push({ text: 'Assessment Breakdown', style: 'h3' });
      const assessRows = s.assessments.filter(a => a.name).map(a => [
        a.optional ? `${a.name} (optional)` : a.name,
        isPoints ? `${a.weight} pts` : `${a.weight}%`,
        a.notes || '',
      ]);
      push(_pdfDataTable(
        ['Assessment', 'Weight', 'Notes'],
        assessRows,
        ['*', 60, 140]
      ));
      s.assessments.forEach(a => {
        if (!a.name || !a.information) return;
        push({ text: a.name, bold: true, marginTop: 6, marginBottom: 2 });
        _mdToPdf(content, a.information);
      });
      push({ text: 'Grading Scale', style: 'h3' });
      const scaleRows = (s.gradeScale || []).map(g => [
        g.grade,
        isPoints ? `${g.min} – ${g.max} pts` : `${g.min}–${g.max}%`,
      ]);
      push(_pdfDataTable(['Grade', 'Range'], scaleRows, [60, '*']));
    }

    /* ── Course Policies ── */
    const divPols    = _getIncludedDivisionPolicies(s);
    const customPols = Array.isArray(s.customPolicies)
      ? s.customPolicies.filter(p => p.title || p.content)
      : [];
    if (divPols.length || customPols.length) {
      push(..._pdfH2('Course Policies'));
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
      push(..._pdfH2('University Policies'));
      uniPolicies.forEach(p => {
        const stack = [];
        _mdToPdf(stack, p.content);
        const block = _pdfPolicyBlock(stack);
        if (block) push(block);
      });
    }

    /* ── Gen AI ── */
    if (s.genAiText) {
      push(..._pdfH2('Generative AI Policy'));
      const stack = [];
      _mdToPdf(stack, s.genAiText);
      const block = _pdfPolicyBlock(stack);
      if (block) push(block);
    }

    /* ── Calendar (own page) ── */
    if (s.calendarRows && s.calendarRows.length) {
      const calHeading = _pdfH2('Course Calendar');
      calHeading[0] = Object.assign({}, calHeading[0], { pageBreak: 'before' });
      push(...calHeading);
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
    const bodyRows = s.calendarRows.map((r, idx) => {
      const d = Utils.formatDate(Utils.parseISODate(r.date));
      const zebra = idx % 2 === 1 ? ZEBRA_FILL : null;
      if (r.type === 'holiday' || r.type === 'no-class') {
        return [
          { text: d, italics: true, color: MUTED, fillColor: zebra },
          { text: r.day, italics: true, color: MUTED, fillColor: zebra },
          { text: `${r.name} — No Class`, italics: true, color: MUTED, colSpan: 3, fillColor: zebra },
          {}, {},
        ];
      }
      if (r.type === 'final-exam') {
        const label = `FINAL EXAM${r.topic ? ` — ${r.topic}` : ''}`;
        return [
          { text: d, bold: true, fillColor: EXAM_FILL },
          { text: r.day, bold: true, fillColor: EXAM_FILL },
          { text: label, bold: true, fillColor: EXAM_FILL },
          { text: '', fillColor: EXAM_FILL },
          { text: r.due || '', bold: true, fillColor: EXAM_FILL },
        ];
      }
      return [
        { text: d, fillColor: zebra },
        { text: r.day || '', fillColor: zebra },
        { text: r.topic || '', fillColor: zebra },
        { text: r.readings || '', fillColor: zebra },
        { text: r.due || '', fillColor: zebra },
      ];
    });
    content.push({
      table: { headerRows: 1, widths: [52, 28, '*', '*', 72], body: [hdr, ...bodyRows] },
      layout: _pdfTableLayout(),
      fontSize: 9,
    });
  }

  /* ── PDF calendar: visual weekly grid ── */
  function _buildPdfCalendarGrid(s, content, primary) {
    const { sortedDays, weeks, finalRow } = Utils.groupCalendarByWeek(s);
    if (!weeks.length) return;

    const colWidth = Math.floor((CONTENT_WIDTH - 24) / sortedDays.length);

    const hdr = [
      { text: 'Wk', bold: true, fillColor: primary, color: '#fff', alignment: 'center' },
      ...sortedDays.map(d => ({ text: d, bold: true, fillColor: primary, color: '#fff', alignment: 'center' })),
    ];

    const bodyRows = weeks.map(({ weekNum, cells }, idx) => {
      const rowBg = idx % 2 === 0 ? '#ffffff' : ZEBRA_FILL;
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
        const cellBg = isExam ? EXAM_FILL : rowBg;
        const stack  = [{ text: d, fontSize: 7, color: '#777', decoration: 'underline' }];
        if (r.topic)    stack.push({ text: r.topic,    bold: true,    fontSize: 8.5, color: isExam ? '#e65100' : '#111' });
        if (r.readings) stack.push({ text: r.readings, italics: true, fontSize: 7.5, color: MUTED });
        if (r.due)      stack.push({ text: r.due,      fontSize: 7,   color: '#c0392b', marginTop: 2 });
        return { stack, fillColor: cellBg };
      });

      return [
        { text: String(weekNum), alignment: 'center', bold: true, fontSize: 8, color: primary, fillColor: '#f0e8e8' },
        ...cells_,
      ];
    });

    if (finalRow) {
      const fd   = Utils.formatDate(Utils.parseISODate(finalRow.date));
      const meta = [fd, finalRow.due, finalRow.topic].filter(Boolean).join('  ·  ');
      const empties = Array(sortedDays.length - 1).fill({});
      bodyRows.push([
        { text: 'Final', alignment: 'center', bold: true, fontSize: 8, color: '#fff', fillColor: primary },
        { stack: [
          { text: 'FINAL EXAM', bold: true, fontSize: 10, color: '#fff' },
          { text: meta, fontSize: 8, color: '#ffffff' },
        ], fillColor: primary, colSpan: sortedDays.length, alignment: 'center' },
        ...empties,
      ]);
    }

    const widths = [24, ...sortedDays.map(() => colWidth)];
    content.push({
      table: { headerRows: 1, widths, body: [hdr, ...bodyRows] },
      layout: _pdfTableLayout(),
      fontSize: 8.5,
    });
  }

  /* ── Markdown → pdfmake content ── */
  function _mdToPdf(content, md) {
    if (!md) return;
    const lines = md.split('\n').map(l => l.replace(/\r$/, ''));
    let i = 0;
    let prevWasHeading = false;

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trimStart();

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
          content.push(_pdfDataTable(headers, dataRows));
        }
        prevWasHeading = false;
        continue;
      }

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

      if (trimmed.startsWith('### ')) {
        content.push({ text: trimmed.slice(4), style: 'h3' });
        prevWasHeading = true;
      } else if (trimmed.startsWith('## ')) {
        content.push({ text: trimmed.slice(3), style: 'h3' });
        prevWasHeading = true;
      } else if (trimmed.startsWith('# ')) {
        content.push({ text: trimmed.slice(2), bold: true, marginTop: 8, marginBottom: 2 });
        prevWasHeading = true;
      } else if (trimmed === '' || trimmed.startsWith('---')) {
        if (!prevWasHeading) content.push({ text: '', marginBottom: 3 });
        prevWasHeading = false;
      } else {
        content.push({ text: _parseInlinePdf(line), marginBottom: 2 });
        prevWasHeading = false;
      }

      i++;
    }
  }

  function _runsToPdfItem(runs) {
    if (!runs || !runs.length) return '';
    if (runs.length === 1 && !runs[0].bold && !runs[0].italics) return runs[0].text;
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

  /* ══════════════════════════════════════════════════════════════════════
     Word (.docx) helpers
     ══════════════════════════════════════════════════════════════════════ */

  function _docxNoneBorder() {
    return { style: 'none', size: 0, color: 'auto' };
  }

  function _docxThinBorder(color) {
    return { style: 'single', size: 4, color: color || 'CCCCCC' };
  }

  /**
   * Cell background fill. Use type "clear" (not "solid") — solid + color:auto
   * paints black in Word because OOXML treats color as the pattern ink.
   */
  function _docxShade(fillHex) {
    if (!fillHex) return undefined;
    return { type: 'clear', fill: String(fillHex).replace('#', '').toUpperCase() };
  }

  function _docxPolicyBlock(paragraphs, docxLib) {
    if (!paragraphs || !paragraphs.length) return null;
    const { Table, TableRow, TableCell, WidthType } = docxLib;
    const primaryHex = _themeHex();
    const none = _docxNoneBorder();
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: { top: none, bottom: none, left: none, right: none, insideH: none, insideV: none },
      rows: [new TableRow({
        children: [new TableCell({
          children: paragraphs,
          shading: _docxShade('FAF6F6'),
          borders: {
            top: none, bottom: none, right: none,
            left: { style: 'single', size: 18, color: primaryHex },
          },
          margins: { top: 70, bottom: 70, left: 130, right: 70 },
        })],
      })],
    });
  }

  function _docxLogisticsPanel(rows, docxLib) {
    const { Paragraph, TextRun, Table, TableRow, TableCell, WidthType } = docxLib;
    const border = _docxThinBorder('DDD5D5');
    const borders = { top: border, bottom: border, left: border, right: border };
    const panelShade = _docxShade('F7F4F4');
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      columnWidths: [1800, 7560],
      rows: rows.map(([lbl, val]) => new TableRow({
        children: [
          new TableCell({
            width: { size: 1800, type: WidthType.DXA },
            shading: panelShade,
            borders,
            margins: { top: 60, bottom: 60, left: 80, right: 80 },
            children: [new Paragraph({
              children: [new TextRun({ text: lbl, bold: true, size: 20, color: '444444' })],
            })],
          }),
          new TableCell({
            width: { size: 7560, type: WidthType.DXA },
            shading: panelShade,
            borders,
            margins: { top: 60, bottom: 60, left: 80, right: 80 },
            children: [new Paragraph({
              children: [new TextRun({ text: String(val), size: 20 })],
            })],
          }),
        ],
      })),
    });
  }

  function _docxDataTable(headers, rows, colWidths, docxLib) {
    const { Paragraph, TextRun, Table, TableRow, TableCell, WidthType,
            VerticalAlign } = docxLib;
    const primaryHex = _themeHex();
    const border = _docxThinBorder('CCCCCC');
    const borders = { top: border, bottom: border, left: border, right: border };
    const totalWidth = colWidths ? colWidths.reduce((a, b) => a + b, 0) : 9360;
    const widths = colWidths || headers.map(() => Math.floor(9360 / headers.length));

    const hdrRow = new TableRow({
      tableHeader: true,
      children: headers.map((h, i) => new TableCell({
        width: { size: widths[i], type: WidthType.DXA },
        shading: _docxShade(primaryHex),
        borders,
        margins: { top: 50, bottom: 50, left: 60, right: 60 },
        verticalAlign: VerticalAlign ? VerticalAlign.CENTER : undefined,
        children: [new Paragraph({
          children: [new TextRun({ text: h, bold: true, color: 'FFFFFF', size: 19 })],
        })],
      })),
    });

    const dataRows = rows.map((row, idx) => new TableRow({
      children: row.map((cell, i) => new TableCell({
        width: { size: widths[i], type: WidthType.DXA },
        shading: idx % 2 === 1 ? _docxShade('F9F9F9') : undefined,
        borders,
        margins: { top: 40, bottom: 40, left: 60, right: 60 },
        children: [new Paragraph({
          children: [new TextRun({ text: cell == null ? '' : String(cell), size: 19 })],
        })],
      })),
    }));

    return new Table({
      width: { size: totalWidth, type: WidthType.DXA },
      columnWidths: widths,
      rows: [hdrRow, ...dataRows],
    });
  }

  function _heading2(text) {
    const primaryHex = _themeHex();
    const BorderStyle = docx.BorderStyle || { SINGLE: 'single' };
    return new docx.Paragraph({
      children: [new docx.TextRun({
        text, bold: true, size: 26, color: primaryHex, font: 'Calibri',
      })],
      spacing: { before: 280, after: 100 },
      border: {
        bottom: {
          style: BorderStyle.SINGLE || 'single',
          size: 8,
          color: primaryHex,
          space: 4,
        },
      },
    });
  }

  function _heading3(text) {
    return new docx.Paragraph({
      children: [new docx.TextRun({
        text, bold: true, size: 22, color: '333333', font: 'Calibri',
      })],
      spacing: { before: 160, after: 60 },
    });
  }

  function _policyTitle(text, docxLib) {
    const { Paragraph, TextRun } = docxLib;
    return new Paragraph({
      children: [new TextRun({ text, bold: true, size: 22, color: '333333', font: 'Calibri' })],
      spacing: { before: 0, after: 60 },
    });
  }

  /* ── Word Export ── */
  async function exportDocx() {
    if (typeof docx === 'undefined') {
      Utils.toast('Word export library failed to load. Check your internet connection and refresh.', 'error', 6000);
      return;
    }

    try {
      const s = State.get();
      const sem = s.semester ? Config.getSemesterByCode(s.semester) : null;

      const {
        Document, Packer, Paragraph, TextRun, Header, Footer, PageNumber, BorderStyle,
      } = docx;

      const primaryHex = _themeHex();
      const darkHex    = _themeDarkHex();
      const foot       = _footerLeft(s, sem);
      const slimHdr    = [s.courseNumber, s.courseTitle].filter(Boolean).join(' — ');
      const children   = [];

      /* ── Letterhead + title block ── */
      children.push(new Paragraph({
        children: [new TextRun({
          text: LETTERHEAD.toUpperCase(),
          bold: true,
          size: 16,
          color: primaryHex,
          font: 'Calibri',
          characterSpacing: 40,
        })],
        spacing: { after: 40 },
        border: {
          bottom: { style: BorderStyle?.SINGLE || 'single', size: 12, color: primaryHex, space: 6 },
        },
      }));
      if (s.courseNumber) {
        children.push(new Paragraph({
          children: [new TextRun({
            text: s.courseNumber, bold: true, size: 22, color: primaryHex, font: 'Calibri',
          })],
          spacing: { before: 120, after: 40 },
        }));
      }
      children.push(new Paragraph({
        children: [new TextRun({
          text: s.courseTitle || '', bold: true, size: 36, color: darkHex, font: 'Calibri',
        })],
        spacing: { after: 60 },
        border: {
          bottom: { style: BorderStyle?.SINGLE || 'single', size: 12, color: primaryHex, space: 4 },
        },
      }));
      const subParts = [
        s.sectionNumber ? `Section ${s.sectionNumber}` : '',
        sem ? sem.label : '',
      ].filter(Boolean);
      if (subParts.length) {
        children.push(new Paragraph({
          children: [new TextRun({
            text: subParts.join('  |  '), italics: true, size: 19, color: '555555',
          })],
          spacing: { after: 240 },
        }));
      }

      /* ── Logistics ── */
      const logRows = _logisticsRows(s);
      if (logRows.length) {
        children.push(_heading2('Course Information'));
        children.push(_docxLogisticsPanel(logRows, docx));
        children.push(new Paragraph({ text: '', spacing: { after: 80 } }));
      }

      /* ── Prerequisites ── */
      if (s.prereqs && s.prereqs.some(p => p.courseNum || p.courseName)) {
        children.push(_heading2('Prerequisites'));
        s.prereqs.forEach(p => {
          if (!p.courseNum && !p.courseName) return;
          children.push(new Paragraph({
            children: [new TextRun({ text: `${p.courseNum || ''} — ${p.courseName || ''}`, bold: true })],
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
      if (s.materials && s.materials.some(m => m.title)) {
        children.push(_heading2('Textbooks & Software'));
        const matRows = s.materials.filter(m => m.title).map(m => [
          m.required || 'Required', m.type || '', m.title || '', m.obtain || '',
        ]);
        children.push(_docxDataTable(
          ['Status', 'Type', 'Title / Name', 'Where to Obtain'],
          matRows,
          [1760, 1200, 3200, 3200],
          docx
        ));
        children.push(new Paragraph({ text: '', spacing: { after: 80 } }));
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
      if (s.modules && s.modules.some(m => m.title)) {
        children.push(_heading2('Course Modules'));
        const modRows = s.modules.filter(m => m.title).map(m => [
          String(m.number || ''), m.title || '', m.description || '',
        ]);
        children.push(_docxDataTable(
          ['#', 'Module', 'Description'],
          modRows,
          [600, 2800, 5960],
          docx
        ));
        children.push(new Paragraph({ text: '', spacing: { after: 80 } }));
      }

      /* ── CLOs ── */
      if (s.clos && s.clos.some(c => c.text)) {
        children.push(_heading2('Course Level Outcomes (CLOs)'));
        s.clos.forEach((c, i) => {
          if (!c.text) return;
          const assignStr = c.assignments && c.assignments.length
            ? `  [Assessed by: ${c.assignments.join(', ')}]` : '';
          children.push(new Paragraph({
            children: [
              new TextRun({ text: `CLO-${c.number || i + 1}: `, bold: true }),
              new TextRun(c.text),
              assignStr
                ? new TextRun({ text: assignStr, italics: true, color: '555555' })
                : new TextRun(''),
            ],
            bullet: { level: 0 },
            spacing: { after: 60 },
          }));
        });
      }

      /* ── Grading ── */
      if (s.assessments && s.assessments.some(a => a.name)) {
        const isPoints = s.gradingType === 'points';
        children.push(_heading2('Grading & Assessments'));
        children.push(_heading3('Assessment Breakdown'));
        const assessRows = s.assessments.filter(a => a.name).map(a => [
          a.optional ? `${a.name} (optional)` : a.name,
          isPoints ? `${a.weight} pts` : `${a.weight}%`,
          a.notes || '',
        ]);
        children.push(_docxDataTable(
          ['Assessment', 'Weight', 'Notes'],
          assessRows,
          [4000, 1200, 4160],
          docx
        ));
        children.push(new Paragraph({ text: '', spacing: { after: 60 } }));
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
        const scaleRows = (s.gradeScale || []).map(g => [
          g.grade,
          isPoints ? `${g.min} – ${g.max} pts` : `${g.min}–${g.max}%`,
        ]);
        children.push(_docxDataTable(['Grade', 'Range'], scaleRows, [1400, 7960], docx));
        children.push(new Paragraph({ text: '', spacing: { after: 80 } }));
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
          children.push(new Paragraph({ text: '', spacing: { after: 60 } }));
        });
        customPols.forEach(p => {
          const paras = [];
          if (p.title) paras.push(_policyTitle(p.title, docx));
          if (p.content) _appendMarkdownToDocx(paras, p.content, docx);
          const block = _docxPolicyBlock(paras, docx);
          if (block) children.push(block);
          children.push(new Paragraph({ text: '', spacing: { after: 60 } }));
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
          children.push(new Paragraph({ text: '', spacing: { after: 60 } }));
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

      /* ── Calendar (own page) ── */
      if (s.calendarRows && s.calendarRows.length) {
        children.push(new Paragraph({ children: [new docx.PageBreak()] }));
        children.push(_heading2('Course Calendar'));
        children.push(new Paragraph({
          children: [new TextRun({
            text: 'The schedule below is tentative; adjustments may be made. Announcements made in class, via email, or on Canvas supersede this outline.',
            italics: true, size: 18, color: '444444',
          })],
          spacing: { after: 120 },
        }));

        if (s.calendarView === 'grid') {
          _buildDocxCalendarGrid(s, children, docx);
        } else {
          _buildDocxCalendarList(s, children, docx);
        }
      }

      /* ── Build & Download ── */
      const emptyHeader = new Header({ children: [new Paragraph({ text: '' })] });
      const continuingHeader = new Header({
        children: [
          new Paragraph({
            children: [new TextRun({ text: slimHdr, size: 16, color: '555555', font: 'Calibri' })],
            border: {
              bottom: { style: BorderStyle?.SINGLE || 'single', size: 6, color: primaryHex, space: 4 },
            },
            spacing: { after: 60 },
          }),
        ],
      });
      const pageFooter = new Footer({
        children: [
          new Paragraph({
            border: {
              top: { style: BorderStyle?.SINGLE || 'single', size: 4, color: 'CCCCCC', space: 8 },
            },
            spacing: { before: 60 },
            tabStops: [{ type: 'right', position: 9360 }],
            children: [
              new TextRun({ text: foot, size: 16, color: '777777', font: 'Calibri' }),
              new TextRun({ text: '\t', font: 'Calibri' }),
              new TextRun({ text: 'Page ', size: 16, color: '777777', font: 'Calibri' }),
              new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '777777', font: 'Calibri' }),
              new TextRun({ text: ' of ', size: 16, color: '777777', font: 'Calibri' }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: '777777', font: 'Calibri' }),
            ],
          }),
        ],
      });

      const doc = new Document({
        styles: {
          default: {
            document: {
              font: 'Calibri',
              size: 21,
            },
          },
          paragraphStyles: [
            {
              id: 'Normal',
              name: 'Normal',
              run: { font: 'Calibri', size: 21 },
              paragraph: { spacing: { after: 60, line: 276 } },
            },
            {
              id: 'Heading1',
              name: 'Heading 1',
              basedOn: 'Normal',
              next: 'Normal',
              quickStyle: true,
              run: { size: 36, bold: true, color: darkHex, font: 'Calibri' },
              paragraph: { spacing: { before: 0, after: 80 } },
            },
            {
              id: 'Heading2',
              name: 'Heading 2',
              basedOn: 'Normal',
              next: 'Normal',
              quickStyle: true,
              run: { size: 26, bold: true, color: primaryHex, font: 'Calibri' },
              paragraph: { spacing: { before: 280, after: 80 } },
            },
            {
              id: 'Heading3',
              name: 'Heading 3',
              basedOn: 'Normal',
              next: 'Normal',
              quickStyle: true,
              run: { size: 22, bold: true, color: '333333', font: 'Calibri' },
              paragraph: { spacing: { before: 160, after: 60 } },
            },
          ],
        },
        sections: [{
          properties: {
            page: {
              size: { width: 12240, height: 15840 },
              margin: {
                top: 1224,    // 0.85″
                right: 1080,  // 0.75″
                bottom: 1224,
                left: 1080,
              },
              titlePage: true,
            },
          },
          headers: {
            default: continuingHeader,
            first: emptyHeader,
          },
          footers: {
            default: pageFooter,
            first: pageFooter,
          },
          children,
        }],
      });

      const blob = await Packer.toBlob(doc);
      const filename = Utils.slugify(
        `${s.courseNumber || 'syllabus'}-${s.sectionNumber || ''}-${sem ? sem.label : 'semester'}`
      ) + '.docx';
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
    const primaryHex = _themeHex();
    const border = _docxThinBorder('CCCCCC');
    const borders = { top: border, bottom: border, left: border, right: border };
    const widths = [1100, 700, 2800, 2800, 1960];

    const cell = (text, opts = {}) => {
      const {
        bold = false, italics = false, color, fill, width, columnSpan,
      } = opts;
      return new TableCell({
        width: { size: width || widths[0], type: WidthType.DXA },
        columnSpan,
        shading: _docxShade(fill),
        borders,
        margins: { top: 40, bottom: 40, left: 50, right: 50 },
        children: [new Paragraph({
          children: [new TextRun({
            text: text || '',
            bold,
            italics,
            color: color || undefined,
            size: 18,
          })],
        })],
      });
    };

    const rows = [
      new TableRow({
        tableHeader: true,
        children: ['Date','Day','Topic','Readings / Materials','Due This Day'].map((h, i) =>
          cell(h, { bold: true, color: 'FFFFFF', fill: primaryHex, width: widths[i] })
        ),
      }),
      ...s.calendarRows.map((r, idx) => {
        const d = Utils.formatDate(Utils.parseISODate(r.date));
        const zebra = idx % 2 === 1 ? 'F9F9F9' : undefined;
        if (r.type === 'holiday' || r.type === 'no-class') {
          return new TableRow({ children: [
            cell(d, { italics: true, color: '555555', fill: zebra, width: widths[0] }),
            cell(r.day || '', { italics: true, color: '555555', fill: zebra, width: widths[1] }),
            cell(`${r.name} — No Class`, {
              italics: true, color: '555555', fill: zebra,
              width: widths[2] + widths[3] + widths[4], columnSpan: 3,
            }),
          ]});
        }
        if (r.type === 'final-exam') {
          const label = `FINAL EXAM${r.topic ? ` — ${r.topic}` : ''}`;
          return new TableRow({ children: [
            cell(d, { bold: true, fill: 'FFF8E1', width: widths[0] }),
            cell(r.day || '', { bold: true, fill: 'FFF8E1', width: widths[1] }),
            cell(label, { bold: true, fill: 'FFF8E1', width: widths[2] }),
            cell('', { fill: 'FFF8E1', width: widths[3] }),
            cell(r.due || '', { bold: true, fill: 'FFF8E1', width: widths[4] }),
          ]});
        }
        return new TableRow({ children: [
          cell(d, { fill: zebra, width: widths[0] }),
          cell(r.day || '', { fill: zebra, width: widths[1] }),
          cell(r.topic || '', { fill: zebra, width: widths[2] }),
          cell(r.readings || '', { fill: zebra, width: widths[3] }),
          cell(r.due || '', { fill: zebra, width: widths[4] }),
        ]});
      }),
    ];
    children.push(new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: widths,
      rows,
    }));
  }

  /* ── Docx calendar: visual weekly grid ── */
  function _buildDocxCalendarGrid(s, children, docxLib) {
    const { Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType } = docxLib;
    const { sortedDays, weeks, finalRow } = Utils.groupCalendarByWeek(s);
    if (!weeks.length) return;

    const primaryHex = _themeHex();
    const border = _docxThinBorder('CCCCCC');
    const borders = { top: border, bottom: border, left: border, right: border };
    const weekW = 700;
    const dayW  = Math.floor((9360 - weekW) / sortedDays.length);
    const widths = [weekW, ...sortedDays.map(() => dayW)];

    const hdrCell = (text, w) => new TableCell({
      width: { size: w, type: WidthType.DXA },
      shading: _docxShade(primaryHex),
      borders,
      margins: { top: 40, bottom: 40, left: 40, right: 40 },
      children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text, bold: true, color: 'FFFFFF', size: 18 })],
      })],
    });

    const hdrRow = new TableRow({
      tableHeader: true,
      children: [
        hdrCell('Wk', weekW),
        ...sortedDays.map(d => hdrCell(d, dayW)),
      ],
    });

    const dataRows = weeks.map(({ weekNum, cells }, idx) => {
      const zebra = idx % 2 === 1 ? 'F9F9F9' : undefined;
      return new TableRow({ children: [
        new TableCell({
          width: { size: weekW, type: WidthType.DXA },
          shading: _docxShade('F0E8E8'),
          borders,
          margins: { top: 40, bottom: 40, left: 40, right: 40 },
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: String(weekNum), bold: true, color: primaryHex, size: 16 })],
          })],
        }),
        ...sortedDays.map(day => {
          const r = cells[day];
          if (!r) {
            return new TableCell({
              width: { size: dayW, type: WidthType.DXA },
              shading: _docxShade('F5F5F5'),
              borders,
              children: [new Paragraph({ text: '' })],
            });
          }
          const d = Utils.formatDate(Utils.parseISODate(r.date));
          if (r.type === 'holiday' || r.type === 'no-class') {
            return new TableCell({
              width: { size: dayW, type: WidthType.DXA },
              shading: _docxShade('EEEEEE'),
              borders,
              margins: { top: 30, bottom: 30, left: 40, right: 40 },
              children: [
                new Paragraph({ children: [new TextRun({ text: d, size: 14, color: '777777' })] }),
                new Paragraph({ children: [new TextRun({ text: r.name, bold: true, color: primaryHex, size: 16 })] }),
                new Paragraph({ children: [new TextRun({ text: 'No Class', italics: true, color: '888888', size: 14 })] }),
              ],
            });
          }
          const isExam = /exam/i.test(r.topic || '');
          const fill = isExam ? 'FFF8E1' : zebra;
          const parts = [
            new Paragraph({ children: [new TextRun({ text: d, size: 14, color: '777777' })] }),
          ];
          if (r.topic) {
            parts.push(new Paragraph({
              children: [new TextRun({
                text: r.topic, bold: true, size: 16,
                color: isExam ? 'E65100' : '111111',
              })],
            }));
          }
          if (r.readings) {
            parts.push(new Paragraph({
              children: [new TextRun({ text: r.readings, italics: true, size: 14, color: '555555' })],
            }));
          }
          if (r.due) {
            parts.push(new Paragraph({
              children: [new TextRun({ text: r.due, color: 'C0392B', size: 14 })],
            }));
          }
          return new TableCell({
            width: { size: dayW, type: WidthType.DXA },
            shading: _docxShade(fill),
            borders,
            margins: { top: 30, bottom: 30, left: 40, right: 40 },
            children: parts,
          });
        }),
      ]});
    });

    const tableRows = [hdrRow, ...dataRows];

    if (finalRow) {
      const fd   = Utils.formatDate(Utils.parseISODate(finalRow.date));
      const meta = [fd, finalRow.due, finalRow.topic].filter(Boolean).join('  ·  ');
      tableRows.push(new TableRow({ children: [
        new TableCell({
          width: { size: weekW, type: WidthType.DXA },
          shading: _docxShade(primaryHex),
          borders,
          margins: { top: 40, bottom: 40, left: 40, right: 40 },
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: 'Final', bold: true, color: 'FFFFFF', size: 16 })],
          })],
        }),
        new TableCell({
          columnSpan: sortedDays.length,
          width: { size: dayW * sortedDays.length, type: WidthType.DXA },
          shading: _docxShade(primaryHex),
          borders,
          margins: { top: 40, bottom: 40, left: 60, right: 60 },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: 'FINAL EXAM', bold: true, color: 'FFFFFF', size: 20 })],
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: meta, color: 'FFFFFF', size: 16 })],
            }),
          ],
        }),
      ]}));
    }

    children.push(new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: widths,
      rows: tableRows,
    }));
  }

  /* ── Shared helpers ── */
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
   * Markdown → docx paragraphs.
   * Handles: headings, bold/italic, lists, blank lines, ---, and | tables.
   */
  function _appendMarkdownToDocx(children, md, docxLib) {
    if (!md) return;
    const { Paragraph, TextRun } = docxLib;
    const lines = md.split('\n').map(l => l.replace(/\r$/, ''));
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trimStart();

      // Markdown tables
      if (trimmed.startsWith('|')) {
        const tableLines = [];
        while (i < lines.length && lines[i].trimStart().startsWith('|')) {
          tableLines.push(lines[i]);
          i++;
        }
        if (tableLines.length >= 2) {
          const parseRow = row =>
            row.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
          // Skip separator row (index 1)
          const headers = parseRow(tableLines[0]);
          const dataRows = tableLines.slice(2).map(parseRow);
          // Filter out separator-looking rows just in case
          const cleanRows = dataRows.filter(r => !r.every(c => /^[-:]+$/.test(c)));
          const colW = headers.map(() => Math.floor(9000 / headers.length));
          children.push(_docxDataTable(headers, cleanRows, colW, docxLib));
          children.push(new Paragraph({ text: '', spacing: { after: 60 } }));
        }
        continue;
      }

      if (trimmed.startsWith('### ')) {
        children.push(new Paragraph({
          children: [new TextRun({ text: trimmed.slice(4), bold: true, size: 22, color: '333333' })],
          spacing: { before: 120, after: 40 },
        }));
      } else if (trimmed.startsWith('## ')) {
        children.push(new Paragraph({
          children: [new TextRun({ text: trimmed.slice(3), bold: true, size: 22, color: '333333' })],
          spacing: { before: 160, after: 60 },
        }));
      } else if (trimmed.startsWith('# ')) {
        children.push(new Paragraph({
          children: [new TextRun({ text: trimmed.slice(2), bold: true, size: 24, color: '333333' })],
          spacing: { before: 160, after: 60 },
        }));
      } else if (/^[-*]\s+/.test(trimmed)) {
        children.push(new Paragraph({
          children: _parseInline(trimmed.replace(/^[-*]\s+/, ''), TextRun),
          bullet: { level: 0 },
          spacing: { after: 40 },
        }));
      } else if (/^\d+\.\s/.test(trimmed)) {
        children.push(new Paragraph({
          children: _parseInline(trimmed.replace(/^\d+\.\s+/, ''), TextRun),
          bullet: { level: 0 },
          spacing: { after: 40 },
        }));
      } else if (trimmed.startsWith('---') || trimmed.startsWith('***')) {
        children.push(new Paragraph({ text: '', spacing: { after: 40 } }));
      } else if (trimmed === '') {
        children.push(new Paragraph({ text: '', spacing: { after: 40 } }));
      } else {
        children.push(new Paragraph({
          children: _parseInline(line, TextRun),
          spacing: { after: 60 },
        }));
      }
      i++;
    }
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

  return { init, unlockWord };
})();
