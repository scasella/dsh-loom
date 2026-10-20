/** Build the standalone browser faces against the installed Harness module table. */
import { build } from 'esbuild'
import { transform } from 'lightningcss'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const plan = JSON.parse(await readFile(join(root, 'client-plan.json'), 'utf8'))
const extraction = JSON.parse(await readFile(join(root, 'extraction.json'), 'utf8'))
const require = createRequire(join(root, 'package.json'))
const platform = new Set([
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  'zod', '@tanstack/react-virtual', '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots', '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
])
const purePackages = new Set([
  '@deepseek-ai/dsh-file-reference', '@deepseek-ai/dsh-brand', '@deepseek-ai/dsh-deque', '@deepseek-ai/dsh-session',
  '@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-output-retention',
  '@deepseek-ai/dsh-typert-protocol', '@deepseek-ai/dsh-util-crypto',
  '@deepseek-ai/dsh-util-values', '@deepseek-ai/dsh-util-workspace-path',
  '@deepseek-ai/cosmokit', '@deepseek-ai/schemastery',
])
const pureSpecifiers = new Set([
  '@deepseek-ai/dsh-token-meter/client', '@deepseek-ai/dsh-native-command/types',
  '@deepseek-ai/dsh-host-open-in-app/shared', '@deepseek-ai/dsh-plugin-manager/registry',
  '@deepseek-ai/dsh-agent-preset-registry/display',
  '@deepseek-ai/dsh-api-workspace-controller/default-workspace',
  '@deepseek-ai/dsh-spill-policy/notice', '@deepseek-ai/dsh-experimental-loom/family',
])

function packageName(specifier) {
  const parts = specifier.split('/')
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
}

