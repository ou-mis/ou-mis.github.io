/**
 * config.js — Loads and caches semesters.json and policies.json.
 */
const Config = (() => {
  let _semesters = [];
  let _policies  = [];

  async function load() {
    const [semRes, polRes] = await Promise.all([
      fetch('config/semesters.json'),
      fetch('config/policies.json'),
    ]);
    _semesters = await semRes.json();
    _policies  = await polRes.json();
  }

  function getSemesters()  { return _semesters; }
  function getPolicies()   { return _policies; }

  function getSemesterByCode(termCode) {
    return _semesters.find(s => s.termCode === termCode) || null;
  }

  function getPoliciesByCategory(category) {
    return _policies.filter(p => p.category === category);
  }

  function getPolicyById(id) {
    return _policies.find(p => p.id === id) || null;
  }

  return { load, getSemesters, getPolicies, getSemesterByCode, getPoliciesByCategory, getPolicyById };
})();
