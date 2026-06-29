/**
 * s9-genai.js — Section 9: Generative AI Policy
 */
const S9 = (() => {
  const EXAM_NOTE = '\n\n---\n\n**Note:** Regardless of the above policy, no AI tools of any kind are permitted during quizzes, exams, or any other timed in-class assessments unless the instructor explicitly states otherwise for a specific assessment.';

  function init() {
    const genAiEl = document.getElementById('genAiText');
    MarkdownEditor.init(genAiEl, {
      onChange: Utils.debounce(_syncText, 400),
    });

    document.getElementById('genAiTier').addEventListener('change', _onTierChange);
    _restoreFromState();
  }

  function _onTierChange() {
    const sel = document.getElementById('genAiTier');
    const tier = sel.value;
    State.set({ genAiTier: tier });

    if (!tier || tier === 'custom') {
      MarkdownEditor.setValue(document.getElementById('genAiText'), '');
      State.set({ genAiText: '' });
      return;
    }

    const policy = Config.getPolicyById(tier);
    if (policy) {
      // Strip the first heading line (## ...) from the content since the
      // syllabus section already provides the "Generative AI Policy" heading.
      const stripped = policy.content.replace(/^##[^\n]*\n\n?/, '');
      const text = tier.startsWith('gen-ai-level-') && tier !== 'gen-ai-level-5'
        ? stripped + EXAM_NOTE
        : stripped;
      MarkdownEditor.setValue(document.getElementById('genAiText'), text);
      State.set({ genAiText: text });
    }
  }

  function _syncText() {
    State.set({ genAiText: MarkdownEditor.getValue(document.getElementById('genAiText')) });
  }

  function _restoreFromState() {
    const s = State.get();
    if (s.genAiTier) document.getElementById('genAiTier').value = s.genAiTier;
    if (s.genAiText) MarkdownEditor.setValue(document.getElementById('genAiText'), s.genAiText);
  }

  function isComplete() {
    const s = State.get();
    return !!(s.genAiTier && s.genAiText);
  }

  return { init, isComplete };
})();
