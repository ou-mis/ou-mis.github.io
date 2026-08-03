const DATA_URL = "./data/courses.json";
const SYLLABI_BASE = "./syllabi/";

const state = {
  courses: [],
  meta: null,
  query: "",
  selectedCode: "",
  semester: "all",
  lastFocused: null,
};

const els = {
  list: document.getElementById("course-list"),
  meta: document.getElementById("results-meta"),
  empty: document.getElementById("empty-state"),
  error: document.getElementById("error-state"),
  search: document.getElementById("course-search"),
  select: document.getElementById("course-select"),
  suggestions: document.getElementById("course-suggestions"),
  clearSearch: document.getElementById("clear-search"),
  resetFilters: document.getElementById("reset-filters"),
  filterTabs: [...document.querySelectorAll(".filter-tab")],
  modal: document.getElementById("syllabus-modal"),
  modalCode: document.getElementById("syllabus-modal-code"),
  modalTitle: document.getElementById("syllabus-modal-title"),
  frame: document.getElementById("syllabus-frame"),
  fallback: document.getElementById("syllabus-fallback"),
  loading: document.getElementById("syllabus-loading"),
  download: document.getElementById("syllabus-download"),
  openTab: document.getElementById("syllabus-open-tab"),
};

function detectEmbed() {
  const params = new URLSearchParams(window.location.search);
  const forced = params.get("embed") === "1" || params.get("embed") === "true";
  const framed = window.self !== window.top;
  if (forced || framed) {
    document.body.classList.add("is-embed");
  }
}

function debounce(fn, wait = 180) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function syllabusUrl(filename) {
  return `${SYLLABI_BASE}${encodeURIComponent(filename)}`;
}

