"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

interface NavItem {
  href: string;
  label: string;
}

function useNavItems(): NavItem[] {
  const { user } = useAuth();
  const items: NavItem[] = [
    { href: "/dashboard", label: "Overview" },
    { href: "/organizations", label: "Organizations" },
    { href: "/account", label: "Account" },
  ];
  if (user?.platformRole === "PLATFORM_ADMIN") {
    items.push({ href: "/admin", label: "Admin" });
  }
  return items;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const navItems = useNavItems();

  async function handleLogout() {
    await logout();
    router.push("/login");
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-border bg-surface lg:flex">
        <div className="flex h-16 items-center border-b border-border px-6">
          <span className="text-lg font-semibold text-navy">MARKET HUB</span>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Primary">
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-control px-3 py-2.5 text-sm font-medium ${
                  active ? "bg-green/10 text-green-dark" : "text-text-secondary hover:bg-background hover:text-text-primary"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border p-4">
          <p className="truncate text-sm font-medium text-text-primary">{user?.name}</p>
          <p className="truncate text-xs text-text-secondary">{user?.email}</p>
          <button type="button" onClick={handleLogout} className="btn-tertiary mt-2 w-full justify-start px-0">
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border bg-surface px-4 lg:hidden">
        <span className="text-base font-semibold text-navy">MARKET HUB</span>
        <button type="button" onClick={handleLogout} className="btn-tertiary px-2 py-1 text-sm">
          Sign out
        </button>
      </header>

      <main className="pb-20 lg:ml-64 lg:pb-0">
        <div className="mx-auto w-full max-w-content px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </main>

      {/* Mobile bottom navigation */}
      <nav
        className="fixed inset-x-0 bottom-0 z-10 flex border-t border-border bg-surface lg:hidden"
        aria-label="Primary"
      >
        {navItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5 text-xs font-medium ${
                active ? "text-green-dark" : "text-text-secondary"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
