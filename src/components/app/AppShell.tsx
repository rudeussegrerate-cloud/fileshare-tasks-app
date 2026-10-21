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
  Route,
  FolderOpen,
  Settings,
  Upload,
  Forward,
  PenLine,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { BrandLogo } from "@/components/Logo";
import loginBackdrop from "@/assets/login-backdrop.jpg";
import { NotificationsBell } from "./NotificationsBell";
import { OnlinePeople } from "./OnlinePeople";
import { PresenceDot } from "./PresenceDot";
import { initialsOf } from "./shared";

export type AppView =
  | "home"
  | "send"
  | "transmit"
  | "inbox"
  | "sent"
  | "fichiers"
  | "workspace"
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
      { key: "transmit", label: "Transmission de courrier", icon: Forward },
      { key: "inbox", label: "Courriers reçus", icon: Inbox },
      { key: "sent", label: "Courriers envoyés", icon: Send },
      { key: "fichiers", label: "Recherche", icon: FolderOpen },
    ],
  },
  {
    title: "Espace de travail",
    items: [
      { key: "workspace", label: "Éditeur de courrier", icon: PenLine },
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
            <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/90">
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
                    className={cn("sc-nav-item py-2.5 text-[14px]")}
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
    <div className="sc-app-shell relative min-h-screen overflow-hidden bg-[#1b1440]">
      <img
        src={loginBackdrop}
        alt=""
        className="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover opacity-40"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 z-0 bg-[#f3f0fa]/88"
        aria-hidden
      />
      <div className="relative z-10 mx-auto flex w-full max-w-[1280px]">
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sc-app-header sticky top-0 z-20 flex items-center justify-between gap-3 px-4 py-3.5 lg:px-8">
            <div className="flex items-center gap-3">
              <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Ouvrir le menu"
                    className="size-10 shrink-0 rounded-xl border-2 border-[#6b3d3d]/70 bg-[#f5d5c8]/90 text-[#6b3d3d] shadow-sm hover:bg-[#f5d5c8]"
                  >
                    <Menu className="size-5" strokeWidth={2.5} />
                  </Button>
                </SheetTrigger>
                <SheetContent
                  side="left"
                  className="sc-shell-sidebar flex w-[min(18rem,90vw)] flex-col border-sidebar-border p-4"
                >
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
                        pendingTasks={pendingTasks}
                      />
                    </div>
                    <div className="mt-4 border-t border-border pt-3">
                      <OnlinePeople />
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
              <BrandMark compact />
              <div className="min-w-0">
                <h1 className="truncate text-base font-semibold tracking-tight text-foreground">
                  {current}
                </h1>
                {me?.department?.name ? (
                  <p className="truncate text-xs text-muted-foreground">
                    {me.department.name}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <NotificationsBell
                onOpenDocument={onOpenDocument}
                onOpenAccounts={() => onViewChange("accounts")}
                onOpenDepartments={() => onViewChange("departments")}
              />
              {userMenu}
            </div>
          </header>

          <main className="sc-shell-main relative z-10 flex-1 px-4 py-5 lg:px-8 lg:py-7">
            <div className="sc-fade-in mx-auto w-full max-w-6xl">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