function matchesQuery(course, query) {
  if (!query) return true;
  const haystack = [
    course.code,
    course.title,
    course.instructor,
    ...(course.prerequisites || []),
    ...(course.semesters || []),
    ...(course.learningOutcomes || []),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function matchesSemester(course, semester) {
  if (semester === "all") return true;
  return (course.semesters || []).includes(semester);
}

function getFilteredCourses() {
  const q = state.query.trim().toLowerCase();
  return state.courses.filter((course) => {
    if (!matchesSemester(course, state.semester)) return false;
    if (state.selectedCode) return course.code === state.selectedCode;
    return matchesQuery(course, q);
  });
}

function populateCoursePicker() {
  if (!els.select || !els.suggestions) return;

  const options = state.courses
    .map(
      (course) =>
        `<option value="${escapeHtml(course.code)}">${escapeHtml(course.code)} — ${escapeHtml(course.title)}</option>`
    )
    .join("");

  els.select.innerHTML = `<option value="">All courses</option>${options}`;

  els.suggestions.innerHTML = state.courses
    .map(
      (course) =>
        `<option value="${escapeHtml(course.code)}" label="${escapeHtml(course.title)}"></option>
         <option value="${escapeHtml(course.title)}"></option>`
    )
    .join("");
}

function renderPrereqs(prereqs) {
  if (!prereqs || prereqs.length === 0) {
    return `<span class="chip chip--none">None</span>`;
  }
  return prereqs.map((p) => `<span class="chip chip--prereq">${escapeHtml(p)}</span>`).join("");
}

function renderSemesters(semesters) {
  return (semesters || [])
    .map((s) => `<span class="chip chip--sem">${escapeHtml(s)}</span>`)
    .join("");
}

function renderLearningOutcomes(outcomes) {
  const list = Array.isArray(outcomes) ? outcomes : [];
  if (list.length === 0) {
    return `
      <details class="course__plos course__plos--empty">
        <summary class="course__plos-toggle">
          <span>Learning outcomes</span>
          <span class="course__plos-count">None listed</span>
        </summary>
        <p class="course__plos-empty">No program learning outcomes have been added for this course yet.</p>
      </details>
    `;
  }

  const items = list.map((outcome) => `<li>${escapeHtml(outcome)}</li>`).join("");
  return `
    <details class="course__plos">
      <summary class="course__plos-toggle">
        <span>Learning outcomes</span>
        <span class="course__plos-count">${list.length}</span>
      </summary>
      <ol class="course__plos-list">${items}</ol>
    </details>
  `;
}

function courseCard(course, index) {
  const delay = Math.min(index * 30, 240);
  return `
    <article class="course" role="listitem" style="animation-delay: ${delay}ms">
      <div class="course__top">
        <p class="course__code">${escapeHtml(course.code)}</p>
        <div class="course__terms" aria-label="Semesters">${renderSemesters(course.semesters)}</div>
      </div>
      <h3 class="course__title">${escapeHtml(course.title)}</h3>
      <p class="course__instructor"><strong>Lead</strong> · ${escapeHtml(course.instructor)}</p>
      <div class="course__prereqs" aria-label="Prerequisites">
        <span class="course__label">Prereqs</span>
        ${renderPrereqs(course.prerequisites)}
      </div>
      ${renderLearningOutcomes(course.learningOutcomes)}
      <div class="course__actions">
        <button
          type="button"
          class="btn btn--primary"
          data-view-syllabus
          data-code="${escapeHtml(course.code)}"
          data-title="${escapeHtml(course.title)}"
          data-file="${escapeHtml(course.syllabus)}"
        >
          View
        </button>
        <a
          class="btn btn--ghost"
          href="${syllabusUrl(course.syllabus)}"
          download="${escapeHtml(course.syllabus)}"
        >
          Download
        </a>
      </div>
    </article>
  `;
}

function render() {
  const filtered = getFilteredCourses();
  const total = state.courses.length;

  els.error.hidden = true;

  if (filtered.length === 0) {
    els.list.innerHTML = "";
    els.empty.hidden = false;
    els.meta.innerHTML =
      total === 0
        ? "No courses loaded."
        : `Showing <strong>0</strong> of <strong>${total}</strong> courses`;
    return;
  }

  els.empty.hidden = true;
  els.list.innerHTML = filtered.map((c, i) => courseCard(c, i)).join("");
  els.meta.innerHTML = `Showing <strong>${filtered.length}</strong> of <strong>${total}</strong> courses`;
}

function setSemester(semester) {
  state.semester = semester;
  els.filterTabs.forEach((tab) => {
    const active = tab.dataset.semester === semester;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-pressed", String(active));
  });
  render();
}

function setQuery(value, { keepSelect = false } = {}) {
  state.query = value;
  els.clearSearch.hidden = value.trim().length === 0;
  if (!keepSelect && value.trim() && state.selectedCode) {
    state.selectedCode = "";
    if (els.select) els.select.value = "";
  }
  render();
}

function setSelectedCourse(code) {
  state.selectedCode = code || "";
  if (els.select) els.select.value = state.selectedCode;
  if (state.selectedCode) {
    els.search.value = "";
    state.query = "";
    els.clearSearch.hidden = true;
  }
  render();
}

function resetFilters() {
  els.search.value = "";
  state.query = "";
  els.clearSearch.hidden = true;
  setSelectedCourse("");
  setSemester("all");
  els.select?.focus();
}

function viewerUrl(syllabusPath) {
  const params = new URLSearchParams({ file: syllabusPath });
  return `./viewer.html?${params.toString()}`;
}

function setPreviewState({ loading = false, fallback = false } = {}) {
  if (els.loading) els.loading.hidden = !loading;
  if (els.fallback) els.fallback.hidden = !fallback;
  if (els.frame) els.frame.hidden = false;
}

async function openSyllabus({ code, title, file }, trigger) {
  const pdfPath = syllabusUrl(file);
  const previewPath = viewerUrl(pdfPath);
  state.lastFocused = trigger || document.activeElement;

  els.modalCode.textContent = code;
  els.modalTitle.textContent = title;
  els.download.href = pdfPath;
  els.download.setAttribute("download", file);
  els.openTab.href = pdfPath;
  els.openTab.removeAttribute("download");

  setPreviewState({ loading: true });
  els.frame.src = "about:blank";
  els.modal.hidden = false;
  document.body.classList.add("modal-open");
  els.modal.querySelector(".modal__close")?.focus();

  try {
    const res = await fetch(pdfPath, { cache: "no-cache" });
    if (!res.ok) {
      setPreviewState({ fallback: true });
      return;
    }

    // Dedicated PDF.js page inside the modal — more reliable than native PDF iframes.
    els.frame.onload = () => setPreviewState({});
    els.frame.src = previewPath;
  } catch (err) {
    console.error("Syllabus preview failed:", err);
    setPreviewState({ fallback: true });
  }
}

function closeSyllabus() {
  if (els.modal.hidden) return;
  els.modal.hidden = true;
  document.body.classList.remove("modal-open");
  els.frame.onload = null;
  els.frame.src = "about:blank";
  setPreviewState({});
  if (state.lastFocused && typeof state.lastFocused.focus === "function") {
    state.lastFocused.focus();
  }
}

function bindEvents() {
  els.search.addEventListener(
    "input",
    debounce((e) => setQuery(e.target.value))
  );

  els.select?.addEventListener("change", (e) => {
    setSelectedCourse(e.target.value);
  });

  els.clearSearch.addEventListener("click", () => {
    els.search.value = "";
    setQuery("");
    els.search.focus();
  });

  els.resetFilters?.addEventListener("click", resetFilters);

  els.filterTabs.forEach((tab) => {
    tab.addEventListener("click", () => setSemester(tab.dataset.semester));
  });

  els.list.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-view-syllabus]");
    if (!btn) return;
    openSyllabus(
      {
        code: btn.dataset.code,
        title: btn.dataset.title,
        file: btn.dataset.file,
      },
      btn
    );
  });

  els.modal.querySelectorAll("[data-close-modal]").forEach((node) => {
    node.addEventListener("click", closeSyllabus);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSyllabus();
  });

  els.frame?.addEventListener("error", () => {
    setPreviewState({ fallback: true });
  });
}

async function init() {
  detectEmbed();
  bindEvents();

  try {
    const res = await fetch(DATA_URL, { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.meta = data.meta || {};
    state.courses = Array.isArray(data.courses) ? data.courses : [];

    if (state.meta.pageTitle) {
      document.title = `${state.meta.pageTitle} | Price College of Business | University of Oklahoma`;
    }

    populateCoursePicker();
    render();
  } catch (err) {
    console.error("Failed to load courses:", err);
    els.meta.textContent = "Could not load course data.";
    els.empty.hidden = true;
    els.error.hidden = false;
  }
}

init();
