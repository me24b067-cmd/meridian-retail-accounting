"use client";
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface MonthPoint { month: string; income: number; expenses: number; profit: number }

const compact = (v: number) => (Math.abs(v) >= 100000 ? `${(v / 100000).toFixed(1)}L` : `${Math.round(v / 1000)}k`);

export function MonthlyChart({ data }: { data: MonthPoint[] }) {
  return (
    <div style={{ width: "100%", height: 280 }}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e9f0" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={compact} tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v) => `₹${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`} />
          <Legend />
          <Bar dataKey="income" name="Income" fill="#1f3a5f" />
          <Bar dataKey="expenses" name="Expenses" fill="#c98a1b" />
          <Line dataKey="profit" name="Net profit" stroke="#14804a" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CompositionChart({ data }: { data: { name: string; value: number }[] }) {
  return (
    <div style={{ width: "100%", height: 280 }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 10, right: 16, left: 30, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e9f0" />
          <XAxis type="number" tickFormatter={compact} tick={{ fontSize: 11 }} />
          <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v) => `₹${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`} />
          <Bar dataKey="value" name="Balance" fill="#1f3a5f" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Optional external reference data. Clearly labelled; failures only hide this panel's numbers. */
export function FxPanel() {
  const [state, setState] = useState<{ available: boolean; message?: string; asOf?: string; rates: Record<string, number>; source?: string } | null>(null);
  useEffect(() => {
    fetch("/api/fx").then((r) => r.json()).then(setState).catch(() => setState({ available: false, rates: {}, message: "Could not reach the rates service." }));
  }, []);
  if (!state) return <p className="p-4 text-sm text-[color:var(--muted)]">Loading reference rates…</p>;
  if (!state.available) return <p className="p-4 text-sm text-[color:var(--muted)]">{state.message ?? "Reference rates unavailable."}</p>;
  return (
    <div className="p-4 text-sm">
      <div className="grid grid-cols-3 gap-3">
        {Object.entries(state.rates).map(([cur, inr]) => (
          <div key={cur}><div className="text-xs text-[color:var(--muted)]">1 {cur} =</div><div className="font-bold">₹{inr.toFixed(2)}</div></div>
        ))}
      </div>
      <p className="mt-3 text-xs text-[color:var(--muted)]">Source: {state.source}, as of {state.asOf}. Reference data only - not used in any journal entry or statement.</p>
    </div>
  );
}
