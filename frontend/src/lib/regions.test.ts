import { describe, expect, it } from 'vitest';
import type { NewsDataset } from '../../../shared/news';
import live from '../../../data/events.json';
import {
  COUNTRY_REGION,
  groupByState,
  inRegion,
  isRegionId,
  NATIONAL_GROUP,
  REGION_IDS,
  regionFromLatLon,
  regionOf,
} from './regions';

const at = (countryCode: string, lat = 0, lon = 0, scope?: 'global' | 'us') => ({ countryCode, lat, lon, scope });

describe('regionOf', () => {
  it('maps a sample of countries', () => {
    expect(regionOf(at('FR'))).toBe('europe');
    expect(regionOf(at('RU'))).toBe('europe');
    expect(regionOf(at('TR'))).toBe('europe');
    expect(regionOf(at('UA'))).toBe('europe');
    expect(regionOf(at('JP'))).toBe('asia');
    expect(regionOf(at('AU'))).toBe('asia');
    expect(regionOf(at('IN'))).toBe('asia');
    expect(regionOf(at('EG'))).toBe('africa-me');
    expect(regionOf(at('IL'))).toBe('africa-me');
    expect(regionOf(at('SD'))).toBe('africa-me');
    expect(regionOf(at('BR'))).toBe('americas');
    expect(regionOf(at('CA'))).toBe('americas');
    expect(regionOf(at('MX'))).toBe('americas');
    expect(regionOf(at('US'))).toBe('us');
    expect(regionOf(at('us'))).toBe('us');
  });

  it('puts every US-run story in the US view, wherever its dateline', () => {
    expect(regionOf(at('MX', 25, -100, 'us'))).toBe('us');
    expect(regionOf(at('XX', 25, -90, 'us'))).toBe('us');
    expect(regionOf(at('FR', 48, 2, 'global'))).toBe('europe');
  });

  it('falls back to coordinates for XX and unknown codes', () => {
    expect(regionOf(at('XX', 30, -40))).toBe('americas'); // mid-Atlantic
    expect(regionOf(at('XX', -20, 80))).toBe('asia'); // Indian Ocean
    expect(regionOf(at('XX', 15, 40))).toBe('africa-me'); // Red Sea
    expect(regionOf(at('XX', 56, 3))).toBe('europe'); // North Sea
    expect(regionOf(at('ZZ', 0, -160))).toBe('asia'); // central Pacific
    expect(regionFromLatLon(62, 100)).toBe('europe'); // Siberia
  });

  it('maps every country in the live dataset without the fallback', () => {
    const data = live as unknown as NewsDataset;
    for (const event of data.events) {
      if (event.countryCode === 'XX') continue;
      expect(COUNTRY_REGION[event.countryCode], event.countryCode).toBeDefined();
    }
  });

  it('inRegion: world takes everything', () => {
    expect(inRegion(at('FR'), 'world')).toBe(true);
    expect(inRegion(at('FR'), 'asia')).toBe(false);
    expect(REGION_IDS.every(isRegionId)).toBe(true);
    expect(isRegionId('mars')).toBe(false);
  });
});

describe('groupByState', () => {
  it('groups by subdivision, busiest first, national last', () => {
    const events = [
      { id: 'a', subdivision: 'US-TX' },
      { id: 'b' },
      { id: 'c', subdivision: 'US-CA' },
      { id: 'd', subdivision: 'US-TX' },
      { id: 'e', subdivision: 'US-ZZ' },
      { id: 'f', subdivision: 'us-ca' },
      { id: 'g', subdivision: 'US-AK' },
    ];
    const groups = groupByState(events);
    expect(groups.map((g) => g.label)).toEqual(['California', 'Texas', 'Alaska', NATIONAL_GROUP]);
    expect(groups[1].events.map((e) => e.id)).toEqual(['a', 'd']);
    expect(groups[3].events.map((e) => e.id)).toEqual(['b', 'e']);
    expect(groups[3].code).toBe('');
  });

  it('has no national group when every story has a state', () => {
    expect(groupByState([{ subdivision: 'US-NY' }]).map((g) => g.label)).toEqual(['New York']);
    expect(groupByState([])).toEqual([]);
  });
});
