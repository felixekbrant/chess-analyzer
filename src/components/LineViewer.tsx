import { useEffect, useRef, useState } from 'react';
import { useStableCallback } from '../hooks/useStableCallback';
import type { ExplainedLine } from '../lib/analysis/lines';
import { Icon } from './Icon';

/**
 * Steps through an engine line: tappable moves, a note on the current move, the outcome at the end,
 * and Play to watch it move by move. The board itself is driven by the parent through `index`
 * (how many moves of the line are on the board). With its own controls, the arrow keys step through
 * it too: ← → a move, ↑ ↓ to the start and end, Esc closes.
 */
export function LineViewer({
  title,
  context,
  line,
  index,
  onIndex,
  onClose,
  controls = true,
}: {
  /** False when the page has its own controls for stepping through the line (the review's bottom bar). */
  controls?: boolean;
  title: string;
  /** One line under the title, e.g. how much the move changes your winning chances. */
  context?: string;
  line: ExplainedLine;
  index: number;
  onIndex: (i: number) => void;
  onClose?: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const [playing, setPlaying] = useState(false);
  const shown = showAll ? line.steps.length : Math.max(line.keyLength, index);
  const atEnd = index >= shown;
  const step = index > 0 ? line.steps[index - 1] : undefined;

  // Play: one move every 0.9 s until the end of the shown part.
  const indexRef = useRef(index);
  indexRef.current = index;
  useEffect(() => {
    if (!playing) return;
    if (atEnd) return setPlaying(false);
    const t = setTimeout(() => onIndex(indexRef.current + 1), index === 0 ? 300 : 900);
    return () => clearTimeout(t);
  }, [playing, index, atEnd, onIndex]);

  const onKey = useStableCallback((e: KeyboardEvent) => {
    if (!controls || e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target as HTMLElement;
    if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return;
    if (e.key === 'ArrowRight') {
      if (index >= line.steps.length) return;
      // Past the key part of the line: show the rest rather than stop.
      if (index >= shown) setShowAll(true);
      onIndex(index + 1);
    } else if (e.key === 'ArrowLeft') onIndex(Math.max(0, index - 1));
    else if (e.key === 'ArrowUp' || e.key === 'Home') onIndex(0);
    else if (e.key === 'ArrowDown' || e.key === 'End') onIndex(shown);
    else if (e.key === 'Escape' && onClose) onClose();
    else return;
    setPlaying(false);
    e.preventDefault();
  });
  useEffect(() => {
    if (!controls) return;
    const h = (e: KeyboardEvent) => onKey(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [controls, onKey]);

  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold">{title}</p>
        {onClose && (
          <button className="icon-btn !min-w-8 !min-h-8 -m-1" onClick={onClose} aria-label="Close the line">
            <Icon name="close" size={16} />
          </button>
        )}
      </div>

      {context && <p className="muted text-sm mt-0.5">{context}</p>}

      <div className="flex flex-wrap gap-1 mt-2" role="list">
        {line.steps.slice(0, shown).map((s, i) => (
          <button
            key={i}
            role="listitem"
            onClick={() => {
              setPlaying(false);
              onIndex(i + 1);
            }}
            className={`rounded-md px-1.5 py-0.5 text-sm tabular-nums ${
              i + 1 === index ? 'bg-primary text-white font-semibold' : i < index ? 'bg-[var(--panel-2)]' : 'bg-[var(--panel-2)] muted'
            }`}
          >
            {(s.color === 'w' || i === 0) && <span className="opacity-70 mr-0.5">{s.number}</span>}
            {s.san}
          </button>
        ))}
        {!showAll && line.steps.length > shown && (
          <button className="rounded-md px-1.5 py-0.5 text-sm muted underline" onClick={() => setShowAll(true)}>
            +{line.steps.length - shown} more
          </button>
        )}
      </div>

      <p className="mt-2 min-h-[2.5em]">
        {step?.note}
        {atEnd && index > 0 && line.summary && (
          <>
            {' '}
            <b>{line.summary}</b>
          </>
        )}
      </p>

      {controls && (
      <div className="flex items-center gap-2 mt-2">
        <button className="btn !py-1.5" onClick={() => onIndex(Math.max(0, index - 1))} disabled={index === 0} aria-label="Previous move" title="Previous move (←)">
          <Icon name="prev" size={16} />
        </button>
        <button
          className="btn btn-primary !py-1.5 flex-1 justify-center"
          onClick={() => {
            if (atEnd) {
              onIndex(0);
              setPlaying(true);
            } else setPlaying((p) => !p);
          }}
        >
          <Icon name={playing ? 'pause' : atEnd ? 'retry' : 'play'} size={16} /> {playing ? 'Pause' : atEnd ? 'Replay' : 'Play'}
        </button>
        <button className="btn !py-1.5" onClick={() => onIndex(Math.min(shown, index + 1))} disabled={atEnd} aria-label="Next move" title="Next move (→)">
          <Icon name="next" size={16} />
        </button>
      </div>
      )}
    </div>
  );
}
