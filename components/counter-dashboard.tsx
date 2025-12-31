"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { useTheme } from "./theme-provider";

type HistoryEntry = {
  id: string;
  delta: number;
  value: number;
  createdAt: number;
  mode: "manual" | "auto";
  note?: string;
};

type CounterState = {
  value: number;
  step: number;
  goal: number;
  autoInterval: number;
  isAutoIncrementing: boolean;
  history: HistoryEntry[];
};

const STORAGE_KEY = "momentum-counter-state";

const QUICK_ACTIONS = [1, 5, 10, 25, 50];
const AUTO_INTERVAL_PRESETS = [
  { label: "0.5s", value: 500 },
  { label: "1s", value: 1000 },
  { label: "2s", value: 2000 },
  { label: "5s", value: 5000 }
];

const INITIAL_STATE: CounterState = {
  value: 0,
  step: 1,
  goal: 50,
  autoInterval: 1000,
  isAutoIncrementing: false,
  history: []
};

const MAX_HISTORY = 120;

function loadState(): CounterState {
  if (typeof window === "undefined") {
    return INITIAL_STATE;
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return INITIAL_STATE;
    }
    const parsed = JSON.parse(stored) as CounterState;
    return {
      ...INITIAL_STATE,
      ...parsed,
      history: parsed.history?.slice(-MAX_HISTORY) ?? []
    };
  } catch (error) {
    console.error("Failed to parse counter state", error);
    return INITIAL_STATE;
  }
}

