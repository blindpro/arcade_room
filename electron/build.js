// Bundle the multi-game Electron app for the current platform.
// Run with `npm run package`.
const fs = require('fs'), path = require('path')

const ROOT = path.resolve(__dirname, '..')

// Auto-discover game directories that have a public/index.html.
const GAME_DIRS = fs.readdirSync(ROOT, {withFileTypes: true})
  .filter(d => d.isDirectory() && !['electron','template','node_modules'].includes(d.name) && !d.name.startsWith('.') && !d.name.startsWith('!'))
  .filter(d => fs.existsSync(path.join(ROOT, d.name, 'public', 'index.html')))
  .map(d => d.name)
  .sort()

// `ignore` runs against POSIX-style paths relative to the project root,
// each starting with `/`. Anything matching a regex is dropped from the
// bundle.
const ignorePatterns = [
  /^\/\.git(\/|$)/,
  /^\/\.gitignore$/,
  /^\/\.github(\/|$)/,
  /^\/\.claude(\/|$)/,
  /^\/chat\.txt$/,
  /^\/dist(\/|$)/,
  /^\/template(\/|$)/,            // never ship the empty starter
  /^\/![^/]*(\/|$)/,              // hidden games (directories prefixed with !)
  /^\/README\.md$/,
  /^\/build_all\.bat$/,
  /^\/index\.html$/,              // Caddy-templated launcher (web-only)
  // @electron/packager only applies its own DEFAULT_IGNORES when `ignore` is
  // an array, so a function-style ignore has to repeat them here.
  /\/(package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/,
  /\/node_modules\/\.bin(\/|$)/,
  /\.o(bj)?$/,
  /\/node_gyp_bins(\/|$)/,
]

for (const g of GAME_DIRS) {
  // Inside each game, everything outside public/ is build-time noise.
  ignorePatterns.push(new RegExp(`^/${g}/(src|docs|assets|node_modules|electron|template|tools|dist)(/|$)`))
  ignorePatterns.push(new RegExp(`^/${g}/(Gulpfile\\.js|package\\.json|AGENTS\\.md|CLAUDE[^/]*\\.md|README\\.md|LICENSE|\\.gitignore)$`))
}

// Skip noise inside any other nested node_modules.
ignorePatterns.push(/\/node_modules\/.*\/(test|tests|docs|man|example|examples)(\/|$)/)

;(async () => {
  // @electron/packager v20 is ESM-only.
  const {packager} = await import('@electron/packager')

  const platforms = [process.platform]
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'

  const out = await packager({
    dir: ROOT,
    out: path.join(ROOT, 'dist'),
    name: 'arcade_room',
    asar: true,
    overwrite: true,
    platform: platforms,
    arch,
    icon: path.join(__dirname, 'icon', 'icon'),
    ignore: (p) => ignorePatterns.some((re) => re.test(p)),
  })

  console.log('Bundled to:')
  for (const p of out) console.log('  ' + p)
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
