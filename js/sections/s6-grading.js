/**
 * s6-grading.js — Section 6: Grading & Assessments
 * Supports two modes:
 *   weighted — assessments have a % weight; grade scale uses % ranges (default)
 *   points   — assessments have a point value; grade scale uses point thresholds
 */
const S6 = (() => {

  function init() {
    _bindGradingTypeToggle();
    _renderGradeScale();
    _initAssessments();
    _restoreFromState();
  }

  /* ── Grading-type toggle ── */
  function _bindGradingTypeToggle() {
    document.getElementById('gt-weighted').addEventListener('click', () => _setGradingType('weighted'));
    document.getElementById('gt-points').addEventListener('click',   () => _setGradingType('points'));
  }

  function _setGradingType(type) {
    State.set({ gradingType: type });
    _applyGradingTypeUI(type);
    _renderGradeScale();          // re-render scale with correct units
    _rebuildAssessmentLabels();   // update column header labels in existing rows
    _updateWeightTotal();
  }

  function _applyGradingTypeUI(type) {
    const isPoints = type === 'points';
    document.getElementById('gt-weighted').classList.toggle('btn--active', !isPoints);
    document.getElementById('gt-points').classList.toggle('btn--active',   isPoints);
    document.getElementById('gt-weighted').setAttribute('aria-pressed', String(!isPoints));
    document.getElementById('gt-points').setAttribute('aria-pressed',   String(isPoints));
    document.getElementById('grade-scale-hint').innerHTML = isPoints
      ? 'Enter the minimum and maximum <strong>points</strong> required for each letter grade.'
      : 'Enter the minimum and maximum <strong>percentage</strong> for each letter grade.';
  }

  /* ── Grade Scale ── */
  function _renderGradeScale() {
    const s         = State.get();
    const isPoints  = s.gradingType === 'points';
    const unit      = isPoints ? 'pts' : '%';
    const maxAttr   = isPoints ? '' : 'max="100"';
    const container = document.getElementById('grade-scale-list');
    container.innerHTML = '';
    s.gradeScale.forEach((row, i) => {
      const item = document.createElement('div');
      item.className = 'grade-scale-item';
      item.innerHTML = `
        <span class="grade-scale-item__label">${Utils.escapeHtml(row.grade)}</span>
        <input type="number" class="input gs-min" value="${row.min}" min="0" ${maxAttr}
               aria-label="${row.grade} minimum ${unit}" title="${row.grade} minimum ${unit}" />
        <span>–</span>
        <input type="number" class="input gs-max" value="${row.max}" min="0" ${maxAttr}
               aria-label="${row.grade} maximum ${unit}" title="${row.grade} maximum ${unit}" />
        <span class="gs-unit">${unit}</span>
      `;
      item.querySelectorAll('input').forEach(el => {
        el.addEventListener('change', _syncGradeScale);
        el.addEventListener('input', Utils.debounce(_syncGradeScale, 400));
      });
      container.appendChild(item);
    });
  }

  function _syncGradeScale() {
    const items = document.querySelectorAll('.grade-scale-item');
    const gradeScale = Array.from(items).map((item, i) => ({
      grade: State.get().gradeScale[i].grade,
      min:   parseFloat(item.querySelector('.gs-min').value) || 0,
      max:   parseFloat(item.querySelector('.gs-max').value) || 0,
    }));
    State.set({ gradeScale });
  }

  /* ── Assessments ── */
  function _initAssessments() {
    document.getElementById('btn-add-assessment').addEventListener('click', () => {
      _addAssessmentRow();
      _syncAssessments();
    });
  }

  function _addAssessmentRow(data = {}) {
    const list     = document.getElementById('assessments-list');
    const idx      = list.querySelectorAll('.repeating-item').length;
    const isPoints = State.get().gradingType === 'points';
    const item     = document.createElement('div');
    item.className = 'repeating-item';
    item.setAttribute('role', 'listitem');
    item.innerHTML = `
      <div class="repeating-item__fields">
        <div class="field-group field-group--grow">
          <label class="field-label" for="asmnt-name-${idx}">Component Name</label>
          <input type="text" id="asmnt-name-${idx}" class="input asmnt-name"
                 value="${Utils.escapeHtml(data.name||'')}" placeholder="e.g., Homework Assignments" />
        </div>
        <div class="field-group" style="max-width:110px">
          <label class="field-label asmnt-weight-label" for="asmnt-weight-${idx}">${isPoints ? 'Points' : 'Weight (%)'}</label>
          <input type="number" id="asmnt-weight-${idx}" class="input asmnt-weight"
                 value="${data.weight||''}" min="0" ${isPoints ? '' : 'max="100"'} step="${isPoints ? 5 : 1}" placeholder="0" />
        </div>
        <div class="field-group" style="min-width:130px;align-self:flex-end">
          <label class="checkbox-label" for="asmnt-optional-${idx}" title="List in syllabus but exclude from weight total">
            <input type="checkbox" id="asmnt-optional-${idx}" class="asmnt-optional"
                   ${data.optional ? 'checked' : ''} />
            Optional
          </label>
          <span class="field-hint">Not counted in total</span>
        </div>
        <div class="field-group field-group--grow">
          <label class="field-label" for="asmnt-notes-${idx}">Notes <span class="field-label__optional">(optional)</span></label>
          <input type="text" id="asmnt-notes-${idx}" class="input asmnt-notes"
                 value="${Utils.escapeHtml(data.notes||'')}" placeholder="e.g., 2 lowest scores dropped" />
        </div>
        <div class="field-group field-group--full">
          <label class="field-label" for="asmnt-information-${idx}">Information <span class="field-label__optional">(optional)</span></label>
          <textarea id="asmnt-information-${idx}" class="input input--textarea input--markdown asmnt-information" rows="4"
                    placeholder="Detailed explanation of this component (format, expectations, drop rules, etc.)">${Utils.escapeHtml(data.information||'')}</textarea>
          <span class="field-hint">Use the toolbar for formatting. Omitted from the syllabus when left blank.</span>
        </div>
      </div>
      <button type="button" class="repeating-item__remove" aria-label="Remove assessment component" title="Remove">&#10005;</button>
    `;
    item.querySelector('.repeating-item__remove').addEventListener('click', () => {
      const infoEl = item.querySelector('.asmnt-information');
      if (infoEl) MarkdownEditor.destroy(infoEl);
      item.remove();
      _syncAssessments();
      _updateWeightTotal();
    });
    item.querySelectorAll('input:not(.asmnt-information), textarea:not(.asmnt-information)').forEach(el => {
      el.addEventListener('change', () => { _syncAssessments(); _updateWeightTotal(); });
      el.addEventListener('input', Utils.debounce(() => { _syncAssessments(); _updateWeightTotal(); }, 400));
    });
    const infoEl = item.querySelector('.asmnt-information');
    MarkdownEditor.init(infoEl, {
      onChange: Utils.debounce(() => { _syncAssessments(); _updateWeightTotal(); }, 400),
    });
    list.appendChild(item);
    _updateWeightTotal();
  }

  /** Update the weight-column label in already-rendered rows (called on type switch) */
  function _rebuildAssessmentLabels() {
    const isPoints = State.get().gradingType === 'points';
    const newLabel = isPoints ? 'Points' : 'Weight (%)';
    document.querySelectorAll('.asmnt-weight-label').forEach(el => { el.textContent = newLabel; });
    document.querySelectorAll('.asmnt-weight').forEach(el => {
      if (isPoints) { el.removeAttribute('max'); el.step = '5'; }
      else          { el.setAttribute('max', '100'); el.step = '1'; }
    });
  }

  function _syncAssessments() {
    const list = document.getElementById('assessments-list');
    const assessments = Array.from(list.querySelectorAll('.repeating-item')).map(item => ({
      name:        item.querySelector('.asmnt-name').value.trim(),
      weight:      parseFloat(item.querySelector('.asmnt-weight').value) || 0,
      notes:       item.querySelector('.asmnt-notes').value.trim(),
      optional:    item.querySelector('.asmnt-optional').checked,
      information: MarkdownEditor.getValue(item.querySelector('.asmnt-information')).trim(),
    }));
    State.set({ assessments });
    _updateWeightTotal();
  }

  function _countedAssessments(assessments) {
    return assessments.filter(a => a.name && !a.optional);
  }

  function _updateWeightTotal() {
    const s         = State.get();
    const isPoints  = s.gradingType === 'points';
    const counted   = _countedAssessments(s.assessments);
    const optional  = s.assessments.filter(a => a.name && a.optional);
    const total     = counted.reduce((sum, a) => sum + (a.weight || 0), 0);
    const optTotal  = optional.reduce((sum, a) => sum + (a.weight || 0), 0);
    const totalEl   = document.getElementById('weight-total');
    const statusEl  = document.getElementById('weight-status');
    const labelEl   = document.getElementById('weight-total-label');
    if (!totalEl) return;

    if (isPoints) {
      labelEl.textContent   = optional.length ? 'Total points (required):' : 'Total points:';
      totalEl.textContent   = `${total} pts`;
      totalEl.className     = 'weight-total weight-total--valid';
      statusEl.textContent  = optional.length ? `Optional: ${optTotal} pts (not counted)` : '';
    } else {
      labelEl.textContent   = optional.length ? 'Total weight (required):' : 'Total weight:';
      totalEl.textContent   = `${total}%`;
      const isValid         = Math.abs(total - 100) < 0.01;
      totalEl.className     = `weight-total ${isValid ? 'weight-total--valid' : 'weight-total--invalid'}`;
      let status = isValid ? '✓ Valid' : total > 100 ? '↑ Over 100%' : '↓ Under 100%';
      if (optional.length) {
        status += ` · Optional: ${optTotal}% (not counted)`;
      }
      statusEl.textContent  = status;
      statusEl.style.color  = isValid ? 'var(--color-success)' : 'var(--color-danger)';
    }
  }

  /* ── Restore from state ── */
  function _restoreFromState() {
    const s = State.get();
    _applyGradingTypeUI(s.gradingType || 'weighted');
    s.assessments.forEach(a => _addAssessmentRow(a));
    _updateWeightTotal();
  }

  function isComplete() {
    const s        = State.get();
    const hasItems = s.assessments.some(a => a.name);
    if (!hasItems) return false;
    if (s.gradingType === 'points') return true;
    const total = _countedAssessments(s.assessments).reduce((sum, a) => sum + (a.weight || 0), 0);
    return Math.abs(total - 100) < 0.01;
  }

  return { init, isComplete };
})();
