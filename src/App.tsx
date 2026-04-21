import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink } from 'react-router';
import './App.css';
import { DotsView } from './DotsView';
import { runSimulation, type Lender, type Strategy } from './simulation';

type AppProps = {
  strategy: Strategy;
};

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const MAX_LENDERS = LETTERS.length;
const DEFAULT_CAPACITY = 10_000;
const POOL_LTV = 0.6; // 60% — matches the real Pacoima Staging pool
const POOL_APR = 0.05; // 5% — nominal interest rate paid on borrowed (deployed) capital

function resizeCapacities(prev: number[], nextCount: number): number[] {
  if (nextCount > prev.length) {
    return [...prev, ...Array(nextCount - prev.length).fill(DEFAULT_CAPACITY)];
  }
  return prev.slice(0, nextCount);
}

const formatUsd = (value: number) => `$${value.toLocaleString('en-US')}`;

export default function App({ strategy }: AppProps) {
  // Largest lender first so the queue-order bias in plain Round-Robin is immediately visible:
  // A is a $30k whale served first each rotation, but still only gets one chunk per turn.
  const [lenderCapacities, setLenderCapacities] = useState<number[]>([30_000, 15_000, 5_000]);
  const lenderCount = lenderCapacities.length;

  // Default to the full pool capacity so a user hitting Play sees the whole allocation
  // play out — every lender fills up and the two strategies' final states can be compared.
  const [borrowRequest, setBorrowRequest] = useState(50_000);
  const [chunk, setChunk] = useState(2_500);
  const [speed, setSpeed] = useState(2); // steps per second
  const [playing, setPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  const lenders = useMemo<Lender[]>(
    () =>
      lenderCapacities.map((cap, i) => ({
        id: LETTERS[i],
        label: LETTERS[i],
        capacity: cap,
      })),
    [lenderCapacities],
  );

  const result = useMemo(
    () => runSimulation(strategy, { lenders, borrowRequest, chunk }),
    [strategy, lenders, borrowRequest, chunk],
  );

  // Reset step if config changed past current position
  useEffect(() => {
    if (currentStep > result.totalSteps) setCurrentStep(result.totalSteps);
  }, [result.totalSteps, currentStep]);

  // When the route (strategy) changes, reset playback so the user sees the new run from scratch.
  useEffect(() => {
    setCurrentStep(0);
    setPlaying(false);
  }, [strategy]);

  // Auto-advance when playing
  const intervalRef = useRef<number | null>(null);
  useEffect(() => {
    if (!playing) {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      intervalRef.current = null;
      return;
    }
    const id = window.setInterval(() => {
      setCurrentStep((s) => {
        if (s >= result.totalSteps) {
          setPlaying(false);
          return s;
        }
        return s + 1;
      });
    }, 1000 / speed);
    intervalRef.current = id;
    return () => window.clearInterval(id);
  }, [playing, speed, result.totalSteps]);

  // Compute totals-so-far from events[0..currentStep]
  const servedNow = useMemo(() => {
    const map: Record<string, number> = Object.fromEntries(lenders.map((l) => [l.id, 0]));
    for (let i = 0; i < currentStep; i++) {
      const e = result.events[i];
      if (!e) break;
      map[e.lenderId] += e.amount;
    }
    return map;
  }, [lenders, result.events, currentStep]);

  const activeLenderId = currentStep > 0 ? result.events[currentStep - 1]?.lenderId ?? null : null;
  const currentEvent = currentStep > 0 ? result.events[currentStep - 1] : null;
  const totalAllocated = Object.values(servedNow).reduce((a, b) => a + b, 0);
  const remaining = borrowRequest - totalAllocated;
  const totalDeposited = lenderCapacities.reduce((a, b) => a + b, 0);
  const impliedBorrowProceeds = Math.round(borrowRequest * POOL_LTV);
  const impliedChunkBorrow = Math.round(chunk * POOL_LTV);

  const handleReset = () => {
    setPlaying(false);
    setCurrentStep(0);
  };

  const handleStep = () => {
    if (currentStep < result.totalSteps) setCurrentStep(currentStep + 1);
  };

  const handleBack = () => {
    if (currentStep > 0) setCurrentStep(currentStep - 1);
  };

  const handleLenderCountChange = (next: number) => {
    setLenderCapacities((prev) => resizeCapacities(prev, next));
  };

  const handleCapacityChange = (index: number, value: number) => {
    setLenderCapacities((prev) => prev.map((c, i) => (i === index ? value : c)));
  };

  return (
    <div className="app">
      <header>
        <div className="eyebrow">Profitr borrow-lend · directed pool</div>
        <h1>{strategy === 'WEIGHTED_ROUND_ROBIN' ? 'Weighted Round-Robin' : 'Round-Robin'} Allocation</h1>
        <p className="subtitle">
          Simulates how a pending borrow request is matched against registered lenders in a directed
          pool. Each step represents one on-chain <code>borrowFrom</code> call issued by the worker.
        </p>

        <nav className="strategy-toggle" role="tablist">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')} role="tab">
            Round-Robin
          </NavLink>
          <NavLink
            to="/weighted"
            className={({ isActive }) => (isActive ? 'active' : '')}
            role="tab"
          >
            Weighted Round-Robin
          </NavLink>
        </nav>
      </header>

      <section className="panel explainer">
        <h2>How {strategy === 'WEIGHTED_ROUND_ROBIN' ? 'Weighted Round-Robin' : 'Round-Robin'} works here</h2>
        {strategy === 'ROUND_ROBIN' ? (
          <ul>
            <li>
              <strong>Every lender gets the same chunk per turn</strong>, regardless of deposit size.
              The rotation visits each lender in order; once served, they go to the back of the queue.
            </li>
            <li>
              <strong>Bigger lenders are under-deployed</strong> — a $50k depositor receives the same
              per-turn chunk as a $2k depositor, so their capital sits idle while the queue rotates.
            </li>
            <li>
              <strong>Small lenders are never starved</strong> — they see activity on every borrow.
              Good for engagement-focused pools.
            </li>
          </ul>
        ) : (
          <ul>
            <li>
              <strong>Bigger deposits earn credit faster</strong>. Each round, every lender accrues
              allocation credit proportional to their deposit. Once a lender has a chunk's worth of
              credit, they get served.
            </li>
            <li>
              <strong>Unused credit carries over</strong> — if a chunk can't be served this round, the
              remaining credit sticks around for the next. Long-run totals trend to exact pro-rata.
            </li>
            <li>
              <strong>Per-tx size is still bounded</strong> by the admin-set chunk, preserving the
              audit-friendly granularity of plain Round-Robin.
            </li>
          </ul>
        )}
        <div className="explainer-grid">
          <div>
            <div className="explainer-label">Dots</div>
            <div>Registered lenders. Size scales with deposit.</div>
          </div>
          <div>
            <div className="explainer-label">Fill level</div>
            <div>Collateral pledged against this borrow so far.</div>
          </div>
          <div>
            <div className="explainer-label">Borrow request</div>
            <div>
              {formatUsd(borrowRequest)} collateral ⇒ {formatUsd(impliedBorrowProceeds)} borrow at{' '}
              {Math.round(POOL_LTV * 100)}% LTV
            </div>
          </div>
          <div>
            <div className="explainer-label">Chunk size</div>
            <div>
              {formatUsd(chunk)} collateral per tx ≈ {formatUsd(impliedChunkBorrow)} USDC borrow
            </div>
          </div>
        </div>
      </section>

      <div className="play-hero">
        <button
          className="play-hero-button"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? (
            <>
              <span className="play-icon" aria-hidden>❚❚</span> Pause
            </>
          ) : (
            <>
              <span className="play-icon" aria-hidden>▶</span> Play
            </>
          )}
        </button>
        <div className="play-hero-meta">
          <button onClick={handleBack} disabled={currentStep === 0} className="play-secondary">
            ← Back
          </button>
          <button
            onClick={handleStep}
            disabled={currentStep >= result.totalSteps}
            className="play-secondary"
          >
            Step →
          </button>
          <button onClick={handleReset} className="play-secondary">
            ⟲ Reset
          </button>
          <span className="play-step-indicator">
            Tx <strong>{currentStep}</strong> / {result.totalSteps}
          </span>
        </div>
      </div>

      <section className="panel">
        <h2>Live state</h2>
        <DotsView lenders={lenders} servedNow={servedNow} activeLenderId={activeLenderId} />
        <div className="live-stats">
          <span>
            Tx <strong>{currentStep}</strong> / {result.totalSteps}
          </span>
          <span>
            Filled <strong>{formatUsd(totalAllocated)}</strong> / {formatUsd(borrowRequest)}
          </span>
          <span>
            Remaining <strong>{formatUsd(Math.max(0, remaining))}</strong>
          </span>
          {currentEvent && (
            <span>
              Last tx: <strong>borrowFrom(Lender {currentEvent.lenderId})</strong> →{' '}
              {formatUsd(currentEvent.amount)}
            </span>
          )}
        </div>

        <div className="utilisation-panel">
          <div className="utilisation-header">
            <span>Per-lender outcome so far</span>
            <span className="utilisation-hint">
              Pool pays <strong>{(POOL_APR * 100).toFixed(1)}% APR</strong> on deployed capital.
              Effective APR per lender ={' '}
              <code>{(POOL_APR * 100).toFixed(1)}% × (allocated ÷ deposited)</code> — under-deployed
              lenders earn less than the headline rate even though their capital was locked in the pool.
            </span>
          </div>
          {lenders.map((lender, i) => {
            const s = servedNow[lender.id] ?? 0;
            const utilisation = lender.capacity > 0 ? s / lender.capacity : 0;
            const effectiveApr = POOL_APR * utilisation;
            const shareOfAllocated = totalAllocated > 0 ? (s / totalAllocated) * 100 : 0;
            const shareOfDeposits = totalDeposited > 0 ? (lender.capacity / totalDeposited) * 100 : 0;
            return (
              <div key={lender.id} className="utilisation-row">
                <div className="utilisation-label">
                  <span className="queue-pos">{i + 1}</span>
                  <span>
                    Lender <strong>{lender.label}</strong>
                  </span>
                </div>
                <div className="utilisation-bar">
                  <div
                    className="utilisation-fill"
                    style={{ width: `${Math.min(100, utilisation * 100)}%` }}
                  />
                </div>
                <div className="utilisation-figures">
                  <span className="apr-value">{(effectiveApr * 100).toFixed(2)}% APR</span>
                  <span>{formatUsd(s)} allocated</span>
                  <span className="muted">
                    {(utilisation * 100).toFixed(0)}% of capacity ·{' '}
                    {shareOfAllocated.toFixed(0)}% of flow · {shareOfDeposits.toFixed(0)}% of pool
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel chunk-feature">
        <div className="chunk-header">
          <h2>Chunk size</h2>
          <span className="chunk-sublabel">
            Per-lender allocation per turn — the admin's main lever
          </span>
        </div>
        <div className="chunk-display">{formatUsd(chunk)}</div>
        <div className="chunk-hint-row">
          ≈ {formatUsd(impliedChunkBorrow)} of USDC borrow per <code>borrowFrom</code> tx at{' '}
          {Math.round(POOL_LTV * 100)}% LTV
        </div>
        <input
          type="range"
          className="chunk-slider"
          min={100}
          max={20_000}
          step={100}
          value={chunk}
          onChange={(e) => setChunk(Number(e.target.value))}
        />
        <div className="chunk-extremes">
          <span>$100 — many small txs, fair rotation</span>
          <span>$20,000 — few large txs, biased rotation</span>
        </div>
      </section>

      <section className="panel controls">
        <label>
          Playback speed: <strong>{speed}x</strong>
          <input
            type="range"
            min={1}
            max={5}
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
          />
        </label>

        <hr />

        <label>
          Registered lenders: <strong>{lenderCount}</strong>
          <input
            type="range"
            min={2}
            max={MAX_LENDERS}
            value={lenderCount}
            onChange={(e) => handleLenderCountChange(Number(e.target.value))}
          />
        </label>

        <div className="capacity-grid">
          {lenderCapacities.map((cap, i) => (
            <label key={LETTERS[i]} className="capacity-row">
              <span>
                Lender <strong>{LETTERS[i]}</strong> deposited: <strong>{formatUsd(cap)}</strong>
              </span>
              <input
                type="range"
                min={500}
                max={100_000}
                step={500}
                value={cap}
                onChange={(e) => handleCapacityChange(i, Number(e.target.value))}
              />
            </label>
          ))}
          <div className="capacity-total">Total deposits in pool: {formatUsd(totalDeposited)}</div>
        </div>

        <hr />

        <label>
          Borrow request (collateral pledged): <strong>{formatUsd(borrowRequest)}</strong>
          <span className="hint">
            ≈ {formatUsd(impliedBorrowProceeds)} of USDC borrow at {Math.round(POOL_LTV * 100)}% LTV
          </span>
          <input
            type="range"
            min={500}
            max={200_000}
            step={500}
            value={borrowRequest}
            onChange={(e) => setBorrowRequest(Number(e.target.value))}
          />
        </label>

      </section>
    </div>
  );
}
