// Visual QA harness for HELIOS CORE.
//
//   node scripts/visual_check.mjs                    run every scenario against the dev server
//   node scripts/visual_check.mjs --only default,xray
//   node scripts/visual_check.mjs --url http://127.0.0.1:5181 --tier low
//
// Drives a real, GPU-backed Chrome through the actual interface (mouse drags,
// wheel, button clicks), saves screenshots to .qa/, and fails on console errors.

import { chromium } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : fallback
}

const baseUrl = arg('url', 'http://127.0.0.1:5180')
const tier = arg('tier', 'high')
const only = arg('only', '')?.split(',').filter(Boolean) ?? []
const outDir = path.join(root, arg('out', '.qa'))
fs.mkdirSync(outDir, { recursive: true })

const CHROME_PATHS = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean)
const executablePath = CHROME_PATHS.find((p) => fs.existsSync(p))
if (!executablePath) {
  console.error('No Chrome or Edge found. Set CHROME_PATH.')
  process.exit(2)
}

const DESKTOP = { width: 1440, height: 900 }
const PHONE = { width: 390, height: 844 }

const problems = []
const notes = new Set()

// Warnings that come from dependencies, not from this project, and indicate no defect:
// R3F still constructs THREE.Clock, and ANGLE's HLSL compiler reports constant-folding
// precision notes (X4122) for kernel constants inside third-party blur shaders.
const BENIGN = [/THREE\.Clock: This module has been deprecated/, /warning X4122/]

function report(kind, text) {
  if (BENIGN.some((re) => re.test(text))) notes.add(`${kind}: ${text.split('\n')[0].slice(0, 110)}`)
  else problems.push(`${kind}: ${text}`)
}

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ['--enable-webgl', '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11', '--hide-scrollbars'],
})

async function open(viewport, { mobile = false, tier: forTier = tier, reducedMotion = false } = {}) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: mobile ? 2 : 1,
    hasTouch: mobile,
    isMobile: mobile,
    reducedMotion: reducedMotion ? 'reduce' : 'no-preference',
  })
  const page = await context.newPage()
  page.on('console', (msg) => {
    if (msg.type() === 'error') report('console.error', msg.text())
    if (msg.type() === 'warning') report('console.warn', msg.text())
  })
  page.on('pageerror', (err) => report('pageerror', err.message))
  await page.goto(`${baseUrl}/?tier=${forTier}`, { waitUntil: 'load' })
  await page.waitForFunction(() => window.__HELIOS_STORE__?.getState().introCompleted === true, null, { timeout: 45000 })
  await page.waitForTimeout(1600)
  return { page, context }
}

const store = (page, fn, value) => page.evaluate(([f, v]) => window.__HELIOS_STORE__.getState()[f](v), [fn, value])
const state = (page) =>
  page.evaluate(() => {
    const s = window.__HELIOS_STORE__.getState()
    return {
      coreOutput: s.coreOutput,
      ringSpeed: s.ringSpeed,
      mode: s.operatingMode,
      xray: s.xrayEnabled,
      orbit: s.orbitEnabled,
      paused: s.paused,
      selected: s.selectedAnatomy,
      view: s.view,
      tier: s.performanceTier,
    }
  })

async function shot(page, name) {
  const file = path.join(outDir, `${name}.png`)
  await page.screenshot({ path: file })
  console.log(`  saved ${path.relative(root, file)}`)
}

async function drag(page, dx, dy, viewport = DESKTOP) {
  const cx = viewport.width / 2
  const cy = viewport.height * 0.45
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx + dx, cy + dy, { steps: 14 })
  await page.mouse.up()
  await page.waitForTimeout(900)
}

async function fps(page) {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        let frames = 0
        const start = performance.now()
        const tick = () => {
          frames++
          if (performance.now() - start < 2000) requestAnimationFrame(tick)
          else resolve(Math.round((frames * 1000) / (performance.now() - start)))
        }
        requestAnimationFrame(tick)
      }),
  )
}

const click = (page, name) => page.getByRole('button', { name, exact: true }).click()

/** Mean brightness of the frame that was just rendered, 0..765. */
const frameLuminance = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => {
          const source = document.querySelector('.stage canvas')
          const probe = document.createElement('canvas')
          probe.width = 160
          probe.height = 100
          const ctx = probe.getContext('2d')
          ctx.drawImage(source, 0, 0, probe.width, probe.height)
          const data = ctx.getImageData(0, 0, probe.width, probe.height).data
          let sum = 0
          for (let i = 0; i < data.length; i += 4) sum += data[i] + data[i + 1] + data[i + 2]
          resolve(sum / (data.length / 4))
        })
      }),
  )

