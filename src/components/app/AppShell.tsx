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
  Share2,
  Inbox,
  LayoutDashboard,
  Network,
  LogOut,
  Megaphone,
  Newspaper,
  Menu,
  Send,
  Settings,
  Route,
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
  | "tracking"
  | "departments"
  | "accounts"
  | "settings";

type NavItem = {
  key: AppView;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
};

/**
 * Arborescence ScanDoc (structure hiérarchique) :
 * Niveau 1 — Accueil (tableau de bord)
 * Niveau 2 — Rubriques thématiques
 * Niveau 3 — Pages d'action
 * Principe : classer par intention utilisateur, pas par technique.
 */
const NAV_GROUPS: Array<{ title: string; items: NavItem[] }> = [
  {
    title: "Vue d'ensemble",
    items: [
      { key: "home", label: "Tableau de bord", icon: LayoutDashboard },
    ],
  },
  {
    title: "Courrier",
    items: [
      { key: "send", label: "Nouveau courrier", icon: Upload },
      { key: "inbox", label: "Courriers reçus", icon: Inbox },
      { key: "sent", label: "Courriers envoyés", icon: Send },
      { key: "tracking", label: "Suivi", icon: Route },
    ],
  },
  {
    title: "Organisation",
    items: [
      { key: "departments", label: "Structures", icon: Building2 },
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

function RedBadge({
  count,
  active,
}: {
  count: number;
  active?: boolean;
}) {
  if (count <= 0) return null;
  const label = count > 99 ? "99+" : String(count);
  return (
    <span
      className={cn(
        "ml-auto flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full px-1 text-[11px] font-bold leading-none tabular-nums",
        active ? "bg-white text-red-600" : "bg-[#e41e3f] text-white",
      )}
      aria-label={`${count} non lus`}
    >
      {label}
    </span>
  );
}

function NavList({
  view,
  onSelect,
  isAdmin,
  pendingAccounts,
  pendingTasks,
}: {
  view: AppView;
  onSelect: (view: AppView) => void;
  isAdmin: boolean;
  pendingAccounts: number;
  pendingTasks?: number;
}) {
  return (
    <nav className="space-y-5">
      {NAV_GROUPS.map((group) => {
        const items = group.items.filter((item) => !item.adminOnly || isAdmin);
        if (items.length === 0) return null;
        return (
          <div key={group.title}>
            <p className="mb-1.5 px-3 text-[9px] font-extrabold uppercase tracking-[1.15px] text-[#9F9ABB]">
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
                      "relative flex w-full items-center gap-3 rounded-[11px] px-3 py-2.5 text-left text-[12px] font-medium transition-colors",
                      active
                        ? "bg-white/15 text-white shadow-[inset_3px_0_0_#BDB4FF]"
                        : "text-[#C7C2E0] hover:bg-white/8 hover:text-white",
                    )}
                    data-active={active ? "true" : "false"}
                    data-scandoc-nav={item.key}
                  >
                    <Icon className="size-4 shrink-0 opacity-90" />
                    <span className="flex-1 text-left">{item.label}</span>
                    
                    {item.key === "inbox" ? (
                      <RedBadge count={pendingTasks ?? 0} active={active} />
                    ) : null}
                    {item.key === "accounts" ? (
                      <RedBadge count={pendingAccounts} active={active} />
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
  onOpenDocument,
  children,
}: {
  view: AppView;
  onViewChange: (view: AppView) => void;
  onOpenDocument?: (id: import("@/convex/_generated/dataModel").Id<"documents">) => void;
  children: ReactNode;
}) {
  const me = useQuery(api.workspace.me);
  const docStats = useQuery(api.documents.stats);
  const notifUnread = useQuery(api.inAppNotifications.unreadCount);
  const pendingTasks = docStats?.awaiting ?? 0;
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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

  return (
    <div className="sc-app-shell flex min-h-dvh w-full bg-[#F5F6FB] text-foreground">
      {/* Sidebar fixe — maquette ScanDoc */}
      <aside className="sc-shell-sidebar sticky top-0 hidden h-dvh w-[244px] shrink-0 flex-col overflow-y-auto bg-[#211D4D] px-3.5 pb-4 pt-5 text-[#EEEAFE] lg:flex">
        <div className="mb-6 px-2">
          <BrandMark />
        </div>
        <div className="mb-4 mx-1 flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.06] px-2.5 py-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-white/12 text-xs font-bold">
            SD
          </span>
          <span className="min-w-0">
            <span className="block truncate text-xs font-bold text-white">
              {me?.department?.name ?? "ScanDoc"}
            </span>
            <span className="block text-[10px] text-[#B9B4D9]">
              Courrier interne
            </span>
          </span>
        </div>
        <div className="flex-1">
          <NavList
            view={view}
            onSelect={onViewChange}
            isAdmin={Boolean(me?.isAdmin || me?.isRoot)}
            pendingAccounts={me?.pendingAccounts ?? 0}
            pendingTasks={pendingTasks}
          />
        </div>
        <div className="mt-auto border-t border-white/12 pt-3">
          <div className="flex items-center gap-2 px-1.5">
            <span className="flex size-9 items-center justify-center rounded-full bg-[#E4E0FF] text-[11px] font-extrabold text-[#4436A9]">
              {initialsOf(me?.user.name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[11px] font-semibold text-white">
                {me?.user.name ?? "…"}
              </span>
              <span className="block truncate text-[10px] text-[#B9B4D9]">
                {me?.isRoot
                  ? "Super utilisateur"
                  : me?.isAdmin
                    ? "Directeur général"
                    : me?.isChef
                      ? "Chef de structure"
                      : "Membre"}
              </span>
            </span>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-[72px] items-center gap-4 border-b border-[#E8E8F1] bg-white px-4 sm:px-6 lg:px-8">
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                aria-label="Ouvrir le menu"
                className="size-9 shrink-0 rounded-[11px] border-[#E8E8F1] lg:hidden"
              >
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="flex w-[min(18rem,90vw)] flex-col border-0 bg-[#211D4D] p-4 text-[#EEEAFE]"
            >
              <SheetHeader className="p-0">
                <SheetTitle className="sr-only">Menu ScanDoc</SheetTitle>
              </SheetHeader>
              <BrandMark />
              <div className="mt-6 flex-1 overflow-y-auto">
                <NavList
                  view={view}
                  onSelect={(next) => {
                    onViewChange(next);
                    setMobileNavOpen(false);
                  }}
                  isAdmin={Boolean(me?.isAdmin || me?.isRoot)}
                  pendingAccounts={me?.pendingAccounts ?? 0}
                  pendingTasks={pendingTasks}
                />
              </div>
            </SheetContent>
          </Sheet>

          <div className="min-w-0">
            <p className="text-[11px] text-[#78788F]">
              ScanDoc / <strong className="text-[#17162B]">{current}</strong>
            </p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <NotificationsBell
              onOpenDocument={onOpenDocument}
              onOpenAccounts={() => onViewChange("accounts")}
              onOpenDepartments={() => onViewChange("departments")}
            />
            {userMenu}
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-7">
          <div className="mx-auto w-full max-w-[1520px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
