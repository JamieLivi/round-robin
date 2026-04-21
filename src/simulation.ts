export type Lender = {
  id: string;
  label: string;
  capacity: number;
};

export type SimEvent = {
  step: number;
  lenderId: string;
  amount: number;
};

export type Strategy = 'ROUND_ROBIN' | 'WEIGHTED_ROUND_ROBIN';

export type SimConfig = {
  lenders: Lender[];
  borrowRequest: number;
  chunk: number;
};

export type SimResult = {
  events: SimEvent[];
  /** How much each lender was allocated in total */
  totals: Record<string, number>;
  /** How many steps the allocation took */
  totalSteps: number;
};

/**
 * Pure round-robin allocation. Pre-computes the full event stream so the UI
 * can scrub/play/pause without re-running the logic each frame.
 *
 * Queue order here is the lenders array order. Wrap-around = next rotation.
 * On each step, serve the next eligible lender (positive headroom) a chunk,
 * capped by the remaining borrow amount and their free capacity.
 */
export function simulate(config: SimConfig): SimResult {
  const events: SimEvent[] = [];
  const served: Record<string, number> = Object.fromEntries(config.lenders.map((l) => [l.id, 0]));
  let remaining = config.borrowRequest;
  let cursor = 0;
  let step = 0;

  // Cap at sensibly-large to avoid pathological loops with chunk=0 etc.
  const MAX_STEPS = 10_000;

  while (remaining > 0 && step < MAX_STEPS) {
    // Find the next lender with headroom, starting from cursor. Scan one full
    // rotation; if nobody takes anything, break.
    let moved = false;
    for (let scanned = 0; scanned < config.lenders.length; scanned++) {
      const lender = config.lenders[(cursor + scanned) % config.lenders.length];
      const headroom = lender.capacity - served[lender.id];
      if (headroom <= 0) continue;

      const take = Math.min(config.chunk, remaining, headroom);
      if (take <= 0) continue;

      events.push({ step, lenderId: lender.id, amount: take });
      served[lender.id] += take;
      remaining -= take;
      cursor = (cursor + scanned + 1) % config.lenders.length;
      step++;
      moved = true;
      break;
    }

    if (!moved) break; // Everyone is tapped out
  }

  return { events, totals: served, totalSteps: events.length };
}

/**
 * Deficit Round-Robin (DRR): bigger depositors earn more allocation credit per round.
 * Per round, each lender's deficit grows by `quantum_i = chunk × (capacity_i / minCapacity)`.
 * They're served one chunk at a time while their deficit is ≥ chunk and they have headroom.
 * Unused credit carries over to the next round — so long-run allocation trends to strict
 * proportionality while single-tx size stays bounded by the admin-set chunk.
 */
export function simulateWeighted(config: SimConfig): SimResult {
  const events: SimEvent[] = [];
  const served: Record<string, number> = Object.fromEntries(config.lenders.map((l) => [l.id, 0]));
  const deficit: Record<string, number> = Object.fromEntries(config.lenders.map((l) => [l.id, 0]));

  if (config.lenders.length === 0 || config.chunk <= 0) {
    return { events, totals: served, totalSteps: 0 };
  }

  const minCapacity = Math.max(1, Math.min(...config.lenders.map((l) => l.capacity)));
  const quantum: Record<string, number> = Object.fromEntries(
    config.lenders.map((l) => [l.id, (config.chunk * l.capacity) / minCapacity]),
  );

  let remaining = config.borrowRequest;
  let step = 0;
  const MAX_STEPS = 10_000;
  let round = 0;
  const MAX_ROUNDS = 10_000;

  while (remaining > 0 && step < MAX_STEPS && round < MAX_ROUNDS) {
    let movedThisRound = false;

    for (const lender of config.lenders) {
      if (remaining <= 0) break;

      deficit[lender.id] += quantum[lender.id];

      while (remaining > 0 && deficit[lender.id] >= config.chunk) {
        const headroom = lender.capacity - served[lender.id];
        if (headroom <= 0) break;

        const take = Math.min(config.chunk, remaining, headroom);
        if (take <= 0) break;

        events.push({ step, lenderId: lender.id, amount: take });
        served[lender.id] += take;
        deficit[lender.id] -= config.chunk;
        remaining -= take;
        step++;
        movedThisRound = true;
      }
    }

    if (!movedThisRound) break;
    round++;
  }

  return { events, totals: served, totalSteps: events.length };
}

export function runSimulation(strategy: Strategy, config: SimConfig): SimResult {
  return strategy === 'WEIGHTED_ROUND_ROBIN' ? simulateWeighted(config) : simulate(config);
}
