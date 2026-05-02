import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, SeedResult, GifDownloadResult, SeedLogEntry, ApiKeyProvider } from "@/lib/api";
import { format } from "date-fns";

function fmtBytes(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function ApiKeyCard({ provider, onChange }: { provider: ApiKeyProvider; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [error, setError] = useState("");

  const save = useMutation({
    mutationFn: () => api.admin.apiKeySave(provider.provider, newKey),
    onSuccess: () => { setEditing(false); setNewKey(""); setError(""); onChange(); },
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: () => api.admin.apiKeyDelete(provider.provider),
    onSuccess: () => onChange(),
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="p-4 bg-surface border border-border rounded-lg space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium text-primary">{provider.name}</p>
            <span className={`w-2 h-2 rounded-full ${provider.configured ? "bg-success" : "bg-secondary"}`} />
          </div>
          <p className="text-xs text-secondary">
            {provider.configured ? `Key: ${provider.preview}` : "No key configured"}
            {" · "}{provider.free_quota.toLocaleString()} req/month free
          </p>
        </div>
        <div className="flex gap-2">
          {provider.configured && !editing && (
            <button onClick={() => remove.mutate()} className="text-xs text-danger hover:text-danger/80">
              Remove
            </button>
          )}
          {!editing && (
            <button onClick={() => setEditing(true)} className="text-xs text-blue hover:text-blue-dim">
              {provider.configured ? "Replace" : "Add key"}
            </button>
          )}
        </div>
      </div>

      {editing && (
        <div className="space-y-2 pt-2 border-t border-border">
          <input
            type="password"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder={`${provider.provider === "ascendapi" ? "RapidAPI key" : "wx_…"}`}
            className="input text-xs"
            autoFocus
          />
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex gap-2">
            <button onClick={() => { setEditing(false); setNewKey(""); setError(""); }} className="btn-secondary text-xs flex-1">Cancel</button>
            <button onClick={() => save.mutate()} disabled={!newKey.trim() || save.isPending} className="btn-primary text-xs flex-1">
              {save.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}

      <details className="text-xs text-secondary">
        <summary className="cursor-pointer hover:text-primary">Setup instructions</summary>
        <p className="mt-2 pl-2 text-xs leading-relaxed">{provider.signup_instructions}</p>
        <a href={provider.docs_url} target="_blank" rel="noreferrer" className="text-blue hover:underline text-xs mt-1 inline-block">
          Docs / Sign up →
        </a>
      </details>
    </div>
  );
}

function SeedResultBox({ result }: { result: SeedResult | GifDownloadResult }) {
  if ("added" in result) {
    return (
      <div className="bg-success/10 border border-success/30 text-success text-sm rounded-lg px-4 py-3 space-y-1">
        <p>✓ Seed complete ({result.provider})</p>
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
  const [provider, setProvider] = useState<"ascendapi" | "workoutx" | "both">("ascendapi");
  const [debugResult, setDebugResult] = useState<string>("");

  const { data: backupStatus } = useQuery({ queryKey: ["backup-status"], queryFn: api.admin.backupStatus });
  const { data: users } = useQuery({ queryKey: ["admin-users"], queryFn: api.admin.listUsers });
  const { data: mediaStatus } = useQuery({ queryKey: ["media-status"], queryFn: api.admin.mediaStatus });
  const { data: apiKeys, refetch: refetchKeys } = useQuery({ queryKey: ["api-keys"], queryFn: api.admin.apiKeysList });
  const { data: estimateMeta } = useQuery({ queryKey: ["seed-estimate", provider, false], queryFn: () => api.admin.seedEstimate(provider === "both" ? "ascendapi" : provider, false) });
  const { data: estimateGifs } = useQuery({ queryKey: ["seed-estimate", provider, true],  queryFn: () => api.admin.seedEstimate(provider === "both" ? "ascendapi" : provider, true) });
  const { data: seedLogs, refetch: refetchLogs } = useQuery({ queryKey: ["seed-logs"], queryFn: api.admin.seedLogs });

  const runBackup = useMutation({
    mutationFn: (body: { include_media?: boolean } = {}) => api.admin.runBackup(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["backup-status"] });
      qc.invalidateQueries({ queryKey: ["backup-list"] });
    },
  });

  // v0.0.12 — backup management
  const { data: backupList } = useQuery({
    queryKey: ["backup-list"], queryFn: api.admin.listBackups,
  });
  const { data: backupSettings } = useQuery({
    queryKey: ["backup-settings"], queryFn: api.admin.getBackupSettings,
  });
  const updateBackupSettings = useMutation({
    mutationFn: (body: { retention_days?: number; include_media?: boolean }) =>
      api.admin.updateBackupSettings(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["backup-settings"] }),
  });
  const restoreBackup = useMutation({
    mutationFn: (filename: string) => api.admin.restoreBackup(filename),
    onSuccess: () => {
      // After restore, virtually everything has changed — refetch broadly
      qc.invalidateQueries();
    },
  });
  const deleteBackup = useMutation({
    mutationFn: (filename: string) => api.admin.deleteBackup(filename),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["backup-list"] });
      qc.invalidateQueries({ queryKey: ["backup-status"] });
    },
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
      const result = await api.admin.seedExercises(provider, downloadGifs);
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

  // Determine if seed buttons should be disabled
  const ascConfigured = mediaStatus?.providers?.ascendapi?.configured ?? false;
  const wxConfigured  = mediaStatus?.providers?.workoutx?.configured  ?? false;
  const seedDisabled =
    (provider === "ascendapi" && !ascConfigured) ||
    (provider === "workoutx" && !wxConfigured) ||
    (provider === "both" && !ascConfigured && !wxConfigured);

  return (
    <div className="p-8 space-y-8 max-w-4xl">
      <h1 className="text-2xl font-bold text-primary">Admin</h1>

      {/* Backup */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-border bg-card flex items-center justify-between">
          <p className="font-medium text-primary">Backup</p>
          <div className="flex gap-2">
            <button
              onClick={() => runBackup.mutate({})}
              disabled={runBackup.isPending}
              className="btn-primary text-xs"
            >
              {runBackup.isPending ? "Running…" : "▶ Run now"}
            </button>
          </div>
        </div>
        <div className="p-5 space-y-5">
          {/* Status grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
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

          {/* Settings */}
          <div className="border-t border-border pt-5 space-y-3">
            <p className="text-sm font-medium text-primary">Settings</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="label">Retention (number of past backups to keep)</label>
                <input
                  type="number"
                  min={1} max={365}
                  defaultValue={backupSettings?.retention_days ?? 7}
                  key={backupSettings?.retention_days ?? 0}
                  onBlur={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (Number.isFinite(v) && v >= 1 && v !== backupSettings?.retention_days) {
                      updateBackupSettings.mutate({ retention_days: v });
                    }
                  }}
                  className="input"
                />
                <p className="text-xs text-secondary mt-1">
                  Older backups are pruned after each run. Default 7.
                </p>
              </div>
              <div>
                <label className="label">Include media (exercise GIFs/images)</label>
                <button
                  onClick={() => updateBackupSettings.mutate({
                    include_media: !(backupSettings?.include_media ?? false),
                  })}
                  className={`btn-secondary w-full text-left text-sm ${backupSettings?.include_media ? "border-blue text-blue" : ""}`}
                >
                  {backupSettings?.include_media ? "✓ Enabled" : "✗ Disabled"} — click to toggle
                </button>
                <p className="text-xs text-secondary mt-1">
                  When on, scheduled backups also bundle /media. Skipped re-tar if media unchanged.
                </p>
              </div>
            </div>
          </div>

          {/* Backup list */}
          <div className="border-t border-border pt-5 space-y-2">
            <p className="text-sm font-medium text-primary">Available backups</p>
            {(!backupList || backupList.length === 0) && (
              <p className="text-secondary text-xs">No backups yet.</p>
            )}
            {backupList && backupList.length > 0 && (
              <div className="space-y-1">
                {backupList.map((b) => (
                  <div key={b.filename} className="flex items-center justify-between gap-3 bg-card border border-border rounded-lg px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-primary font-mono truncate">{b.filename}</p>
                      <p className="text-[10px] text-secondary">
                        {fmtBytes(b.size_bytes)} · {new Date(b.created_at).toLocaleString()}
                        {b.has_media ? " · with media" : ""}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => {
                          if (confirm(`RESTORE from "${b.filename}"?\n\nThis WILL ERASE current data and replace it with the backup. This cannot be undone.`)) {
                            restoreBackup.mutate(b.filename);
                          }
                        }}
                        disabled={restoreBackup.isPending}
                        className="text-xs text-blue hover:text-blue-dim disabled:opacity-50"
                      >
                        {restoreBackup.isPending && restoreBackup.variables === b.filename ? "Restoring…" : "Restore"}
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Delete "${b.filename}"?`)) deleteBackup.mutate(b.filename);
                        }}
                        className="text-xs text-secondary hover:text-danger"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* API Keys */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-border bg-card">
          <p className="font-medium text-primary">API Keys</p>
          <p className="text-xs text-secondary mt-0.5">
            Configure exercise data providers. Keys are stored securely in the database.
          </p>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          {(apiKeys?.providers ?? []).map((p) => (
            <ApiKeyCard key={p.provider} provider={p} onChange={() => { refetchKeys(); qc.invalidateQueries({ queryKey: ["media-status"] }); }} />
          ))}
        </div>
      </div>

      {/* Exercise seeding */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-border bg-card">
          <p className="font-medium text-primary">Exercise Library — Seed</p>
          <p className="text-xs text-secondary mt-0.5">
            Pull exercise data from{" "}
            <a href="https://ascendapi.com" target="_blank" rel="noreferrer" className="text-blue hover:underline">AscendAPI</a>{" "}or{" "}
            <a href="https://workoutxapp.com" target="_blank" rel="noreferrer" className="text-blue hover:underline">WorkoutX</a>
          </p>
        </div>

        <div className="p-5 space-y-5">
          {/* Provider selection */}
          <div>
            <p className="label mb-2">Provider</p>
            <div className="flex gap-2">
              {[
                { key: "ascendapi", label: "AscendAPI", configured: ascConfigured },
                { key: "workoutx",  label: "WorkoutX",  configured: wxConfigured  },
                { key: "both",      label: "Both",      configured: ascConfigured || wxConfigured },
              ].map(p => (
                <button
                  key={p.key}
                  onClick={() => setProvider(p.key as "ascendapi" | "workoutx" | "both")}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm transition-colors ${
                    provider === p.key
                      ? "bg-blue text-white"
                      : p.configured
                        ? "bg-surface border border-border text-primary hover:bg-card"
                        : "bg-surface border border-border text-secondary opacity-50 cursor-not-allowed"
                  }`}
                  disabled={!p.configured}
                  title={!p.configured ? "Configure API key first" : ""}
                >
                  {p.label}{!p.configured && " 🔒"}
                </button>
              ))}
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
                {mediaStatus?.gif_count ? ` · ${mediaStatus.gif_count} GIFs cached` : ""}
              </p>
              <p className="text-xs text-secondary">
                {mediaStatus?.media_storage === "external"
                  ? "GIFs load from provider CDN. Set MEDIA_STORAGE in .env to cache locally."
                  : `Caching GIFs in ${mediaStatus?.media_dir}`}
              </p>
            </div>
          </div>

          {/* Quota estimates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-surface rounded-lg border border-border space-y-1">
              <p className="text-xs text-secondary uppercase tracking-wider">Metadata only</p>
              <p className="text-lg font-bold text-primary">~{estimateMeta?.metadata_requests ?? "?"} requests</p>
              <p className="text-xs text-secondary">Names, muscles, instructions, CDN GIF links</p>
              <p className="text-xs text-success">Leaves ~{estimateMeta?.remaining_estimate ?? "?"} of {estimateMeta?.free_quota?.toLocaleString() ?? "?"} free quota</p>
            </div>
            <div className="p-3 bg-surface rounded-lg border border-border space-y-1">
              <p className="text-xs text-secondary uppercase tracking-wider">Metadata + GIFs</p>
              <p className="text-lg font-bold text-primary">~{estimateGifs?.total_requests ?? "?"} requests</p>
              <p className="text-xs text-secondary">Full data + GIFs cached locally</p>
              <p className="text-xs text-warning">Uses ~{estimateGifs?.total_requests ?? "?"} of {estimateGifs?.free_quota?.toLocaleString() ?? "?"} free quota</p>
            </div>
          </div>

          {/* Seed buttons */}
          <div className="flex flex-wrap gap-3">
            <button onClick={() => handleSeed(false)} disabled={seedDisabled} className="btn-primary flex-1 disabled:opacity-40 disabled:cursor-not-allowed">
              ⬇ Seed metadata only
            </button>
            <button
              onClick={() => handleSeed(true)}
              disabled={seedDisabled || mediaStatus?.media_storage === "external"}
              className="btn-magenta flex-1 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ⬇ Seed + download GIFs
            </button>
            <button
              onClick={handleDownloadGifs}
              disabled={mediaStatus?.media_storage === "external"}
              className="btn-secondary flex-1 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ↓ Download GIFs for existing
            </button>
          </div>

          {/* Recategorize button — for upgraded exercises that need multi-category tags */}
          <button onClick={async () => {
            setSeedResult(null); setSeedError("");
            try {
              const r = await api.admin.recategorize();
              setSeedError(""); 
              setSeedResult({ status: "ok", added: r.updated, skipped: r.total - r.updated, total_fetched: r.total, gifs_downloaded: 0, media_storage: "n/a", provider: "recategorize" } as SeedResult);
              qc.invalidateQueries({ queryKey: ["exercises"] });
            } catch (e: unknown) { setSeedError(e instanceof Error ? e.message : "Recategorize failed"); }
          }} className="btn-secondary w-full text-xs">
            ↻ Recategorize existing exercises (multi-muscle tags)
          </button>

          {/* Debug button — runs all auth strategies against WorkoutX GIF endpoint */}
          <button onClick={async () => {
            setDebugResult("Running…");
            try {
              const r = await api.admin.debugWorkoutXGif("0009");
              setDebugResult(JSON.stringify(r, null, 2));
            } catch (e: unknown) {
              setDebugResult("ERROR: " + (e instanceof Error ? e.message : String(e)));
            }
          }} className="btn-secondary w-full text-xs">
            🔍 Debug WorkoutX GIF auth (test all methods on exercise 0009)
          </button>

          {debugResult && (
            <pre className="bg-card border border-border text-xs rounded-lg p-3 overflow-x-auto max-h-96 overflow-y-auto whitespace-pre-wrap">{debugResult}</pre>
          )}

          {seedResult && <SeedResultBox result={seedResult} />}
          {seedError && (
            <div className="bg-danger/10 border border-danger/30 text-danger text-sm rounded-lg px-4 py-3">{seedError}</div>
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
                      {log.error ? `ERROR: ${log.error}\n\n${log.log_output ?? ""}` : log.log_output}
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
          <div><span className="text-secondary">Version </span><span className="text-primary font-mono">v0.0.12</span></div>
          <div><span className="text-secondary">Environment </span><span className="text-primary font-mono">{import.meta.env.MODE}</span></div>
          <div><span className="text-secondary">Media storage </span><span className="text-primary font-mono">{mediaStatus?.media_storage ?? "…"}</span></div>
          <div><span className="text-secondary">GIFs cached </span><span className="text-primary font-mono">{mediaStatus?.gif_count ?? 0}</span></div>
        </div>
      </div>
    </div>
  );
}
