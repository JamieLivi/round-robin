import { motion } from 'motion/react';
import type { Lender } from './simulation';

type Props = {
  lenders: Lender[];
  servedNow: Record<string, number>;
  activeLenderId: string | null;
};

const MIN_RADIUS = 22;
const MAX_RADIUS = 56;
const RING_PADDING = 10; // Room around the biggest dot for the active-highlight ring
const SVG_SIZE = (MAX_RADIUS + RING_PADDING) * 2;
const CENTER = SVG_SIZE / 2;

const formatUsd = (value: number) => `$${value.toLocaleString('en-US')}`;

const ORDINAL_SUFFIX = (i: number) => {
  const v = i + 1;
  if (v >= 11 && v <= 13) return 'th';
  switch (v % 10) {
    case 1:
      return 'st';
    case 2:
      return 'nd';
    case 3:
      return 'rd';
    default:
      return 'th';
  }
};

export function DotsView({ lenders, servedNow, activeLenderId }: Props) {
  const maxCapacity = Math.max(1, ...lenders.map((l) => l.capacity));

  return (
    <div className="dots-view">
      {lenders.map((lender, i) => {
        const served = servedNow[lender.id] ?? 0;
        const fillRatio = lender.capacity > 0 ? Math.min(1, served / lender.capacity) : 0;
        const isActive = lender.id === activeLenderId;
        const radius = MIN_RADIUS + (MAX_RADIUS - MIN_RADIUS) * (lender.capacity / maxCapacity);

        return (
          <div key={lender.id} className="dot-cell">
            <div className="queue-badge">
              {i + 1}
              {ORDINAL_SUFFIX(i)} IN QUEUE
            </div>

            <svg width={SVG_SIZE} height={SVG_SIZE} viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}>
              {isActive && (
                <motion.circle
                  cx={CENTER}
                  cy={CENTER}
                  r={radius + 8}
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth={3}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                />
              )}
              <motion.circle
                cx={CENTER}
                cy={CENTER}
                r={radius}
                fill="#1e293b"
                stroke="#334155"
                strokeWidth={2}
                animate={{ r: radius }}
                transition={{ type: 'spring', stiffness: 200, damping: 25 }}
              />
              <defs>
                <clipPath id={`clip-${lender.id}`}>
                  <rect
                    x={CENTER - radius}
                    y={CENTER + radius - radius * 2 * fillRatio}
                    width={radius * 2}
                    height={radius * 2 * fillRatio}
                  />
                </clipPath>
              </defs>
              <motion.circle
                cx={CENTER}
                cy={CENTER}
                r={radius}
                fill="#3b82f6"
                clipPath={`url(#clip-${lender.id})`}
                animate={{ opacity: fillRatio > 0 ? 1 : 0 }}
                transition={{ duration: 0.2 }}
              />
            </svg>

            <div className="dot-label">Lender {lender.label}</div>
            <div className="dot-served">
              {formatUsd(served)} / {formatUsd(lender.capacity)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
