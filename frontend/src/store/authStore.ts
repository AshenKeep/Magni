import { create } from "zustand";
import { api, setToken, clearToken, type UserResponse } from "@/lib/api";

interface AuthState {
  user: UserResponse | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  init: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,

  init: async () => {
    const token = localStorage.getItem("gym_token");
    if (!token) { set({ loading: false }); return; }
    try {
      const user = await api.auth.me();
      set({ user, loading: false });
    } catch {
      clearToken();
      set({ user: null, loading: false });
    }
  },

  login: async (email, password) => {
    const { access_token } = await api.auth.login(email, password);
    setToken(access_token);
    const user = await api.auth.me();
    set({ user });
  },

  logout: () => {
    clearToken();
    set({ user: null });
  },
}));
