import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { SiteHeader } from "@/components/site-header";

export const Route = createFileRoute("/_authenticated")({
  component: AuthedLayout,
});

function AuthedLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  // Only block rendering while we are determining auth state. Once loading
  // is finished we render the header and the child routes. Individual child
  // routes (like forum room) are responsible for gating actions that
  // require an authenticated user (they already check `user` themselves).
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SiteHeader />
      <Outlet />
    </div>
  );
}
