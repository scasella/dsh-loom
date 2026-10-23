/** Build the independently installable Host and browser distribution. */
import { build } from 'esbuild'
import { readFile, writeFile, mkdir, rm, cp } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

await import('./generate-loom.mjs')

const root = fileURLToPath(new URL('../', import.meta.url))
const json = async path => JSON.parse(await readFile(join(root, path), 'utf8'))
const [host, llm, client, extraction] = await Promise.all([
  json('host-plan.json'), json('llm-plan.json'), json('client-plan.json'), json('extraction.json'),
])
await rm(join(root, 'dist'), { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
const entries = { index: 'src/index.ts', ...llm.entries }
for (const [key, value] of Object.entries(host.entries)) entries[key.endsWith('/index') ? key : `${key}/index`] = value
for (const entry of client.entries) entries[`${entry.outdir.replace(/^dist\//, '')}/index`] ??= entry.hostSource
for (const key of ['loom', 'worktree', 'tool-loom']) entries[`${key}/index`] = `vendor/harness/packages/experimental/${key}/src/index.ts`
const aliases = { ...host.aliases, ...llm.aliases }
for (const name of ['loom', 'tool-loom', 'worktree']) {
  const packageName = `@deepseek-ai/dsh-experimental-${name}`
  const manifest = await json(`vendor/harness/packages/experimental/${name}/package.json`)
  for (const [key, value] of Object.entries(manifest.exports)) {
    if (key.includes('*') || key === './package.json') continue
    const target = typeof value === 'string' ? value : value.default
    let source = target.replace('./lib/types/', 'src/').replace('./lib/', 'src/').replace(/\.js$/, '.ts')
    if (key === './typert') source = `../../../generated/${name}/typert.host.js`
    if (key === './remote') source = `../../../generated/${name}/typert.remote-client.js`
    const path = key === './typert' || key === './remote'
      ? `generated/${name}/${key === './typert' ? 'typert.host.js' : 'typert.remote-client.js'}`
      : `vendor/harness/packages/experimental/${name}/${source}`
    if (existsSync(join(root, path))) aliases[key === '.' ? packageName : `${packageName}/${key.slice(2)}`] = path
  }
}

const result = await build({
  absWorkingDir: root, entryPoints: entries, outdir: 'dist', bundle: true,
  splitting: true, format: 'esm', platform: 'node', target: 'node22',
  chunkNames: 'shared/[name]-[hash]', sourcemap: false, metafile: true,
  packages: 'external', tsconfigRaw: { compilerOptions: { experimentalDecorators: false, useDefineForClassFields: true } },
  plugins: [{ name: 'loom-host-inputs', setup(builder) {
    builder.onResolve({ filter: /^@loom\/stock\// }, args => ({ path: args.path.slice('@loom/stock/'.length), external: true }))
    builder.onResolve({ filter: /^[^./]|^@/ }, args => {
      if (aliases[args.path] !== undefined) return { path: join(root, aliases[args.path]) }
      if (args.path.startsWith('@deepseek-ai/dsh-experimental-')) throw new Error(`Unresolved private input: ${args.path}`)
      return undefined
    })
  } }],
})
await mkdir(join(root, 'dist/build'), { recursive: true })
await writeFile(join(root, 'dist/build/host-inputs.json'), JSON.stringify(result.metafile, null, 2) + '\n')
await writeFile(join(root, 'dist/build/reference.json'), JSON.stringify({
  reference: extraction.reference_commit, upstream: extraction.upstream_commit, dsh: extraction.upstream_version,
}, null, 2) + '\n')
for (const name of ['loom', 'worktree', 'tool-loom']) {
  const source = join(root, `vendor/harness/packages/experimental/${name}`)
  for (const folder of ['locale', 'skills']) {
    if (existsSync(join(source, folder))) await cp(join(source, folder), join(root, 'dist', name, folder), { recursive: true })
  }
}
await import('./build-client.mjs')
console.log(`Built ${Object.keys(entries).length} shared Host entries`)
