import { describe, it, expect, vi } from 'vitest'

// Mock all OL modules — these instantiate WebGL/DOM objects that don't exist in Node.
vi.mock('ol/layer/Tile', () => ({ default: vi.fn(() => ({ setOpacity: vi.fn() })) }))
vi.mock('ol/layer/WebGLTile', () => ({ default: vi.fn(() => ({ setOpacity: vi.fn() })) }))
vi.mock('ol/source/XYZ', () => ({ default: vi.fn() }))
vi.mock('ol/tilegrid/TileGrid', () => ({ default: vi.fn() }))
vi.mock('ol/tilegrid', () => ({ createXYZ: vi.fn() }))
vi.mock('ol/source/WMTS', () => ({ default: vi.fn() }))
vi.mock('ol/tilegrid/WMTS', () => ({ default: vi.fn() }))
vi.mock('ol/source/TileWMS', () => ({ default: vi.fn() }))
vi.mock('ol/source/GeoTIFF', () => ({ default: vi.fn() }))

import { buildColormapStyle, createGeoJSONLayerConfig } from './layerFactory.js'

// ─── buildColormapStyle ───────────────────────────────────────────────────────

describe('buildColormapStyle', () => {
  it('returns a grayscale style when colormapId is undefined', () => {
    expect(buildColormapStyle(undefined, false)).toEqual({
      color: ['array', ['band', 1], ['band', 1], ['band', 1], 1],
    })
  })

  it('returns a grayscale style for the "grayscale" id', () => {
    expect(buildColormapStyle('grayscale', false)).toEqual({
      color: ['array', ['band', 1], ['band', 1], ['band', 1], 1],
    })
  })

  it('uses band 2 as the alpha channel when hasNoData is true', () => {
    const style = buildColormapStyle('grayscale', true)
    expect(style.color[4]).toEqual(['band', 2])
  })

  it('uses literal 1 as alpha when hasNoData is false', () => {
    const style = buildColormapStyle('grayscale', false)
    expect(style.color[4]).toBe(1)
  })

  it('returns an inverted grayscale style', () => {
    const v = ['-', 1, ['band', 1]]
    expect(buildColormapStyle('grayscale', false, true)).toEqual({
      color: ['array', v, v, v, 1],
    })
  })

  it('returns interpolation expressions for a named colormap', () => {
    const style = buildColormapStyle('viridis', false)
    expect(style.color[0]).toBe('array')
    expect(style.color[1][0]).toBe('interpolate')
    expect(style.color[2][0]).toBe('interpolate')
    expect(style.color[3][0]).toBe('interpolate')
  })

  it('interpolates against band 1', () => {
    const style = buildColormapStyle('viridis', false)
    expect(style.color[1][2]).toEqual(['band', 1])
  })

  it('inverting a named colormap changes the R value at position 0', () => {
    const normal = buildColormapStyle('viridis', false, false)
    const inverted = buildColormapStyle('viridis', false, true)
    // rInterp layout: ['interpolate', ['linear'], ['band', 1], pos0, r0, pos1, r1, ...]
    // Normal: pos0=0, r0=viridis start color
    // Inverted: pos0=0, r0=viridis end color (positions flipped and re-sorted)
    const normalR0 = normal.color[1][4]
    const invertedR0 = inverted.color[1][4]
    expect(normalR0).not.toBeCloseTo(invertedR0)
  })

  it('passes hasNoData alpha through for named colormaps', () => {
    const style = buildColormapStyle('viridis', true)
    // alpha is the 5th element in the ['array', r, g, b, alpha] expression
    expect(style.color[4]).toEqual(['band', 2])
  })
})

// ─── createGeoJSONLayerConfig ─────────────────────────────────────────────────

describe('createGeoJSONLayerConfig', () => {
  const base = {
    name: 'Test Layer',
    visible: true,
    url: '/data/test.geojson',
  }

  it('creates a config object with the expected shape', () => {
    expect(createGeoJSONLayerConfig(base, 'layer-1')).toMatchObject({
      layerId: 'layer-1',
      name: 'Test Layer',
      type: 'geojson',
      visible: true,
      url: '/data/test.geojson',
      layerInstance: null,
    })
  })

  it('uses color when both color and stroke_color are set', () => {
    const conf = { ...base, color: '#00ff00', stroke_color: '#ff0000' }
    const config = createGeoJSONLayerConfig(conf, 'layer-2')
    expect(config.color).toBe('#00ff00')
    expect(config.strokeColor).toBe('#ff0000')
  })

  it('falls back to stroke_color as the badge color when color is absent', () => {
    const conf = { ...base, stroke_color: '#ff0000' }
    const config = createGeoJSONLayerConfig(conf, 'layer-3')
    expect(config.color).toBe('#ff0000')
    expect(config.strokeColor).toBe('#ff0000')
  })

  it('defaults searchFields to an empty array', () => {
    expect(createGeoJSONLayerConfig(base, 'layer-4').searchFields).toEqual([])
  })

  it('passes search_fields through', () => {
    const conf = { ...base, search_fields: ['name', 'id'] }
    expect(createGeoJSONLayerConfig(conf, 'layer-5').searchFields).toEqual(['name', 'id'])
  })

  it('defaults renderMode to "vector"', () => {
    expect(createGeoJSONLayerConfig(base, 'layer-6').renderMode).toBe('vector')
  })

  it('passes render_mode through', () => {
    const conf = { ...base, render_mode: 'image' }
    expect(createGeoJSONLayerConfig(conf, 'layer-7').renderMode).toBe('image')
  })

  it('defaults groupBy to null', () => {
    expect(createGeoJSONLayerConfig(base, 'layer-8').groupBy).toBeNull()
  })

  it('passes group_by through', () => {
    const conf = { ...base, group_by: 'category' }
    expect(createGeoJSONLayerConfig(conf, 'layer-9').groupBy).toBe('category')
  })

  it('defaults sourceCrs to null', () => {
    expect(createGeoJSONLayerConfig(base, 'layer-10').sourceCrs).toBeNull()
  })

  it('passes sourceCrs through', () => {
    const conf = { ...base, sourceCrs: 'EPSG:3031' }
    expect(createGeoJSONLayerConfig(conf, 'layer-11').sourceCrs).toBe('EPSG:3031')
  })
})
