"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Image as ImageIcon, Film, Compass, Paintbrush, Sun } from "lucide-react";
import AuthGuard from "@/components/AuthGuard";
import AppHeader from "@/components/AppHeader";
import MarketingHistoryStrip from "@/components/MarketingHistoryStrip";
import { useI18n, TKey } from "@/lib/i18n";

const SUBNAV: { href: string; icon: typeof ImageIcon; labelKey: TKey }[] = [
  { href: "/marketing/static",   icon: ImageIcon,  labelKey: "nav.staticImage" },
  { href: "/marketing/video",    icon: Film,       labelKey: "nav.video" },
  { href: "/marketing/orbit",    icon: Compass,    labelKey: "nav.orbitContent" },
  { href: "/marketing/edit",     icon: Paintbrush, labelKey: "nav.edit" },
  { href: "/marketing/lighting", icon: Sun,        labelKey: "nav.lighting" },
];

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "";
  const { t } = useI18n();

  return (
    <div className="flex-1 flex flex-col">
      <AppHeader />

      <div className="border-b border-border bg-card/50">
        <div className="max-w-7xl mx-auto px-6 py-2 overflow-x-auto">
          <nav className="flex items-center gap-1">
            {SUBNAV.map(({ href, icon: Icon, labelKey }) => {
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
                  {t(labelKey)}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-5">
        <AuthGuard>{children}</AuthGuard>
      </main>

      <MarketingHistoryStrip />
    </div>
  );
}
