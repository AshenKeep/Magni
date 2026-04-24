import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { format } from "date-fns";

function fmtBytes(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function AdminPage() {
  const qc = useQueryClient();
  const [resetEmail, setResetEmail] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetMsg, setResetMsg] = useState("");

  const { data: backupStatus } = useQuery({ queryKey: ["backup-status"], queryFn: api.admin.backupStatus });
  const { data: users } = useQuery({ queryKey: ["admin-users"], queryFn: api.admin.listUsers });

  const runBackup = useMutation({
    mutationFn: api.admin.runBackup,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["backup-status"] }),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: () => api.admin.resetPassword(resetEmail, resetPassword),
    onSuccess: () => {
      setResetMsg("Password updated successfully");
      setResetEmail(""); setResetPassword("");
    },
    onError: (e: Error) => setResetMsg(`Error: ${e.message}`),
  });

  const toggleActive = useMutation({
    mutationFn: (userId: string) => api.admin.toggleActive(userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  return (
    <div className="p-8 space-y-8 max-w-4xl">
      <h1 className="text-2xl font-bold text-primary">Admin</h1>

      {/* Backup */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-border bg-card flex items-center justify-between">
          <p className="font-medium text-primary">Backup</p>
          <button
            onClick={() => runBackup.mutate()}
            disabled={runBackup.isPending}
            className="btn-primary text-xs"
          >
            {runBackup.isPending ? "Running…" : "▶ Run now"}
          </button>
        </div>
        <div className="p-5 grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <p className="label">Last backup</p>
            <p className="text-sm text-primary">{backupStatus?.last_backup ?? "Never"}</p>
          </div>
          <div>
            <p className="label">Backup size</p>
            <p className="text-sm text-primary">{fmtBytes(backupStatus?.last_backup_size_bytes ?? null)}</p>
          </div>
          <div>
            <p className="label">Total backups</p>
            <p className="text-sm text-primary">{backupStatus?.backup_count ?? 0}</p>
          </div>
          <div>
            <p className="label">Schedule</p>
            <p className="text-sm text-primary font-mono">{backupStatus?.schedule ?? "—"}</p>
          </div>
          <div>
            <p className="label">Timezone</p>
            <p className="text-sm text-primary">{backupStatus?.timezone ?? "—"}</p>
          </div>
          <div>
            <p className="label">Backup dir</p>
            <p className="text-sm text-primary font-mono">{backupStatus?.backup_dir ?? "—"}</p>
          </div>
          {backupStatus?.cifs_path && (
            <div className="col-span-2 md:col-span-3">
              <p className="label">NAS path</p>
              <p className="text-sm text-primary font-mono">{backupStatus.cifs_path}</p>
            </div>
          )}
        </div>
        {runBackup.isSuccess && (
          <div className="px-5 pb-4 text-xs text-success">Backup triggered successfully</div>
        )}
      </div>

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
                <button onClick={() => toggleActive.mutate(u.id)}
                  className="text-xs text-secondary hover:text-primary transition-colors">
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
            <input type="password" value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} className="input" placeholder="Minimum 8 characters" />
          </div>
          <button
            onClick={() => resetPasswordMutation.mutate()}
            disabled={!resetEmail || !resetPassword || resetPasswordMutation.isPending}
            className="btn-primary"
          >
            {resetPasswordMutation.isPending ? "Updating…" : "Reset password"}
          </button>
        </div>
      </div>

      {/* System info */}
      <div className="card p-5">
        <p className="label mb-3">System</p>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><span className="text-secondary">Version </span><span className="text-primary font-mono">v0.0.3</span></div>
          <div><span className="text-secondary">Environment </span><span className="text-primary font-mono">{import.meta.env.MODE}</span></div>
        </div>
      </div>
    </div>
  );
}