/** Resolve copied source leaves without depending on an enclosing Harness checkout. */
function copiedSource(specifier) {
  const name = packageName(specifier)
  const location = extraction.packages[name]
  if (location === undefined) return undefined
  const suffix = specifier.slice(name.length).replace(/^\//, '')
  const base = join(root, 'vendor/harness', location, 'src')
  for (const candidate of suffix === ''
    ? [join(base, 'index.ts'), join(base, 'index.tsx')]
    : [join(base, `${suffix}.ts`), join(base, `${suffix}.tsx`), join(base, suffix, 'index.ts')]) {
    if (existsSync(candidate)) return candidate
  }
  return undefined
}

/** Every npm input must be installed in this project, never inherited from its parent checkout. */
function npmSource(specifier) {
  const name = packageName(specifier)
  if (!existsSync(join(root, 'node_modules', name, 'package.json'))) {
    throw new Error(`Browser build requires local devDependency ${name}; install it in this project`)
  }
  return require.resolve(specifier)
}

async function styleModule(id, filename, source, inline) {
  const references = [...source.matchAll(/url\(\s*(["']?)(\.\.?\/[^"')]+)\1\s*\)/gu)]
  for (const match of references) {
    const asset = resolve(dirname(filename), match[2])
    const extension = asset.split('.').at(-1)
    const media = extension === 'svg' ? 'svg+xml' : extension
    if (!['png', 'webp', 'svg', 'jpg', 'jpeg', 'gif'].includes(extension)) {
      throw new Error(`Unsupported stylesheet asset ${relative(root, asset)}`)
    }
    source = source.replace(match[0], `url("data:image/${media};base64,${(await readFile(asset)).toString('base64')}")`)
  }
  const cssModules = filename.endsWith('.module.css')
  const result = transform({
    filename: relative(root, filename), code: Buffer.from(source),
    minify: true, cssModules, drafts: { customMedia: true },
  })
  const css = result.code.toString()
  if (inline) return `export default ${JSON.stringify(css)};`
  const classes = {}
  for (const [key, value] of Object.entries(result.exports ?? {})) {
    classes[key] = [value.name, ...value.composes.map(item => item.name)].join(' ')
  }
  const tagId = `${id}/${relative(root, filename).replaceAll('\\', '/')}`
  return `const text=${JSON.stringify(css)};const id=${JSON.stringify(tagId)};
if(typeof document!=='undefined'&&!document.querySelector('style[data-plugin-css='+JSON.stringify(id)+']')){
const tag=document.createElement('style');tag.dataset.plugin=${JSON.stringify(id)};
tag.dataset.pluginCss=id;tag.textContent=text;document.head.appendChild(tag);}
export default ${JSON.stringify(classes)};`
}

function clientPlugin(id, requests) {
  return {
    name: 'loom-browser-inputs',
    setup(build) {
      build.onResolve({ filter: /\.(?:css)(?:\?inline)?$/ }, args => ({
        path: resolve(args.resolveDir, args.path.replace(/\?inline$/, '')),
        namespace: args.path.endsWith('?inline') ? 'loom-inline-style' : 'loom-style',
      }))
      for (const namespace of ['loom-style', 'loom-inline-style']) {
        build.onLoad({ filter: /.*/, namespace }, async args => ({
          contents: await styleModule(id, args.path, await readFile(args.path, 'utf8'), namespace === 'loom-inline-style'),
          loader: 'js', resolveDir: dirname(args.path),
        }))
      }
      build.onLoad({ filter: /\.(?:svg|png|webp)$/ }, async args => ({
        contents: `export default ${JSON.stringify(`data:image/${args.path.endsWith('.svg') ? 'svg+xml' : args.path.split('.').at(-1)};base64,${(await readFile(args.path)).toString('base64')}`)};`,
        loader: 'js',
      }))
      build.onResolve({ filter: /^[^./]|^@/ }, args => {
        const alias = plan.aliases[args.path]
        if (alias !== undefined) return { path: join(root, alias) }
        if (args.path.startsWith('node:')) throw new Error(`Node import reached browser face: ${args.path}`)
        if (platform.has(args.path)) {
          requests.add(args.path)
          return { path: args.path, external: true }
        }
        const name = packageName(args.path)
        if (args.path.startsWith('@deepseek-ai/')) {
          if (purePackages.has(name) || pureSpecifiers.has(args.path) || args.path.endsWith('/remote')) {
            return { path: copiedSource(args.path) ?? npmSource(args.path) }
          }
          requests.add(args.path)
          return { path: args.path, external: true }
        }
        if (!args.path.startsWith('.') && !args.path.startsWith('/')) return { path: npmSource(args.path) }
      })
    },
  }
}

/** Build one ordinary factory-form client module and its private discovery manifest. */
async function buildEntry(entry) {
  const requests = new Set()
  const result = await build({
    absWorkingDir: root, entryPoints: [join(root, entry.source)], bundle: true,
    write: false, format: 'cjs', platform: 'browser', target: 'es2022', jsx: 'automatic',
    sourcemap: false, minify: true, metafile: true, legalComments: 'eof',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [clientPlugin(entry.id, requests)],
  })
  const output = result.outputFiles.find(file => !file.path.endsWith('.map'))
  if (output === undefined) throw new Error(`No browser output for ${entry.id}`)
  const code = `window.__ModuleLoader__.load({id:${JSON.stringify(entry.id)},factory:(require)=>{const module={exports:{}};let exports=module.exports;\n${output.text}\nreturn module.exports;}});\n`
  const directory = join(root, entry.outdir)
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'client.js'), code)
  const client = { ...entry.client, external: [...requests].filter(specifier => !platform.has(specifier)).sort() }
  const manifest = {
    name: entry.id, version: '0.1.0-alpha.3', private: true, type: 'module',
    description: `Private Loom compatibility face for ${entry.id}`,
    main: './index.js', exports: { '.': './index.js', './client': './client.js', './package.json': './package.json' },
    dsh: { client },
  }
  await writeFile(join(directory, 'package.json'), JSON.stringify(manifest, null, 2) + '\n')
  const inputs = Object.keys(result.metafile.inputs).map(input => input.replaceAll(root, ''))
  return { key: entry.key, id: entry.id, bytes: Buffer.byteLength(code), external: client.external, inputs }
}

const reports = []
for (const entry of plan.entries) reports.push(await buildEntry(entry))
await mkdir(join(root, 'dist/build'), { recursive: true })
await writeFile(join(root, 'dist/build/client-inputs.json'), JSON.stringify(reports, null, 2) + '\n')
console.log(`Built ${reports.length} standalone browser faces`)
