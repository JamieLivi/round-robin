import { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import { DotsView } from './DotsView';
import { GanttView } from './GanttView';
import { simulate, type Agent } from './simulation';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

function buildAgents(count: number, uniformCapacity: number): Agent[] {
  return Array.from({ length: count }, (_, i) => ({
    id: LETTERS[i],
    label: LETTERS[i],
    capacity: uniformCapacity,
  }));
}

export default function App() {
  const [agentCount, setAgentCount] = useState(5);
  const [capacity, setCapacity] = useState(100);
  const [request, setRequest] = useState(300);
  const [chunk, setChunk] = useState(20);
  const [speed, setSpeed] = useState(4); // steps per second
  const [playing, setPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  const agents = useMemo(() => buildAgents(agentCount, capacity), [agentCount, capacity]);

  const result = useMemo(() => simulate({ agents, request, chunk }), [agents, request, chunk]);

  // Reset step if config changed past current position
  useEffect(() => {
    if (currentStep > result.totalSteps) setCurrentStep(result.totalSteps);
  }, [result.totalSteps, currentStep]);

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
    const map: Record<string, number> = Object.fromEntries(agents.map((a) => [a.id, 0]));
    for (let i = 0; i < currentStep; i++) {
      const e = result.events[i];
      if (!e) break;
      map[e.agentId] += e.amount;
    }
    return map;
  }, [agents, result.events, currentStep]);

  const activeAgentId = currentStep > 0 ? result.events[currentStep - 1]?.agentId ?? null : null;
  const currentEvent = currentStep > 0 ? result.events[currentStep - 1] : null;
  const remaining = request - Object.values(servedNow).reduce((a, b) => a + b, 0);

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

  return (
    <div className="app">
      <header>
        <h1>Round-Robin Allocation</h1>
        <p className="subtitle">
          {agentCount} agents each with capacity {capacity}. Request size {request}, chunk size {chunk}.
          Each step hands one chunk to the next eligible agent.
        </p>
      </header>

      <section className="panel">
        <h2>Current state</h2>
        <DotsView agents={agents} servedNow={servedNow} activeAgentId={activeAgentId} />
        <div className="live-stats">
          <span>
            Step <strong>{currentStep}</strong> / {result.totalSteps}
          </span>
          <span>
            Remaining <strong>{Math.max(0, remaining)}</strong> / {request}
          </span>
          {currentEvent && (
            <span>
              Just served <strong>{currentEvent.agentId}</strong> → {currentEvent.amount}
            </span>
          )}
        </div>
      </section>

      <section className="panel">
        <h2>Timeline</h2>
        <div className="scroll">
          <GanttView
            agents={agents}
            events={result.events}
            currentStep={currentStep}
            totalSteps={result.totalSteps}
          />
        </div>
      </section>

      <section className="panel controls">
        <div className="control-row">
          <button onClick={() => setPlaying((p) => !p)} className="primary">
            {playing ? '❚❚ Pause' : '▶ Play'}
          </button>
          <button onClick={handleBack} disabled={currentStep === 0}>
            ← Back
          </button>
          <button onClick={handleStep} disabled={currentStep >= result.totalSteps}>
            Step →
          </button>
          <button onClick={handleReset}>⟲ Reset</button>
        </div>

        <label>
          Scrub timeline: step {currentStep}
          <input
            type="range"
            min={0}
            max={result.totalSteps}
            value={currentStep}
            onChange={(e) => {
              setPlaying(false);
              setCurrentStep(Number(e.target.value));
            }}
          />
        </label>

        <label>
          Playback speed: <strong>{speed}x</strong>
          <input
            type="range"
            min={1}
            max={60}
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
          />
        </label>

        <hr />

        <label>
          Agents: <strong>{agentCount}</strong>
          <input
            type="range"
            min={2}
            max={8}
            value={agentCount}
            onChange={(e) => setAgentCount(Number(e.target.value))}
          />
        </label>

        <label>
          Per-agent capacity: <strong>{capacity}</strong>
          <input
            type="range"
            min={20}
            max={500}
            step={10}
            value={capacity}
            onChange={(e) => setCapacity(Number(e.target.value))}
          />
        </label>

        <label>
          Request size: <strong>{request}</strong>
          <input
            type="range"
            min={10}
            max={2000}
            step={10}
            value={request}
            onChange={(e) => setRequest(Number(e.target.value))}
          />
        </label>

        <label>
          Chunk size: <strong>{chunk}</strong>
          <input
            type="range"
            min={1}
            max={200}
            value={chunk}
            onChange={(e) => setChunk(Number(e.target.value))}
          />
        </label>
      </section>

      <footer>
        <p>
          The top dots show the current fill level per agent and highlight whose turn it is. The timeline below
          shows the full history — scrub back and forth or play it out. Try setting the chunk to 1 and watching
          the pattern emerge.
        </p>
      </footer>
    </div>
  );
}
