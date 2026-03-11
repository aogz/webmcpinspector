import './index.css'

declare const webfuse: any

const STORAGE_KEY = 'webmcp-overrides'
const URL_STORAGE_KEY = 'webmcp-last-url'
const WIDGET_KEY = import.meta.env.DEV
  ? 'wk_88w0LdNQy0kxUZGRQgmtta30yaQ9rqJo'
  : 'wk_tqCYlFrDmS_UGqhLcI_Wn6Y1DDTMaTSQ'
const SPACE_ID = import.meta.env.DEV ? '1872' : '1798'

// ── Types ────────────────────────────────────────────────────────────

interface FormInput {
  index: number; tag: string; type: string; name: string; id: string
  required: boolean; toolparamdescription: string; toolparamtitle: string
  label: string; webfuseApplied: boolean
}

interface FormTool {
  index: number; formId: string; action: string; method: string
  toolname: string; tooldescription: string; toolautosubmit: string
  hasWebMCP: boolean; inputCount: number; inputs: FormInput[]
  webfuseApplied: boolean
}

interface ImperativeTool {
  name: string; description: string; inputSchema: Record<string, unknown>
}

interface SavedFormOverride {
  formId: string
  attributes: Record<string, string>
  inputs: Record<string, Record<string, string>>
}

interface SchemaResponse {
  formIndex: number
  schema: { name: string; description: string; inputSchema: unknown }
}

// ── State ────────────────────────────────────────────────────────────

let isConnected = false
let isConnecting = false
let sessionObj: any = null
let liveSession: any = null
let currentForms: FormTool[] = []
let currentImperative: ImperativeTool[] = []
let currentSchema: SchemaResponse | null = null
let restoredUrl: string | null = null

// ── DOM refs ─────────────────────────────────────────────────────────

const $ = (sel: string) => document.querySelector(sel)!
const urlInput = $<HTMLInputElement>('#url-input') as HTMLInputElement
const connectBtn = $<HTMLButtonElement>('#connect-btn') as HTMLButtonElement
const connectBtnText = $('#connect-btn-text') as HTMLElement
const connectedBadge = $('#connected-badge') as HTMLElement
const statsBar = $('#stats-bar') as HTMLElement
const formCount = $('#form-count') as HTMLElement
const imperativeCountEl = $('#imperative-count') as HTMLElement
const rescanBtn = $('#rescan-btn') as HTMLElement
const formsList = $('#forms-list') as HTMLElement
const noForms = $('#no-forms') as HTMLElement
const imperativeList = $('#imperative-list') as HTMLElement
const noImperative = $('#no-imperative') as HTMLElement
const tabDeclarative = $('#tab-declarative') as HTMLElement
const tabImperative = $('#tab-imperative') as HTMLElement
const declarativePanel = $('#declarative-panel') as HTMLElement
const imperativePanel = $('#imperative-panel') as HTMLElement
const placeholderMsg = $('#placeholder-msg') as HTMLElement
const connectingMsg = $('#connecting-msg') as HTMLElement

// ── LocalStorage helpers ─────────────────────────────────────────────

function normalizeUrl(raw: string): string {
  let u = raw.trim()
  if (!u) return ''
  if (u.endsWith('/')) u = u.slice(0, -1)
  return u
}

function loadAllOverrides(): Record<string, SavedFormOverride[]> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') }
  catch { return {} }
}

