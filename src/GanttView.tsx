import { motion } from 'motion/react';
import type { Agent, SimEvent } from './simulation';

type Props = {
  agents: Agent[];
  events: SimEvent[];
  currentStep: number;
  /** Total step count for the entire precomputed run — used for X-axis scale. */
  totalSteps: number;
};

const ROW_HEIGHT = 38;
const ROW_GAP = 6;
const LABEL_COL_WIDTH = 56;
const PADDING = 16;

export function GanttView({ agents, events, currentStep, totalSteps }: Props) {
  const cellWidth = totalSteps > 0 ? Math.max(16, Math.min(48, 1200 / totalSteps)) : 32;
  const timelineWidth = Math.max(400, totalSteps * cellWidth);
  const width = LABEL_COL_WIDTH + timelineWidth + PADDING * 2;
  const height = PADDING * 2 + agents.length * (ROW_HEIGHT + ROW_GAP);

  const agentIndex: Record<string, number> = Object.fromEntries(agents.map((a, i) => [a.id, i]));

  const maxAmount = events.reduce((m, e) => (e.amount > m ? e.amount : m), 1);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ maxWidth: width }}>
      {/* Row backgrounds + labels */}
      {agents.map((agent, i) => {
        const y = PADDING + i * (ROW_HEIGHT + ROW_GAP);
        return (
          <g key={agent.id}>
            <rect
              x={LABEL_COL_WIDTH}
              y={y}
              width={timelineWidth}
              height={ROW_HEIGHT}
              fill="#0f172a"
              stroke="#1e293b"
              strokeWidth={1}
              rx={4}
            />
            <text x={LABEL_COL_WIDTH - 10} y={y + ROW_HEIGHT / 2 + 5} textAnchor="end" fill="#cbd5e1" fontSize={13} fontWeight={600}>
              {agent.label}
            </text>
          </g>
        );
      })}

      {/* Playhead */}
      {currentStep > 0 && (
        <motion.line
          x1={LABEL_COL_WIDTH + currentStep * cellWidth}
          x2={LABEL_COL_WIDTH + currentStep * cellWidth}
          y1={PADDING - 4}
          y2={height - PADDING + 4}
          stroke="#f59e0b"
          strokeWidth={2}
          strokeDasharray="4 4"
          initial={false}
          animate={{ x1: LABEL_COL_WIDTH + currentStep * cellWidth, x2: LABEL_COL_WIDTH + currentStep * cellWidth }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        />
      )}

      {/* Served blocks — one per event, up to currentStep */}
      {events.slice(0, currentStep).map((event, i) => {
        const rowIdx = agentIndex[event.agentId];
        if (rowIdx === undefined) return null;
        const x = LABEL_COL_WIDTH + i * cellWidth;
        const y = PADDING + rowIdx * (ROW_HEIGHT + ROW_GAP);
        const intensity = event.amount / maxAmount;
        // Map intensity 0-1 to colour depth
        const fill = `hsl(217, 91%, ${50 + intensity * 15}%)`;

        return (
          <motion.g key={`event-${i}`} initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.15 }}>
            <rect
              x={x + 1}
              y={y + 2}
              width={cellWidth - 2}
              height={ROW_HEIGHT - 4}
              fill={fill}
              rx={3}
            />
            {cellWidth > 24 && (
              <text
                x={x + cellWidth / 2}
                y={y + ROW_HEIGHT / 2 + 4}
                textAnchor="middle"
                fill="#f8fafc"
                fontSize={11}
                fontWeight={600}
                style={{ pointerEvents: 'none' }}
              >
                {event.amount}
              </text>
            )}
          </motion.g>
        );
      })}

      {/* Step axis ticks — every 5 steps */}
      {Array.from({ length: Math.floor(totalSteps / 5) + 1 }, (_, i) => i * 5).map((s) => (
        <text
          key={`tick-${s}`}
          x={LABEL_COL_WIDTH + s * cellWidth}
          y={height - 2}
          textAnchor="middle"
          fill="#64748b"
          fontSize={10}
        >
          {s}
        </text>
      ))}
    </svg>
  );
}
