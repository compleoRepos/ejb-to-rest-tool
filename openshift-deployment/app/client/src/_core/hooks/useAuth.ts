import { trpc } from "@/lib/trpc";
import { useCallback, useMemo } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(_options?: UseAuthOptions) {
  const utils = trpc.useUtils();

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
    },
  });

  const logout = useCallback(async () => {
    // Demo mode: logout is a no-op
    console.log("[Demo] Logout called — no-op in demo mode");
  }, []);

  const state = useMemo(() => {
    // Demo mode: always return the demo user from backend context
    const user = meQuery.data ?? {
      id: 1,
      openId: "demo-user",
      name: "Compleo",
      email: "demo@compleo.dev",
      role: "admin",
    };

    localStorage.setItem("manus-runtime-user-info", JSON.stringify(user));

    return {
      user,
      loading: meQuery.isLoading,
      error: null,
      isAuthenticated: true,
    };
  }, [meQuery.data, meQuery.isLoading]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
  };
}
