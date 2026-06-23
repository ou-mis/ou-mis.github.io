/**
 * s4-prereqs.js — Section 4: Prerequisites
 */
const S4 = (() => {
  function init() {
    document.getElementById('btn-add-prereq').addEventListener('click', () => {
      _addRow();
      _sync();
    });
    _restoreFromState();
  }

  function _addRow(data = {}) {
    const list = document.getElementById('prereqs-list');
    const idx  = list.querySelectorAll('.repeating-item').length;
    const item = document.createElement('div');
    item.className = 'repeating-item';
    item.setAttribute('role', 'listitem');
    item.innerHTML = `
      <div class="repeating-item__fields">
        <div class="field-group">
          <label class="field-label" for="pre-num-${idx}">Course Number</label>
          <input type="text" id="pre-num-${idx}" class="input pre-num"
                 value="${Utils.escapeHtml(data.courseNum||'')}" placeholder="e.g., MIS 2113" />
        </div>
        <div class="field-group field-group--grow">
          <label class="field-label" for="pre-name-${idx}">Course Name</label>
          <input type="text" id="pre-name-${idx}" class="input pre-name"
                 value="${Utils.escapeHtml(data.courseName||'')}"
                 placeholder="e.g., Computer-Based Information Systems" />
        </div>
        <div class="field-group field-group--grow" style="flex-basis:100%">
          <label class="field-label" for="pre-reason-${idx}">Reason Required <span class="field-label__optional">(optional)</span></label>
          <input type="text" id="pre-reason-${idx}" class="input pre-reason"
                 value="${Utils.escapeHtml(data.reason||'')}"
                 placeholder="e.g., Excel fundamentals and basic data analysis skills are expected from day one" />
        </div>
      </div>
      <button type="button" class="repeating-item__remove" aria-label="Remove prerequisite" title="Remove">&#10005;</button>
    `;
    item.querySelector('.repeating-item__remove').addEventListener('click', () => { item.remove(); _sync(); });
    item.querySelectorAll('input').forEach(el => {
      el.addEventListener('change', _sync);
      el.addEventListener('input', Utils.debounce(_sync, 400));
    });
    list.appendChild(item);
  }

  function _sync() {
    const list = document.getElementById('prereqs-list');
    const prereqs = Array.from(list.querySelectorAll('.repeating-item')).map(item => ({
      courseNum:  item.querySelector('.pre-num').value.trim(),
      courseName: item.querySelector('.pre-name').value.trim(),
      reason:     item.querySelector('.pre-reason').value.trim(),
    }));
    State.set({ prereqs });
  }

  function _restoreFromState() {
    State.get().prereqs.forEach(p => _addRow(p));
  }

  function isComplete() {
    // Section is optional; mark complete if user has visited or explicitly has no prereqs
    return true;
  }

  return { init, isComplete };
})();
