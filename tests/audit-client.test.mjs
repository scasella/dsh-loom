/** Loom review regressions through real React controls in an isolated browser document. */
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { Window } from 'happy-dom'
import React, { act, useState } from 'react'
import { createRoot } from 'react-dom/client'

const project = path.resolve(import.meta.dirname, '..')
const source = 'vendor/harness/packages/experimental/client-ui-loom/src/client/'
let directory
let ui
let window
const globals = new Map()

before(async () => {
  directory = await mkdtemp(path.join(project, '.audit-client-'))
  const output = path.join(directory, 'client.mjs')
  await build({
    stdin: { contents: [
      ...['LoomTree', 'VariantPager', 'CounterfactualAction', 'CompareView', 'CompareDetail', 'RunningStrip',
        'ExportDialog', 'ReadingPane', 'MultiversePage', 'labels', 'locales'].map(name => `export * from './${source}${name}.${['labels', 'locales'].includes(name) ? 'ts' : 'tsx'}'`),
    ].join('\n'), resolveDir: project, sourcefile: 'audit-client.tsx' },
    outfile: output, bundle: true, packages: 'external', platform: 'node', format: 'esm', jsx: 'automatic',
    plugins: [{ name: 'browser-test-inputs', setup(builder) {
      builder.onResolve({ filter: /^@deepseek-ai\/dsh-client-store$/ }, args => ({ path: args.path, external: true, sideEffects: false }))
      builder.onResolve({ filter: /^@deepseek-ai\/dsh-experimental-loom\/family$/ }, () => ({ path: path.join(project, 'vendor/harness/packages/experimental/loom/src/family.ts') }))
      // Presentation doubles keep this lane independent of the browser shell's preloaded Markdown/highlighter dependencies.
      builder.onResolve({ filter: /^@deepseek-ai\/dsh-client-ui-primitives$/ }, () => ({ path: 'primitives', namespace: 'presentation' }))
      builder.onLoad({ filter: /.*/, namespace: 'presentation' }, () => ({ loader: 'js', resolveDir: project, contents: `
        import React from 'react';
        const icon=()=>null;
        export const IconBranchOutlineRegular=icon, IconChevronRightOutlineRegular=icon, IconChevronDownOutlineRegular=icon,
          IconChevronLeftOutlineRegular=icon, IconThinkOutlineRegular=icon, IconSearchOutlineRegular=icon, StateDot=icon;
        export const Button=React.forwardRef(({children,variant,size,...props},ref)=>React.createElement('button',{...props,ref},children));
        export const Input=({icon,...props})=>React.createElement('input',props);
        export const Tooltip=({children})=>children;
        export const Tag=({children})=>React.createElement('span',null,children);
        export const Modal=({open,title,children,footer})=>open?React.createElement('section',{'role':'dialog','aria-label':title},children,footer):null;
        export const Menu=({anchor})=>anchor;
        export const MarkdownText=({text})=>React.createElement('span',null,text);
        export const DisclosureRow=({title,children})=>React.createElement('section',null,title,children);
        export const DiffBlock=({diffs})=>React.createElement('pre',null,JSON.stringify(diffs));
        export const useAnchoredPosition=()=>null;
        export const useDismissOnOutsidePointer=()=>{};
      ` }))
      builder.onResolve({ filter: /\.css(?:\?inline)?$/ }, args => ({ path: path.resolve(args.resolveDir, args.path), namespace: 'styles' }))
      builder.onLoad({ filter: /.*/, namespace: 'styles' }, args => ({ contents: args.path.endsWith('?inline')
        ? 'export default ""' : 'export default new Proxy({}, {get: (_, key) => String(key)})', loader: 'js' }))
      builder.onLoad({ filter: /\.(?:svg|png|webp)$/ }, () => ({ contents: 'export default "data:image/svg+xml,<svg/>"', loader: 'js' }))
    } }],
    logLevel: 'silent',
  })
  window = new Window({ url: 'http://localhost/' })
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'MutationObserver', 'ResizeObserver',
    'KeyboardEvent', 'MouseEvent', 'Event', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) {
    globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === 'window' ? window
      : typeof window[key] === 'function' && ['getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'].includes(key)
        ? window[key].bind(window) : window[key] })
  }
  globals.set('IS_REACT_ACT_ENVIRONMENT', Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT'))
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  ui = await import(pathToFileURL(output).href)
})

