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
import ActivityPage from "@/components/pages/ActivityPage";

const qc = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, retry: 1 } },
});

type AppState = "checking" | "setup" | "ready";

export default function App() {
  const { user, loading, init } = useAuthStore();
  const [appState, setAppState] = useState<AppState>("checking");

  useEffect(() => {
    // Run once on mount — check if setup is needed then initialise auth
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
        // If check fails, fall back based on whether a token exists
        const token = localStorage.getItem("gym_token");
        if (!token) {
          setAppState("setup");
        } else {
          init().then(() => setAppState("ready"));
        }
      });
  }, []); // Empty deps — runs once only

  if (appState === "checking" || (appState === "ready" && loading)) {
    return (
      <div className="flex h-screen items-center justify-center text-gray-500 text-sm">
        Loading…
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

  // appState === "ready"
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={!user ? <LoginPage /> : <Navigate to="/" replace />} />
          <Route path="/" element={user ? <Layout /> : <Navigate to="/login" replace />}>
            <Route index element={<DashboardPage />} />
            <Route path="workouts" element={<WorkoutsPage />} />
            <Route path="workouts/:id" element={<WorkoutDetailPage />} />
            <Route path="activity" element={<ActivityPage />} />
          </Route>
          <Route path="*" element={<Navigate to={user ? "/" : "/login"} replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
