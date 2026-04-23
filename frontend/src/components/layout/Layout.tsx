import { Outlet, NavLink } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";

const nav = [
  { to: "/",         label: "Dashboard", end: true  },
  { to: "/workouts", label: "Workouts",  end: false },
  { to: "/activity", label: "Activity",  end: false },
];

export default function Layout() {
  const { user, logout } = useAuthStore();

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-52 flex flex-col bg-gray-900 border-r border-gray-800 shrink-0">
        <div className="px-5 py-5 border-b border-gray-800">
          <span className="text-brand-400 font-semibold text-lg tracking-wide">Magni</span>
          <span className="block text-xs text-gray-600 mt-0.5">v0.0.1</span>
        </div>
        <nav className="flex-1 py-4 space-y-1 px-3">
          {nav.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `block px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? "bg-brand-600 text-white"
                    : "text-gray-400 hover:bg-gray-800 hover:text-gray-100"
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-gray-800">
          <p className="text-xs text-gray-500 truncate mb-2">{user?.display_name}</p>
          <button
            onClick={logout}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
