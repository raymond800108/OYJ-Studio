"use client";

import { Loader2, Lock } from "lucide-react";
import { useAuth } from "@/lib/useAuth";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, ready, openLogin } = useAuth();

  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-5 h-5 animate-spin text-muted" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-6 text-center">
        <div className="w-12 h-12 rounded-full bg-card border border-border flex items-center justify-center">
          <Lock className="w-5 h-5 text-muted" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Sign in to continue</p>
          <p className="text-xs text-muted mt-1">This page requires an account.</p>
        </div>
        <button
          onClick={openLogin}
          className="px-5 py-2 rounded-full bg-foreground text-background text-xs font-medium hover:opacity-90"
        >
          Sign In
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
