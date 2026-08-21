import { AppNavigation } from "@/modules/plataforma/layout/navigation";
import { ThemeToggle } from "@/components/brand/theme-toggle";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen lg:flex">
      <AppNavigation />
      <div className="min-w-0 flex-1">
        <header className="hidden h-14 items-center justify-end border-b px-6 lg:flex"><ThemeToggle /></header>
        <main id="main-content" className="mx-auto w-full max-w-7xl p-4 md:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