export function CounterDashboard() {
  const [state, setState] = useState<CounterState>(INITIAL_STATE);
  const [note, setNote] = useState("");
  const [summaryRange, setSummaryRange] = useState<"session" | "day" | "all">("session");
  const sessionStartRef = useRef<number>(Date.now());
  const autoTimerRef = useRef<NodeJS.Timeout | null>(null);

  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    setState(loadState());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    if (!state.isAutoIncrementing) {
      if (autoTimerRef.current) {
        clearInterval(autoTimerRef.current);
        autoTimerRef.current = null;
      }
      return;
    }

    autoTimerRef.current = setInterval(() => {
      handleIncrement(state.step, "auto");
    }, state.autoInterval);

    return () => {
      if (autoTimerRef.current) {
        clearInterval(autoTimerRef.current);
        autoTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isAutoIncrementing, state.autoInterval, state.step]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.target && (event.target as HTMLElement).tagName === "INPUT") {
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        handleIncrement(state.step);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        handleIncrement(-state.step);
      } else if (event.key === " ") {
        event.preventDefault();
        toggleAutoIncrement();
      } else if (event.key === "0") {
        event.preventDefault();
        handleReset();
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  const handleIncrement = useCallback(
    (delta: number, mode: "manual" | "auto" = "manual") => {
      setState((prev) => {
        const nextValue = Math.max(0, prev.value + delta);
        const entry: HistoryEntry = {
          id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
          delta,
          value: nextValue,
          mode,
          createdAt: Date.now()
        };

        return {
          ...prev,
          value: nextValue,
          history: [...prev.history, entry].slice(-MAX_HISTORY)
        };
      });
      const now = Date.now();
      if (now - sessionStartRef.current > 5 * 60 * 1000) {
        sessionStartRef.current = now;
      }
    },
    []
  );

  const handleReset = useCallback(() => {
    setState((prev) => {
      const resetEntry: HistoryEntry = {
        id: `${Date.now()}-reset`,
        delta: -prev.value,
        value: 0,
        mode: "manual",
        createdAt: Date.now()
      };
      return {
        ...prev,
        value: 0,
        history: [...prev.history, resetEntry].slice(-MAX_HISTORY)
      };
    });
    sessionStartRef.current = Date.now();
  }, []);

  const handleUndo = useCallback(() => {
    setState((prev) => {
      if (prev.history.length === 0) return prev;
      const history = prev.history.slice(0, -1);
      const lastValue = history.length > 0 ? history[history.length - 1].value : 0;
      return {
        ...prev,
        value: lastValue,
        history
      };
    });
  }, []);

  const toggleAutoIncrement = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isAutoIncrementing: !prev.isAutoIncrementing
    }));
  }, []);

  const setStep = (step: number) =>
    setState((prev) => ({
      ...prev,
      step: Math.max(1, Math.round(step))
    }));

  const setGoal = (goal: number) =>
    setState((prev) => ({
      ...prev,
      goal: Math.max(1, Math.round(goal))
    }));

  const setAutoInterval = (interval: number) =>
    setState((prev) => ({
      ...prev,
      autoInterval: Math.max(250, interval)
    }));

  const isGoalReached = state.goal > 0 && state.value >= state.goal;

  const progressPercent = state.goal
    ? Math.min(100, Math.round((state.value / state.goal) * 100))
    : 0;

  const paceStats = useMemo(() => {
    if (state.history.length < 2) {
      return { avgDelta: 0, perMinute: 0, perHour: 0 };
    }
    const relevantHistory = [...state.history].filter((entry) => entry.delta > 0);
    if (relevantHistory.length < 2) {
      return { avgDelta: 0, perMinute: 0, perHour: 0 };
    }

    const first = relevantHistory[0]!;
    const last = relevantHistory[relevantHistory.length - 1]!;
    const totalAdded = relevantHistory.reduce((sum, entry) => sum + entry.delta, 0);
    const durationMs = last.createdAt - first.createdAt || 1;
    const perMs = totalAdded / durationMs;
    const perMinute = perMs * 60_000;
    const perHour = perMinute * 60;

    return {
      avgDelta: +(totalAdded / relevantHistory.length).toFixed(2),
      perMinute: +perMinute.toFixed(2),
      perHour: +perHour.toFixed(2)
    };
  }, [state.history]);

  const projectedCompletion = useMemo(() => {
    if (!paceStats.perMinute || state.goal <= state.value) {
      return null;
    }
    const remaining = state.goal - state.value;
    const minutes = remaining / paceStats.perMinute;
    if (!Number.isFinite(minutes) || minutes <= 0) {
      return null;
    }
    const eta = new Date(Date.now() + minutes * 60_000);
    return { eta, minutesLeft: minutes };
  }, [paceStats.perMinute, state.goal, state.value]);

  const currentSessionHistory = useMemo(() => {
    const sessionStart = sessionStartRef.current;
    return state.history.filter((entry) => entry.createdAt >= sessionStart);
  }, [state.history]);

  const summaryHistory = useMemo(() => {
    if (summaryRange === "session") return currentSessionHistory;
    if (summaryRange === "day") {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      return state.history.filter((entry) => entry.createdAt >= startOfDay.getTime());
    }
    return state.history;
  }, [currentSessionHistory, state.history, summaryRange]);

  const summaryTotals = useMemo(() => {
    const increments = summaryHistory.filter((entry) => entry.delta > 0).length;
    const decrements = summaryHistory.filter((entry) => entry.delta < 0).length;
    const net = summaryHistory.reduce((sum, entry) => sum + entry.delta, 0);
    return { increments, decrements, net };
  }, [summaryHistory]);

  const sparkline = useMemo(() => {
    if (state.history.length === 0) {
      return "";
    }
    const values = state.history.map((entry) => entry.value);
    const min = Math.min(...values);
    const max = Math.max(...values);

    if (min === max) {
      return state.history
        .map((_, index) => {
          const x = (index / (state.history.length - 1 || 1)) * 100;
          return `${x},50`;
        })
        .join(" ");
    }

    return state.history
      .map((entry, index) => {
        const x = (index / (state.history.length - 1 || 1)) * 100;
        const y = 100 - ((entry.value - min) / (max - min)) * 100;
        return `${x},${y}`;
      })
      .join(" ");
  }, [state.history]);

  const milestones = useMemo(() => {
    const goal = state.goal || 100;
    const checkpoints = [0.25, 0.5, 0.75, 1].map((ratio) => ({
      ratio,
      value: Math.round(goal * ratio)
    }));
    return checkpoints.map((checkpoint) => ({
      ...checkpoint,
      reached: state.value >= checkpoint.value
    }));
  }, [state.goal, state.value]);

  const lastUpdated = state.history[state.history.length - 1]?.createdAt ?? null;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 pb-16 pt-12">
      <header className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
        <div>
          <p className="text-sm uppercase tracking-[0.35em] text-slate-400">
            Productivity Toolkit
          </p>
          <h1 className="mt-2 text-4xl font-semibold text-white md:text-5xl">
            Momentum Counter
          </h1>
          <p className="mt-4 max-w-xl text-slate-300">
            Stay in flow with an intelligent counter that tracks pace, forecasts your finish, and
            gives you the right controls for any session.
          </p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <button
            className="inline-flex items-center gap-2 rounded-full border border-slate-700/70 bg-slate-900/60 px-4 py-2 text-sm text-slate-200 transition hover:border-primary-400 hover:shadow-glow"
            onClick={toggleTheme}
          >
            <span className="text-xs uppercase tracking-widest">Theme</span>
            <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-100">
              {theme === "light" ? "Light" : "Dark"}
            </span>
          </button>
          <p className="text-xs text-slate-500">
            Keyboard: ↑ add, ↓ subtract, space auto, 0 reset
          </p>
        </div>
      </header>

      <section className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="rounded-3xl border border-slate-800/70 bg-slate-900/60 p-8 shadow-[0_30px_120px_-50px_rgba(59,130,246,0.45)]">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.35em] text-primary-300">Current Count</p>
              <div className="mt-4 flex items-baseline gap-4">
                <span className="text-7xl font-bold text-white md:text-8xl">{state.value}</span>
                <span className="rounded-full border border-slate-700 bg-slate-900 px-4 py-1 text-xs font-semibold uppercase tracking-[0.35em] text-slate-300">
                  Goal {state.goal}
                </span>
              </div>
            </div>
            <div className="relative flex h-36 w-full max-w-xs items-center justify-center overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/80">
              <svg viewBox="0 0 120 120" className="h-32 w-32">
                <circle
                  cx="60"
                  cy="60"
                  r="52"
                  className="fill-none stroke-slate-800"
                  strokeWidth="10"
                />
                <circle
                  cx="60"
                  cy="60"
                  r="52"
                  className={`fill-none stroke-[url(#progressGradient)] transition-all duration-500 ease-out`}
                  strokeWidth="10"
                  strokeDasharray={Math.PI * 2 * 52}
                  strokeDashoffset={(Math.PI * 2 * 52 * (100 - progressPercent)) / 100}
                  strokeLinecap="round"
                />
                <defs>
                  <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#3A96FF" />
                    <stop offset="100%" stopColor="#61ABFF" />
                  </linearGradient>
                </defs>
                <text
                  x="50%"
                  y="55%"
                  dominantBaseline="middle"
                  textAnchor="middle"
                  className="fill-white text-2xl font-semibold"
                >
                  {progressPercent}%
                </text>
                <text
                  x="50%"
                  y="70%"
                  dominantBaseline="middle"
                  textAnchor="middle"
                  className="fill-slate-400 text-[10px]"
                >
                  progress
                </text>
              </svg>
            </div>
          </div>

          {isGoalReached && (
            <div className="mt-4 rounded-2xl border border-primary-500/40 bg-primary-500/10 p-4 text-sm text-primary-200">
              Goal achieved! Consider setting a new target or enabling focus mode to maintain your
              momentum.
            </div>
          )}

          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
              <h3 className="text-sm font-semibold uppercase tracking-[0.35em] text-slate-400">
                Adjustments
              </h3>
              <div className="mt-4 grid grid-cols-2 gap-4">
                <label className="text-xs uppercase tracking-[0.25em] text-slate-400">
                  Step Size
                  <input
                    type="number"
                    min={1}
                    value={state.step}
                    onChange={(event) => setStep(Number(event.target.value) || 1)}
                    className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-white focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                  />
                </label>
                <label className="text-xs uppercase tracking-[0.25em] text-slate-400">
                  Goal Target
                  <input
                    type="number"
                    min={1}
                    value={state.goal}
                    onChange={(event) => setGoal(Number(event.target.value) || 1)}
                    className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-white focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                  />
                </label>
              </div>

              <div className="mt-4">
                <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Quick Actions</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {QUICK_ACTIONS.map((value) => (
                    <button
                      key={value}
                      className="rounded-full border border-slate-700 bg-slate-800/80 px-4 py-2 text-sm text-slate-200 transition hover:border-primary-500 hover:text-primary-200"
                      onClick={() => handleIncrement(value)}
                    >
                      +{value}
                    </button>
                  ))}
                  {QUICK_ACTIONS.map((value) => (
                    <button
                      key={`dec-${value}`}
                      className="rounded-full border border-slate-800 bg-slate-900/80 px-4 py-2 text-sm text-slate-400 transition hover:border-primary-500 hover:text-primary-200"
                      onClick={() => handleIncrement(-value)}
                    >
                      -{value}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
              <h3 className="text-sm font-semibold uppercase tracking-[0.35em] text-slate-400">
                Automation
              </h3>
              <div className="mt-4 flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-slate-300">Auto increment every</p>
                  <select
                    value={state.autoInterval}
                    onChange={(event) => setAutoInterval(Number(event.target.value))}
                    className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:border-primary-400 focus:outline-none"
                  >
                    {AUTO_INTERVAL_PRESETS.map((preset) => (
                      <option key={preset.value} value={preset.value}>
                        {preset.label}
                      </option>
                    ))}
                    <option value={state.autoInterval}>Custom</option>
                  </select>
                </div>
                <input
                  type="range"
                  min={250}
                  max={10_000}
                  step={250}
                  value={state.autoInterval}
                  onChange={(event) => setAutoInterval(Number(event.target.value))}
                  className="w-full accent-primary-500"
                />
                <button
                  className={`rounded-2xl px-4 py-3 text-sm font-semibold uppercase tracking-[0.35em] transition ${
                    state.isAutoIncrementing
                      ? "bg-primary-500 text-slate-950 shadow-glow"
                      : "border border-primary-500/40 bg-slate-900/80 text-primary-200"
                  }`}
                  onClick={toggleAutoIncrement}
                >
                  {state.isAutoIncrementing ? "Stop Automation" : "Start Automation"}
                </button>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-slate-400">
                <div>
                  <p className="uppercase tracking-[0.25em]">Auto pace</p>
                  <p className="mt-1 text-base text-slate-200">
                    {Math.round((60_000 / state.autoInterval) * state.step)} / min
                  </p>
                </div>
                <div>
                  <p className="uppercase tracking-[0.25em]">Manual pace</p>
                  <p className="mt-1 text-base text-slate-200">{paceStats.perMinute} / min</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <button
              className="rounded-full border border-slate-700 bg-slate-800/80 px-6 py-2 text-sm font-medium text-slate-100 transition hover:border-primary-400 hover:text-primary-200"
              onClick={() => handleIncrement(state.step)}
            >
              Add Step
            </button>
            <button
              className="rounded-full border border-slate-800 bg-slate-900/80 px-6 py-2 text-sm font-medium text-slate-300 transition hover:border-primary-400 hover:text-primary-200"
              onClick={() => handleIncrement(-state.step)}
            >
              Remove Step
            </button>
            <button
              className="rounded-full border border-slate-800/80 bg-slate-900/80 px-6 py-2 text-sm font-medium text-slate-300 transition hover:border-primary-400 hover:text-primary-200"
              onClick={handleUndo}
              disabled={state.history.length === 0}
            >
              Undo
            </button>
            <button
              className="rounded-full border border-red-400/40 bg-red-500/20 px-6 py-2 text-sm font-medium text-red-200 transition hover:border-red-400 hover:bg-red-500/30"
              onClick={handleReset}
            >
              Reset Counter
            </button>
          </div>
        </div>

        <aside className="flex flex-col gap-4">
          <div className="rounded-3xl border border-slate-800/70 bg-slate-900/60 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-[0.35em] text-slate-400">
                Insights
              </h2>
              <select
                value={summaryRange}
                onChange={(event) => setSummaryRange(event.target.value as typeof summaryRange)}
                className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs uppercase tracking-[0.25em] text-slate-200 focus:border-primary-400 focus:outline-none"
              >
                <option value="session">Session</option>
                <option value="day">Today</option>
                <option value="all">All time</option>
              </select>
            </div>

            <dl className="mt-4 grid grid-cols-3 gap-3 text-center text-xs text-slate-400">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-3 py-4">
                <dt className="uppercase tracking-[0.35em]">Increments</dt>
                <dd className="mt-2 text-2xl font-semibold text-white">{summaryTotals.increments}</dd>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-3 py-4">
                <dt className="uppercase tracking-[0.35em]">Decrements</dt>
                <dd className="mt-2 text-2xl font-semibold text-white">{summaryTotals.decrements}</dd>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-3 py-4">
                <dt className="uppercase tracking-[0.35em]">Net</dt>
                <dd className={`mt-2 text-2xl font-semibold ${summaryTotals.net >= 0 ? "text-primary-300" : "text-red-300"}`}>
                  {summaryTotals.net}
                </dd>
              </div>
            </dl>

            <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
              <p className="text-xs uppercase tracking-[0.35em] text-slate-400">
                Velocity
              </p>
              <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.35em] text-slate-500">Avg Δ</p>
                  <p className="mt-1 text-lg font-semibold text-white">{paceStats.avgDelta}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.35em] text-slate-500">Per min</p>
                  <p className="mt-1 text-lg font-semibold text-white">{paceStats.perMinute}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.35em] text-slate-500">Per hour</p>
                  <p className="mt-1 text-lg font-semibold text-white">{paceStats.perHour}</p>
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
              <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Milestones</p>
              <ul className="mt-3 flex flex-col gap-2 text-sm">
                {milestones.map((milestone) => (
                  <li
                    key={milestone.ratio}
                    className={`flex items-center justify-between rounded-xl border px-3 py-2 ${
                      milestone.reached
                        ? "border-primary-500/40 bg-primary-500/15 text-primary-100"
                        : "border-slate-800 bg-slate-900/60 text-slate-300"
                    }`}
                  >
                    <span>{milestone.value}</span>
                    <span className="text-xs uppercase tracking-[0.25em] text-slate-500">
                      {Math.round(milestone.ratio * 100)}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {projectedCompletion && (
              <div className="mt-5 rounded-2xl border border-primary-500/40 bg-primary-500/15 p-4 text-sm text-primary-100">
                <p className="text-xs uppercase tracking-[0.35em] text-primary-200">Forecast</p>
                <p className="mt-2">
                  On track to hit your goal at{" "}
                  <span className="font-semibold">
                    {format(projectedCompletion.eta, "h:mm a")}
                  </span>
                  , about {projectedCompletion.minutesLeft.toFixed(1)} minutes from now.
                </p>
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-slate-800/70 bg-slate-900/60 p-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.35em] text-slate-400">
              Progress Line
            </h2>
            <div className="mt-4 h-32 rounded-2xl border border-slate-800 bg-slate-950/70 p-2">
              {sparkline ? (
                <svg viewBox="0 0 100 100" className="h-full w-full">
                  <polyline
                    fill="none"
                    stroke="url(#sparkGradient)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    points={sparkline}
                    className="animate-pulseSlow"
                  />
                  <defs>
                    <linearGradient id="sparkGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#61ABFF" />
                      <stop offset="100%" stopColor="#3A96FF" stopOpacity="0.4" />
                    </linearGradient>
                  </defs>
                </svg>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-slate-500">
                  No history yet. Start counting to see trends.
                </div>
              )}
            </div>
          </div>
        </aside>
      </section>

      <section className="rounded-3xl border border-slate-800/70 bg-slate-900/60 p-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.35em] text-slate-400">
              Activity Log
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              Increments are tracked with context so you can reflect on your session.
            </p>
          </div>
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <textarea
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Add a note about this session…"
              className="w-full rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40 md:w-72"
            />
            <button
              className="rounded-2xl border border-primary-400/40 bg-primary-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.35em] text-primary-100 transition hover:bg-primary-500/20"
              onClick={() => {
                if (!note.trim()) return;
                const currentNote = note.trim();
                setNote("");
                setState((prev) => {
                  const noteEntry: HistoryEntry = {
                    id: `${Date.now()}-note`,
                    delta: 0,
                    value: prev.value,
                    mode: "manual",
                    createdAt: Date.now(),
                    note: currentNote
                  };
                  return {
                    ...prev,
                    history: [...prev.history, noteEntry].slice(-MAX_HISTORY)
                  };
                });
                sessionStartRef.current = Date.now();
              }}
            >
              Save Note
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-2 text-sm">
          {[...state.history].reverse().slice(0, 12).map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3"
            >
              <div>
                <p className="text-base text-white">
                  {entry.delta > 0 ? "+" : ""}
                  {entry.delta}
                </p>
                <p className="text-xs uppercase tracking-[0.35em] text-slate-500">
                  {entry.mode === "auto" ? "Automation" : "Manual"} ·{" "}
                  {format(entry.createdAt, "MMM d, h:mm:ss a")}
                </p>
                {entry.note && (
                  <p className="mt-2 text-xs text-slate-300">“{entry.note}”</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Total</p>
                <p className="text-lg font-semibold text-primary-200">{entry.value}</p>
              </div>
            </div>
          ))}
          {state.history.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-700/70 bg-slate-950/40 p-6 text-center text-sm text-slate-400">
              No activity yet. Use quick actions to start your session.
            </div>
          )}
        </div>
      </section>

      <footer className="text-center text-xs uppercase tracking-[0.35em] text-slate-600">
        {lastUpdated ? (
          <span>Updated {format(lastUpdated, "MMM d, yyyy · h:mm a")}</span>
        ) : (
          <span>Ready for your next streak</span>
        )}
      </footer>
    </div>
  );
}
