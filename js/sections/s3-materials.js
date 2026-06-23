/**
 * s3-materials.js — Section 3: Required Texts & Software
 */
const S3 = (() => {
  function init() {
    document.getElementById('btn-add-material').addEventListener('click', () => {
      _addRow();
      _sync();
    });
    _restoreFromState();
  }

  function _addRow(data = {}) {
    const list = document.getElementById('materials-list');
    const idx  = list.querySelectorAll('.repeating-item').length;
    const item = document.createElement('div');
    item.className = 'repeating-item';
    item.setAttribute('role', 'listitem');
    item.innerHTML = `
      <div class="repeating-item__fields">
        <div class="field-group">
          <label class="field-label" for="mat-type-${idx}">Type</label>
          <select id="mat-type-${idx}" class="input input--select mat-type">
            <option value="Textbook">Textbook</option>
            <option value="Software">Software</option>
            <option value="Online Resource">Online Resource</option>
            <option value="Supplemental">Supplemental</option>
          </select>
        </div>
        <div class="field-group field-group--grow">
          <label class="field-label" for="mat-title-${idx}">Title / Name</label>
          <input type="text" id="mat-title-${idx}" class="input mat-title"
                 value="${Utils.escapeHtml(data.title||'')}" placeholder="Title or software name" />
        </div>
        <div class="field-group field-group--grow">
          <label class="field-label" for="mat-obtain-${idx}">Where to Obtain</label>
          <input type="text" id="mat-obtain-${idx}" class="input mat-obtain"
                 value="${Utils.escapeHtml(data.obtain||'')}" placeholder="URL or note (e.g., Available via Canvas)" />
        </div>
        <div class="field-group">
          <label class="field-label" for="mat-req-${idx}">Status</label>
          <select id="mat-req-${idx}" class="input input--select mat-required">
            <option value="Required">Required</option>
            <option value="Recommended">Recommended</option>
            <option value="Optional">Optional</option>
          </select>
        </div>
      </div>
      <button type="button" class="repeating-item__remove" aria-label="Remove material" title="Remove">&#10005;</button>
    `;
    if (data.type) item.querySelector('.mat-type').value = data.type;
    if (data.required) item.querySelector('.mat-required').value = data.required;
    item.querySelector('.repeating-item__remove').addEventListener('click', () => { item.remove(); _sync(); });
    item.querySelectorAll('input, select').forEach(el => {
      el.addEventListener('change', _sync);
      el.addEventListener('input', Utils.debounce(_sync, 400));
    });
    list.appendChild(item);
  }

  function _sync() {
    const list = document.getElementById('materials-list');
    const materials = Array.from(list.querySelectorAll('.repeating-item')).map(item => ({
      type:     item.querySelector('.mat-type').value,
      title:    item.querySelector('.mat-title').value.trim(),
      obtain:   item.querySelector('.mat-obtain').value.trim(),
      required: item.querySelector('.mat-required').value,
    }));
    State.set({ materials });
  }

  function _restoreFromState() {
    State.get().materials.forEach(m => _addRow(m));
  }

  function isComplete() {
    return State.get().materials.length > 0;
  }

  return { init, isComplete };
})();
