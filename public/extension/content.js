/* WebMCP Inspector – Webfuse extension content script
   Runs inside the proxied page. Communicates with the host React app
   via webfuse.currentSession.sendMessage / .on('message'). */

let highlightedForm = null;
let highlightTimer = null;
let savedOutline = '';
let savedBoxShadow = '';
let savedTransition = '';
let imperativeTools = [];
let imperativeToolHandlers = {}; // name → full tool object (with handler)
let isAnimating = false;

// ── Imperative API Watcher ──────────────────────────────────────────
if (typeof navigator !== 'undefined' && 'modelContext' in navigator) {
  const originalRegisterTool = navigator.modelContext.registerTool;
  navigator.modelContext.registerTool = function (tool) {
    imperativeTools.push({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    });
    imperativeToolHandlers[tool.name] = tool;
    sendToolsUpdate();
    return originalRegisterTool.apply(this, arguments);
  };
}

// ── navigator.modelContextTesting API ───────────────────────────────
(function () {
  function buildFormToolSchema(form, formIndex) {
    var toolname = form.getAttribute('toolname') || '';
    var tooldescription = form.getAttribute('tooldescription') || '';
    if (!toolname) return null;

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
      _type: 'form',
      _formIndex: formIndex,
    };
  }

  function listTools() {
    var tools = [];

    // Collect form-based (declarative) tools
    var forms = document.querySelectorAll('form');
    forms.forEach(function (form, index) {
      var schema = buildFormToolSchema(form, index);
      if (schema) {
        tools.push({
          name: schema.name,
          description: schema.description,
          inputSchema: schema.inputSchema,
          type: 'form',
        });
      }
    });

    // Collect imperative tools
    imperativeTools.forEach(function (tool) {
      tools.push({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        type: 'imperative',
      });
    });

    return tools;
  }

  function executeFormTool(toolname, args) {
    var forms = document.querySelectorAll('form');
    var targetForm = null;

    for (var i = 0; i < forms.length; i++) {
      if (forms[i].getAttribute('toolname') === toolname) {
        targetForm = forms[i];
        break;
      }
    }

    if (!targetForm) {
      return Promise.reject(new Error('Form tool "' + toolname + '" not found'));
    }

    var fields = targetForm.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea'
    );

    // Map args to fields by toolparamtitle, name, or id
    if (args && typeof args === 'object') {
      fields.forEach(function (field) {
        var paramKey =
          field.getAttribute('toolparamtitle') ||
          field.getAttribute('name') ||
          field.id;
        if (!paramKey || !(paramKey in args)) return;

        var value = args[paramKey];
        var type = field.getAttribute('type') || 'text';

        if (type === 'checkbox') {
          field.checked = !!value;
        } else if (field.tagName === 'SELECT') {
          field.value = String(value);
        } else {
          field.value = String(value);
        }

        // Dispatch events so frameworks pick up the change
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }

    // Submit the form
    var autosubmit = targetForm.getAttribute('toolautosubmit');
    if (autosubmit === 'false') {
      return Promise.resolve({ submitted: false, message: 'Fields filled, auto-submit disabled' });
    }

    // Try clicking a submit button first, then fall back to form.submit()
    var submitBtn = targetForm.querySelector(
      'button[type="submit"], input[type="submit"], button:not([type])'
    );
    if (submitBtn) {
      submitBtn.click();
    } else {
      targetForm.submit();
    }

    return Promise.resolve({ submitted: true });
  }

  function executeTool(name, args) {
    if (!name || typeof name !== 'string') {
      return Promise.reject(new Error('Tool name is required'));
    }

    // Check imperative tools first
    var handler = imperativeToolHandlers[name];
    if (handler) {
      try {
        var result = typeof handler.handler === 'function'
          ? handler.handler(args || {})
          : typeof handler.execute === 'function'
            ? handler.execute(args || {})
            : typeof handler.callback === 'function'
              ? handler.callback(args || {})
              : undefined;
        return Promise.resolve(result);
      } catch (err) {
        return Promise.reject(err);
      }
    }

    // Check form-based tools
    return executeFormTool(name, args);
  }

  // Expose on navigator.modelContextTesting
  if (typeof navigator !== 'undefined') {
    try {
      Object.defineProperty(navigator, 'modelContextTesting', {
        value: Object.freeze({
          listTools: listTools,
          executeTool: executeTool,
        }),
        writable: false,
        enumerable: true,
        configurable: true,
      });
    } catch (e) {
      // Fallback: simple assignment if defineProperty is restricted
      try {
        navigator.modelContextTesting = Object.freeze({
          listTools: listTools,
          executeTool: executeTool,
        });
      } catch (e2) {
        console.warn('[WebMCP content.js] Could not define navigator.modelContextTesting:', e2);
      }
    }
  }
})();