after(async () => {
  await window?.happyDOM.abort()
  for (const [key, descriptor] of globals) {
    if (descriptor === undefined) delete globalThis[key]
    else Object.defineProperty(globalThis, key, descriptor)
  }
  if (directory !== undefined) await rm(directory, { recursive: true, force: true })
})

const translate = (key, values = {}) => {
  const copy = ui.en[key] ?? ({ copy: 'Copy', copied: 'Copied', collapse: 'Collapse' })[key] ?? key
  return copy.replace(/\{([^}]+)\}/gu, (_, name) => String(values[name]))
}
const valueHook = value => selector => selector === undefined ? value : selector(value)
const noop = () => {}

async function mount(Component, props) {
  const element = document.createElement('div')
  document.body.append(element)
  const root = createRoot(element)
  const render = async next => { await act(async () => { root.render(React.createElement(Component, next)) }) }
  await render(props)
  return { element, render, async close() { await act(async () => { root.unmount() }); element.remove() } }
}
async function key(element, value) {
  const event = new window.KeyboardEvent('keydown', { key: value, code: value.length === 1 ? `Key${value.toUpperCase()}` : value, bubbles: true, cancelable: true })
  await act(async () => { element.dispatchEvent(event) })
  return event
}
async function click(element) { assert.ok(element); await act(async () => { element.click() }) }

function familyFixture() {
  const ids = ['session-root', 'session-11111111', 'session-22222222', 'session-33333333', 'session-44444444']
  const byId = {}
  const nodes = ids.map((id, index) => {
    const parentId = index === 0 ? undefined : ids[0]
    const projectionValues = {
      turnOutline: [{ turn: 1, seq: 1, prompt: 'seed', response: '' }, ...index === 0 ? [] : [{ turn: 2, seq: 50, prompt: index <= 2 ? 'left' : 'right', response: 'result' }]],
      sessionStats: { turns: index === 0 ? 1 : 2, steps: 2 },
      tokenUsage: { uncachedInputTokens: 10, cacheReadTokens: 20, cacheWriteTokens: 0, outputTokens: 30 },
      ...parentId === undefined ? {} : { forkLineage: { parentSession: parentId, cutSeq: 40, cutTurn: 1, createdAt: index },
        loomBranch: { setId: 'set-1', kind: 'variants', index: index - 1, variantKey: index <= 2 ? 'left-key' : 'right-key', createdAt: index } },
    }
    byId[id] = { id, displayTitle: 'Same generated title', blank: false, running: false, updatedAt: index, projectionValues, ...parentId === undefined ? {} : { parentId } }
    return { id, sessionId: id, depth: index === 0 ? 0 : 1, updatedAt: index, createdAt: index, blank: false, running: false, ...parentId === undefined ? {} : { parentId } }
  })
  return { ids, list: { ids, byId, projectionsBySession: {} }, family: { rootId: ids[0], nodes } }
}

test('Multiverse and the tree distinguish repeated titles and label every variant sample from durable membership', async () => {
  const { ids, list, family } = familyFixture()
  assert.equal(ui.loomSessionTitle(list, ids[1], translate), 'Same generated title · Fork 11111111')
  assert.equal(ui.loomVariantLabel(family, list, ids[2], translate), 'Variant 1 · Sample 2/2 · left')
  assert.equal(ui.loomVariantLabel(family, list, ids[3], translate), 'Variant 2 · Sample 1/2 · right')
  const mounted = await mount(ui.MultiversePage, { useSessions: valueHook(list),
    useLoomFamilySearch: () => ({ status: 'ready', value: { items: [], hasMore: false } }), openSession: noop, retrySearch: noop, t: translate })
  try {
    const labels = [...mounted.element.querySelectorAll('li button')].map(button => button.textContent)
    assert.equal(new Set(labels).size, ids.length)
    assert.match(labels[1], /Fork 11111111.*Variant 1 · Sample 1\/2.*left/u)
    assert.match(labels[4], /Fork 44444444.*Variant 2 · Sample 2\/2.*right/u)
  } finally { await mounted.close() }
})

