import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, SeedResult, GifDownloadResult, SeedLogEntry } from "@/lib/api";
import { format } from "date-fns";

function fmtBytes(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function SeedResultBox({ result }: { result: SeedResult | GifDownloadResult }) {
  if ("added" in result) {
    return (
      <div className="bg-success/10 border border-success/30 text-success text-sm rounded-lg px-4 py-3 space-y-1">
        <p>✓ Seed complete</p>
        <p className="text-xs text-success/70">
          {result.added} added · {result.skipped} skipped · {result.total_fetched} fetched from API
          {result.gifs_downloaded > 0 ? ` · ${result.gifs_downloaded} GIFs downloaded locally` : ""}
        </p>
      </div>
    );
  }
  return (
    <div className="bg-success/10 border border-success/30 text-success text-sm rounded-lg px-4 py-3 space-y-1">
      <p>✓ GIF download complete</p>
      <p className="text-xs text-success/70">
        {result.downloaded} downloaded · {result.skipped_already_local} already local · {result.failed} failed
      </p>
    </div>
  );
}

export default function AdminPage() {
  const qc = useQueryClient();
  const [resetEmail, setResetEmail] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetMsg, setResetMsg] = useState("");
  const [seedResult, setSeedResult] = useState<SeedResult | GifDownloadResult | null>(null);
  const [seedError, setSeedError] = useState("");

  const { data: backupStatus } = useQuery({ queryKey: ["backup-status"], queryFn: api.admin.backupStatus });
  const { data: users } = useQuery({ queryKey: ["admin-users"], queryFn: api.admin.listUsers });
  const { data: mediaStatus, refetch: refetchMedia } = useQuery({ queryKey: ["media-status"], queryFn: api.admin.mediaStatus });
  const { data: estimateMeta }  = useQuery({ queryKey: ["seed-estimate", false], queryFn: () => api.admin.seedEstimate(false) });
  const { data: estimateGifs }  = useQuery({ queryKey: ["seed-estimate", true],  queryFn: () => api.admin.seedEstimate(true) });
  const { data: seedLogs, refetch: refetchLogs } = useQuery({ queryKey: ["seed-logs"], queryFn: api.admin.seedLogs });

  const runBackup = useMutation({
    mutationFn: api.admin.runBackup,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["backup-status"] }),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: () => api.admin.resetPassword(resetEmail, resetPassword),
    onSuccess: () => { setResetMsg("Password updated successfully"); setResetEmail(""); setResetPassword(""); },
    onError: (e: Error) => setResetMsg(`Error: ${e.message}`),
  });

  const toggleActive = useMutation({
    mutationFn: (userId: string) => api.admin.toggleActive(userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  async function handleSeed(downloadGifs: boolean) {
    setSeedResult(null);
    setSeedError("");
    try {
      const result = await api.admin.seedExercises(downloadGifs);
      setSeedResult(result);
      qc.invalidateQueries({ queryKey: ["exercises"] });
      qc.invalidateQueries({ queryKey: ["media-status"] });
      refetchLogs();
    } catch (e: unknown) {
      setSeedError(e instanceof Error ? e.message : "Seed failed");
      refetchLogs();
    }
  }

  async function handleDownloadGifs() {
    setSeedResult(null);
    setSeedError("");
    try {
      const result = await api.admin.downloadGifs();
      setSeedResult(result);
      qc.invalidateQueries({ queryKey: ["media-status"] });
      refetchLogs();
    } catch (e: unknown) {
      setSeedError(e instanceof Error ? e.message : "Download failed");
      refetchLogs();
    }
  }

  const isSeeding = false; // mutations handled inline above

  return (
    <div className="p-8 space-y-8 max-w-4xl">
      <h1 className="text-2xl font-bold text-primary">Admin</h1>

      {/* Backup */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-border bg-card flex items-center justify-between">
          <p className="font-medium text-primary">Backup</p>
          <button onClick={() => runBackup.mutate()} disabled={runBackup.isPending} className="btn-primary text-xs">
            {runBackup.isPending ? "Running…" : "▶ Run now"}
          </button>
        </div>
        <div className="p-5 grid grid-cols-2 md:grid-cols-3 gap-4">
          {[
            { label: "Last backup",   value: backupStatus?.last_backup ?? "Never" },
            { label: "Backup size",   value: fmtBytes(backupStatus?.last_backup_size_bytes ?? null) },
            { label: "Total backups", value: String(backupStatus?.backup_count ?? 0) },
            { label: "Schedule",      value: backupStatus?.schedule ?? "—" },
            { label: "Timezone",      value: backupStatus?.timezone ?? "—" },
            { label: "NAS path",      value: backupStatus?.cifs_path ?? "—" },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="label">{label}</p>
              <p className="text-sm text-primary font-mono truncate">{value}</p>
            </div>
          ))}
        </div>
        {runBackup.isSuccess && (
          <div className="px-5 pb-4 text-xs text-success">Backup triggered successfully</div>
        )}
      </div>

      {/* Exercise seeding */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-border bg-card">
          <p className="font-medium text-primary">Exercise Library — AscendAPI Seed</p>
          <p className="text-xs text-secondary mt-0.5">
            Exercise data powered by{" "}
            <a href="https://ascendapi.com" target="_blank" rel="noreferrer" className="text-blue hover:underline">AscendAPI</a>
            {" "}(formerly ExerciseDB) ·{" "}
            <a href="https://rapidapi.com/user/ascendapi" target="_blank" rel="noreferrer" className="text-blue hover:underline">RapidAPI</a>
          </p>
        </div>

        <div className="p-5 space-y-5">
          {/* API key status */}
          <div className={`flex items-center gap-3 p-3 rounded-lg border ${
            mediaStatus?.api_key_configured
              ? "bg-success/10 border-success/30"
              : "bg-danger/10 border-danger/30"
          }`}>
            <div className={`w-2 h-2 rounded-full shrink-0 ${mediaStatus?.api_key_configured ? "bg-success" : "bg-danger"}`} />
            <div>
              <p className="text-sm text-primary">
                API key: {mediaStatus?.api_key_configured
                  ? <span className="text-success font-mono">{mediaStatus.api_key_preview} ✓</span>
                  : <span className="text-danger">Not configured</span>}
              </p>
              {!mediaStatus?.api_key_configured && (
                <p className="text-xs text-danger/80 mt-0.5">
                  Add <span className="font-mono">ASCENDAPI_KEY=your_key</span> to <span className="font-mono">.env</span> then run <span className="font-mono">docker compose up -d</span>
                </p>
              )}
            </div>
          </div>

          {/* Media storage status */}
          <div className="flex items-center gap-3 p-3 bg-surface rounded-lg border border-border">
            <div className={`w-2 h-2 rounded-full shrink-0 ${
              mediaStatus?.media_storage === "external" ? "bg-warning" :
              mediaStatus?.media_storage === "local" || mediaStatus?.media_storage === "cifs" ? "bg-success" : "bg-secondary"
            }`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-primary">
                Media storage: <span className="font-mono text-blue">{mediaStatus?.media_storage ?? "…"}</span>
                {mediaStatus?.gif_count ? ` · ${mediaStatus.gif_count} GIFs cached locally` : ""}
              </p>
              <p className="text-xs text-secondary">
                {mediaStatus?.media_storage === "external"
                  ? "GIFs load from AscendAPI CDN. Change MEDIA_STORAGE in .env to cache locally."
                  : `Storing GIFs in ${mediaStatus?.media_dir}`}
              </p>
            </div>
          </div>

          {/* Quota estimates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-surface rounded-lg border border-border space-y-1">
              <p className="text-xs text-secondary uppercase tracking-wider">Metadata only</p>
              <p className="text-lg font-bold text-primary">~{estimateMeta?.metadata_requests ?? 9} requests</p>
              <p className="text-xs text-secondary">Names, muscles, instructions, CDN GIF links</p>
              <p className="text-xs text-success">Leaves ~{estimateMeta?.remaining_estimate ?? 1991} of 2,000 free quota</p>
            </div>
            <div className="p-3 bg-surface rounded-lg border border-border space-y-1">
              <p className="text-xs text-secondary uppercase tracking-wider">Metadata + download GIFs</p>
              <p className="text-lg font-bold text-primary">~{estimateGifs?.total_requests ?? 234} requests</p>
              <p className="text-xs text-secondary">Full data + GIFs saved locally — fewer fetches after</p>
              <p className="text-xs text-warning">Uses ~{estimateGifs?.total_requests ?? 234} of 2,000 free quota</p>
            </div>
          </div>

          {/* Seed buttons */}
          <div className="flex flex-wrap gap-3">
            <button onClick={() => handleSeed(false)} className="btn-primary flex-1">
              ⬇ Seed metadata only
            </button>
            <button
              onClick={() => handleSeed(true)}
              disabled={mediaStatus?.media_storage === "external"}
              className="btn-magenta flex-1 disabled:opacity-40 disabled:cursor-not-allowed"
              title={mediaStatus?.media_storage === "external" ? "Set MEDIA_STORAGE=local or cifs in .env first" : ""}
            >
              ⬇ Seed + download GIFs
            </button>
            <button
              onClick={handleDownloadGifs}
              disabled={mediaStatus?.media_storage === "external"}
              className="btn-secondary flex-1 disabled:opacity-40 disabled:cursor-not-allowed"
              title={mediaStatus?.media_storage === "external" ? "Set MEDIA_STORAGE=local or cifs in .env first" : ""}
            >
              ↓ Download GIFs for existing
            </button>
          </div>

          {mediaStatus?.media_storage === "external" && (
            <p className="text-xs text-secondary">
              "Seed + download GIFs" and "Download GIFs for existing" are disabled because{" "}
              <span className="font-mono text-primary">MEDIA_STORAGE=external</span>. Change to{" "}
              <span className="font-mono text-primary">local</span> or{" "}
              <span className="font-mono text-primary">cifs</span> in your <span className="font-mono text-primary">.env</span> file to enable local caching.
            </p>
          )}

          {/* Results */}
          {seedResult && <SeedResultBox result={seedResult} />}
          {seedError && (
            <div className="bg-danger/10 border border-danger/30 text-danger text-sm rounded-lg px-4 py-3">{seedError}</div>
          )}

          {/* Setup instructions */}
          {!seedResult && !seedError && (
            <details className="text-xs text-secondary">
              <summary className="cursor-pointer hover:text-primary transition-colors">Setup instructions</summary>
              <ol className="mt-2 list-decimal list-inside space-y-1 ml-2">
                <li>Sign up at <a href="https://rapidapi.com" target="_blank" rel="noreferrer" className="text-blue hover:underline">rapidapi.com</a></li>
                <li>Search <span className="text-primary font-mono">"EDB with Videos and Images by AscendAPI"</span></li>
                <li>Subscribe to the Basic plan (free, no card required)</li>
                <li>Copy your <span className="text-primary font-mono">X-RapidAPI-Key</span> → add as <span className="text-primary font-mono">ASCENDAPI_KEY</span> in <span className="text-primary font-mono">.env</span></li>
                <li>Restart the backend: <span className="text-primary font-mono">docker compose up -d</span></li>
              </ol>
            </details>
          )}
        </div>
      </div>

      {/* Seed logs */}
      {(seedLogs ?? []).length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-border bg-card flex items-center justify-between">
            <p className="font-medium text-primary">Seed History</p>
            <button onClick={() => refetchLogs()} className="text-xs text-secondary hover:text-primary transition-colors">↻ Refresh</button>
          </div>
          <div className="divide-y divide-border/40">
            {(seedLogs ?? []).map((log: SeedLogEntry) => (
              <details key={log.id} className="group">
                <summary className="px-5 py-3 flex items-center gap-3 cursor-pointer hover:bg-card/50 transition-colors list-none">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${
                    log.status === "success" ? "bg-success" :
                    log.status === "error"   ? "bg-danger" : "bg-warning animate-pulse"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-primary">
                      {log.mode.replace(/_/g, " ")} ·{" "}
                      <span className={log.status === "success" ? "text-success" : log.status === "error" ? "text-danger" : "text-warning"}>
                        {log.status}
                      </span>
                    </p>
                    <p className="text-xs text-secondary">
                      {format(new Date(log.started_at), "d MMM yyyy HH:mm:ss")}
                      {log.status === "success" && ` · +${log.added} added · ${log.skipped} skipped`}
                      {log.gifs_downloaded > 0 && ` · ${log.gifs_downloaded} GIFs`}
                    </p>
                  </div>
                  <span className="text-secondary text-xs group-open:rotate-90 transition-transform">›</span>
                </summary>
                {(log.log_output || log.error) && (
                  <div className="px-5 pb-4">
                    <pre className="bg-black border border-border rounded-lg p-3 text-xs font-mono text-secondary overflow-x-auto whitespace-pre-wrap max-h-64 overflow-y-auto">
                      {log.error
                        ? `ERROR: ${log.error}\n\n${log.log_output ?? ""}`
                        : log.log_output}
                    </pre>
                  </div>
                )}
              </details>
            ))}
          </div>
        </div>
      )}

      {/* Users */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-border bg-card">
          <p className="font-medium text-primary">Users</p>
        </div>
        <div className="divide-y divide-border/40">
          {(users ?? []).map((u) => (
            <div key={u.id} className="px-5 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-primary">{u.display_name}</p>
                <p className="text-xs text-secondary">{u.email} · joined {format(new Date(u.created_at), "d MMM yyyy")}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs px-2 py-0.5 rounded-full ${u.is_active ? "badge-blue" : "bg-danger/10 text-danger"}`}>
                  {u.is_active ? "Active" : "Disabled"}
                </span>
                <button onClick={() => toggleActive.mutate(u.id)} className="text-xs text-secondary hover:text-primary transition-colors">
                  {u.is_active ? "Disable" : "Enable"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Reset password */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-border bg-card">
          <p className="font-medium text-primary">Reset password</p>
        </div>
        <div className="p-5 space-y-4">
          {resetMsg && (
            <div className={`text-sm rounded-lg px-4 py-3 ${resetMsg.startsWith("Error") ? "bg-danger/10 border border-danger/30 text-danger" : "bg-success/10 border border-success/30 text-success"}`}>
              {resetMsg}
            </div>
          )}
          <div>
            <label className="label">Email</label>
            <input value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} className="input" placeholder="user@example.com" />
          </div>
          <div>
            <label className="label">New password</label>
            <input type="password" value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} className="input" />
          </div>
          <button onClick={() => resetPasswordMutation.mutate()} disabled={!resetEmail || !resetPassword || resetPasswordMutation.isPending} className="btn-primary">
            {resetPasswordMutation.isPending ? "Updating…" : "Reset password"}
          </button>
        </div>
      </div>

      {/* System */}
      <div className="card p-5">
        <p className="label mb-3">System</p>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><span className="text-secondary">Version </span><span className="text-primary font-mono">v0.0.5</span></div>
          <div><span className="text-secondary">Environment </span><span className="text-primary font-mono">{import.meta.env.MODE}</span></div>
          <div><span className="text-secondary">Media storage </span><span className="text-primary font-mono">{mediaStatus?.media_storage ?? "…"}</span></div>
          <div><span className="text-secondary">GIFs cached </span><span className="text-primary font-mono">{mediaStatus?.gif_count ?? 0}</span></div>
        </div>
      </div>
    </div>
  );
}
