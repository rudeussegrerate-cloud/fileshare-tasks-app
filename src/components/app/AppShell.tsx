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

const NAV_ITEMS: Array<{
  key: AppView;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}> = [
  { key: "home", label: "Tableau de bord", icon: LayoutDashboard },
  { key: "send", label: "Nouveau document", icon: Upload },
  { key: "inbox", label: "Documents reçus", icon: Inbox },
  { key: "sent", label: "Documents envoyés", icon: Send },
  { key: "departments", label: "Départements", icon: Building2 },
  { key: "accounts", label: "Comptes", icon: UserCheck, adminOnly: true },
  { key: "settings", label: "Paramètres", icon: Settings },
];

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
    <nav className="space-y-1">
      {NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin).map((item) => {
        const Icon = item.icon;
        const active = view === item.key;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onSelect(item.key)}
            className={cn(
              "flex w-full items-center gap-2.5 px-3 py-2.5 text-sm font-medium border-l-[3px]",
              active
                ? "border-l-brand-accent bg-brand text-primary-foreground"
                : "border-l-transparent text-foreground hover:bg-secondary",
            )}
          >
            <Icon className="size-5" />
            <span className="flex-1 text-left">{item.label}</span>
            {item.key === "accounts" && pendingAccounts > 0 ? (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[10px] font-semibold",
                  active
                    ? "bg-white/20 text-white"
                    : "bg-amber-100 text-amber-700",
                )}
              >
                {pendingAccounts}
              </span>
            ) : null}
          </button>
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

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const current = NAV_ITEMS.find((item) => item.key === view)?.label ?? "ScanDoc";

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
            <span className="block text-xs font-semibold">
              {me?.user.name ?? "…"}
            </span>
            <span className="block text-[10px] text-muted-foreground">
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
              ? "Super utilisateur (root)"
              : me?.isAdmin
                ? "DG · admin principal"
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
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex w-full max-w-[1400px]">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-card px-4 py-5 lg:flex">
          <BrandMark />
          <div className="mt-8 flex-1">
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Espace de travail
            </p>
            <NavList
              view={view}
              onSelect={onViewChange}
              isAdmin={Boolean(me?.isAdmin)}
              pendingAccounts={me?.pendingAccounts ?? 0}
            />
            <div className="mt-6 border-t border-border pt-3">
              <OnlinePeople />
            </div>
          </div>
          <div className="rounded-sm border border-border bg-brand-soft/50 p-3">
            <p className="text-xs font-medium text-foreground">
              {me?.isRoot
                ? "Vous désignez les comptes de DG et supervisez toute l'organisation."
                : me?.isAdmin
                  ? "Vous administrez l'ensemble des départements."
                  : me?.isChef
                    ? "Vous gérez les membres de votre département."
                    : "Envoyez et traitez les documents qui vous sont adressés."}
            </p>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border bg-background px-4 py-3 lg:px-8">
            <div className="flex items-center gap-3">
              <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="icon" className="lg:hidden">
                    <Menu className="size-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-72 p-5">
                  <SheetHeader className="p-0">
                    <SheetTitle className="sr-only">Navigation ScanDoc</SheetTitle>
                  </SheetHeader>
                  <BrandMark />
                  <div className="mt-8">
                    <NavList
                      view={view}
                      onSelect={(next) => {
                        onViewChange(next);
                        setMobileNavOpen(false);
                      }}
                      isAdmin={Boolean(me?.isAdmin)}
                      pendingAccounts={me?.pendingAccounts ?? 0}
                    />
                    <div className="mt-6 border-t border-border pt-3">
                      <OnlinePeople />
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
              <div className="lg:hidden">
                <BrandMark compact />
              </div>
              <h1 className="hidden text-sm font-semibold text-foreground lg:block">
                {current}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <NotificationsBell />
              {userMenu}
            </div>
          </header>

          <main className="flex-1 px-4 py-6 lg:px-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
