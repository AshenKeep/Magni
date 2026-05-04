import { Outlet, NavLink } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { useIsTouchDevice } from "@/hooks/useIsTouchDevice";

const nav = [
  { to: "/",          label: "Dashboard",  icon: "⊞", end: true  },
  { to: "/workouts",  label: "Workouts",   icon: "◈", end: false },
  { to: "/exercises", label: "Exercises",  icon: "⊕", end: false },
  { to: "/templates", label: "Templates",  icon: "◧", end: false },
  { to: "/activity",  label: "Activity",   icon: "♡", end: false },
  { to: "/admin",     label: "Admin",      icon: "⚙", end: false },
];

export default function Layout() {
  const { user, logout } = useAuthStore();
  const isTouch = useIsTouchDevice();

  return (
    <div className="flex h-screen overflow-hidden bg-black">

      {/* Sidebar — shown when mouse/trackpad is primary input */}
      {!isTouch && (
        <aside className="w-52 flex flex-col shrink-0 border-r border-border bg-surface">
          <div className="px-5 py-5 border-b border-border">
            <span className="text-blue font-bold text-xl tracking-tight">Magni</span>
            <span className="block text-xs text-secondary mt-0.5">v0.0.13</span>
          </div>

          <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
            {nav.map(({ to, label, icon, end }) => (
              <NavLink
                key={to} to={to} end={end}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                    isActive
                      ? "bg-blue-glow text-blue font-medium border border-blue/20"
                      : "text-secondary hover:bg-card hover:text-primary"
                  }`
                }
              >
                <span className="text-base w-5 text-center">{icon}</span>
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="px-4 py-4 border-t border-border">
            <p className="text-xs text-secondary truncate mb-1">{user?.display_name}</p>
            <p className="text-xs text-secondary/60 truncate mb-3">{user?.email}</p>
            <button onClick={logout} className="text-xs text-secondary hover:text-danger transition-colors">
              Sign out
            </button>
          </div>
        </aside>
      )}

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-black" style={{
        paddingBottom: isTouch ? "env(safe-area-inset-bottom)" : 0,
      }}>
        {/* Mobile header */}
        {isTouch && (
          <header className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 bg-surface border-b border-border">
            <span className="text-blue font-bold text-lg tracking-tight">Magni</span>
            <button onClick={logout} className="text-xs text-secondary hover:text-danger transition-colors">
              Sign out
            </button>
          </header>
        )}

        <Outlet />
      </main>

      {/* Bottom nav — shown when touch/finger is primary input */}
      {isTouch && (
        <nav
          className="fixed bottom-0 left-0 right-0 z-30 flex items-stretch bg-surface border-t border-border"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          {nav.map(({ to, label, icon, end }) => (
            <NavLink
              key={to} to={to} end={end}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center justify-center gap-0.5 py-2 min-h-[52px] text-[10px] transition-colors ${
                  isActive ? "text-blue" : "text-secondary"
                }`
              }
            >
              <span className="text-xl leading-none">{icon}</span>
              <span className="leading-none">{label}</span>
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}