function saveAllOverrides(data: Record<string, SavedFormOverride[]>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

function getOverridesForUrl(urlStr: string): SavedFormOverride[] {
  return loadAllOverrides()[normalizeUrl(urlStr)] || []
}

function saveOverrideForUrl(urlStr: string, override: SavedFormOverride) {
  const key = normalizeUrl(urlStr)
  const all = loadAllOverrides()
  const existing = all[key] || []
  const idx = existing.findIndex(o => o.formId === override.formId)
  if (idx >= 0) existing[idx] = override
  else existing.push(override)
  all[key] = existing
  saveAllOverrides(all)
}

// ── UI updates ───────────────────────────────────────────────────────

function updateUI() {
  connectBtn.disabled = isConnecting
  connectBtnText.textContent = isConnecting ? 'Connecting...' : isConnected ? 'Open Tab' : 'Connect'
  connectedBadge.classList.toggle('hidden', !isConnected)
  statsBar.classList.toggle('hidden', !isConnected)
  placeholderMsg.classList.toggle('hidden', isConnecting || isConnected)
  connectingMsg.classList.toggle('hidden', !isConnecting || isConnected)

  formCount.textContent = String(currentForms.length)
  imperativeCountEl.textContent = String(currentImperative.length)

  noForms.textContent = isConnected ? 'No forms detected' : 'No declarative tools'
  noForms.classList.toggle('hidden', currentForms.length > 0)
  noImperative.textContent = isConnected ? 'No imperative tools detected' : 'No imperative tools'
  noImperative.classList.toggle('hidden', currentImperative.length > 0)

  renderForms()
  renderImperative()
}

function sendToSession(msg: Record<string, unknown>) {
  if (sessionObj) sessionObj.sendMessage(msg, '*')
}

// ── Render forms ─────────────────────────────────────────────────────

function renderForms() {
  formsList.innerHTML = ''
  for (const form of currentForms) {
    const card = document.createElement('div')
    card.className = 'px-3 py-2 border-b border-gray-100'
    card.innerHTML = `
      <div class="flex items-center gap-1.5">
        <button class="toggle-form flex items-center gap-1.5 flex-1 min-w-0 text-left cursor-pointer">
          <svg class="chevron w-3.5 h-3.5 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          <span class="text-sm font-medium text-gray-800 truncate flex-1">${esc(form.toolname || form.formId)}</span>
        </button>
        <span class="flex items-center gap-1 shrink-0">
          ${form.hasWebMCP ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700">MCP</span>' : ''}
          ${form.webfuseApplied ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">WF</span>' : ''}
          <button class="highlight-btn p-1 text-gray-400 hover:text-blue-600 transition-colors cursor-pointer" title="Locate form on page">
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="22" y1="12" x2="18" y2="12"/><line x1="6" y1="12" x2="2" y2="12"/><line x1="12" y1="6" x2="12" y2="2"/><line x1="12" y1="22" x2="12" y2="18"/></svg>
          </button>
        </span>
      </div>
      <div class="ml-5 text-[11px] text-gray-400">${esc(form.method)} ${esc(form.action || '/')} · ${form.inputCount} fields</div>
      <div class="details hidden mt-2 ml-5 space-y-2"></div>
    `

    const details = card.querySelector('.details') as HTMLElement
    const toggle = card.querySelector('.toggle-form') as HTMLElement
    const chevron = card.querySelector('.chevron') as SVGElement
    let expanded = false

    toggle.addEventListener('click', () => {
      expanded = !expanded
      details.classList.toggle('hidden', !expanded)
      chevron.innerHTML = expanded
        ? '<polyline points="6 9 12 15 18 9"/>'
        : '<polyline points="9 18 15 12 9 6"/>'
      if (expanded && !details.hasChildNodes()) buildFormDetails(details, form)
    })

    card.querySelector('.highlight-btn')!.addEventListener('click', (e) => {
      e.stopPropagation()
      sendToSession({ type: 'webmcp:highlight', formIndex: form.index })
    })

    formsList.appendChild(card)
  }
}

function buildFormDetails(container: HTMLElement, form: FormTool) {
  const edits: Record<string, string> = {}
  const inputEdits: Record<number, Record<string, string>> = {}

  function mkField(label: string, value: string, onChange: (v: string) => void) {
    const div = document.createElement('div')
    div.innerHTML = `<label class="block text-[10px] text-gray-400 mb-0.5">${esc(label)}</label>`
    const inp = document.createElement('input')
    inp.type = 'text'
    inp.value = value
    inp.placeholder = label
    inp.className = 'w-full px-2 py-1 text-[11px] border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400'
    inp.addEventListener('input', () => onChange(inp.value))
    div.appendChild(inp)
    return div
  }

  // Buttons row
  const btns = document.createElement('div')
  btns.className = 'flex gap-1.5'

  const schemaBtn = document.createElement('button')
  schemaBtn.className = 'flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors cursor-pointer'
  schemaBtn.innerHTML = '<svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg> Schema'
  let schemaShown = false
  const schemaPre = document.createElement('pre')
  schemaPre.className = 'hidden mt-2 text-[10px] bg-gray-50 border border-gray-200 rounded p-2 overflow-x-auto max-h-48 overflow-y-auto'

  schemaBtn.addEventListener('click', () => {
    schemaShown = !schemaShown
    if (schemaShown) {
      sendToSession({ type: 'webmcp:get-schema', formIndex: form.index })
      schemaBtn.className = schemaBtn.className.replace('bg-gray-100 text-gray-600 hover:bg-gray-200', 'bg-blue-100 text-blue-700 hover:bg-blue-200')
    } else {
      schemaBtn.className = schemaBtn.className.replace('bg-blue-100 text-blue-700 hover:bg-blue-200', 'bg-gray-100 text-gray-600 hover:bg-gray-200')
    }
    schemaPre.classList.toggle('hidden', !schemaShown)
    if (schemaShown && currentSchema?.formIndex === form.index) {
      schemaPre.textContent = JSON.stringify(currentSchema.schema, null, 2)
    }
  })

  const saveBtn = document.createElement('button')
  saveBtn.className = 'flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors cursor-pointer'
  saveBtn.innerHTML = '<svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/></svg> Save'
  saveBtn.addEventListener('click', () => {
    for (const [attrName, attrValue] of Object.entries(edits)) {
      sendToSession({ type: 'webmcp:set-form-attr', formIndex: form.index, attrName, attrValue, isWebfuseApplied: true })
    }
    for (const [inputIdx, attrs] of Object.entries(inputEdits)) {
      for (const [attrName, attrValue] of Object.entries(attrs)) {
        sendToSession({ type: 'webmcp:set-input-attr', formIndex: form.index, inputIndex: Number(inputIdx), attrName, attrValue, isWebfuseApplied: true })
      }
    }

    const mergedAttrs: Record<string, string> = {}
    for (const key of ['toolname', 'tooldescription', 'toolautosubmit']) {
      const val = edits[key] ?? (form as any)[key] ?? ''
      if (val) mergedAttrs[key] = val
    }
    const mergedInputs: Record<string, Record<string, string>> = {}
    for (const input of form.inputs) {
      const inputKey = input.name || input.id || `__idx_${input.index}`
      const merged: Record<string, string> = {}
      for (const key of ['toolparamtitle', 'toolparamdescription']) {
        const val = inputEdits[input.index]?.[key] ?? (input as any)[key] ?? ''
        if (val) merged[key] = val
      }
      if (Object.keys(merged).length) mergedInputs[inputKey] = merged
    }
    saveOverrideForUrl(urlInput.value, { formId: form.formId, attributes: mergedAttrs, inputs: mergedInputs })
  })

  btns.appendChild(schemaBtn)
  btns.appendChild(saveBtn)
  container.appendChild(btns)

  container.appendChild(mkField('toolname', (form as any).toolname || '', v => { edits.toolname = v }))
  container.appendChild(mkField('tooldescription', (form as any).tooldescription || '', v => { edits.tooldescription = v }))
  container.appendChild(mkField('toolautosubmit', (form as any).toolautosubmit || '', v => { edits.toolautosubmit = v }))

  if (form.inputs.length > 0) {
    const fieldsHeader = document.createElement('div')
    fieldsHeader.className = 'text-[11px] font-medium text-gray-500 mb-1 mt-2'
    fieldsHeader.textContent = 'Fields'
    container.appendChild(fieldsHeader)

    for (const input of form.inputs) {
      const icard = document.createElement('div')
      icard.className = 'border border-gray-100 rounded p-1.5 mb-1'
      const displayName = input.name || input.id || input.label || `Field ${input.index}`
      icard.innerHTML = `
        <button class="toggle-input flex items-center gap-1 w-full text-left cursor-pointer">
          <svg class="ichev w-3 h-3 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          <span class="text-[11px] font-medium text-gray-700 truncate flex-1">${esc(displayName)}</span>
          <span class="text-[10px] text-gray-400 shrink-0">${esc(input.tag)}${input.type !== input.tag ? '[' + esc(input.type) + ']' : ''}</span>
          ${input.webfuseApplied ? '<span class="text-[10px] px-1 py-0.5 rounded bg-blue-100 text-blue-700 shrink-0">WF</span>' : ''}
        </button>
        <div class="input-details hidden mt-1.5 ml-4 space-y-1.5"></div>
      `
      const idetails = icard.querySelector('.input-details') as HTMLElement
      const itoggle = icard.querySelector('.toggle-input') as HTMLElement
      const ichev = icard.querySelector('.ichev') as SVGElement
      let iexpanded = false

      itoggle.addEventListener('click', () => {
        iexpanded = !iexpanded
        idetails.classList.toggle('hidden', !iexpanded)
        ichev.innerHTML = iexpanded ? '<polyline points="6 9 12 15 18 9"/>' : '<polyline points="9 18 15 12 9 6"/>'
        if (iexpanded && !idetails.hasChildNodes()) {
          idetails.appendChild(mkField('toolparamtitle', (input as any).toolparamtitle || '', v => {
            if (!inputEdits[input.index]) inputEdits[input.index] = {}
            inputEdits[input.index].toolparamtitle = v
          }))
          idetails.appendChild(mkField('toolparamdescription', (input as any).toolparamdescription || '', v => {
            if (!inputEdits[input.index]) inputEdits[input.index] = {}
            inputEdits[input.index].toolparamdescription = v
          }))
          const meta = document.createElement('div')
          meta.className = 'text-[10px] text-gray-400'
          if (input.required) meta.innerHTML += '<span class="text-red-400">required</span>'
          if (input.label) meta.innerHTML += ` · label: ${esc(input.label)}`
          idetails.appendChild(meta)
        }
      })
      container.appendChild(icard)
    }
  }

  container.appendChild(schemaPre)

  // Watch for schema updates
  const origSchemaUpdate = (window as any).__schemaWatchers || []
  origSchemaUpdate.push(() => {
    if (schemaShown && currentSchema?.formIndex === form.index) {
      schemaPre.textContent = JSON.stringify(currentSchema.schema, null, 2)
      schemaPre.classList.remove('hidden')
    }
  });
  (window as any).__schemaWatchers = origSchemaUpdate
}

function renderImperative() {
  imperativeList.innerHTML = ''
  for (const tool of currentImperative) {
    const card = document.createElement('div')
    card.className = 'px-3 py-2 border-b border-gray-100'
    card.innerHTML = `
      <button class="toggle-imp flex items-center gap-1.5 w-full text-left cursor-pointer">
        <svg class="imp-chev w-3.5 h-3.5 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        <span class="text-sm font-medium text-gray-800 truncate flex-1">${esc(tool.name)}</span>
        <span class="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 shrink-0">JS</span>
      </button>
      ${tool.description ? `<div class="ml-5 text-[11px] text-gray-400 truncate">${esc(tool.description)}</div>` : ''}
      <div class="imp-details hidden mt-2 ml-5">
        ${tool.description ? `<p class="text-xs text-gray-600 mb-2">${esc(tool.description)}</p>` : ''}
        <div class="text-[11px] font-medium text-gray-500 mb-1">Input Schema</div>
        <pre class="text-[10px] bg-gray-50 border border-gray-200 rounded p-2 overflow-x-auto max-h-48 overflow-y-auto">${esc(JSON.stringify(tool.inputSchema, null, 2))}</pre>
      </div>
    `
    const toggle = card.querySelector('.toggle-imp') as HTMLElement
    const details = card.querySelector('.imp-details') as HTMLElement
    const chev = card.querySelector('.imp-chev') as SVGElement
    let expanded = false
    toggle.addEventListener('click', () => {
      expanded = !expanded
      details.classList.toggle('hidden', !expanded)
      chev.innerHTML = expanded ? '<polyline points="6 9 12 15 18 9"/>' : '<polyline points="9 18 15 12 9 6"/>'
    })
    imperativeList.appendChild(card)
  }
}

function esc(s: string): string {
  const d = document.createElement('div')
  d.textContent = s
  return d.innerHTML
}

// ── Restore overrides ────────────────────────────────────────────────

function restoreOverrides(incomingForms: FormTool[]) {
  const targetUrl = normalizeUrl(urlInput.value)
  if (!targetUrl) return
  if (restoredUrl === targetUrl) return
  restoredUrl = targetUrl

  const saved = getOverridesForUrl(targetUrl)
  if (!saved.length) return

  const applyForms: Record<string, unknown>[] = []
  for (const override of saved) {
    const liveForm = incomingForms.find(f => f.formId === override.formId)
    if (!liveForm) continue
    const formAttrs: Record<string, { value: string; webfuseApplied: boolean }> = {}
    for (const [key, val] of Object.entries(override.attributes)) {
      formAttrs[key] = { value: val, webfuseApplied: true }
    }
    const inputUpdates: Record<string, unknown>[] = []
    for (const [inputKey, attrs] of Object.entries(override.inputs)) {
      const liveInput = liveForm.inputs.find(inp => (inp.name || inp.id || `__idx_${inp.index}`) === inputKey)
      if (!liveInput) continue
      const inputAttrs: Record<string, { value: string; webfuseApplied: boolean }> = {}
      for (const [key, val] of Object.entries(attrs)) {
        inputAttrs[key] = { value: val, webfuseApplied: true }
      }
      inputUpdates.push({ index: liveInput.index, attributes: inputAttrs })
    }
    applyForms.push({ index: liveForm.index, attributes: formAttrs, inputs: inputUpdates })
  }

  if (applyForms.length) {
    sendToSession({ type: 'webmcp:apply-attrs', forms: applyForms })
  }
}

// ── Message handling ─────────────────────────────────────────────────

function extractMessageData(args: unknown[]): Record<string, unknown> | null {
  for (const arg of args) {
    if (!arg || typeof arg !== 'object') continue
    const obj = arg as Record<string, unknown>
    if (typeof obj.type === 'string' && obj.type.startsWith('webmcp:')) return obj
    if (obj.data && typeof obj.data === 'object') {
      const eventData = obj.data as Record<string, unknown>
      if (eventData.message && typeof eventData.message === 'object') {
        const msg = eventData.message as Record<string, unknown>
        if (typeof msg.type === 'string' && msg.type.startsWith('webmcp:')) return msg
      }
      if (typeof eventData.type === 'string' && eventData.type.startsWith('webmcp:')) return eventData
    }
  }
  return null
}

function handleMessage(...args: unknown[]) {
  const data = extractMessageData(args)
  if (!data) return

  switch (data.type) {
    case 'webmcp:tools-update': {
      currentForms = (data.forms as FormTool[]) || []
      currentImperative = (data.imperativeTools as ImperativeTool[]) || []
      restoreOverrides(currentForms)
      updateUI()
      break
    }
    case 'webmcp:schema':
      currentSchema = data as unknown as SchemaResponse;
      ((window as any).__schemaWatchers || []).forEach((fn: () => void) => fn())
      break
  }
}

// ── Connect ──────────────────────────────────────────────────────────

function handleConnect() {
  const targetUrl = urlInput.value.trim()
  if (!targetUrl) return

  // If already connected, open tab on the live session — exact snippet pattern
  if (isConnected && liveSession) {
    liveSession.openTab(targetUrl)
    liveSession.getTabs().then(function(tabs: any[]) {
      if (tabs.length > 0) {
        liveSession.activateTab(tabs[tabs.length - 1].id)
      }
    })
    restoredUrl = null
    return
  }

  isConnecting = true
  restoredUrl = null
  updateUI()

  // ── Exact snippet pattern ──────────────────────────────────────
  webfuse.initSpace(WIDGET_KEY, SPACE_ID, {}).then(function(space: any) {
    webfuse.on('session_started', function(session: any) {
      console.log('[WebMCP] session_started', session)
      liveSession = session
      sessionObj = session

      // Open a tab when the session starts
      const navUrl = urlInput.value.trim()
      if (navUrl) {
        session.openTab(navUrl)
        session.getTabs().then(function(tabs: any[]) {
          if (tabs.length > 0) {
            session.activateTab(tabs[tabs.length - 1].id)
          }
        })
      }

      isConnected = true
      isConnecting = false
      updateUI()
    })

    webfuse.on('session_ended', function() {
      console.log('[WebMCP] session_ended')
      isConnected = false
      isConnecting = false
      sessionObj = null
      liveSession = null
      currentForms = []
      currentImperative = []
      updateUI()
    })

    webfuse.on('message', handleMessage)

    space.session().start('#webfuse-container')
  }).catch(function(error: any) {
    console.error('Failed:', error)
    isConnecting = false
    updateUI()
  })
}

// ── Tab switching ────────────────────────────────────────────────────

tabDeclarative.addEventListener('click', () => {
  tabDeclarative.className = 'flex-1 px-3 py-2 text-sm font-medium transition-colors border-b-2 border-blue-500 text-blue-600'
  tabImperative.className = 'flex-1 px-3 py-2 text-sm font-medium transition-colors text-gray-500 hover:text-gray-700'
  declarativePanel.classList.remove('hidden')
  imperativePanel.classList.add('hidden')
})

tabImperative.addEventListener('click', () => {
  tabImperative.className = 'flex-1 px-3 py-2 text-sm font-medium transition-colors border-b-2 border-blue-500 text-blue-600'
  tabDeclarative.className = 'flex-1 px-3 py-2 text-sm font-medium transition-colors text-gray-500 hover:text-gray-700'
  imperativePanel.classList.remove('hidden')
  declarativePanel.classList.add('hidden')
})

// ── Init ─────────────────────────────────────────────────────────────

urlInput.value = localStorage.getItem(URL_STORAGE_KEY) || 'https://googlechromelabs.github.io/webmcp-tools/demos/french-bistro/'
urlInput.addEventListener('input', () => localStorage.setItem(URL_STORAGE_KEY, urlInput.value))
urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !isConnecting) handleConnect() })
connectBtn.addEventListener('click', handleConnect)
rescanBtn.addEventListener('click', () => sendToSession({ type: 'webmcp:scan' }))

updateUI()
