/**
 * s7-policies.js — Section 7: Course Policies
 *
 * Division/College policy blocks (toggle + inline editor)
 * Custom Course Policies — card-based list: each entry has a title input + content textarea.
 * No EasyMDE; plain textareas keep formatting consistent with the exported document.
 */
const S7 = (() => {

  /* ── Division / College Policy Blocks ─────────────────────────────── */

  function _renderDivisionPolicies() {
    const container = document.getElementById('division-policies-list');
    container.innerHTML = '';
    const policies = [
      ...Config.getPoliciesByCategory('division'),
      ...Config.getPoliciesByCategory('college'),
    ];
    const statePolData = State.get().divisionPolicies;

    policies.forEach(policy => {
      const savedData  = statePolData[policy.id] || {};
      const isRequired = policy.status === 'required';
      const isIncluded = isRequired ? true : (savedData.included !== undefined ? savedData.included : false);
      const customText = savedData.customText !== undefined ? savedData.customText : policy.content;
      container.appendChild(_createPolicyBlock(policy, isRequired, isIncluded, customText));
    });
  }

  function _createPolicyBlock(policy, isRequired, isIncluded, customText) {
    const block    = document.createElement('div');
    const toggleId = `pol-toggle-${policy.id}`;
    const bodyId   = `pol-body-${policy.id}`;
    block.className = `policy-block policy-block--${isRequired ? 'required' : 'optional'}${!isRequired && !isIncluded ? ' policy-block--off' : ''}`;
    block.dataset.policyId = policy.id;

    block.innerHTML = `
      <div class="policy-block__header" role="button" aria-expanded="false"
           aria-controls="${bodyId}" tabindex="0">
        <span class="policy-block__label">${Utils.escapeHtml(policy.label)}</span>
        <span class="policy-block__badge policy-block__badge--${isRequired ? 'required' : 'optional'}">
          ${isRequired ? 'Required' : 'Optional'}
        </span>
        ${isRequired ? '' : `
          <label class="policy-block__toggle" title="Include this policy">
            <input type="checkbox" id="${toggleId}" ${isIncluded ? 'checked' : ''}
                   aria-label="Include ${Utils.escapeHtml(policy.label)}" />
            <span class="policy-block__toggle-track" aria-hidden="true"></span>
          </label>
        `}
        <button type="button" class="policy-block__expand"
                aria-expanded="false" aria-controls="${bodyId}"
                aria-label="Expand ${Utils.escapeHtml(policy.label)}">&#9660;</button>
      </div>
      <div id="${bodyId}" class="policy-block__body" hidden>
        ${isRequired
          ? `<div class="policy-block__preview">${Utils.escapeHtml(customText).substring(0, 300)}${customText.length > 300 ? '…' : ''}</div>`
          : `<textarea class="policy-block__editor" aria-label="Edit ${Utils.escapeHtml(policy.label)}" rows="8">${Utils.escapeHtml(customText)}</textarea>`
        }
      </div>
    `;

    const header    = block.querySelector('.policy-block__header');
    const body      = block.querySelector(`#${bodyId}`);
    const expandBtn = block.querySelector('.policy-block__expand');

    function toggleExpand() {
      const isOpen = !body.hidden;
      body.hidden  = isOpen;
      expandBtn.setAttribute('aria-expanded', String(!isOpen));
      header.setAttribute('aria-expanded', String(!isOpen));
    }

    header.addEventListener('click', e => {
      if (e.target.closest('.policy-block__toggle')) return;
      toggleExpand();
    });
    header.addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('.policy-block__toggle')) {
        e.preventDefault();
        toggleExpand();
      }
    });

    if (!isRequired) {
      const toggleInput = block.querySelector(`#${toggleId}`);
      const editor      = block.querySelector('.policy-block__editor');
      if (toggleInput) {
        toggleInput.addEventListener('change', () => {
          const included = toggleInput.checked;
          block.classList.toggle('policy-block--off', !included);
          if (editor) editor.disabled = !included;
          _syncDivisionPolicies();
        });
        if (editor) {
          editor.disabled = !isIncluded;
          editor.addEventListener('input', Utils.debounce(_syncDivisionPolicies, 400));
        }
      }
    }

    return block;
  }

  function _syncDivisionPolicies() {
    const divisionPolicies = {};
    document.querySelectorAll('#division-policies-list .policy-block').forEach(block => {
      const id       = block.dataset.policyId;
      const policy   = Config.getPolicyById(id);
      if (!policy) return;
      const isReq    = policy.status === 'required';
      const toggle   = block.querySelector('.policy-block__toggle input');
      const editor   = block.querySelector('.policy-block__editor');
      divisionPolicies[id] = {
        included:   isReq ? true : (toggle ? toggle.checked : false),
        customText: editor ? editor.value : policy.content,
      };
    });
    State.set({ divisionPolicies });
  }

  /* ── Custom Course Policies ────────────────────────────────────────── */

  function _renderCustomPolicies() {
    const list = document.getElementById('custom-policies-list');
    list.innerHTML = '';
    const policies = _getCustomPoliciesFromState();
    policies.forEach((p, idx) => _appendPolicyCard(list, p, idx));
  }

  function _appendPolicyCard(list, policy, idx) {
    const card = document.createElement('div');
    card.className = 'custom-policy-card';
    card.dataset.idx = idx;

    card.innerHTML = `
      <div class="custom-policy-card__header">
        <span class="custom-policy-card__drag" aria-hidden="true" title="Policy">&#9776;</span>
        <input
          type="text"
          class="custom-policy-card__title-input"
          placeholder="Policy title…"
          value="${Utils.escapeHtml(policy.title || '')}"
          aria-label="Policy title"
        />
        <button type="button" class="custom-policy-card__remove"
                aria-label="Remove this policy" title="Remove">&#x2715;</button>
      </div>
      <div class="custom-policy-card__body">
        <textarea
          class="custom-policy-card__content-input"
          rows="4"
          placeholder="Policy text… (supports **bold**, *italic*, and - bullet lists)"
          aria-label="Policy content"
        >${Utils.escapeHtml(policy.content || '')}</textarea>
      </div>
    `;

    const titleInput   = card.querySelector('.custom-policy-card__title-input');
    const contentInput = card.querySelector('.custom-policy-card__content-input');
    const removeBtn    = card.querySelector('.custom-policy-card__remove');

    titleInput.addEventListener('input',   Utils.debounce(_syncCustomPolicies, 300));
    contentInput.addEventListener('input', Utils.debounce(_syncCustomPolicies, 300));
    removeBtn.addEventListener('click', () => {
      card.remove();
      _syncCustomPolicies();
    });

    list.appendChild(card);
  }

  function _syncCustomPolicies() {
    const policies = [];
    document.querySelectorAll('#custom-policies-list .custom-policy-card').forEach(card => {
      const title   = card.querySelector('.custom-policy-card__title-input').value.trim();
      const content = card.querySelector('.custom-policy-card__content-input').value.trim();
      if (title || content) policies.push({ title, content });
    });
    State.set({ customPolicies: policies });
  }

  function _addCustomPolicy() {
    const list = document.getElementById('custom-policies-list');
    const idx  = list.querySelectorAll('.custom-policy-card').length;
    _appendPolicyCard(list, { title: '', content: '' }, idx);
    // Focus the new title input
    const cards = list.querySelectorAll('.custom-policy-card');
    cards[cards.length - 1].querySelector('.custom-policy-card__title-input').focus();
    _syncCustomPolicies();
  }

  function _getCustomPoliciesFromState() {
    const raw = State.get().customPolicies;
    // Backward-compat: old format was a markdown string — migrate on the fly
    if (typeof raw === 'string' && raw.trim()) {
      return _migrateStringToArray(raw);
    }
    return Array.isArray(raw) ? raw : [];
  }

  /**
   * Migrate old single-string format (## headings separated by ---) to the new array format.
   */
  function _migrateStringToArray(md) {
    const sections = md.split(/\n---\n/);
    return sections.map(sec => {
      const lines   = sec.trim().split('\n');
      const heading = lines[0];
      const title   = heading.startsWith('## ') ? heading.slice(3).trim()
                    : heading.startsWith('# ')  ? heading.slice(2).trim()
                    : '';
      const content = (title ? lines.slice(1) : lines).join('\n').trim();
      return { title, content };
    }).filter(p => p.title || p.content);
  }

  /* ── Init ──────────────────────────────────────────────────────────── */

  function init() {
    _renderDivisionPolicies();
    _renderCustomPolicies();
    _restoreFromState();

    document.getElementById('btn-add-custom-policy')
      .addEventListener('click', _addCustomPolicy);
  }

  function _restoreFromState() {
    const s = State.get();
    // Division policies
    document.querySelectorAll('#division-policies-list .policy-block').forEach(block => {
      const id     = block.dataset.policyId;
      const saved  = s.divisionPolicies[id];
      if (!saved) return;
      const toggle = block.querySelector('.policy-block__toggle input');
      const editor = block.querySelector('.policy-block__editor');
      if (toggle) {
        toggle.checked = saved.included;
        block.classList.toggle('policy-block--off', !saved.included);
        if (editor) editor.disabled = !saved.included;
      }
      if (editor && saved.customText !== undefined) editor.value = saved.customText;
    });
    // Custom policies are rendered directly from state in _renderCustomPolicies
  }

  function isComplete() {
    return true;
  }

  return { init, isComplete };
})();
