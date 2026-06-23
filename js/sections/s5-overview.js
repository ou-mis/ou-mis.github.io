/**
 * s5-overview.js — Section 5: Course Overview & Objectives (Modules + CLOs)
 *
 * Modules are optional.
 * CLOs have a free-text "Assessed By" field where the instructor types
 * comma-separated assignment names (e.g. "Homework 1, Quiz A, Exam II").
 */
const S5 = (() => {
  function init() {
    _bindDescriptionFields();
    _initModules();
    _initCLOs();
    _restoreFromState();
  }

  function _bindDescriptionFields() {
    ['courseDescription', 'coursePhilosophy'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', _syncDescriptions);
      el.addEventListener('input', Utils.debounce(_syncDescriptions, 400));
    });
  }

  function _syncDescriptions() {
    State.set({
      courseDescription: document.getElementById('courseDescription').value.trim(),
      coursePhilosophy:  document.getElementById('coursePhilosophy').value.trim(),
    });
  }

  /* ── Modules (optional) ── */
  function _initModules() {
    document.getElementById('btn-add-module').addEventListener('click', () => {
      _addModuleRow();
      _syncModules();
    });
  }

  function _addModuleRow(data = {}) {
    const list = document.getElementById('modules-list');
    const idx  = list.querySelectorAll('.repeating-item').length + 1;
    const item = document.createElement('div');
    item.className = 'repeating-item';
    item.setAttribute('role', 'listitem');
    item.innerHTML = `
      <div class="repeating-item__fields">
        <div class="field-group" style="max-width:80px">
          <label class="field-label" for="mod-num-${idx}">#</label>
          <input type="text" id="mod-num-${idx}" class="input mod-num"
                 value="${Utils.escapeHtml(data.number !== undefined ? String(data.number) : String(idx))}"
                 placeholder="${idx}" />
        </div>
        <div class="field-group" style="min-width:160px">
          <label class="field-label" for="mod-title-${idx}">Module Title</label>
          <input type="text" id="mod-title-${idx}" class="input mod-title"
                 value="${Utils.escapeHtml(data.title||'')}" placeholder="e.g., Storing and Retrieving Data" />
        </div>
        <div class="field-group field-group--grow">
          <label class="field-label" for="mod-desc-${idx}">Description <span class="field-label__optional">(optional)</span></label>
          <input type="text" id="mod-desc-${idx}" class="input mod-desc"
                 value="${Utils.escapeHtml(data.description||'')}"
                 placeholder="Brief description of this module's content" />
        </div>
      </div>
      <button type="button" class="repeating-item__remove" aria-label="Remove module" title="Remove">&#10005;</button>
    `;
    item.querySelector('.repeating-item__remove').addEventListener('click', () => {
      item.remove();
      _syncModules();
    });
    item.querySelectorAll('input').forEach(el => {
      el.addEventListener('change', _syncModules);
      el.addEventListener('input', Utils.debounce(_syncModules, 400));
    });
    list.appendChild(item);
  }

  function _syncModules() {
    const list = document.getElementById('modules-list');
    const modules = Array.from(list.querySelectorAll('.repeating-item')).map(item => ({
      number:      item.querySelector('.mod-num').value.trim(),
      title:       item.querySelector('.mod-title').value.trim(),
      description: item.querySelector('.mod-desc').value.trim(),
    }));
    State.set({ modules });
  }

  /* ── CLOs ── */
  function _initCLOs() {
    document.getElementById('btn-add-clo').addEventListener('click', () => {
      _addCLORow();
      _syncCLOs();
    });
  }

  function _addCLORow(data = {}) {
    const list = document.getElementById('clos-list');
    const idx  = list.querySelectorAll('.repeating-item').length + 1;
    const item = document.createElement('div');
    item.className = 'repeating-item';
    item.setAttribute('role', 'listitem');

    // assignments is stored as an array; display as comma-separated string
    const assignmentsStr = Array.isArray(data.assignments) ? data.assignments.join(', ') : (data.assignments || '');

    item.innerHTML = `
      <div class="repeating-item__fields" style="flex-wrap:wrap">
        <div class="field-group" style="max-width:70px; flex-shrink:0">
          <label class="field-label" for="clo-num-${idx}">CLO</label>
          <input type="number" id="clo-num-${idx}" class="input clo-num"
                 value="${data.number !== undefined ? data.number : idx}" min="1" />
        </div>
        <div class="field-group field-group--grow" style="min-width:220px">
          <label class="field-label" for="clo-text-${idx}">Outcome</label>
          <input type="text" id="clo-text-${idx}" class="input clo-text"
                 value="${Utils.escapeHtml(data.text||'')}"
                 placeholder="Students will be able to…" />
        </div>
        <div class="field-group field-group--grow" style="min-width:200px">
          <label class="field-label" for="clo-assign-${idx}">
            Assessed By
            <span class="field-label__optional">(optional)</span>
          </label>
          <input type="text" id="clo-assign-${idx}" class="input clo-assign"
                 value="${Utils.escapeHtml(assignmentsStr)}"
                 placeholder="e.g., Homework 1, Quiz A, Exam II" />
          <span class="field-hint">Comma-separated list of assignments</span>
        </div>
      </div>
      <button type="button" class="repeating-item__remove" aria-label="Remove CLO" title="Remove">&#10005;</button>
    `;
    item.querySelector('.repeating-item__remove').addEventListener('click', () => { item.remove(); _syncCLOs(); });
    item.querySelectorAll('input').forEach(el => {
      el.addEventListener('change', _syncCLOs);
      el.addEventListener('input', Utils.debounce(_syncCLOs, 400));
    });
    list.appendChild(item);
  }

  function _syncCLOs() {
    const list = document.getElementById('clos-list');
    const clos = Array.from(list.querySelectorAll('.repeating-item')).map(item => {
      const assignVal = item.querySelector('.clo-assign').value.trim();
      const assignments = assignVal
        ? assignVal.split(',').map(s => s.trim()).filter(Boolean)
        : [];
      return {
        number:      parseInt(item.querySelector('.clo-num').value, 10),
        text:        item.querySelector('.clo-text').value.trim(),
        assignments,
      };
    });
    State.set({ clos });
  }

  function _restoreFromState() {
    const s = State.get();
    if (s.courseDescription) document.getElementById('courseDescription').value = s.courseDescription;
    if (s.coursePhilosophy)  document.getElementById('coursePhilosophy').value  = s.coursePhilosophy;
    s.modules.forEach(m => _addModuleRow(m));
    s.clos.forEach(c => _addCLORow(c));
  }

  function isComplete() {
    const s = State.get();
    return !!(s.courseDescription && s.clos.length > 0);
  }

  return { init, isComplete };
})();
