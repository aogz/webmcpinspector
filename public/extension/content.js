/* WebMCP Inspector – Webfuse extension content script
   Runs inside the proxied page. Communicates with the host React app
   via webfuse.currentSession.sendMessage / .on('message'). */

let highlightedForm = null;
let highlightTimer = null;
let savedOutline = '';
let savedBoxShadow = '';
let savedTransition = '';
let imperativeTools = [];

// ── Imperative API Watcher ──────────────────────────────────────────
if (typeof navigator !== 'undefined' && 'modelContext' in navigator) {
  const originalRegisterTool = navigator.modelContext.registerTool;
  navigator.modelContext.registerTool = function (tool) {
    imperativeTools.push({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    });
    sendToolsUpdate();
    return originalRegisterTool.apply(this, arguments);
  };
}

// ── Form Scanning ───────────────────────────────────────────────────
function scanForms() {
  const forms = document.querySelectorAll('form');
  const results = [];

  forms.forEach(function (form, index) {
    const formId =
      form.id ||
      form.getAttribute('name') ||
      form.getAttribute('action') ||
      'Form #' + (index + 1);
    const toolname = form.getAttribute('toolname') || '';
    const tooldescription = form.getAttribute('tooldescription') || '';
    const toolautosubmit = form.getAttribute('toolautosubmit') || '';

    var inputs = [];
    var fields = form.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea'
    );
    fields.forEach(function (field, fieldIndex) {
      inputs.push({
        index: fieldIndex,
        tag: field.tagName.toLowerCase(),
        type:
          field.getAttribute('type') ||
          (field.tagName === 'SELECT'
            ? 'select'
            : field.tagName === 'TEXTAREA'
              ? 'textarea'
              : 'text'),
        name: field.getAttribute('name') || '',
        id: field.id || '',
        required: field.required,
        toolparamdescription: field.getAttribute('toolparamdescription') || '',
        toolparamtitle: field.getAttribute('toolparamtitle') || '',
        label: getLabelForField(field),
        webfuseApplied: field.hasAttribute('data-webfuse-webmcp-applied'),
      });
    });

    var hasWebMCP = !!(toolname && tooldescription);

    results.push({
      index: index,
      formId: formId,
      action: form.getAttribute('action') || '',
      method: (form.getAttribute('method') || 'GET').toUpperCase(),
      toolname: toolname,
      tooldescription: tooldescription,
      toolautosubmit: toolautosubmit,
      hasWebMCP: hasWebMCP,
      inputCount: inputs.length,
      inputs: inputs,
      webfuseApplied: form.hasAttribute('data-webfuse-webmcp-applied'),
    });
  });

  return results;
}

function getLabelForField(field) {
  if (field.id) {
    var label = document.querySelector('label[for="' + field.id + '"]');
    if (label) return label.textContent.trim();
  }
  var parent = field.closest('label');
  if (parent) return parent.textContent.trim().substring(0, 50);
  return '';
}

// ── Highlight ───────────────────────────────────────────────────────
function highlightForm(formIndex) {
  removeHighlight();
  var forms = document.querySelectorAll('form');
  var form = forms[formIndex];
  if (!form) return;

  form.scrollIntoView({ behavior: 'smooth', block: 'center' });

  highlightedForm = form;
  savedOutline = form.style.outline;
  savedBoxShadow = form.style.boxShadow;
  savedTransition = form.style.transition;

  form.style.transition =
    'outline-color 0.3s ease, box-shadow 0.3s ease';
  form.style.outline = '2px solid #3b82f6';
  form.style.outlineOffset = '4px';
  form.style.boxShadow =
    '0 0 0 6px rgba(59, 130, 246, 0.15), 0 0 24px rgba(59, 130, 246, 0.2)';

  clearTimeout(highlightTimer);
  highlightTimer = setTimeout(function () {
    form.style.outline = '2px solid transparent';
    form.style.boxShadow = savedBoxShadow;
    setTimeout(function () {
      removeHighlight();
    }, 300);
  }, 2500);
}

function removeHighlight() {
  if (highlightedForm) {
    highlightedForm.style.outline = savedOutline;
    highlightedForm.style.outlineOffset = '';
    highlightedForm.style.boxShadow = savedBoxShadow;
    highlightedForm.style.transition = savedTransition;
    highlightedForm = null;
  }
  clearTimeout(highlightTimer);
}

