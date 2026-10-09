import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { useQuery } from "convex/react";
import {
  Building2,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  Send,
  Settings,
  Upload,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { BrandLogo } from "@/components/Logo";
import { NotificationsBell } from "./NotificationsBell";
import { OnlinePeople } from "./OnlinePeople";
import { PresenceDot } from "./PresenceDot";
import { initialsOf } from "./shared";

export type AppView =
  | "home"
  | "send"
  | "inbox"
  | "sent"
  | "departments"
  | "accounts"
  | "settings";

type NavItem = {
  key: AppView;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
};

/** Navigation groupée pour éviter la confusion */
const NAV_GROUPS: Array<{ title: string; items: NavItem[] }> = [
  {
    title: "Documents",
    items: [
      { key: "home", label: "Accueil", icon: LayoutDashboard },
      { key: "send", label: "Envoyer", icon: Upload },
      { key: "inbox", label: "Reçus", icon: Inbox },
      { key: "sent", label: "Envoyés", icon: Send },
    ],
  },
  {
    title: "Organisation",
    items: [
      { key: "departments", label: "Départements", icon: Building2 },
      { key: "accounts", label: "Comptes", icon: UserCheck, adminOnly: true },
    ],
  },
  {
    title: "Compte",
    items: [{ key: "settings", label: "Paramètres", icon: Settings }],
  },
];

const ALL_NAV = NAV_GROUPS.flatMap((g) => g.items);

function BrandMark({ compact = false }: { compact?: boolean }) {
  return <BrandLogo compact={compact} />;
}

function NavList({
  view,
  onSelect,
  isAdmin,
  pendingAccounts,
}: {
  view: AppView;
  onSelect: (view: AppView) => void;
  isAdmin: boolean;
  pendingAccounts: number;
}) {
  return (
    <nav className="space-y-5">
      {NAV_GROUPS.map((group) => {
        const items = group.items.filter((item) => !item.adminOnly || isAdmin);
        if (items.length === 0) return null;
        return (
          <div key={group.title}>
            <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {group.title}
            </p>
            <div className="space-y-0.5">
              {items.map((item) => {
                const Icon = item.icon;
                const active = view === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => onSelect(item.key)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-brand text-primary-foreground"
                        : "text-foreground hover:bg-secondary",
                    )}
                  >
                    <Icon className="size-4 shrink-0 opacity-90" />
                    <span className="flex-1 text-left">{item.label}</span>
                    {item.key === "accounts" && pendingAccounts > 0 ? (
                      <span
                        className={cn(
                          "rounded-full px-1.5 text-[10px] font-semibold",
                          active
                            ? "bg-white/20 text-white"
                            : "bg-amber-100 text-amber-800",
                        )}
                      >
                        {pendingAccounts}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

export function AppShell({
  view,
  onViewChange,
  children,
}: {
  view: AppView;
  onViewChange: (view: AppView) => void;
  children: ReactNode;
}) {
  const me = useQuery(api.workspace.me);
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(true);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const current =
    ALL_NAV.find((item) => item.key === view)?.label ?? "ScanDoc";

  const userMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 gap-2 px-2">
          <span className="relative flex size-7 items-center justify-center rounded-full bg-brand text-[11px] font-semibold text-primary-foreground">
            {initialsOf(me?.user.name)}
            <PresenceDot
              online
              className="absolute -bottom-0.5 -right-0.5 size-2.5 border-2 border-background"
            />
          </span>
          <span className="hidden text-left leading-tight sm:block">
            <span className="block max-w-[140px] truncate text-xs font-semibold">
              {me?.user.name ?? "…"}
            </span>
            <span className="block max-w-[140px] truncate text-[10px] text-muted-foreground">
              {me?.department?.name ?? me?.user.email ?? ""}
            </span>
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <span className="block text-sm font-medium">
            {me?.user.name ?? "…"}
          </span>
          <span className="block text-xs font-normal text-muted-foreground">
            {me?.isRoot
              ? "Super utilisateur"
              : me?.isAdmin
                ? "Directeur Général"
                : me?.isChef
                  ? "Chef de département"
                  : "Membre"}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer"
          onClick={() => onViewChange("settings")}
        >
          <Settings className="mr-2 size-4" />
          Paramètres
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer text-destructive focus:text-destructive"
          onClick={() => void handleSignOut()}
        >
          <LogOut className="mr-2 size-4" />
          Se déconnecter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const sidebarInner = (
    <>
      <BrandMark />
      <div className="mt-6 flex-1 overflow-y-auto">
        <NavList
          view={view}
          onSelect={onViewChange}
          isAdmin={Boolean(me?.isAdmin || me?.isRoot)}
          pendingAccounts={me?.pendingAccounts ?? 0}
        />
      </div>
      <div className="mt-3 border-t border-border pt-3">
        <button
          type="button"
          className="mb-1 flex w-full items-center justify-between px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
          onClick={() => setPeopleOpen((v) => !v)}
        >
          Collègues
          <span className="text-[10px] normal-case">
            {peopleOpen ? "Masquer" : "Afficher"}
          </span>
        </button>
        {peopleOpen ? <OnlinePeople /> : null}
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto flex w-full max-w-[1280px]">
        {/* Sidebar desktop */}
        <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-border bg-card px-3 py-4 lg:flex">
          {sidebarInner}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border bg-card/95 px-4 py-2.5 backdrop-blur lg:px-6">
            <div className="flex items-center gap-3">
              <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="icon" className="lg:hidden">
                    <Menu className="size-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="flex w-72 flex-col p-4">
                  <SheetHeader className="p-0">
                    <SheetTitle className="sr-only">Menu ScanDoc</SheetTitle>
                  </SheetHeader>
                  <div className="flex flex-1 flex-col overflow-y-auto">
                    <BrandMark />
                    <div className="mt-6 flex-1">
                      <NavList
                        view={view}
                        onSelect={(next) => {
                          onViewChange(next);
                          setMobileNavOpen(false);
                        }}
                        isAdmin={Boolean(me?.isAdmin || me?.isRoot)}
                        pendingAccounts={me?.pendingAccounts ?? 0}
                      />
                    </div>
                    <div className="mt-4 border-t border-border pt-3">
                      <OnlinePeople />
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
              <div className="lg:hidden">
                <BrandMark compact />
              </div>
              <div className="hidden lg:block">
                <h1 className="text-sm font-semibold text-foreground">
                  {current}
                </h1>
                {me?.department?.name ? (
                  <p className="text-[11px] text-muted-foreground">
                    {me.department.name}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <NotificationsBell />
              {userMenu}
            </div>
          </header>

          <main className="flex-1 px-4 py-5 lg:px-6 lg:py-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
