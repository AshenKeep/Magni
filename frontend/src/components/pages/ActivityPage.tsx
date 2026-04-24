import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { format } from "date-fns";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const RANGES = [7, 30, 90];
const tt = {
  contentStyle: { background: "#141414", border: "1px solid #1F1F1F", borderRadius: 8 },
  labelStyle: { color: "#888" },
};

export default function ActivityPage() {
  const [days, setDays] = useState(30);
  const { data: stats, isLoading } = useQuery({
    queryKey: ["daily-stats", days], queryFn: () => api.stats.daily(days),
  });

  const chartData = (stats ?? []).slice().reverse().map((s) => ({
    date:       format(new Date(s.date), "d MMM"),
    steps:      s.steps ?? 0,
    resting_hr: s.resting_hr,
    active_cal: s.active_calories ?? 0,
    sleep_h:    s.sleep_seconds ? Math.round((s.sleep_seconds / 3600) * 10) / 10 : null,
  }));

  return (
    <div className="p-8 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-primary">Activity</h1>
        <div className="flex gap-2">
          {RANGES.map((r) => (
            <button key={r} onClick={() => setDays(r)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                days === r ? "bg-blue text-white" : "bg-card border border-border text-secondary hover:text-primary"
              }`}>
              {r}d
            </button>
          ))}
        </div>
      </div>

      {isLoading && <div className="text-secondary text-sm">Loading…</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-5">
          <p className="label mb-4">Daily steps</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1F1F1F" />
              <XAxis dataKey="date" tick={{ fill: "#888", fontSize: 10 }} />
              <YAxis tick={{ fill: "#888", fontSize: 10 }} />
              <Tooltip {...tt} itemStyle={{ color: "#5B7FFF" }} />
              <Bar dataKey="steps" fill="#5B7FFF" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <p className="label mb-4">Resting heart rate</p>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1F1F1F" />
              <XAxis dataKey="date" tick={{ fill: "#888", fontSize: 10 }} />
              <YAxis tick={{ fill: "#888", fontSize: 10 }} domain={["auto", "auto"]} />
              <Tooltip {...tt} itemStyle={{ color: "#CC2ECC" }} />
              <Line type="monotone" dataKey="resting_hr" stroke="#CC2ECC" strokeWidth={2} dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <p className="label mb-4">Sleep (hours)</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1F1F1F" />
              <XAxis dataKey="date" tick={{ fill: "#888", fontSize: 10 }} />
              <YAxis tick={{ fill: "#888", fontSize: 10 }} domain={[0, 10]} />
              <Tooltip {...tt} itemStyle={{ color: "#5B7FFF" }} />
              <Bar dataKey="sleep_h" fill="#3D5FCC" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <p className="label mb-4">Active calories</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1F1F1F" />
              <XAxis dataKey="date" tick={{ fill: "#888", fontSize: 10 }} />
              <YAxis tick={{ fill: "#888", fontSize: 10 }} />
              <Tooltip {...tt} itemStyle={{ color: "#CC2ECC" }} />
              <Bar dataKey="active_cal" fill="#991F99" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Daily table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-card">
          <p className="label">Daily breakdown</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-secondary border-b border-border">
                {["Date","Steps","Active cal","Resting HR","Sleep","Active min","Floors"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(stats ?? []).map((s) => (
                <tr key={s.id} className="border-b border-border/40 hover:bg-card/50 transition-colors">
                  <td className="px-4 py-2.5 text-primary">{format(new Date(s.date), "EEE d MMM")}</td>
                  <td className="px-4 py-2.5 text-primary">{s.steps?.toLocaleString() ?? "—"}</td>
                  <td className="px-4 py-2.5 text-primary">{s.active_calories ?? "—"}</td>
                  <td className="px-4 py-2.5 text-magenta">{s.resting_hr ? `${s.resting_hr} bpm` : "—"}</td>
                  <td className="px-4 py-2.5 text-primary">{s.sleep_seconds ? `${(s.sleep_seconds / 3600).toFixed(1)}h` : "—"}</td>
                  <td className="px-4 py-2.5 text-primary">{s.active_minutes ?? "—"}</td>
                  <td className="px-4 py-2.5 text-primary">{s.floors_climbed ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
