import { describe, expect, it } from 'vitest';
import {
  inUnitedStates,
  reconcileCoordinates,
  resolvePlace,
  subdivisionFor,
  US_STATES,
  US_SUBDIVISIONS,
} from '../src/gazetteer.ts';

const DC = { lat: 38.9, lon: -77.04 };
const OLYMPIA = { lat: 47.04, lon: -122.9 };

describe('US gazetteer', () => {
  it('knows all 50 states plus DC', () => {
    expect(US_STATES).toHaveLength(51);
    expect(US_SUBDIVISIONS.has('US-DC')).toBe(true);
    expect(US_SUBDIVISIONS.has('US-WY')).toBe(true);
  });

  it.each(['Washington, D.C., USA', 'Washington, DC', 'Washington DC, USA', 'Washington, D.C., USA (PAHO)'])(
    '%s is DC',
    (name) => {
      expect(reconcileCoordinates(name, DC.lat, DC.lon)).toMatchObject({ cc: 'US', sub: 'US-DC', ...DC });
    },
  );

  it.each([
    ['Seattle, Washington', 47.61, -122.33],
    ['Olympia, Washington, USA', OLYMPIA.lat, OLYMPIA.lon],
    ['Washington State', 47.2, -120.1],
    ['Spokane, WA', 47.66, -117.43],
  ])('%s is Washington state and keeps its coordinates', (name, lat, lon) => {
    expect(reconcileCoordinates(name, lat, lon)).toEqual({ lat, lon, cc: 'US', sub: 'US-WA' });
  });

  it('a bare "Washington" takes the reading nearest the coordinates', () => {
    expect(resolvePlace('Washington', OLYMPIA)?.sub).toBe('US-WA');
    expect(resolvePlace('Washington', DC)?.sub).toBe('US-DC');
  });

  it('"Seattle, Washington" placed in DC is moved to Seattle, not left in DC', () => {
    const coords = reconcileCoordinates('Seattle, Washington', DC.lat, DC.lon);
    expect(coords.lat).toBeCloseTo(47.61, 1);
    expect(coords.sub).toBe('US-WA');
  });

  it('a later state overrides an earlier foreign city: Paris, Texas', () => {
    expect(reconcileCoordinates('Paris, Texas', 33.66, -95.56)).toEqual({
      lat: 33.66,
      lon: -95.56,
      cc: 'US',
      sub: 'US-TX',
    });
  });

  it('tells Georgia the state from Georgia the country', () => {
    expect(reconcileCoordinates('Savannah, Georgia, USA', 32.08, -81.09)).toMatchObject({ cc: 'US', sub: 'US-GA' });
    expect(reconcileCoordinates('Folkston, Georgia, USA', 30.83, -82.0)).toMatchObject({ cc: 'US', sub: 'US-GA' });
    expect(reconcileCoordinates('Tbilisi, Georgia', 41.72, 44.79)).toEqual({ lat: 41.72, lon: 44.79, cc: 'GE' });
    expect(resolvePlace('Georgia', { lat: 41.7, lon: 44.8 })?.cc).toBe('GE');
    expect(resolvePlace('Georgia', { lat: 33.7, lon: -84.4 })?.sub).toBe('US-GA');
  });

  it('does not snap a correctly placed US story to the centroid', () => {
    expect(reconcileCoordinates('Boise, USA', 43.62, -116.2)).toMatchObject({ lat: 43.62, lon: -116.2, cc: 'US' });
    expect(reconcileCoordinates('Somewhere, USA', 47.6, -122.3)).toEqual({ lat: 47.6, lon: -122.3, cc: 'US' });
    expect(reconcileCoordinates('Honolulu, Hawaii, USA', 21.31, -157.86)).toMatchObject({ lat: 21.31, sub: 'US-HI' });
  });

  it('still snaps US coordinates that are plainly wrong', () => {
    expect(reconcileCoordinates('United States', 0, 0)).toMatchObject({ lat: 39.8, lon: -98.6 });
    expect(reconcileCoordinates('Austin, Texas, USA', 0, 0)).toMatchObject({ lat: 30.27, sub: 'US-TX' });
  });

  it('keeps the worldwide behaviour', () => {
    expect(reconcileCoordinates('Tokyo, Japan', 0, 0)).toEqual({ lat: 35.68, lon: 139.69, cc: 'JP' });
    expect(reconcileCoordinates('Birmingham, UK', 52.48, -1.9)).toEqual({ lat: 52.48, lon: -1.9, cc: 'GB' });
    // a capitalised country code is not a state abroad
    expect(reconcileCoordinates('Berlin, DE', 52.5, 13.4)).toEqual({ lat: 52.5, lon: 13.4, cc: 'DE' });
    expect(reconcileCoordinates('Ottawa, Canada / Washington, DC, US', 45.42, -75.7).cc).toBe('CA');
    expect(reconcileCoordinates('Eastern Pacific international waters', 10, -120)).toEqual({ lat: 10, lon: -120 });
  });

  it('handles multi-place names', () => {
    expect(resolvePlace('Gulf Shores, Alabama/Pensacola, Florida, USA', { lat: 30.25, lon: -87.7 })?.sub).toBe('US-AL');
    expect(resolvePlace('Manhattan, New York, USA', { lat: 40.78, lon: -73.97 })?.sub).toBe('US-NY');
  });

  it('fills a subdivision from the name, else from the nearest known city', () => {
    expect(subdivisionFor('Pennsylvania, United States', 40.3, -76.9)).toBe('US-PA');
    expect(subdivisionFor('Boca Chica, United States', 25.99, -97.18)).toBe('US-TX');
    expect(subdivisionFor('Middle of nowhere, USA', 44.0, -103.0)).toBeUndefined();
    expect(subdivisionFor('Tokyo, Japan', 35.68, 139.69)).toBeUndefined();
  });

  it('knows the US by its boxes', () => {
    expect(inUnitedStates(61.2, -149.9)).toBe(true);
    expect(inUnitedStates(21.3, -157.9)).toBe(true);
    expect(inUnitedStates(51.5, -0.1)).toBe(false);
  });
});
