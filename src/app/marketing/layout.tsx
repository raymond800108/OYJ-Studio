"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Image as ImageIcon, Film, Compass, Paintbrush, Sun } from "lucide-react";
import AuthGuard from "@/components/AuthGuard";
import AppHeader from "@/components/AppHeader";

const SUBNAV = [
  { href: "/marketing/static",   icon: ImageIcon,  label: "Static Image" },
  { href: "/marketing/video",    icon: Film,       label: "Video" },
  { href: "/marketing/orbit",    icon: Compass,    label: "Orbit Content" },
  { href: "/marketing/edit",     icon: Paintbrush, label: "Edit" },
  { href: "/marketing/lighting", icon: Sun,        label: "Lighting" },
];

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "";

  return (
    <div className="flex-1 flex flex-col">
      <AppHeader />

      <div className="border-b border-border bg-card/50">
        <div className="max-w-7xl mx-auto px-6 py-2 overflow-x-auto">
          <nav className="flex items-center gap-1">
            {SUBNAV.map(({ href, icon: Icon, label }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
                    active
                      ? "bg-foreground text-background"
                      : "text-muted hover:text-foreground hover:bg-background"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-5">
        <AuthGuard>{children}</AuthGuard>
      </main>
    </div>
  );
}
