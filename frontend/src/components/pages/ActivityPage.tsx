import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { format } from "date-fns";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const RANGES = [7, 30, 90];
const tt = {
  contentStyle: { background: "#111827", border: "1px solid #374151", borderRadius: 8 },
  labelStyle: { color: "#9ca3af" },
};

export default function ActivityPage() {
  const [days, setDays] = useState(30);
  const { data: stats, isLoading } = useQuery({
    queryKey: ["daily-stats", days],
    queryFn: () => api.stats.daily(days),
  });

  const chartData = (stats ?? []).slice().reverse().map((s) => ({
    date:       format(new Date(s.date), "d MMM"),
    steps:      s.steps ?? 0,
    resting_hr: s.resting_hr,
    active_cal: s.active_calories ?? 0,
    sleep_h:    s.sleep_seconds ? Math.round((s.sleep_seconds / 3600) * 10) / 10 : null,
  }));

  return (
    <div className="p-8 space-y-8 max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-100">Activity</h1>
        <div className="flex gap-2">
          {RANGES.map((r) => (
            <button key={r} onClick={() => setDays(r)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                days === r ? "bg-brand-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}>
              {r}d
            </button>
          ))}
        </div>
      </div>

      {isLoading && <p className="text-gray-500 text-sm">Loading…</p>}

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <p className="text-sm font-medium text-gray-400 mb-4">Daily steps</p>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 11 }} />
            <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} />
            <Tooltip {...tt} itemStyle={{ color: "#818cf8" }} />
            <Bar dataKey="steps" fill="#4f46e5" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <p className="text-sm font-medium text-gray-400 mb-4">Resting heart rate</p>
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 11 }} />
            <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} domain={["auto", "auto"]} />
            <Tooltip {...tt} itemStyle={{ color: "#f87171" }} />
            <Line type="monotone" dataKey="resting_hr" stroke="#f87171" strokeWidth={2} dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <p className="text-sm font-medium text-gray-400 mb-4">Sleep (hours)</p>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 11 }} />
            <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} domain={[0, 10]} />
            <Tooltip {...tt} itemStyle={{ color: "#34d399" }} />
            <Bar dataKey="sleep_h" fill="#059669" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-800">
          <p className="text-sm font-medium text-gray-400">Daily breakdown</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-800">
                {["Date","Steps","Active cal","Resting HR","Sleep","Active min","Floors"].map((h) => (
                  <th key={h} className="px-5 py-3 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(stats ?? []).map((s) => (
                <tr key={s.id} className="border-b border-gray-800/40 hover:bg-gray-800/20 transition-colors">
                  <td className="px-5 py-3 text-gray-300">{format(new Date(s.date), "EEE d MMM")}</td>
                  <td className="px-5 py-3 text-gray-300">{s.steps?.toLocaleString() ?? "—"}</td>
                  <td className="px-5 py-3 text-gray-300">{s.active_calories ?? "—"}</td>
                  <td className="px-5 py-3 text-red-400">{s.resting_hr ? `${s.resting_hr} bpm` : "—"}</td>
                  <td className="px-5 py-3 text-gray-300">{s.sleep_seconds ? `${(s.sleep_seconds / 3600).toFixed(1)}h` : "—"}</td>
                  <td className="px-5 py-3 text-gray-300">{s.active_minutes ?? "—"}</td>
                  <td className="px-5 py-3 text-gray-300">{s.floors_climbed ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
