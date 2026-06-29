/**
 * markdown-editor.js — EasyMDE wrapper for markdown textareas.
 */
const MarkdownEditor = (() => {
  const instances = new WeakMap();

  const DEFAULT_TOOLBAR = [
    'bold', 'italic', 'heading', '|',
    'quote', 'unordered-list', 'ordered-list', '|',
    'link', 'table', '|',
    'preview', 'side-by-side', 'fullscreen', '|',
    'guide',
  ];

  const COMPACT_TOOLBAR = [
    'bold', 'italic', '|',
    'unordered-list', 'ordered-list', '|',
    'link', 'preview',
  ];

  function init(textarea, options = {}) {
    if (!textarea || instances.has(textarea)) return instances.get(textarea);
    if (typeof EasyMDE === 'undefined') {
      console.warn('EasyMDE is not loaded; markdown fields will use plain textareas.');
      return null;
    }

    const {
      compact = false,
      minHeight = compact ? '120px' : '180px',
      onChange = null,
    } = options;

    const editor = new EasyMDE({
      element: textarea,
      spellChecker: false,
      status: compact ? false : ['lines', 'words'],
      minHeight,
      toolbar: compact ? COMPACT_TOOLBAR : DEFAULT_TOOLBAR,
      autosave: { enabled: false },
      renderingConfig: {
        singleLineBreaks: false,
        codeSyntaxHighlighting: false,
      },
    });

    if (compact) {
      editor.codemirror.getWrapperElement().closest('.EasyMDEContainer')
        ?.classList.add('markdown-editor--compact');
    }

    if (onChange) {
      editor.codemirror.on('change', onChange);
    }

    instances.set(textarea, editor);
    return editor;
  }

  function get(textarea) {
    return instances.get(textarea) || null;
  }

  function getValue(textarea) {
    if (!textarea) return '';
    const editor = instances.get(textarea);
    return editor ? editor.value() : textarea.value;
  }

  function setValue(textarea, value) {
    if (!textarea) return;
    const editor = instances.get(textarea);
    if (editor) editor.value(value || '');
    else textarea.value = value || '';
  }

  function setDisabled(textarea, disabled) {
    if (!textarea) return;
    const editor = instances.get(textarea);
    if (editor) {
      editor.codemirror.setOption('readOnly', disabled);
      editor.codemirror.getWrapperElement().closest('.EasyMDEContainer')
        ?.classList.toggle('markdown-editor--disabled', disabled);
    } else {
      textarea.disabled = disabled;
    }
  }

  function refresh(textarea) {
    const editor = instances.get(textarea);
    if (editor) editor.codemirror.refresh();
  }

  function destroy(textarea) {
    const editor = instances.get(textarea);
    if (!editor) return;
    editor.toTextArea();
    instances.delete(textarea);
  }

  return { init, get, getValue, setValue, setDisabled, refresh, destroy };
})();