const scenarios = {
  // Regression guard for the blackout class of bug: a single NaN pixel reaching
  // bloom turns a whole frame black for a moment. Sample many frames; none may be dark.
  async stability() {
    const { page, context } = await open(DESKTOP)
    let dark = 0
    let lowest = Infinity
    const samples = 90
    for (let i = 0; i < samples; i++) {
      await page.waitForTimeout(110)
      const lum = await frameLuminance(page)
      lowest = Math.min(lowest, lum)
      if (lum < 3) dark++
    }
    console.log(`  ${samples} frames sampled, ${dark} dark, lowest luminance ${lowest.toFixed(1)}`)
    if (dark > 0) problems.push(`stability: ${dark}/${samples} frames rendered black`)
    await context.close()
  },

  // The opening: loading line, ignition, spin-up, then the interface.
  async intro() {
    const context = await browser.newContext({ viewport: DESKTOP })
    const page = await context.newPage()
    page.on('console', (msg) => {
      if (msg.type() === 'error') report('console.error', msg.text())
      if (msg.type() === 'warning') report('console.warn', msg.text())
    })
    page.on('pageerror', (err) => report('pageerror', err.message))
    await page.goto(`${baseUrl}/?tier=${tier}`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.loading')
    await shot(page, '30_loading')
    await page.waitForFunction(() => window.__HELIOS_STORE__?.getState().sceneReady === true, null, { timeout: 45000 })
    const started = Date.now()
    for (const [at, name] of [
      [600, '31_intro_0.6s'],
      [1400, '32_intro_1.4s'],
      [2300, '33_intro_2.3s'],
      [3300, '34_intro_3.3s'],
      [5200, '35_intro_5.2s'],
    ]) {
      await page.waitForTimeout(Math.max(0, at - (Date.now() - started)))
      await shot(page, name)
    }
    await context.close()
  },

  // The plate is composed from the live frame; check that it really produces an image.
  async plate() {
    const { page, context } = await open(DESKTOP)
    await page.locator('.nav__item', { hasText: 'Collect' }).click()
    await page.waitForTimeout(800)
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.getByRole('button', { name: /Save plate/ }).click()])
    const file = path.join(outDir, '36_plate.png')
    await download.saveAs(file)
    const size = fs.statSync(file).size
    console.log(`  plate ${download.suggestedFilename()} ${(size / 1024).toFixed(0)} kB -> ${path.relative(root, file)}`)
    if (size < 50_000) problems.push(`plate: captured image is suspiciously small (${size} bytes)`)
    await context.close()
  },

  async default() {
    const { page, context } = await open(DESKTOP)
    await store(page, 'toggleOrbit')
    await page.waitForTimeout(600)
    await shot(page, '01_default_three_quarter')
    console.log(`  fps ~${await fps(page)}  state ${JSON.stringify(await state(page))}`)
    await context.close()
  },

  async angles() {
    const { page, context } = await open(DESKTOP)
    await store(page, 'toggleOrbit')
    await drag(page, 115, 0)
    await shot(page, '02_front')
    await drag(page, 330, 0)
    await shot(page, '03_side')
    await drag(page, 380, 0)
    await shot(page, '04_rear')
    await drag(page, 120, -190)
    await shot(page, '05_high')
    await click(page, 'Reset view')
    await page.waitForTimeout(1500)
    await page.mouse.move(DESKTOP.width / 2, DESKTOP.height * 0.45)
    await page.mouse.wheel(0, -900)
    await page.waitForTimeout(1200)
    await shot(page, '06_zoom_in')
    await page.mouse.wheel(0, 2600)
    await page.waitForTimeout(1200)
    await shot(page, '07_zoom_out')
    await context.close()
  },

  async modes() {
    const { page, context } = await open(DESKTOP)
    await store(page, 'toggleOrbit')
    for (const [label, file] of [
      ['IGNITION', '08_ignition'],
      ['STABILIZING', '09_stabilizing'],
      ['OVERDRIVE', '10_overdrive'],
    ]) {
      await page.getByRole('radio', { name: label }).click()
      await page.waitForTimeout(3600)
      await shot(page, file)
    }
    console.log(`  after OVERDRIVE ${JSON.stringify(await state(page))}`)
    await page.getByRole('radio', { name: 'RADIANCE' }).click()
    await page.waitForTimeout(2800)
    await context.close()
  },

  async controls() {
    const { page, context } = await open(DESKTOP)
    await store(page, 'toggleOrbit')
    await page.locator('#core-output').fill('1.75')
    await page.locator('#ring-speed').fill('2')
    await page.waitForTimeout(2800)
    await shot(page, '11_output_max')
    console.log(`  sliders max ${JSON.stringify(await state(page))}`)
    await page.locator('#core-output').fill('0.35')
    await page.locator('#ring-speed').fill('0.25')
    await page.waitForTimeout(2800)
    await shot(page, '12_output_min')
    await click(page, 'Pause')
    await page.waitForTimeout(1800)
    const a = await page.screenshot()
    await page.waitForTimeout(1200)
    const b = await page.screenshot()
    console.log(`  paused: mechanism frames identical = ${Buffer.compare(a, b) === 0} (core shimmer may differ)`)
    await shot(page, '13_paused')
    await click(page, 'Resume')
    await click(page, 'X-Ray')
    await page.waitForTimeout(1500)
    await click(page, 'Reset')
    await page.waitForTimeout(2600)
    const after = await state(page)
    console.log(`  after RESET ${JSON.stringify(after)}`)
    if (after.coreOutput !== 1 || after.ringSpeed !== 1 || after.mode !== 'radiance' || after.xray || after.paused || after.selected) {
      problems.push(`reset did not restore defaults: ${JSON.stringify(after)}`)
    }
    await shot(page, '14_after_reset')
    await context.close()
  },

  async xray() {
    const { page, context } = await open(DESKTOP)
    await store(page, 'toggleOrbit')
    await click(page, 'X-Ray')
    await page.waitForTimeout(1500)
    await shot(page, '15_xray')
    await drag(page, 300, -60)
    await shot(page, '16_xray_side')
    await context.close()
  },

  async anatomy() {
    const { page, context } = await open(DESKTOP)
    await store(page, 'toggleOrbit')
    for (const [name, file] of [
      ['Solar Fin', '17_anatomy_fins'],
      ['Gyro Rings', '18_anatomy_rings'],
      ['Plasma Core', '19_anatomy_core'],
      ['Regulator', '20_anatomy_regulator'],
      ['Anchor', '21_anatomy_anchor'],
    ]) {
      await page.locator('.anatomy__item', { hasText: name }).click()
      await page.waitForTimeout(2300)
      await shot(page, file)
    }
    await page.locator('.nav__item', { hasText: 'Collect' }).click()
    await page.waitForTimeout(1800)
    await shot(page, '22_collect')
    await context.close()
  },

  // A phone gets the low tier in the field, so that is what is tested here.
  async mobile() {
    const { page, context } = await open(PHONE, { mobile: true, tier: 'low' })
    await store(page, 'toggleOrbit')
    await page.waitForTimeout(500)
    await shot(page, '23_mobile_observe')
    console.log(`  mobile fps ~${await fps(page)}  state ${JSON.stringify(await state(page))}`)
    for (const [label, file] of [
      ['Explore', '24_mobile_explore'],
      ['Interact', '25_mobile_interact'],
      ['Collect', '26_mobile_collect'],
    ]) {
      await page.locator('.nav__item', { hasText: label }).tap()
      await page.waitForTimeout(2000)
      await shot(page, file)
    }
    await context.close()
  },

  // Auto orbit is left on here: two frames a few seconds apart must show a turned artifact.
  async orbit() {
    const { page, context } = await open(DESKTOP)
    await shot(page, '37_orbit_a')
    await page.waitForTimeout(9000)
    await shot(page, '38_orbit_b')
    // A drag must hand control back to the visitor, then orbit resumes on its own.
    await drag(page, 60, 0)
    console.log(`  orbit state ${JSON.stringify(await state(page))}`)
    await context.close()
  },

  // Single-key shortcuts, checked against the store rather than by eye.
  async keyboard() {
    const { page, context } = await open(DESKTOP)
    const expectState = async (label, want) => {
      const got = await state(page)
      for (const [key, value] of Object.entries(want)) {
        if (got[key] !== value) problems.push(`keyboard ${label}: ${key} is ${got[key]}, expected ${value}`)
      }
    }
    await page.keyboard.press('x')
    await expectState('X', { xray: true })
    await page.keyboard.press('4')
    await expectState('4', { mode: 'overdrive', coreOutput: 1.35 })
    await page.keyboard.press('Space')
    await expectState('Space', { paused: true })
    await page.keyboard.press('o')
    await expectState('O', { orbit: false })
    await page.keyboard.press('r')
    await expectState('R', { xray: false, mode: 'radiance', paused: false, orbit: true, coreOutput: 1 })
    // Tab must reach real controls, and Enter must operate them.
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Enter')
    await expectState('Tab+Enter on EXPLORE', { view: 'explore', selected: 'core' })
    await page.keyboard.press('Escape')
    await expectState('Escape', { view: 'observe', selected: null })
    console.log('  shortcuts X, 4, Space, O, R, Tab+Enter, Escape exercised')
    await context.close()
  },

  // One-finger orbit and two-finger pinch, sent as real touch events.
  async touch() {
    const { page, context } = await open(PHONE, { mobile: true, tier: 'low' })
    await store(page, 'toggleOrbit')
    const cdp = await context.newCDPSession(page)
    const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) })
    const interacted = () => page.evaluate(() => window.__HELIOS_STORE__.getState().hasInteracted)
    if (await interacted()) problems.push('touch: hasInteracted was already true before any gesture')

    await touch('touchStart', [[195, 420]])
    for (let i = 1; i <= 12; i++) await touch('touchMove', [[195 + i * 10, 420]])
    await touch('touchEnd', [])
    await page.waitForTimeout(900)
    if (!(await interacted())) problems.push('touch: a one-finger drag did not reach the orbit controls')
    await shot(page, '39_touch_orbit')

    await touch('touchStart', [
      [150, 420],
      [240, 420],
    ])
    for (let i = 1; i <= 12; i++) {
      await touch('touchMove', [
        [150 - i * 5, 420],
        [240 + i * 5, 420],
      ])
    }
    await touch('touchEnd', [])
    await page.waitForTimeout(900)
    await shot(page, '40_touch_pinch')
    await context.close()
  },

  // With WebGL 2 unavailable the visitor gets a branded message, not a black page or a stack trace.
  async fallback() {
    const context = await browser.newContext({ viewport: DESKTOP })
    const page = await context.newPage()
    page.on('pageerror', (err) => report('pageerror', err.message))
    page.on('console', (msg) => {
      if (msg.type() === 'error') report('console.error', msg.text())
    })
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.getContext = function (kind, ...rest) {
        return /webgl/i.test(kind) ? null : original.call(this, kind, ...rest)
      }
    })
    await page.goto(`${baseUrl}/`, { waitUntil: 'load' })
    await page.waitForTimeout(600)
    const text = await page.locator('.fallback').innerText().catch(() => '')
    if (!/requires WebGL/i.test(text)) problems.push(`fallback: expected the WebGL message, got "${text.slice(0, 80)}"`)
    if (await page.locator('canvas').count()) problems.push('fallback: a canvas was still mounted')
    await shot(page, '41_webgl_fallback')
    await context.close()
  },

  async tablet() {
    const { page, context } = await open({ width: 1024, height: 768 })
    await store(page, 'toggleOrbit')
    await page.waitForTimeout(500)
    await shot(page, '27_tablet')
    await context.close()
  },

  async lowtier() {
    const { page, context } = await open(DESKTOP, { tier: 'low' })
    await store(page, 'toggleOrbit')
    await page.waitForTimeout(500)
    await shot(page, '28_low_tier')
    console.log(`  low tier fps ~${await fps(page)}  state ${JSON.stringify(await state(page))}`)
    await context.close()
  },

  async reduced() {
    const { page, context } = await open(DESKTOP, { reducedMotion: true })
    await shot(page, '29_reduced_motion')
    console.log(`  reduced motion ${JSON.stringify(await state(page))}`)
    await context.close()
  },
}

const names = only.length ? only : Object.keys(scenarios)
for (const name of names) {
  const run = scenarios[name]
  if (!run) {
    console.error(`Unknown scenario: ${name}`)
    continue
  }
  console.log(`> ${name}`)
  try {
    await run()
  } catch (err) {
    problems.push(`${name}: ${err.message}`)
    console.error(`  FAILED ${err.message}`)
  }
}

await browser.close()

if (notes.size) {
  console.log(`\n${notes.size} third-party note(s), not counted:`)
  notes.forEach((n) => console.log(`  · ${n}`))
}

const unique = [...new Set(problems)]
if (unique.length) {
  console.log(`\n${unique.length} problem(s):`)
  unique.forEach((p) => console.log(`  - ${p}`))
  process.exit(1)
}
console.log('\nNo console errors or warnings.')
