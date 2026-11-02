import { useMemo } from 'react';
import { CATEGORIES, CATEGORY_LABELS } from '../../../shared/news';
import { CATEGORY_SHORT } from '../lib/categories';
import { inRegion, REGION_IDS, REGIONS } from '../lib/regions';
import { useGlobeStore } from '../store';
import { DropMenu } from './DropMenu';
import { CategoryIcon, CheckIcon, ChevronDownIcon, FilterIcon, RegionIcon } from './icons';
import { REGION_SHORT, useRegionCounts } from './RegionChips';

const plural = (n: number) => `${n} ${n === 1 ? 'story' : 'stories'}`;

/** The phone top bar's left end: which region is on screen, and the others. */
export function RegionMenu() {
  const region = useGlobeStore((s) => s.region);
  const setRegion = useGlobeStore((s) => s.setRegion);
  const counts = useRegionCounts();
  return (
    <DropMenu
      className="m-region"
      buttonClassName="m-region-btn"
      buttonLabel={`Region: ${REGIONS[region].label}. Change region`}
      menuLabel="Region"
      align="start"
      buttonContent={
        <>
          <RegionIcon region={region} size={18} className="m-region-icon" />
          <span className="m-region-name">{REGION_SHORT[region]}</span>
          <ChevronDownIcon size={14} className="m-chevron" />
        </>
      }
    >
      {(close) =>
        REGION_IDS.map((id) => (
          <button
            key={id}
            role="menuitemradio"
            aria-checked={region === id}
            tabIndex={-1}
            className={`drop-item ${region === id ? 'on' : ''}`}
            onClick={() => {
              setRegion(id);
              close();
            }}
          >
            <RegionIcon region={id} size={18} className="drop-item-icon" />
            <span className="drop-item-label">{REGIONS[id].label}</span>
            <span className="drop-item-count" aria-hidden>
              {counts.get(id) ?? 0}
            </span>
            <span className="sr-only">, {plural(counts.get(id) ?? 0)}</span>
            <CheckIcon size={16} className="drop-item-check" />
          </button>
        ))
      }
    </DropMenu>
  );
}

/**
 * The phone top bar's category filter: each category's icon in its globe
 * colour (so the menu is also the colour key), its name, its count in this
 * region, and whether it is shown. The button's badge counts hidden ones.
 */
export function FilterMenu() {
  const dataset = useGlobeStore((s) => s.dataset);
  const hidden = useGlobeStore((s) => s.hidden);
  const region = useGlobeStore((s) => s.region);
  const toggleCategory = useGlobeStore((s) => s.toggleCategory);
  const showAll = useGlobeStore((s) => s.showAllCategories);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const event of dataset?.events ?? []) {
      if (!inRegion(event, region)) continue;
      map.set(event.category, (map.get(event.category) ?? 0) + 1);
    }
    return map;
  }, [dataset, region]);

  const off = hidden.size;
  return (
    <DropMenu
      className="m-filter"
      buttonClassName={`m-icon-btn m-filter-btn ${off ? 'filtered' : ''}`}
      buttonLabel={off ? `Categories: ${off} hidden. Change` : 'Categories: all shown. Filter'}
      menuLabel="Categories"
      align="end"
      buttonContent={
        <>
          <FilterIcon size={20} />
          {off > 0 && (
            <span className="m-badge" aria-hidden>
              {off}
            </span>
          )}
        </>
      }
    >
      {() => (
        <>
          <div className="drop-head" aria-hidden>
            Categories
          </div>
          {CATEGORIES.map((category) => {
            const shown = !hidden.has(category);
            const count = counts.get(category) ?? 0;
            return (
              <button
                key={category}
                role="menuitemcheckbox"
                aria-checked={shown}
                tabIndex={-1}
                className={`drop-item ${shown ? 'on' : 'off'}`}
                onClick={() => toggleCategory(category)}
              >
                <span className="drop-item-icon cat-icon" style={{ color: `var(--cat-${category})` }}>
                  <CategoryIcon category={category} size={18} />
                </span>
                <span className="drop-item-label">
                  <span aria-hidden>{CATEGORY_SHORT[category]}</span>
                  <span className="sr-only">{CATEGORY_LABELS[category]}</span>
                </span>
                <span className="drop-item-count" aria-hidden>
                  {count}
                </span>
                <span className="sr-only">, {plural(count)}</span>
                <span className="drop-check" aria-hidden>
                  <CheckIcon size={14} />
                </span>
              </button>
            );
          })}
          <button
            role="menuitem"
            tabIndex={-1}
            className="drop-item drop-item-all"
            aria-disabled={off === 0}
            onClick={() => showAll()}
          >
            Show all categories
          </button>
        </>
      )}
    </DropMenu>
  );
}