// ── Attribute Setters ───────────────────────────────────────────────
function setFormAttribute(formIndex, attrName, attrValue, isWebfuseApplied) {
  var forms = document.querySelectorAll('form');
  var form = forms[formIndex];
  if (!form) return false;

  if (attrValue) {
    form.setAttribute(attrName, attrValue);
  } else {
    form.removeAttribute(attrName);
  }

  if (isWebfuseApplied) {
    form.setAttribute('data-webmcp-webfuse-applied-' + attrName, 'true');
  } else {
    form.removeAttribute('data-webmcp-webfuse-applied-' + attrName);
  }

  var hasAny = ['toolname', 'tooldescription', 'toolautosubmit'].some(function (
    name
  ) {
    return form.hasAttribute('data-webmcp-webfuse-applied-' + name);
  });

  if (hasAny) {
    form.setAttribute('data-webfuse-webmcp-applied', 'true');
  } else {
    form.removeAttribute('data-webfuse-webmcp-applied');
  }

  return true;
}

function setInputAttribute(
  formIndex,
  inputIndex,
  attrName,
  attrValue,
  isWebfuseApplied
) {
  var forms = document.querySelectorAll('form');
  var form = forms[formIndex];
  if (!form) return false;
  var fields = form.querySelectorAll(
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea'
  );
  var field = fields[inputIndex];
  if (!field) return false;

  if (attrValue) {
    field.setAttribute(attrName, attrValue);
  } else {
    field.removeAttribute(attrName);
  }

  if (isWebfuseApplied) {
    field.setAttribute('data-webmcp-webfuse-applied-' + attrName, 'true');
  } else {
    field.removeAttribute('data-webmcp-webfuse-applied-' + attrName);
  }

  var hasAny = ['toolparamdescription', 'toolparamtitle'].some(function (name) {
    return field.hasAttribute('data-webmcp-webfuse-applied-' + name);
  });

  if (hasAny) {
    field.setAttribute('data-webfuse-webmcp-applied', 'true');
  } else {
    field.removeAttribute('data-webfuse-webmcp-applied');
  }

  return true;
}

function applyAttributes(formsData) {
  formsData.forEach(function (formUpdate) {
    var forms = document.querySelectorAll('form');
    var form = forms[formUpdate.index];
    if (!form) return;

    if (formUpdate.attributes) {
      for (var attrName in formUpdate.attributes) {
        var attr = formUpdate.attributes[attrName];
        setFormAttribute(formUpdate.index, attrName, attr.value, attr.webfuseApplied);
      }
    }

    if (formUpdate.inputs) {
      formUpdate.inputs.forEach(function (inputUpdate) {
        if (inputUpdate.attributes) {
          for (var attrName in inputUpdate.attributes) {
            var attr = inputUpdate.attributes[attrName];
            setInputAttribute(
              formUpdate.index,
              inputUpdate.index,
              attrName,
              attr.value,
              attr.webfuseApplied
            );
          }
        }
      });
    }
  });
  return { success: true };
}

// ── Schema Generation ───────────────────────────────────────────────
function getGeneratedSchema(formIndex) {
  var forms = document.querySelectorAll('form');
  var form = forms[formIndex];
  if (!form) return { error: 'Form not found' };

  var toolname = form.getAttribute('toolname') || 'form_' + formIndex;
  var tooldescription =
    form.getAttribute('tooldescription') || 'Submit form ' + formIndex;

  var properties = {};
  var required = [];

  var fields = form.querySelectorAll(
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea'
  );

  fields.forEach(function (field) {
    var name =
      field.getAttribute('toolparamtitle') ||
      field.getAttribute('name') ||
      field.id ||
      'field_' + Math.random().toString(36).slice(2, 6);
    var description =
      field.getAttribute('toolparamdescription') ||
      getLabelForField(field) ||
      name;
    var type = field.getAttribute('type') || 'text';

    var prop = { type: 'string', description: description };

    if (type === 'number' || type === 'range') {
      prop.type = 'number';
      if (field.min) prop.minimum = Number(field.min);
      if (field.max) prop.maximum = Number(field.max);
    } else if (type === 'checkbox') {
      prop.type = 'boolean';
    } else if (field.tagName === 'SELECT') {
      var options = [];
      field.querySelectorAll('option').forEach(function (opt) {
        if (opt.value) options.push(opt.value);
      });
      if (options.length) prop.enum = options;
    }

    if (field.placeholder) prop.examples = [field.placeholder];

    properties[name] = prop;
    if (field.required) required.push(name);
  });

  return {
    name: toolname,
    description: tooldescription,
    inputSchema: {
      type: 'object',
      properties: properties,
      required: required.length ? required : undefined,
    },
  };
}

