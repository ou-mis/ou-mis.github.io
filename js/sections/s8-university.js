/**
 * s8-university.js — Section 8: University Policies
 */
const S8 = (() => {
  function init() {
    _renderUniversityPolicies();
    _restoreFromState();
  }

  function _renderUniversityPolicies() {
    const container = document.getElementById('university-policies-list');
    container.innerHTML = '';
    const policies = Config.getPoliciesByCategory('university');
    const saved = State.get().universityPolicies;

    policies.forEach(policy => {
      const isRequired = policy.status === 'required';
      const isIncluded = isRequired
        ? true
        : (saved[policy.id] !== undefined ? saved[policy.id].included : true); // optional: on by default

      const block = _createBlock(policy, isRequired, isIncluded);
      container.appendChild(block);
    });
  }

  function _policyLastUpdatedHtml(policy) {
    if (!policy.lastUpdated) return '';
    const formatted = Utils.formatPolicyLastUpdated(policy.lastUpdated);
    if (!formatted) return '';
    return `<span class="policy-block__updated">Last updated ${Utils.escapeHtml(formatted)}</span>`;
  }

  function _createBlock(policy, isRequired, isIncluded) {
    const block = document.createElement('div');
    block.className = `policy-block policy-block--${isRequired ? 'required' : 'optional'} ${!isRequired && !isIncluded ? 'policy-block--off' : ''}`;
    block.dataset.policyId = policy.id;

    const bodyId   = `upol-body-${policy.id}`;
    const toggleId = `upol-toggle-${policy.id}`;

    block.innerHTML = `
      <div class="policy-block__header" role="button" aria-expanded="false" aria-controls="${bodyId}" tabindex="0">
        <div class="policy-block__title">
          <span class="policy-block__label">${Utils.escapeHtml(policy.label)}</span>
          ${_policyLastUpdatedHtml(policy)}
        </div>
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
        <div class="policy-block__preview" style="white-space:pre-wrap; font-size:0.8rem; color:var(--color-gray-700)">${Utils.escapeHtml(policy.content)}</div>
      </div>
    `;

    const header   = block.querySelector('.policy-block__header');
    const body     = block.querySelector(`#${bodyId}`);
    const expandBtn = block.querySelector('.policy-block__expand');

    function toggleExpand() {
      const isOpen = !body.hidden;
      body.hidden = isOpen;
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
      if (toggleInput) {
        toggleInput.addEventListener('change', () => {
          block.classList.toggle('policy-block--off', !toggleInput.checked);
          _sync();
        });
      }
    }

    return block;
  }

  function _sync() {
    const blocks = document.querySelectorAll('#university-policies-list .policy-block');
    const universityPolicies = {};
    blocks.forEach(block => {
      const id = block.dataset.policyId;
      const policy = Config.getPolicyById(id);
      if (!policy) return;
      const toggleInput = block.querySelector('.policy-block__toggle input');
      universityPolicies[id] = {
        included: policy.status === 'required' ? true : (toggleInput ? toggleInput.checked : true),
      };
    });
    State.set({ universityPolicies });
  }

  function _restoreFromState() {
    const saved = State.get().universityPolicies;
    const blocks = document.querySelectorAll('#university-policies-list .policy-block');
    blocks.forEach(block => {
      const id = block.dataset.policyId;
      const savedPol = saved[id];
      if (!savedPol) return;
      const toggleInput = block.querySelector('.policy-block__toggle input');
      if (toggleInput) {
        toggleInput.checked = savedPol.included;
        block.classList.toggle('policy-block--off', !savedPol.included);
      }
    });
  }

  function isComplete() {
    return true;
  }

  return { init, isComplete };
})();
