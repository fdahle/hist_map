import { describe, it, expect } from 'vitest'
import {
  csvDetectDelimiter,
  parseCsvRow,
  parseCsv,
  detectGeomColumns,
  csvToGeoJson,
} from './csvParser.js'

describe('csvDetectDelimiter', () => {
  it('detects comma as delimiter', () => {
    expect(csvDetectDelimiter('a,b,c')).toBe(',')
  })

  it('detects semicolon when it appears more than comma', () => {
    expect(csvDetectDelimiter('a;b;c;d')).toBe(';')
  })

  it('detects tab delimiter', () => {
    expect(csvDetectDelimiter('a\tb\tc')).toBe('\t')
  })

  it('ignores delimiters inside quoted strings', () => {
    // three commas outside quotes vs one semicolon
    expect(csvDetectDelimiter('"a,b";c;d;e')).toBe(';')
  })

  it('defaults to comma when no clear winner', () => {
    expect(csvDetectDelimiter('abc')).toBe(',')
  })
})

describe('parseCsvRow', () => {
  it('splits a simple comma-separated row', () => {
    expect(parseCsvRow('a,b,c', ',')).toEqual(['a', 'b', 'c'])
  })

  it('handles quoted fields containing the delimiter', () => {
    expect(parseCsvRow('"hello,world",b', ',')).toEqual(['hello,world', 'b'])
  })

  it('handles escaped double-quotes inside a quoted field', () => {
    expect(parseCsvRow('"say ""hi""",b', ',')).toEqual(['say "hi"', 'b'])
  })

  it('handles an empty field', () => {
    expect(parseCsvRow('a,,c', ',')).toEqual(['a', '', 'c'])
  })
})

describe('parseCsv', () => {
  it('parses a two-line CSV into headers and row objects', () => {
    const { headers, rows } = parseCsv('x,y,name\n1.0,2.0,Alice')
    expect(headers).toEqual(['x', 'y', 'name'])
    expect(rows).toEqual([{ x: '1.0', y: '2.0', name: 'Alice' }])
  })

  it('trims whitespace from headers', () => {
    const { headers } = parseCsv(' x , y \n1,2')
    expect(headers).toEqual(['x', 'y'])
  })

  it('returns empty result for fewer than 2 lines', () => {
    expect(parseCsv('x,y')).toEqual({ headers: [], rows: [] })
    expect(parseCsv('')).toEqual({ headers: [], rows: [] })
  })

  it('skips blank lines', () => {
    const { rows } = parseCsv('x,y\n1,2\n\n3,4')
    expect(rows).toHaveLength(2)
  })
})

describe('detectGeomColumns', () => {
  it('detects longitude/latitude columns', () => {
    const result = detectGeomColumns(['longitude', 'latitude', 'name'])
    expect(result).toEqual({ xCol: 'longitude', yCol: 'latitude', confident: true })
  })

  it('detects x/y columns as fallback', () => {
    const result = detectGeomColumns(['x', 'y', 'value'])
    expect(result).toEqual({ xCol: 'x', yCol: 'y', confident: true })
  })

  it('is case-insensitive', () => {
    const result = detectGeomColumns(['LON', 'LAT'])
    expect(result.confident).toBe(true)
  })

  it('prefers longer/more-specific pattern over short one', () => {
    // 'longitude' should win over 'x' when both present
    const result = detectGeomColumns(['x', 'longitude', 'latitude'])
    expect(result.xCol).toBe('longitude')
  })

  it('returns confident:false when columns are missing', () => {
    const result = detectGeomColumns(['name', 'value'])
    expect(result.confident).toBe(false)
    expect(result.xCol).toBeNull()
    expect(result.yCol).toBeNull()
  })
})

describe('csvToGeoJson', () => {
  const rows = [
    { lon: '10.5', lat: '52.3', name: 'A' },
    { lon: 'bad', lat: '52.3', name: 'B' },
    { lon: '11.0', lat: '53.0', name: 'C' },
  ]

  it('converts rows with valid coordinates to GeoJSON features', () => {
    const geojson = csvToGeoJson(rows, 'lon', 'lat', 'EPSG:4326')
    expect(geojson.type).toBe('FeatureCollection')
    expect(geojson.features).toHaveLength(2)
  })

  it('skips rows with non-numeric coordinates', () => {
    const geojson = csvToGeoJson(rows, 'lon', 'lat', 'EPSG:4326')
    const names = geojson.features.map((f) => f.properties.name)
    expect(names).not.toContain('B')
  })

  it('sets correct point coordinates', () => {
    const geojson = csvToGeoJson(rows, 'lon', 'lat', 'EPSG:4326')
    expect(geojson.features[0].geometry.coordinates).toEqual([10.5, 52.3])
  })

  it('does not embed a CRS block for EPSG:4326', () => {
    const geojson = csvToGeoJson(rows, 'lon', 'lat', 'EPSG:4326')
    expect(geojson.crs).toBeUndefined()
  })

  it('embeds a CRS block for non-4326 projections', () => {
    const geojson = csvToGeoJson(rows, 'lon', 'lat', 'EPSG:25832')
    expect(geojson.crs).toEqual({ type: 'name', properties: { name: 'EPSG:25832' } })
  })
})
