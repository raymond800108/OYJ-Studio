"use client";

import Link from "next/link";
import { Film, ArrowRight } from "lucide-react";

export default function MarketingVideoStub() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-6">
      <Film className="w-10 h-10 text-muted mb-3" />
      <h2 className="text-base font-semibold">Video — Migrating</h2>
      <p className="text-xs text-muted mt-2 max-w-md">
        The video marketing generator is being moved out of the legacy single-page app.
        Use the existing flow in the meantime.
      </p>
      <Link
        href="/?mode=marketing"
        className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-foreground text-background text-xs font-medium hover:opacity-90"
      >
        Open legacy Marketing
        <ArrowRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  );
}
