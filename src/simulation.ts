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

export type Strategy =
  | 'ROUND_ROBIN'
  | 'WEIGHTED_ROUND_ROBIN'
  | 'PRO_RATA'
  | 'FIFO'
  | 'LARGEST_FIRST'
  | 'EQUAL_SPLIT';

export const STRATEGY_USES_CHUNK: Record<Strategy, boolean> = {
  ROUND_ROBIN: true,
  WEIGHTED_ROUND_ROBIN: true,
  PRO_RATA: false,
  FIFO: false,
  LARGEST_FIRST: false,
  EQUAL_SPLIT: false,
};

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

/**
 * Pro-rata: one allocation per lender, sized proportionally to their capacity.
 * Matches the DeFi norm (aTokens/cTokens) — every borrow hits every depositor once,
 * in proportion to their share of pool liquidity. Chunk size is ignored.
 */
export function simulateProRata(config: SimConfig): SimResult {
  const served: Record<string, number> = Object.fromEntries(config.lenders.map((l) => [l.id, 0]));
  const events: SimEvent[] = [];
  const totalCapacity = config.lenders.reduce((sum, l) => sum + l.capacity, 0);
  const capped = Math.min(config.borrowRequest, totalCapacity);

  if (totalCapacity === 0 || capped === 0) return { events, totals: served, totalSteps: 0 };

  let allocated = 0;
  let step = 0;
  for (let i = 0; i < config.lenders.length; i++) {
    const lender = config.lenders[i];
    const isLast = i === config.lenders.length - 1;
    // Last lender sweeps any rounding residue to ensure exact fill.
    const share = isLast ? capped - allocated : Math.floor((capped * lender.capacity) / totalCapacity);
    if (share <= 0) continue;
    events.push({ step, lenderId: lender.id, amount: share });
    served[lender.id] = share;
    allocated += share;
    step++;
  }

  return { events, totals: served, totalSteps: events.length };
}

/**
 * FIFO (as implemented in Profitr): smallest depositors get filled first. Sort
 * lenders by capacity ASC, then greedily fill each to their cap before moving on.
 * Chunk size is ignored — each lender receives a single allocation.
 */
export function simulateFifo(config: SimConfig): SimResult {
  const served: Record<string, number> = Object.fromEntries(config.lenders.map((l) => [l.id, 0]));
  const events: SimEvent[] = [];
  const sorted = [...config.lenders].sort((a, b) => a.capacity - b.capacity);

  let remaining = config.borrowRequest;
  let step = 0;
  for (const lender of sorted) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, lender.capacity);
    if (take <= 0) continue;
    events.push({ step, lenderId: lender.id, amount: take });
    served[lender.id] = take;
    remaining -= take;
    step++;
  }

  return { events, totals: served, totalSteps: events.length };
}

/**
 * Largest-first: sort lenders by capacity DESC, greedily fill each to their cap.
 * Minimises on-chain calls (biggest lender absorbs most of the borrow in one tx).
 */
export function simulateLargestFirst(config: SimConfig): SimResult {
  const served: Record<string, number> = Object.fromEntries(config.lenders.map((l) => [l.id, 0]));
  const events: SimEvent[] = [];
  const sorted = [...config.lenders].sort((a, b) => b.capacity - a.capacity);

  let remaining = config.borrowRequest;
  let step = 0;
  for (const lender of sorted) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, lender.capacity);
    if (take <= 0) continue;
    events.push({ step, lenderId: lender.id, amount: take });
    served[lender.id] = take;
    remaining -= take;
    step++;
  }

  return { events, totals: served, totalSteps: events.length };
}

/**
 * Equal-split: divide the remaining borrow equally across uncapped lenders.
 * When a lender hits their cap, drop them from the eligible set and redistribute
 * the residual to the rest. Repeats until filled or everyone is capped.
 *
 * To show the redistribution logic in playback, we emit one event per lender per pass
 * (rather than consolidating into a final-total-per-lender). This matches the mental
 * model — pass 1 tries to split equally, pass 2 absorbs the residual, etc.
 */
export function simulateEqualSplit(config: SimConfig): SimResult {
  const served: Record<string, number> = Object.fromEntries(config.lenders.map((l) => [l.id, 0]));
  const events: SimEvent[] = [];
  let remaining = config.borrowRequest;
  let eligible = [...config.lenders];
  let step = 0;
  const MAX_PASSES = 20;

  for (let pass = 0; pass < MAX_PASSES && remaining > 0 && eligible.length > 0; pass++) {
    const perLender = Math.floor(remaining / eligible.length);
    if (perLender <= 0) break;

    const nextEligible: Lender[] = [];

    for (const lender of eligible) {
      if (remaining <= 0) break;
      const headroom = lender.capacity - (served[lender.id] ?? 0);
      const share = Math.min(perLender, headroom, remaining);

      if (share > 0) {
        events.push({ step, lenderId: lender.id, amount: share });
        served[lender.id] = (served[lender.id] ?? 0) + share;
        remaining -= share;
        step++;
      }

      if (lender.capacity - (served[lender.id] ?? 0) > 0) {
        nextEligible.push(lender);
      }
    }

    // Nobody was dropped AND remaining didn't go down — avoid infinite loop.
    if (nextEligible.length === eligible.length && perLender === 0) break;
    eligible = nextEligible;
  }

  return { events, totals: served, totalSteps: events.length };
}

export function runSimulation(strategy: Strategy, config: SimConfig): SimResult {
  switch (strategy) {
    case 'WEIGHTED_ROUND_ROBIN':
      return simulateWeighted(config);
    case 'PRO_RATA':
      return simulateProRata(config);
    case 'FIFO':
      return simulateFifo(config);
    case 'LARGEST_FIRST':
      return simulateLargestFirst(config);
    case 'EQUAL_SPLIT':
      return simulateEqualSplit(config);
    default:
      return simulate(config);
  }
}
