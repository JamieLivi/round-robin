export type Agent = {
  id: string;
  label: string;
  capacity: number;
};

export type SimEvent = {
  step: number;
  agentId: string;
  amount: number;
};

export type SimConfig = {
  agents: Agent[];
  request: number;
  chunk: number;
};

export type SimResult = {
  events: SimEvent[];
  /** How much each agent was served in total */
  totals: Record<string, number>;
  /** How many steps the allocation took */
  totalSteps: number;
};

/**
 * Pure round-robin allocation. Pre-computes the full event stream so the UI
 * can scrub/play/pause without re-running the logic each frame.
 *
 * Queue order here is the agents array order. Wrap-around = next rotation.
 * On each step, serve the next eligible agent (positive headroom) a chunk,
 * capped by remaining request and their free capacity.
 */
export function simulate(config: SimConfig): SimResult {
  const events: SimEvent[] = [];
  const served: Record<string, number> = Object.fromEntries(config.agents.map((a) => [a.id, 0]));
  let remaining = config.request;
  let cursor = 0;
  let step = 0;

  // Cap at sensibly-large to avoid pathological loops with chunk=0 etc.
  const MAX_STEPS = 10_000;

  while (remaining > 0 && step < MAX_STEPS) {
    // Find the next agent with headroom, starting from cursor. Scan one full
    // rotation; if nobody takes anything, break.
    let moved = false;
    for (let scanned = 0; scanned < config.agents.length; scanned++) {
      const agent = config.agents[(cursor + scanned) % config.agents.length];
      const headroom = agent.capacity - served[agent.id];
      if (headroom <= 0) continue;

      const take = Math.min(config.chunk, remaining, headroom);
      if (take <= 0) continue;

      events.push({ step, agentId: agent.id, amount: take });
      served[agent.id] += take;
      remaining -= take;
      cursor = (cursor + scanned + 1) % config.agents.length;
      step++;
      moved = true;
      break;
    }

    if (!moved) break; // Everyone is tapped out
  }

  return { events, totals: served, totalSteps: events.length };
}
