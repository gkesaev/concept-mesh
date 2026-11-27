export interface ValidationResult {
  renders: boolean
  errors: string[]
  hasInteractivity: boolean
  thumbnail: Buffer | null
  screenshotHash: string | null
}

export interface ValidateCardOptions {
  /** Maximum time in milliseconds before failing validation (default: 10000) */
  timeoutMs?: number
  /** Skip Playwright headless rendering and run static checks only */
  staticOnly?: boolean
}
