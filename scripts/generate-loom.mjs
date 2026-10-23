/** Regenerate Loom Remote artifacts using its sources and the pinned published dependency declarations. */
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { WorkspaceAnalyzer, FaceModelEmitter } from '@deepseek-ai/dsh-typert-generator'

const project = path.resolve(import.meta.dirname, '..')
const temporary = await mkdtemp(path.join(project, '.typert-'))

/** Keep source discovery independent of filesystem enumeration order. */
function byName(left, right) { return left.name < right.name ? -1 : left.name > right.name ? 1 : 0 }

/** Select the same declaration-first export branch the analyzer reads. */
function exportTarget(value) {
  if (typeof value === 'string') return value
  if (value === null || typeof value !== 'object') return undefined
  for (const candidate of Array.isArray(value) ? value : ['types', 'import', 'default'].map(key => value[key])) {
    const selected = exportTarget(candidate)
    if (selected !== undefined) return selected
  }
  return undefined
}

/** Enumerate declarations or staged source files without following directory symlinks. */
async function declarations(directory, prefix = '', source = false) {
  const files = []
  for (const entry of (await readdir(path.join(directory, prefix), { withFileTypes: true })).sort(byName)) {
    const relative = path.join(prefix, entry.name)
    if (entry.isDirectory()) files.push(...await declarations(directory, relative, source))
    else if (entry.isFile() && (source ? /\.tsx?$/.test(entry.name) : entry.name.endsWith('.d.ts'))) files.push(relative)
  }
  return files
}

/** Materialize declaration paths as temporary source paths recognized by the published analyzer. */
function sourceTarget(target) {
  return target.replace(/^\.\/lib\/types\//, './src/').replace(/^\.\/lib\//, './src/').replace(/\.d\.ts$/, '.ts').replace(/\.js$/, '.ts')
}

try {
  const packages = []
  const paths = {}
  const base = path.join(project, 'tsconfig.base.json')
  const installed = path.join(project, 'node_modules/@deepseek-ai')
  const vendored = path.join(project, 'vendor/harness/packages')
  for (const group of (await readdir(vendored, { withFileTypes: true })).sort(byName)) {
    if (!group.isDirectory()) continue
    for (const entry of (await readdir(path.join(vendored, group.name), { withFileTypes: true })).sort(byName)) {
      if (!entry.isDirectory()) continue
      const relative = path.join('packages', group.name, entry.name)
      await cp(path.join(vendored, group.name, entry.name), path.join(temporary, relative), { recursive: true })
      packages.push(relative)
    }
  }
  const sourceNames = new Set(await Promise.all(packages.map(async relative => JSON.parse(await readFile(path.join(temporary, relative, 'package.json'), 'utf8')).name)))
  for (const entry of (await readdir(installed, { withFileTypes: true })).sort(byName)) {
    if (!entry.name.startsWith('dsh-')) continue
    const packageRoot = path.join(installed, entry.name)
    const manifest = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'))
    if (sourceNames.has(manifest.name)) continue
    const relative = path.join('packages/published', entry.name)
    const owner = path.join(temporary, relative)
    await mkdir(owner, { recursive: true })
    await writeFile(path.join(owner, 'package.json'), JSON.stringify(manifest))
    for (const file of await declarations(path.join(packageRoot, 'lib'))) {
      const target = path.join(owner, sourceTarget(`./lib/${file}`))
      await mkdir(path.dirname(target), { recursive: true })
      await cp(path.join(packageRoot, 'lib', file), target)
    }
    packages.push(relative)
  }
  for (const relative of packages) {
    const owner = path.join(temporary, relative)
    const manifest = JSON.parse(await readFile(path.join(owner, 'package.json'), 'utf8'))
    for (const [subpath, value] of Object.entries(manifest.exports ?? {})) {
      const target = exportTarget(value)
      if (!target || subpath === './package.json' || target.endsWith('.json')) continue
      const name = subpath === '.' ? manifest.name : `${manifest.name}/${subpath.slice(2)}`
      paths[name] = [path.join(owner, sourceTarget(target))]
    }
  }
  const options = { extends: base, compilerOptions: { paths, types: ['node'] } }
  const roots = []
  for (const relative of packages) {
    const source = path.join(temporary, relative, 'src')
    roots.push(...(await declarations(source, '', true)).map(file => path.join(source, file)))
  }
  for (const relative of packages) {
    // Load the complete declared vocabulary while emitting only Loom's Remote service.
    await writeFile(path.join(temporary, relative, 'tsconfig.json'), JSON.stringify({ ...options, files: roots }))
  }
  await writeFile(path.join(temporary, 'tsconfig.host.json'), JSON.stringify({ ...options, files: [], references: packages.map(relative => ({ path: relative })) }))
  const workspace = new WorkspaceAnalyzer({ root: temporary, faces: ['host'], packages: ['@deepseek-ai/dsh-experimental-loom'], checkDiagnostics: false }).analyze()
  const face = workspace.faces.find(value => value.face === 'host')
  if (!face) throw new Error('Loom generation produced no Host face')
  const result = new FaceModelEmitter(face).emit('@deepseek-ai/dsh-experimental-loom')
  if (!result.remote) throw new Error('Loom generation produced no Remote methods')
  const declarationMap = JSON.parse(result.remote.dtsMap)
  declarationMap.sources = declarationMap.sources.map(source => path.relative(path.join(project, 'generated/loom'), path.resolve(project, 'vendor/harness/packages/experimental/loom/lib', source)))
  await writeFile(path.join(project, 'generated/loom/typert.remote-client.d.ts.map'), JSON.stringify(declarationMap) + '\n')
  for (const [name, content] of [['typert.host.js', result.js], ['typert.host.d.ts', result.dts],
    ['typert.remote-client.js', result.remote.js], ['typert.remote-client.d.ts', result.remote.dts]]) {
    await writeFile(path.join(project, 'generated/loom', name), content)
  }
  console.log('Generated Loom Host validation and Remote client artifacts')
} finally { await rm(temporary, { recursive: true, force: true }) }
