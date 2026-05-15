"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Megaphone, Share2, Box, BarChart3, LucideIcon } from "lucide-react";
import { useI18n, TKey } from "@/lib/i18n";
import { isDevAuthBypass } from "@/lib/useAuth";
import UserMenu from "./UserMenu";

interface NavItem {
  href: string;
  matchPrefix: string;
  icon: LucideIcon;
  labelKey: TKey;
}

const NAV: NavItem[] = [
  { href: "/marketing/static", matchPrefix: "/marketing", icon: Megaphone, labelKey: "nav.marketing" },
  { href: "/social", matchPrefix: "/social", icon: Share2, labelKey: "nav.social" },
  { href: "/3d", matchPrefix: "/3d", icon: Box, labelKey: "nav.3d" },
  { href: "/usage", matchPrefix: "/usage", icon: BarChart3, labelKey: "nav.usage" },
];

export default function AppHeader() {
  const pathname = usePathname() || "/";
  const { lang, setLang, t } = useI18n();

  return (
    <header className="border-b border-border px-6 py-4 bg-card">
      {isDevAuthBypass && (
        <div className="max-w-7xl mx-auto mb-2 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-100 border border-amber-300 text-[11px] text-amber-900">
          <span className="font-bold">⚠ DEV AUTH BYPASS ACTIVE</span>
          <span className="opacity-80">— client gate disabled for review. Server routes still require real session.</span>
        </div>
      )}
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 flex-wrap">
        <Link href="/" className="flex items-center gap-3 shrink-0">
          <img
            src="/logo.svg"
            alt="Olivia Yao Jewellery"
            className="h-10"
            style={{ filter: "brightness(0)" }}
          />
        </Link>

        <div className="flex items-center gap-3 flex-wrap">
          <nav className="flex items-center bg-background border border-border rounded-full p-0.5 gap-0.5">
            {NAV.map(({ href, matchPrefix, icon: Icon, labelKey }) => {
              const active = pathname === matchPrefix || pathname.startsWith(matchPrefix + "/");
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all ${
                    active
                      ? "bg-foreground text-background shadow-sm"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {t(labelKey)}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center bg-background border border-border rounded-full p-0.5 gap-0.5">
            <button
              onClick={() => setLang("en")}
              className={`px-2.5 py-1.5 rounded-full text-xs font-medium transition-all ${
                lang === "en"
                  ? "bg-foreground text-background shadow-sm"
                  : "text-muted hover:text-foreground"
              }`}
            >
              EN
            </button>
            <button
              onClick={() => setLang("zh")}
              className={`px-2.5 py-1.5 rounded-full text-xs font-medium transition-all ${
                lang === "zh"
                  ? "bg-foreground text-background shadow-sm"
                  : "text-muted hover:text-foreground"
              }`}
            >
              中
            </button>
          </div>

          <UserMenu />
        </div>
      </div>
    </header>
  );
}
