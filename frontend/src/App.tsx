import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
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

function AppRoutes() {
  const { user, loading, init } = useAuthStore();
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const base = import.meta.env.VITE_API_URL ?? "";
    fetch(`${base}/api/auth/setup-required`)
      .then((r) => r.json())
      .then((data) => {
        setSetupRequired(data.required);
        if (data.required) {
          navigate("/setup", { replace: true });
        } else {
          init();
        }
      })
      .catch(() => {
        // If check fails just proceed normally
        setSetupRequired(false);
        init();
      });
  }, []);

  // Still checking setup status
  if (setupRequired === null) {
    return <div className="flex h-screen items-center justify-center text-gray-500 text-sm">Loading…</div>;
  }

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-gray-500 text-sm">Loading…</div>;
  }

  return (
    <Routes>
      <Route path="/setup" element={setupRequired ? <SetupPage /> : <Navigate to="/" replace />} />
      <Route path="/login" element={!user ? <LoginPage /> : <Navigate to="/" replace />} />
      <Route path="/" element={user ? <Layout /> : <Navigate to="/login" replace />}>
        <Route index element={<DashboardPage />} />
        <Route path="workouts" element={<WorkoutsPage />} />
        <Route path="workouts/:id" element={<WorkoutDetailPage />} />
        <Route path="activity" element={<ActivityPage />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
