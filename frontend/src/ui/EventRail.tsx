import { useGlobeStore } from '../store';
import { CategoryChips } from './CategoryChips';
import { DayPicker } from './DayPicker';
import { RegionChips } from './RegionChips';
import { StatusPanel } from './StatusPanel';
import { StoryList } from './StoryList';
import { useListStories } from './useStoryArt';

/** Desktop: the story rail on the left. */
export function EventRail() {
  const { sorted, chains } = useListStories();
  const breaking = sorted.filter((e) => e.isBreaking).length;
  const viewing = useGlobeStore((s) => s.viewingDate !== null);

  return (
    <aside className="rail" aria-label="Stories">
      <header className="rail-head">
        <h1 className="rail-brand">
          GlobeNews
          <span className="rail-count" aria-live="polite">
            {sorted.length} {sorted.length === 1 ? 'story' : 'stories'}
            {breaking > 0 && !viewing && <span className="rail-count-breaking"> · {breaking} breaking</span>}
          </span>
        </h1>
        <CategoryChips variant="rail" />
        <RegionChips className="region-chips-rail" />
        <DayPicker className="day-picker-rail" />
      </header>

      <div className="rail-list">
        <StoryList stories={sorted} chains={chains} variant="rail" />
      </div>

      <StatusPanel />
    </aside>
  );
}
