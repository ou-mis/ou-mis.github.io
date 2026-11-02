(function (root) {
  'use strict';

  const S = root.TAState;

  function money(n) {
    return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function courseLabel(sec) {
    return `${sec.subject} ${sec.number}-${sec.section}`;
  }

  function sortedStudentsWithAssignments(state) {
    return Object.values(state.students)
      .filter((st) => S.assignmentsForStudent(state, st.id).length)
      .sort((a, b) => lastFirst(a.name).localeCompare(lastFirst(b.name)));
  }

  function lastFirst(name) {
    const parts = String(name || '').trim().split(/\s+/);
    if (parts.length < 2) return parts[0] || '';
    return `${parts[parts.length - 1]}, ${parts.slice(0, -1).join(' ')}`;
  }

  // One row per assignment, in the UGTA sheet's column order (A..AA).
  function ugtaRows(state) {
    const st = state.settings;
    const rows = [];
    sortedStudentsWithAssignments(state).forEach((student) => {
      const inf = S.info(state, student.id);
      S.assignmentsForStudent(state, student.id)
        .map((a) => ({ a, sec: state.sections[a.crn] }))
        .filter((x) => x.sec)
        .sort((x, y) => courseLabel(x.sec).localeCompare(courseLabel(y.sec)))
        .forEach(({ a, sec }) => {
          const pay = S.payFor(state, S.hoursFor(state, a));
          const notes = [a.note, inf.notes].filter(Boolean).join('; ');
          rows.push([
            student.name,
            inf.email,
            student.sisId,
            inf.employeeStatus,
            inf.previouslyWorked,
            inf.previouslyWorked === 'Yes' ? inf.jobType : '',
            st.division,
            st.taType,
            st.fte !== '' && st.fte !== null && st.fte !== undefined ? Number(st.fte) : pay.fte,
            pay.hours,
            pay.biweekly,
            pay.total,
            courseLabel(sec),
            sec.startDate,
            sec.endDate,
            sec.instructor,
            inf.outsideUS,
            inf.outsideUS === 'Yes' ? inf.country : '',
            st.org,
            st.fund,
            st.functionCode,
            st.account,
            st.entity,
            st.project,
            st.source,
            st.purpose,
            notes,
          ]);
        });
    });
    return rows;
  }

  async function buildAppointmentWorkbook(state, templateBuffer) {
    const wb = new root.ExcelJS.Workbook();
    await wb.xlsx.load(templateBuffer);
    const ws = wb.getWorksheet('UGTA');
    if (!ws) throw new Error('The workbook has no "UGTA" sheet.');
    const header = ws.getRow(1);
    const rows = ugtaRows(state);
    rows.forEach((values, i) => {
      const row = ws.getRow(i + 2);
      values.forEach((v, c) => {
        const cell = row.getCell(c + 1);
        cell.value = v === undefined || v === '' ? null : v;
        const hs = header.getCell(c + 1).style || {};
        if (hs.font) cell.font = Object.assign({}, hs.font, { bold: false });
      });
      row.getCell(11).numFmt = '$#,##0.00';
      row.getCell(12).numFmt = '$#,##0.00';
      row.commit();
    });
    const buf = await wb.xlsx.writeBuffer();
    return { buffer: buf, rowCount: rows.length };
  }

  function letterData(state, student) {
    const st = state.settings;
    const totals = S.studentTotals(state, student.id);
    return {
      letter_date: S.toUsDate(st.letterDate),
      ta_name: student.name,
      biweekly_rate: money(totals.biweekly),
      term: st.term,
      total_stipend: money(totals.total),
      start_date: S.toUsDate(st.startDate),
      end_date: S.toUsDate(st.endDate),
      hours_per_week: String(totals.hours),
      accept_by_date: S.toUsDate(st.acceptByDate),
    };
  }

  function safeFileName(s) {
    return String(s).replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim();
  }

  function letterFileName(state, student) {
    const parts = String(student.name).trim().split(/\s+/);
    const last = parts.length > 1 ? parts[parts.length - 1] : parts[0];
    const first = parts.length > 1 ? parts.slice(0, -1).join(' ') : '';
    const person = [last, first].filter(Boolean).join('_').replace(/\s+/g, '_');
    return safeFileName(`${person}_${state.settings.term} TA Offer.docx`);
  }

  function renderLetter(templateBuffer, data) {
    const zip = new root.PizZip(templateBuffer);
    const doc = new root.docxtemplater(zip, { paragraphLoop: true, linebreaks: true, nullGetter: () => '' });
    doc.render(data);
    return doc.getZip().generate({ type: 'uint8array', compression: 'DEFLATE' });
  }

  async function buildOfferLetters(state, templateBuffer) {
    const out = new root.JSZip();
    const students = sortedStudentsWithAssignments(state);
    const names = new Set();
    students.forEach((student) => {
      let name = letterFileName(state, student);
      while (names.has(name)) name = name.replace(/\.docx$/, ` (${student.sisId || student.id}).docx`);
      names.add(name);
      out.file(name, renderLetter(templateBuffer, letterData(state, student)));
    });
    const zip = await out.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    return { buffer: zip, count: students.length };
  }

  function csvCell(v) {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function assignmentsCsv(state) {
    const T = root.TATime;
    const header = ['Course', 'CRN', 'Title', 'Instructor', 'Meeting', 'Location', 'TA Name', 'OU ID', 'Email', 'Hours/Week'];
    const lines = [header];
    Object.values(state.sections)
      .sort((a, b) => courseLabel(a).localeCompare(courseLabel(b)))
      .forEach((sec) => {
        S.assignmentsForSection(state, sec.crn).forEach((a) => {
          const st = state.students[a.studentId];
          if (!st) return;
          lines.push([
            courseLabel(sec), sec.crn, sec.title, sec.instructor, T.formatMeeting(sec),
            [sec.building, sec.room].filter(Boolean).join(' '), st.name, st.sisId,
            S.info(state, st.id).email, S.hoursFor(state, a),
          ]);
        });
      });
    return lines.map((l) => l.map(csvCell).join(',')).join('\r\n');
  }

  root.TAExports = { ugtaRows, buildAppointmentWorkbook, buildOfferLetters, letterData, letterFileName, assignmentsCsv, money, courseLabel, lastFirst };
})(typeof window !== 'undefined' ? window : globalThis);