// ── Scan Animation ──────────────────────────────────────────────────
function showScanAnimation() {
  if (isAnimating) return;
  isAnimating = true;

  // Remove any leftover overlay
  var old = document.getElementById('webmcp-scan-overlay');
  if (old && old.parentNode) old.parentNode.removeChild(old);

  // Inject keyframes once
  if (!document.getElementById('webmcp-scan-style')) {
    var style = document.createElement('style');
    style.id = 'webmcp-scan-style';
    style.textContent =
      '@keyframes webmcp-dust-shimmer{0%{opacity:0.5;filter:blur(32px)}50%{opacity:0.85;filter:blur(22px)}100%{opacity:0.5;filter:blur(32px)}}' +
      '@keyframes webmcp-form-glow-in{0%{box-shadow:0 0 0 0 rgba(59,130,246,0),0 0 0 0 rgba(59,130,246,0)}' +
      '40%{box-shadow:0 0 0 3px rgba(59,130,246,0.35),0 0 20px 4px rgba(99,160,255,0.18)}' +
      '100%{box-shadow:0 0 0 3px rgba(59,130,246,0.35),0 0 20px 4px rgba(99,160,255,0.18)}}' +
      '@keyframes webmcp-form-glow-out{0%{box-shadow:0 0 0 3px rgba(59,130,246,0.35),0 0 20px 4px rgba(99,160,255,0.18)}' +
      '100%{box-shadow:0 0 0 0 rgba(59,130,246,0),0 0 0 0 rgba(59,130,246,0)}}';
    document.head.appendChild(style);
  }

  // Create the dust cloud element — 65% of viewport, dispersed light-blue dust
  var cloudHeight = Math.round(window.innerHeight * 0.65);
  var dust = document.createElement('div');
  dust.id = 'webmcp-scan-overlay';
  dust.style.cssText =
    'position:fixed;left:0;right:0;height:' + cloudHeight + 'px;z-index:2147483647;pointer-events:none;' +
    'top:-' + cloudHeight + 'px;' +
    'background:' +
    'radial-gradient(ellipse 60% 35% at 20% 30%, rgba(147,197,253,0.25) 0%, transparent 70%),' +
    'radial-gradient(ellipse 50% 30% at 75% 55%, rgba(147,197,253,0.22) 0%, transparent 70%),' +
    'radial-gradient(ellipse 70% 25% at 45% 70%, rgba(130,180,255,0.18) 0%, transparent 70%),' +
    'radial-gradient(ellipse 40% 40% at 85% 25%, rgba(165,200,255,0.20) 0%, transparent 70%),' +
    'radial-gradient(ellipse 45% 35% at 30% 65%, rgba(140,190,255,0.16) 0%, transparent 70%),' +
    'linear-gradient(180deg,' +
    'transparent 0%,' +
    'rgba(147,197,253,0.08) 10%,' +
    'rgba(130,185,255,0.18) 30%,' +
    'rgba(120,175,255,0.24) 50%,' +
    'rgba(130,185,255,0.18) 70%,' +
    'rgba(147,197,253,0.08) 90%,' +
    'transparent 100%);' +
    'animation:webmcp-dust-shimmer 0.9s ease-in-out infinite;';
  document.documentElement.appendChild(dust);

  // Create the counter badge
  var badge = document.createElement('div');
  badge.id = 'webmcp-scan-badge';
  var discoveredCount = 0;
  var totalForms = document.querySelectorAll('form').length;
  badge.innerHTML =
    '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:rgba(59,130,246,0.8);margin-right:8px;vertical-align:middle;' +
    'box-shadow:0 0 6px rgba(59,130,246,0.4);transition:background 0.4s ease,box-shadow 0.4s ease" id="webmcp-badge-dot"></span>' +
    '<span id="webmcp-badge-text" style="vertical-align:middle">Tools discovered: 0</span>';
  badge.style.cssText =
    'position:fixed;top:16px;right:16px;z-index:2147483647;pointer-events:none;' +
    'padding:8px 16px;border-radius:12px;font-size:12px;font-weight:500;letter-spacing:0.02em;' +
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;' +
    'background:rgba(255,255,255,0.7);color:rgba(55,65,81,0.9);' +
    'border:1px solid rgba(59,130,246,0.12);' +
    'backdrop-filter:blur(16px) saturate(1.8);-webkit-backdrop-filter:blur(16px) saturate(1.8);' +
    'box-shadow:0 1px 3px rgba(0,0,0,0.04),0 8px 24px rgba(0,0,0,0.06);' +
    'transition:background 0.5s ease,color 0.5s ease,border-color 0.5s ease,box-shadow 0.5s ease,transform 0.2s ease;' +
    'transform:translateY(0);';
  document.documentElement.appendChild(badge);

  function updateBadge() {
    discoveredCount++;
    var textEl = document.getElementById('webmcp-badge-text');
    var dotEl = document.getElementById('webmcp-badge-dot');
    if (textEl) textEl.textContent = 'Tools discovered: ' + discoveredCount;

    // Subtle pop animation on each increment
    badge.style.transform = 'translateY(-1px) scale(1.03)';
    setTimeout(function () { badge.style.transform = 'translateY(0) scale(1)'; }, 200);

    if (discoveredCount >= totalForms) {
      badge.style.background = 'rgba(240,253,244,0.75)';
      badge.style.color = 'rgba(21,128,61,0.9)';
      badge.style.borderColor = 'rgba(22,163,74,0.15)';
      badge.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04),0 8px 24px rgba(22,163,74,0.08)';
      if (dotEl) {
        dotEl.style.background = 'rgba(22,163,74,0.8)';
        dotEl.style.boxShadow = '0 0 6px rgba(22,163,74,0.4)';
      }
    }
  }

  // Gather all forms and their document-top offsets
  var forms = document.querySelectorAll('form');
  var formData = [];
  forms.forEach(function (form) {
    var rect = form.getBoundingClientRect();
    var absTop = rect.top + window.scrollY;
    formData.push({ el: form, absTop: absTop, height: rect.height, highlighted: false });
  });
  formData.sort(function (a, b) { return a.absTop - b.absTop; });

  var totalHeight = document.documentElement.scrollHeight;
  var viewportHeight = window.innerHeight;
  var duration = Math.min(Math.max(totalHeight * 1.5, 1800), 6000);
  var startTime = null;
  var startScroll = window.scrollY;

  function animateFrame(timestamp) {
    if (!startTime) startTime = timestamp;
    var elapsed = timestamp - startTime;
    var progress = Math.min(elapsed / duration, 1);
    // Ease in-out cubic
    var eased = progress < 0.5
      ? 4 * progress * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 3) / 2;

    // Current scan position in document coordinates
    var scanY = eased * totalHeight;

    // Position the dust cloud relative to the viewport
    var scrollTarget = Math.max(0, scanY - viewportHeight * 0.35);
    scrollTarget = Math.min(scrollTarget, totalHeight - viewportHeight);
    window.scrollTo(0, scrollTarget);

    var dustViewportY = scanY - window.scrollY - cloudHeight * 0.5;
    dust.style.top = dustViewportY + 'px';

    // Highlight forms as the dust reaches them
    for (var i = 0; i < formData.length; i++) {
      var fd = formData[i];
      if (!fd.highlighted && scanY >= fd.absTop) {
        fd.highlighted = true;
        updateBadge();
        (function (el) {
          el.style.animation = 'none';
          el.style.animation = 'webmcp-form-glow-in 0.4s ease-out forwards';
          setTimeout(function () {
            el.style.animation = 'webmcp-form-glow-out 0.6s ease-in forwards';
            setTimeout(function () {
              el.style.animation = '';
              el.style.boxShadow = '';
            }, 600);
          }, 800);
        })(fd.el);
      }
    }

    if (progress < 1) {
      requestAnimationFrame(animateFrame);
    } else {
      // Fade out dust and badge
      dust.style.transition = 'opacity 0.3s ease-out';
      dust.style.opacity = '0';
      setTimeout(function () {
        badge.style.transition = 'opacity 0.5s ease-out';
        badge.style.opacity = '0';
      }, 800);
      setTimeout(function () {
        if (dust.parentNode) dust.parentNode.removeChild(dust);
        if (badge.parentNode) badge.parentNode.removeChild(badge);
        isAnimating = false;
      }, 1500);
    }
  }

  requestAnimationFrame(animateFrame);
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
function sendToolsUpdateQuiet() {
  var forms = scanForms();
  console.log('[WebMCP content.js] quiet update:', forms.length, 'forms');
  try {
    webfuse.currentSession.sendMessage({
      type: 'webmcp:tools-update',
      forms: forms,
      imperativeTools: imperativeTools,
    }, '*');
  } catch (e) {
    console.warn('[WebMCP content.js] sendMessage FAILED:', e);
  }
}