test('tree arrow + Enter keeps keyboard focus for g, k and x and never handles composer input', async () => {
  const { ids, list, family } = familyFixture()
  const opened = [], marked = [], refreshed = []
  const initial = { collapsed: [], active: null, selected: ids[0] }
  function Tree() {
    const [state, setState] = useState(initial)
    const [marks, setMarks] = useState({})
    const actions = {
      activated: active => { setState(previous => ({ ...previous, active })) },
      selected: selected => { setState(previous => ({ ...previous, selected })) },
      toggled: id => { setState(previous => ({ ...previous, collapsed: previous.collapsed.includes(id) ? previous.collapsed.filter(value => value !== id) : [...previous.collapsed, id] })) },
    }
    return React.createElement(React.Fragment, null,
      React.createElement(ui.LoomTree, { family, currentSessionId: ids[0], selectedSessionId: state.selected,
        useSessions: valueHook(list), useSessionStatus: valueHook(new Map()), useLoomBranching: valueHook({ marks }),
        useStore: valueHook(state), actions, refreshProjection: id => { refreshed.push(id) },
        openForm: (...args) => { opened.push(args) }, setMark: async (id, mark) => {
          marked.push([id, mark]); setMarks(previous => ({ ...previous, [id]: { status: 'saved', mark } })); return { ok: true }
        }, t: translate }), React.createElement('textarea', { 'aria-label': 'Composer' }))
  }
  const mounted = await mount(Tree, {})
  try {
    const rows = () => [...mounted.element.querySelectorAll('[role="treeitem"]')]
    await act(async () => { rows()[0].focus() })
    await key(document.activeElement, 'g')
    assert.deepEqual(opened.at(-1), [ids[0], { sourceSessionId: ids[0], afterTurn: 1 }])
    await key(document.activeElement, 'ArrowDown')
    await key(document.activeElement, 'ArrowDown')
    assert.equal(document.activeElement.dataset.loomRow, `s:${ids[1]}`)
    await key(document.activeElement, 'Enter')
    assert.equal(document.activeElement.getAttribute('aria-selected'), 'true')
    assert.match(document.activeElement.textContent, /Variant 1 · Sample 1\/2/u)
    await key(document.activeElement, 'k')
    assert.deepEqual(marked.at(-1), [ids[1], 'keep'])
    await key(document.activeElement, 'k')
    assert.deepEqual(marked.at(-1), [ids[1], null])
    await key(document.activeElement, 'x')
    assert.deepEqual(marked.at(-1), [ids[1], 'set-aside'])
    await key(document.activeElement, 'g')
    assert.deepEqual(opened.at(-1), [ids[0], { sourceSessionId: ids[1], afterTurn: 2 }])
    const counts = [opened.length, marked.length]
    const composer = mounted.element.querySelector('textarea'); composer.focus()
    for (const value of ['g', 'k', 'x']) await key(composer, value)
    assert.deepEqual([opened.length, marked.length], counts)
    assert.deepEqual(refreshed, [])
  } finally { await mounted.close() }
})

test('the variant pager uses native disabled buttons at both ends while arrow navigation retains an enabled target', async () => {
  const { ids, list, family } = familyFixture(), opened = []
  const props = sessionId => ({ sessionId, useSessions: valueHook(list), useLoomFamily: () => ({ status: 'ready', family }),
    openSession: id => { opened.push(id) }, refreshProjection: noop, t: translate })
  const mounted = await mount(ui.VariantPagerBody, props(ids[1]))
  try {
    const previous = mounted.element.querySelector('[aria-label="Previous variant"]')
    const next = mounted.element.querySelector('[aria-label="Next variant"]')
    assert.equal(previous.disabled, true); assert.equal(next.disabled, false)
    await click(previous); assert.deepEqual(opened, [])
    next.focus(); await key(next, 'ArrowLeft'); assert.equal(document.activeElement, next)
    await mounted.render(props(ids[4]))
    assert.equal(mounted.element.querySelector('[aria-label="Next variant"]').disabled, true)
    assert.equal(mounted.element.querySelector('[aria-label="Previous variant"]').disabled, false)
  } finally { await mounted.close() }
})

