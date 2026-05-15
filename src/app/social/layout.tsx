import AppHeader from "@/components/AppHeader";
import AuthGuard from "@/components/AuthGuard";

export default function SocialLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 flex flex-col">
      <AppHeader />
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-5">
        <AuthGuard>{children}</AuthGuard>
      </main>
    </div>
  );
}
