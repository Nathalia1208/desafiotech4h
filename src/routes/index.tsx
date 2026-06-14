import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    // Always navigate to dashboard as the initial route. The dashboard
    // will show the login button/modal if the user is not authenticated.
    if (loading) return;
    navigate({ to: "/dashboard", replace: true });
  }, [user, loading, navigate]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}
