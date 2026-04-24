import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuthStore } from "@/store/authStore";
import Layout from "@/components/layout/Layout";
import SetupPage from "@/components/pages/SetupPage";
import LoginPage from "@/components/pages/LoginPage";
import DashboardPage from "@/components/pages/DashboardPage";
import WorkoutsPage from "@/components/pages/WorkoutsPage";
import WorkoutDetailPage from "@/components/pages/WorkoutDetailPage";
import NewWorkoutPage from "@/components/pages/NewWorkoutPage";
import ExercisesPage from "@/components/pages/ExercisesPage";
import TemplatesPage from "@/components/pages/TemplatesPage";
import ActivityPage from "@/components/pages/ActivityPage";
import AdminPage from "@/components/pages/AdminPage";

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: 1 } } });

type AppState = "checking" | "setup" | "ready";

export default function App() {
  const { user, loading, init } = useAuthStore();
  const [appState, setAppState] = useState<AppState>("checking");

  useEffect(() => {
    fetch("/api/auth/setup-required")
      .then((r) => r.json())
      .then((data) => {
        if (data.required) {
          setAppState("setup");
        } else {
          init().then(() => setAppState("ready"));
        }
      })
      .catch(() => {
        const token = localStorage.getItem("gym_token");
        if (!token) { setAppState("setup"); }
        else { init().then(() => setAppState("ready")); }
      });
  }, []);

  if (appState === "checking" || (appState === "ready" && loading)) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <div className="text-center">
          <p className="text-blue text-2xl font-bold mb-2">Magni</p>
          <p className="text-secondary text-sm">Loading…</p>
        </div>
      </div>
    );
  }

  if (appState === "setup") {
    return (
      <QueryClientProvider client={qc}>
        <BrowserRouter>
          <Routes>
            <Route path="*" element={<SetupPage onComplete={() => {
              init().then(() => setAppState("ready"));
            }} />} />
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={!user ? <LoginPage /> : <Navigate to="/" replace />} />
          <Route path="/" element={user ? <Layout /> : <Navigate to="/login" replace />}>
            <Route index element={<DashboardPage />} />
            <Route path="workouts" element={<WorkoutsPage />} />
            <Route path="workouts/new" element={<NewWorkoutPage />} />
            <Route path="workouts/:id" element={<WorkoutDetailPage />} />
            <Route path="exercises" element={<ExercisesPage />} />
            <Route path="templates" element={<TemplatesPage />} />
            <Route path="activity" element={<ActivityPage />} />
            <Route path="admin" element={<AdminPage />} />
          </Route>
          <Route path="*" element={<Navigate to={user ? "/" : "/login"} replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