test('queue labels remain request positions when a browser re-adopts a running set', async () => {
  const { ids, list, family } = familyFixture()
  const base = { setId: 'set-1', sourceSessionId: ids[0], ownerSessionId: ids[0], lost: false, reads: 1,
    children: [{ index: 0, state: 'started', sessionId: ids[1] }, { index: 1, state: 'queued' }] }
  const props = lines => ({ sessionId: ids[0], useSessions: valueHook(list), useLoomFamily: () => ({ status: 'ready', family }),
    useSessionStatus: valueHook(new Map([[ids[1], { running: true }]])), useLoomBranching: valueHook({ sets: [{ ...base, lines }] }),
    adoptSet: noop, refreshSet: noop, dismissSet: noop, cancelBranches: async () => ({ ok: true }), openSession: noop,
    refreshProjection: noop, t: translate })
  const mounted = await mount(ui.RunningStrip, props(['Q1', 'Q2']))
  try {
    const labels = () => [...mounted.element.querySelectorAll('[data-loom-strip-item]')].map(row => row.querySelector('button, span:nth-child(2)')?.textContent)
    const before = labels()
    assert.ok(mounted.element.textContent.includes('Branch 1'))
    await mounted.render(props([]))
    assert.deepEqual(labels(), before)
    assert.ok(!mounted.element.textContent.includes('Q1'))
  } finally { await mounted.close() }
})

test('Counterfactual editing is hidden on Loom orchestration tools and retained for settled ordinary results', async () => {
  const props = { phase: 'result', block: { seq: 5, content: [{ type: 'text', text: 'recorded result' }] }, sessionId: 'session-result',
    counterfactual: noop, openSession: noop, t: translate }
  const mounted = await mount(ui.CounterfactualAction, { ...props, toolName: 'loom_expand' })
  try {
    for (const toolName of ['loom_expand', 'loom_wait', 'loom_read', 'loom_keep', 'loom_cull']) {
      await mounted.render({ ...props, toolName }); assert.equal(mounted.element.textContent, '')
    }
    await mounted.render({ ...props, toolName: 'bash' })
    assert.match(mounted.element.textContent, /Edit result & branch/u)
    await mounted.render({ ...props, phase: 'start', toolName: 'bash' }); assert.equal(mounted.element.textContent, '')
  } finally { await mounted.close() }
})

test('What the model saw exposes full logged messages, system and tool schemas as inert text', async () => {
  const { ids, list, family } = familyFixture()
  const hostile = '<img src=x onerror="window.__loomInjected=true">'
  const message = 'Message before ' + 'long '.repeat(200) + 'UNTRUNCATED_END ' + hostile
  const view = { route: { provider: 'fixture', model: 'test' }, inheritedTurns: 0, ownTurns: 1,
    systemPrompt: { text: 'full system ' + hostile, chars: 80 },
    tools: { names: ['lookup'], addedThisTurn: [], removedThisTurn: [], definitions: [JSON.stringify({ name: 'lookup', description: 'full description', inputSchema: { type: 'object' } }, null, 2)] },
    messages: [{ seq: 3, role: 'user', inherited: false, preview: 'Message before …', chars: message.length, text: message }] }
  const mounted = await mount(ui.ReadingPane, { family, sessionId: ids[0], currentSessionId: ids[0], useSessions: valueHook(list),
    useLoomReader: () => ({ status: 'ready', document: { hasMore: false, turns: [{ turn: 1, prompt: 'prompt', reply: 'answer', reasoning: '', closed: true, closingSeq: 10 }] } }),
    useLoomRequest: () => ({ status: 'ready', view }), renderFactorySlot: noop, openSession: noop, loadOlder: noop, t: translate })
  try {
    await click([...mounted.element.querySelectorAll('button')].find(button => button.textContent.includes('What the model saw')))
    const text = mounted.element.textContent
    assert.ok(text.includes('UNTRUNCATED_END'))
    assert.ok(text.includes(message))
    assert.ok(text.includes('full system ' + hostile))
    assert.ok(text.includes('full description'))
    assert.ok(text.includes('before provider serialization'))
    assert.equal(mounted.element.querySelector('img'), null)
    assert.equal(window.__loomInjected, undefined)
  } finally { await mounted.close() }
})

