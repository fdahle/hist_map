import { describe, it, expect, beforeEach, vi } from 'vitest'
import { loadFromStorage, saveToStorage } from './localStorage.js'

// createPersistedRef uses Vue reactivity so we test it separately
// with a simple behaviour check rather than mocking the full Vue runtime.

const mockStorage = (() => {
  let store = {}
  return {
    getItem: vi.fn((key) => store[key] ?? null),
    setItem: vi.fn((key, value) => { store[key] = value }),
    removeItem: vi.fn((key) => { delete store[key] }),
    clear: vi.fn(() => { store = {} }),
  }
})()

beforeEach(() => {
  vi.stubGlobal('localStorage', mockStorage)
  mockStorage.clear()
  vi.clearAllMocks()
})

describe('loadFromStorage', () => {
  it('returns the parsed value when the key exists', () => {
    mockStorage.setItem('k', JSON.stringify({ a: 1 }))
    expect(loadFromStorage('k', null)).toEqual({ a: 1 })
  })

  it('returns the default value when the key is absent', () => {
    expect(loadFromStorage('missing', 42)).toBe(42)
  })

  it('returns the default value when stored JSON is malformed', () => {
    mockStorage.setItem('bad', '{not json}')
    expect(loadFromStorage('bad', [])).toEqual([])
  })

  it('returns null default correctly', () => {
    expect(loadFromStorage('missing', null)).toBeNull()
  })
})

describe('saveToStorage', () => {
  it('serialises the value as JSON and writes it', () => {
    saveToStorage('key', [1, 2, 3])
    expect(mockStorage.setItem).toHaveBeenCalledWith('key', '[1,2,3]')
  })

  it('does not throw when localStorage.setItem fails', () => {
    mockStorage.setItem.mockImplementationOnce(() => { throw new Error('QuotaExceededError') })
    expect(() => saveToStorage('key', 'value')).not.toThrow()
  })
})
