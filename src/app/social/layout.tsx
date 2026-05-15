"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calendar, BarChart3 } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import AuthGuard from "@/components/AuthGuard";
import { useI18n, TKey } from "@/lib/i18n";

const SUBNAV: { href: string; icon: typeof Calendar; labelKey: TKey }[] = [
  { href: "/social",     icon: Calendar,   labelKey: "social.nav.schedule" },
  { href: "/social/ads", icon: BarChart3,  labelKey: "social.nav.ads" },
];

export default function SocialLayout({ children }: { children: React.ReactNode }) {
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
    </div>
  );
}
