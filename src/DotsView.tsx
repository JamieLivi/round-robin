import { motion } from 'motion/react';
import type { Agent } from './simulation';

type Props = {
  agents: Agent[];
  servedNow: Record<string, number>;
  activeAgentId: string | null;
};

const DOT_RADIUS = 36;
const DOT_GAP = 90;
const PADDING = 40;

export function DotsView({ agents, servedNow, activeAgentId }: Props) {
  const width = PADDING * 2 + (agents.length - 1) * DOT_GAP + DOT_RADIUS * 2;
  const height = 180;
  const cy = height / 2;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ maxWidth: width }}>
      {agents.map((agent, i) => {
        const cx = PADDING + DOT_RADIUS + i * DOT_GAP;
        const served = servedNow[agent.id] ?? 0;
        const fillRatio = agent.capacity > 0 ? Math.min(1, served / agent.capacity) : 0;
        const isActive = agent.id === activeAgentId;

        return (
          <g key={agent.id}>
            {/* Active highlight ring */}
            {isActive && (
              <motion.circle
                cx={cx}
                cy={cy}
                r={DOT_RADIUS + 8}
                fill="none"
                stroke="#f59e0b"
                strokeWidth={3}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              />
            )}
            {/* Empty dot outline */}
            <circle cx={cx} cy={cy} r={DOT_RADIUS} fill="#1e293b" stroke="#334155" strokeWidth={2} />
            {/* Fill — rises from the bottom based on fill ratio */}
            <defs>
              <clipPath id={`clip-${agent.id}`}>
                <rect
                  x={cx - DOT_RADIUS}
                  y={cy + DOT_RADIUS - DOT_RADIUS * 2 * fillRatio}
                  width={DOT_RADIUS * 2}
                  height={DOT_RADIUS * 2 * fillRatio}
                />
              </clipPath>
            </defs>
            <motion.circle
              cx={cx}
              cy={cy}
              r={DOT_RADIUS}
              fill="#3b82f6"
              clipPath={`url(#clip-${agent.id})`}
              animate={{ opacity: fillRatio > 0 ? 1 : 0 }}
              transition={{ duration: 0.2 }}
            />
            {/* Label */}
            <text x={cx} y={cy + DOT_RADIUS + 24} textAnchor="middle" fill="#cbd5e1" fontSize={14} fontWeight={600}>
              {agent.label}
            </text>
            {/* Served / capacity */}
            <text x={cx} y={cy + DOT_RADIUS + 42} textAnchor="middle" fill="#94a3b8" fontSize={11}>
              {served} / {agent.capacity}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
