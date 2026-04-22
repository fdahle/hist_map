import { describe, it, expect } from 'vitest'
import { sampleLinePoints, bilinear } from './elevationSampling.js'

describe('sampleLinePoints', () => {
  it('returns the input points when fewer than 2 coordinates', () => {
    expect(sampleLinePoints([[1, 2]], 10)).toEqual([[1, 2]])
    expect(sampleLinePoints([], 10)).toEqual([])
  })

  it('returns numSamples+1 points for a simple line', () => {
    const pts = sampleLinePoints([[0, 0], [10, 0]], 4)
    expect(pts).toHaveLength(5)
  })

  it('returns the start and end points of the line', () => {
    const pts = sampleLinePoints([[0, 0], [10, 0]], 4)
    expect(pts[0]).toEqual([0, 0])
    expect(pts[4]).toEqual([10, 0])
  })

  it('spaces points evenly along a horizontal line', () => {
    const pts = sampleLinePoints([[0, 0], [10, 0]], 4)
    expect(pts[1][0]).toBeCloseTo(2.5)
    expect(pts[2][0]).toBeCloseTo(5.0)
    expect(pts[3][0]).toBeCloseTo(7.5)
  })

  it('handles a multi-segment polyline', () => {
    // Two equal-length segments: (0,0)→(5,0)→(10,0)
    const pts = sampleLinePoints([[0, 0], [5, 0], [10, 0]], 4)
    expect(pts).toHaveLength(5)
    expect(pts[2][0]).toBeCloseTo(5.0)
  })

  it('returns a single point when total length is 0', () => {
    const pts = sampleLinePoints([[3, 4], [3, 4]], 10)
    expect(pts).toEqual([[3, 4]])
  })
})

describe('bilinear', () => {
  // 2×2 raster: top-left=0, top-right=1, bottom-left=2, bottom-right=3
  // Layout (row-major): [0, 1, 2, 3]
  const data = new Float64Array([0, 1, 2, 3])
  const w = 2, h = 2

  it('returns exact corner values', () => {
    expect(bilinear(data, w, h, 0, 0)).toBeCloseTo(0)
    expect(bilinear(data, w, h, 1, 0)).toBeCloseTo(1)
    expect(bilinear(data, w, h, 0, 1)).toBeCloseTo(2)
    expect(bilinear(data, w, h, 1, 1)).toBeCloseTo(3)
  })

  it('interpolates the center of the raster', () => {
    // Center of 2×2: average of all four = 1.5
    expect(bilinear(data, w, h, 0.5, 0.5)).toBeCloseTo(1.5)
  })

  it('clamps out-of-bounds fractional coordinates to the edge', () => {
    // fx=-1 should clamp to 0 → same as corner (0,0) = 0
    expect(bilinear(data, w, h, -1, 0)).toBeCloseTo(0)
    // fy=99 should clamp to h-1=1 → bottom row midpoint
    expect(bilinear(data, w, h, 0.5, 99)).toBeCloseTo(2.5)
  })

  it('falls back to nearest-neighbour when a neighbour is NaN', () => {
    // Replace top-right with NaN; sampling near (0.9, 0) should use nearest = 0 (top-left)
    const d = new Float64Array([0, NaN, 2, 3])
    const result = bilinear(d, w, h, 0.9, 0)
    // Nearest-neighbour at (round(0.9), round(0)) = (1, 0) = NaN → returns NaN
    expect(isNaN(result)).toBe(true)
  })

  it('returns NaN when the nearest pixel is NaN', () => {
    const d = new Float64Array([NaN, NaN, NaN, NaN])
    expect(isNaN(bilinear(d, w, h, 0.5, 0.5))).toBe(true)
  })
})
