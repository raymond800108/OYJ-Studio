"use client";

import React, { useState, useRef, useEffect } from "react";
import { LogOut, User, CreditCard, ChevronDown } from "lucide-react";
import { useAuth } from "@/lib/useAuth";

export default function UserMenu() {
  const { user, loading, ready, openLogin, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Still loading initial auth check
  if (!ready || loading) {
    return (
      <div className="w-8 h-8 rounded-full bg-background border border-border animate-pulse" />
    );
  }

  // Not signed in
  if (!user) {
    return (
      <button
        onClick={openLogin}
        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium bg-foreground text-background hover:opacity-90 transition-all"
      >
        <User className="w-3.5 h-3.5" />
        Sign In
      </button>
    );
  }

  // Signed in — show avatar + dropdown
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        className="flex items-center gap-2 px-2 py-1 rounded-full border border-border bg-background hover:bg-card transition-all"
      >
        {user.avatar ? (
          <img
            src={user.avatar}
            alt={user.name}
            className="w-6 h-6 rounded-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-6 h-6 rounded-full bg-foreground/10 flex items-center justify-center">
            <User className="w-3.5 h-3.5 text-foreground" />
          </div>
        )}
        <span className="text-xs font-medium text-foreground max-w-[100px] truncate hidden sm:inline">
          {user.name}
        </span>
        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-semibold">
          <CreditCard className="w-3 h-3" />
          {user.credits}
        </div>
        <ChevronDown className="w-3 h-3 text-muted" />
      </button>

      {/* Dropdown */}
      {menuOpen && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-card border border-border rounded-xl shadow-lg py-1 z-50">
          <div className="px-3 py-2 border-b border-border">
            <p className="text-xs font-medium text-foreground truncate">
              {user.name}
            </p>
            {user.email && (
              <p className="text-[10px] text-muted truncate">{user.email}</p>
            )}
          </div>

          <div className="px-3 py-2 border-b border-border">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted uppercase tracking-wider">
                Plan
              </span>
              <span className="text-[10px] font-semibold text-foreground capitalize">
                {user.plan}
              </span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-[10px] text-muted uppercase tracking-wider">
                Credits
              </span>
              <span className="text-[10px] font-semibold text-amber-700">
                {user.credits} remaining
              </span>
            </div>
          </div>

          <button
            onClick={async () => {
              setMenuOpen(false);
              await logout();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