// ── Load Webfuse SDK ────────────────────────────────────────────────
(function (w, e, b, f, u, s) {
  w[f] = w[f] || {
    initSpace: function () {
      return new Promise(function (resolve) {
        w[f].q = arguments;
        w[f].resolve = resolve;
      });
    },
  };
  u = e.createElement(b);
  s = e.getElementsByTagName(b)[0];
  u.async = 1;
  u.src = 'https://webfu.se/surfly.js';
  s.parentNode.insertBefore(u, s);
})(window, document, 'script', 'webfuse');

// ── Webfuse Messaging ───────────────────────────────────────────────
function sendToolsUpdate() {
  var forms = scanForms();
  console.log('[WebMCP content.js] scanForms result:', forms.length, 'forms found', forms);
  try {
    var msg = {
      type: 'webmcp:tools-update',
      forms: forms,
      imperativeTools: imperativeTools,
    };
    console.log('[WebMCP content.js] Sending tools-update via sendMessage');
    webfuse.currentSession.sendMessage(msg, '*');
    console.log('[WebMCP content.js] sendMessage succeeded');
  } catch (e) {
    console.warn('[WebMCP content.js] sendMessage FAILED:', e);
  }
}

function handleMessage(session, event) {
  console.log('[WebMCP content.js] handleMessage event:', event);

  var data = event && event.data ? event.data : event;
  // The host sends via session.sendMessage({message: payload}, origin)
  // so data may be the payload directly or wrapped in .message
  if (data && data.message && typeof data.message === 'object' && data.message.type) {
    data = data.message;
  }

  console.log('[WebMCP content.js] parsed data:', data);

  if (!data || typeof data.type !== 'string') return;
  if (!data.type.startsWith('webmcp:')) return;

  console.log('[WebMCP content.js] processing', data.type);

  switch (data.type) {
    case 'webmcp:scan':
      sendToolsUpdate();
      break;

    case 'webmcp:highlight':
      highlightForm(data.formIndex);
      break;

    case 'webmcp:set-form-attr':
      setFormAttribute(
        data.formIndex,
        data.attrName,
        data.attrValue,
        data.isWebfuseApplied
      );
      sendToolsUpdate();
      break;

    case 'webmcp:set-input-attr':
      setInputAttribute(
        data.formIndex,
        data.inputIndex,
        data.attrName,
        data.attrValue,
        data.isWebfuseApplied
      );
      sendToolsUpdate();
      break;

    case 'webmcp:apply-attrs':
      applyAttributes(data.forms);
      sendToolsUpdate();
      break;

    case 'webmcp:get-schema':
      var schema = getGeneratedSchema(data.formIndex);
      try {
        webfuse.currentSession.sendMessage({
          type: 'webmcp:schema',
          formIndex: data.formIndex,
          schema: schema,
        }, '*');
      } catch (e) {
        console.warn('[WebMCP content.js] Failed to send schema:', e);
      }
      break;
  }
}

// ── Bootstrap ───────────────────────────────────────────────────────
var WIDGET_KEY = 'wk_tqCYlFrDmS_UGqhLcI_Wn6Y1DDTMaTSQ';
var SPACE_ID = '1798';

(function waitForWebfuse() {
  if (typeof webfuse === 'undefined' || !webfuse.isInsideSession) {
    console.log('[WebMCP content.js] Waiting for webfuse SDK...',
      'exists:', typeof webfuse !== 'undefined',
      'isInsideSession:', typeof webfuse !== 'undefined' && webfuse.isInsideSession);
    setTimeout(waitForWebfuse, 200);
    return;
  }

  console.log('[WebMCP content.js] webfuse ready, isInsideSession=true. Calling initSpace...');

  webfuse.initSpace(WIDGET_KEY, SPACE_ID, {}).then(function () {
    console.log('[WebMCP content.js] initSpace resolved, currentSession:', !!webfuse.currentSession);

    if (!webfuse.currentSession) {
      console.warn('[WebMCP content.js] currentSession still null after initSpace');
      return;
    }

    console.log('[WebMCP content.js] Setting up message listener');
    webfuse.currentSession.on('message', handleMessage);

    // Initial scan after a short delay to let the page settle
    setTimeout(function () {
      console.log('[WebMCP content.js] Running initial sendToolsUpdate');
      sendToolsUpdate();
    }, 500);

    // Re-scan on dynamic DOM changes (debounced)
    var debounceTimer = null;
    var observer = new MutationObserver(function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () {
        console.log('[WebMCP content.js] MutationObserver triggered rescan');
        sendToolsUpdate();
      }, 1000);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    console.log('[WebMCP content.js] Bootstrap complete');
  }).catch(function (err) {
    console.error('[WebMCP content.js] initSpace failed:', err);
  });
})();
