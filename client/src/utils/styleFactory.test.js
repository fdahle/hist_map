import { describe, it, expect, vi, beforeEach } from 'vitest'

// Must be called before the module under test is imported.
// Vitest hoists vi.mock() calls automatically.
vi.mock('ol/style', () => {
  function Style(opts) { Object.assign(this, opts) }
  function Stroke(opts) { Object.assign(this, opts) }
  function Fill(opts) { Object.assign(this, opts) }
  function Icon(opts) { Object.assign(this, opts) }
  Style.prototype.setZIndex = vi.fn()
  return {
    Style: vi.fn().mockImplementation(function(opts) { Object.assign(this, opts) }),
    Stroke: vi.fn().mockImplementation(function(opts) { Object.assign(this, opts) }),
    Fill: vi.fn().mockImplementation(function(opts) { Object.assign(this, opts) }),
    Icon: vi.fn().mockImplementation(function(opts) { Object.assign(this, opts) }),
  }
})

vi.mock('../constants/icons.js', () => ({
  getMapPinIcon: vi.fn(() => '<svg></svg>'),
}))

import { Style, Stroke, Fill } from 'ol/style'
import { getComplementaryColor, createVectorStyle } from './styleFactory.js'

describe('getComplementaryColor', () => {
  it('returns the complement of pure red', () => {
    expect(getComplementaryColor('#ff0000')).toBe('#00ffff')
  })

  it('returns the complement of white (#000000)', () => {
    expect(getComplementaryColor('#ffffff')).toBe('#000000')
  })

  it('returns the complement of black (#ffffff)', () => {
    expect(getComplementaryColor('#000000')).toBe('#ffffff')
  })

  it('expands 3-digit shorthand hex before computing', () => {
    // #f00 → #ff0000, complement → #00ffff
    expect(getComplementaryColor('#f00')).toBe('#00ffff')
  })

  it('is case-insensitive', () => {
    expect(getComplementaryColor('#FF0000')).toBe('#00ffff')
  })

  it('returns white for null', () => {
    expect(getComplementaryColor(null)).toBe('#ffffff')
  })

  it('returns white for an invalid hex string', () => {
    expect(getComplementaryColor('#gggggg')).toBe('#ffffff')
  })

  it('returns white for a non-string input', () => {
    expect(getComplementaryColor(123)).toBe('#ffffff')
  })
})

describe('createVectorStyle', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a Style with stroke and derived fill by default', () => {
    createVectorStyle('#3388ff')
    expect(Stroke).toHaveBeenCalledWith(expect.objectContaining({ color: '#3388ff' }))
    expect(Fill).toHaveBeenCalledOnce()
    expect(Style).toHaveBeenCalledOnce()
  })

  it('omits stroke when strokeColor is "none"', () => {
    createVectorStyle('none')
    expect(Stroke).not.toHaveBeenCalled()
  })

  it('uses explicit fillColor when provided', () => {
    createVectorStyle('#ff0000', '#00ff00')
    expect(Fill).toHaveBeenCalledWith(expect.objectContaining({ color: '#00ff00' }))
  })

  it('omits fill when fillColor is "none"', () => {
    createVectorStyle('#ff0000', 'none')
    expect(Fill).not.toHaveBeenCalled()
  })

  it('derives fill color from strokeColor with alpha at DEFAULT_OPACITY (50%)', () => {
    // DEFAULT_OPACITY = 0.5 → Math.round(0.5 * 255) = 128 → '80'
    createVectorStyle('#ff0000', null, 2, 0.5)
    expect(Fill).toHaveBeenCalledWith(expect.objectContaining({ color: '#ff000080' }))
  })

  it('correctly encodes 100% opacity as "ff" in the alpha hex', () => {
    createVectorStyle('#ff0000', null, 2, 1)
    expect(Fill).toHaveBeenCalledWith(expect.objectContaining({ color: '#ff0000ff' }))
  })

  it('correctly encodes 0% opacity as "00" in the alpha hex', () => {
    createVectorStyle('#ff0000', null, 2, 0)
    expect(Fill).toHaveBeenCalledWith(expect.objectContaining({ color: '#ff000000' }))
  })
})
