import { existsSync } from 'node:fs'
import { chromium, type Browser } from 'playwright'

const SYSTEM_CHROMIUM_CANDIDATES = [
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
]

let browserPromise: Promise<Browser> | null = null

function resolveExecutablePath(): string | undefined {
  const envPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  if (envPath && existsSync(envPath)) {
    return envPath
  }

  try {
    const bundled = chromium.executablePath()
    if (bundled && existsSync(bundled)) {
      return bundled
    }
  } catch {
    // Fall through to system browser discovery
  }

  return SYSTEM_CHROMIUM_CANDIDATES.find(candidate => existsSync(candidate))
}

async function launchBrowser(): Promise<Browser> {
  const executablePath = resolveExecutablePath()
  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  })

  browser.on('disconnected', () => {
    browserPromise = null
  })

  return browser
}

/**
 * Returns a shared headless Chromium instance for server-side card validation,
 * re-launching transparently if the browser disconnects.
 */
export async function getValidationBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = launchBrowser().catch(err => {
      browserPromise = null
      throw err
    })
  }

  const browser = await browserPromise
  if (!browser.isConnected()) {
    browserPromise = null
    return getValidationBrowser()
  }
  return browser
}

/**
 * Closes the shared validation browser (used for graceful shutdown and test teardown).
 */
export async function closeValidationBrowser(): Promise<void> {
  if (!browserPromise) return
  const pending = browserPromise
  browserPromise = null
  try {
    const browser = await pending
    await browser.close()
  } catch {
    // Ignore errors when shutting down an already-closed browser
  }
}
