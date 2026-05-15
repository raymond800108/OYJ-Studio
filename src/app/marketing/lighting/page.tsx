"use client";

import { Sun } from "lucide-react";

export default function MarketingLightingPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-6">
      <Sun className="w-10 h-10 text-muted mb-3" />
      <h2 className="text-base font-semibold">Lighting — Coming Soon</h2>
      <p className="text-xs text-muted mt-2 max-w-md">
        Re-light any product image with controllable studio lighting. TODO: define spec.
      </p>
    </div>
  );
}
