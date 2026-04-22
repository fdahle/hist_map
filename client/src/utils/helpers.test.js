import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { capitalize, formatKey, generateUUID, debounce } from './helpers.js'

describe('capitalize', () => {
  it('capitalizes the first letter of a lowercase string', () => {
    expect(capitalize('hello')).toBe('Hello')
  })

  it('returns empty string for empty input', () => {
    expect(capitalize('')).toBe('')
  })

  it('returns empty string for null/undefined', () => {
    expect(capitalize(null)).toBe('')
    expect(capitalize(undefined)).toBe('')
  })

  it('does not change an already-capitalized string', () => {
    expect(capitalize('Hello')).toBe('Hello')
  })

  it('capitalizes only the first letter, leaving the rest unchanged', () => {
    expect(capitalize('hELLO')).toBe('HELLO')
  })

  it('handles a single character', () => {
    expect(capitalize('a')).toBe('A')
  })
})

describe('formatKey', () => {
  it('replaces underscores with spaces and capitalizes each word', () => {
    expect(formatKey('layer_name')).toBe('Layer Name')
  })

  it('handles multiple underscores', () => {
    expect(formatKey('some_long_key_name')).toBe('Some Long Key Name')
  })

  it('handles a key with no underscores', () => {
    expect(formatKey('hello')).toBe('Hello')
  })

  it('handles already-capitalized words', () => {
    expect(formatKey('Layer_Name')).toBe('Layer Name')
  })
})

describe('generateUUID', () => {
  it('returns a valid UUID v4 format', () => {
    const uuid = generateUUID()
    expect(uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
  })

  it('generates a unique value on each call', () => {
    expect(generateUUID()).not.toBe(generateUUID())
  })
})

describe('debounce', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('does not call the function before the delay elapses', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 100)
    debounced()
    expect(fn).not.toHaveBeenCalled()
  })

  it('calls the function once after the delay', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 100)
    debounced()
    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledOnce()
  })

  it('resets the timer on rapid successive calls', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 100)
    debounced()
    vi.advanceTimersByTime(50)
    debounced()
    vi.advanceTimersByTime(50)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(50)
    expect(fn).toHaveBeenCalledOnce()
  })

  it('passes arguments through to the wrapped function', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 100)
    debounced('a', 42)
    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledWith('a', 42)
  })
})