function sendToolsUpdate() {
  showScanAnimation();
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
      sendToolsUpdateQuiet();
      break;

    case 'webmcp:set-input-attr':
      setInputAttribute(
        data.formIndex,
        data.inputIndex,
        data.attrName,
        data.attrValue,
        data.isWebfuseApplied
      );
      sendToolsUpdateQuiet();
      break;

    case 'webmcp:apply-attrs':
      applyAttributes(data.forms);
      sendToolsUpdateQuiet();
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

    case 'webmcp:list-tools':
      try {
        var tools = navigator.modelContextTesting.listTools();
        webfuse.currentSession.sendMessage({
          type: 'webmcp:list-tools-result',
          requestId: data.requestId,
          tools: tools,
        }, '*');
      } catch (e) {
        console.warn('[WebMCP content.js] Failed to list tools:', e);
        webfuse.currentSession.sendMessage({
          type: 'webmcp:list-tools-result',
          requestId: data.requestId,
          error: e.message,
        }, '*');
      }
      break;

    case 'webmcp:execute-tool':
      navigator.modelContextTesting.executeTool(data.toolName, data.args)
        .then(function (result) {
          webfuse.currentSession.sendMessage({
            type: 'webmcp:execute-tool-result',
            requestId: data.requestId,
            toolName: data.toolName,
            result: result,
          }, '*');
        })
        .catch(function (err) {
          webfuse.currentSession.sendMessage({
            type: 'webmcp:execute-tool-result',
            requestId: data.requestId,
            toolName: data.toolName,
            error: err.message,
          }, '*');
        });
      break;
  }
}

// ── Bootstrap ───────────────────────────────────────────────────────
// ── Staging (webmcp-inspector-staging) ──
// var WIDGET_KEY = 'wk_88w0LdNQy0kxUZGRQgmtta30yaQ9rqJo';
// var SPACE_ID = '1872';
// ── Production (webmcpinspector) ──
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

    // Send the buffered scan that ran at content-script load time
    console.log('[WebMCP content.js] Sending buffered initial scan');
    sendToolsUpdate();

    // Re-scan on dynamic DOM changes (debounced)
    var debounceTimer = null;
    var observer = new MutationObserver(function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () {
        console.log('[WebMCP content.js] MutationObserver triggered rescan');
        sendToolsUpdateQuiet();
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
