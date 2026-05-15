"use client";

import SocialPanel from "@/components/SocialPanel";
import { useAuth } from "@/lib/useAuth";
import { useUsageTracking } from "@/lib/usage";
import { useI18n } from "@/lib/i18n";

export default function SocialPage() {
  const { user } = useAuth();
  const { lang } = useI18n();
  const { logUsage } = useUsageTracking(user?.email);

  return (
    <SocialPanel
      lang={lang}
      user={user ? { email: user.email, name: user.name } : null}
      logUsage={logUsage}
    />
  );
}