test('empty prose export cannot send a request and selected prose explicitly uses the Weave source', async () => {
  const calls = [], state = { choices: [], curationBits: 0, modelTokens: 0, nodes: [] }
  const props = { open: true, close: noop, sessionId: 'session-prose', state, preview: '',
    exportLoom: async request => { calls.push(request); return { ok: false, error: { code: 'loom/export-unavailable' } } }, t: translate }
  const mounted = await mount(ui.ExportDialog, props)
  try {
    const download = () => [...document.querySelectorAll('button')].find(button => button.textContent === 'Download')
    assert.equal(download().disabled, true)
    await click(download()); assert.deepEqual(calls, [])
    await mounted.render({ ...props, nodeId: 'node-prose', preview: 'Selected prose' })
    assert.equal(download().disabled, false)
    await click(download()); assert.deepEqual(calls, [{ sessionId: 'session-prose', source: 'weave', mode: 'path', format: 'html', nodeId: 'node-prose' }])
  } finally { await mounted.close() }
})

test('Compare keeps own token totals visible together with each configured list price', async () => {
  const { ids, list, family } = familyFixture()
  const row = { sessionId: ids[1], title: 'Priced branch', prompt: 'left', isolation: 'shared', running: false, mark: null,
    own: { inputTokens: 10, cachedTokens: 20, outputTokens: 30, steps: 2, usd: { amount: 0.01, label: 'list price' } }, wallMs: 1000 }
  const mounted = await mount(ui.CompareView, { family, selectedSessionId: ids[1], useSessions: valueHook(list), useStore: valueHook({ point: null, picked: null }),
    actions: { picked: noop, pointed: noop }, useSessionStatus: valueHook(new Map()), useLoomBranching: valueHook({ marks: {} }),
    useLoomCompare: () => ({ status: 'ready', value: { rows: [row] } }), useLoomDiff: noop, setMark: noop, openSession: noop,
    refreshProjection: noop, refreshCompare: noop, adoptBranch: noop, applyBranch: noop, discardBranch: noop, t: translate })
  try {
    assert.match(mounted.element.textContent, /Own tokens/u)
    const branch = mounted.element.querySelector('[data-loom-compare-row]')
    assert.match(branch.textContent, /60 tok/u)
    assert.match(branch.textContent, /\$0\.010 · list price/u)
  } finally { await mounted.close() }
})


test('Compare retains applied diff text after worktree removal and offers no destructive worktree actions', async () => {
  const row = { sessionId: 'session-applied', title: 'Applied branch', isolation: 'worktree', worktreeEnded: true, running: false,
    adopted: false, diff: { insertions: 1, deletions: 1, files: [{ path: 'notes.txt', insertions: 1, deletions: 1 }] } }
  const patch = 'diff --git a/notes.txt b/notes.txt\n--- a/notes.txt\n+++ b/notes.txt\n@@ -1 +1 @@\n-base\n+retained-alpha\n'
  const mounted = await mount(ui.CompareDetail, { row, branches: 2,
    useLoomDiff: () => ({ status: 'ready', value: { unified: patch, truncated: false } }),
    adoptBranch: noop, applyBranch: noop, discardBranch: noop, openSession: noop, onChanged: noop, t: translate })
  try {
    assert.match(mounted.element.textContent, /retained-alpha/u)
    assert.match(mounted.element.textContent, /applied change is retained/u)
    assert.ok(![...mounted.element.querySelectorAll('button')].some(button => ['Apply diff to folder', 'Discard worktree'].includes(button.textContent)))
  } finally { await mounted.close() }
})
