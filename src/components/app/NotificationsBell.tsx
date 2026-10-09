import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import { Bell, CheckCheck, FileText, Users } from "lucide-react";
import { formatDateTime } from "./shared";

export function NotificationsBell({
  onOpenDocument,
  onOpenAccounts,
  onOpenDepartments,
}: {
  onOpenDocument?: (id: Id<"documents">) => void;
  onOpenAccounts?: () => void;
  onOpenDepartments?: () => void;
}) {
  const items = useQuery(api.inAppNotifications.list, { limit: 25 });
  const unread = useQuery(api.inAppNotifications.unreadCount);
  const markRead = useMutation(api.inAppNotifications.markRead);
  const markAllRead = useMutation(api.inAppNotifications.markAllRead);

  const count = unread ?? 0;

  const handleClick = async (n: {
    _id: Id<"notifications">;
    type: string;
    documentId?: Id<"documents">;
    readAt?: number;
  }) => {
    if (!n.readAt) {
      try {
        await markRead({ notificationId: n._id });
      } catch {
        /* ignore */
      }
    }
    if (n.documentId && onOpenDocument) {
      onOpenDocument(n.documentId);
      return;
    }
    if (
      (n.type === "department.join_request" ||
        n.type.includes("department")) &&
      onOpenDepartments
    ) {
      onOpenDepartments();
      return;
    }
    if (n.type.includes("account") && onOpenAccounts) {
      onOpenAccounts();
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="relative"
          aria-label="Notifications"
        >
          <Bell className="size-4" />
          {count > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {count > 9 ? "9+" : count}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2">
          <DropdownMenuLabel className="p-0 text-sm font-semibold">
            Notifications
          </DropdownMenuLabel>
          {count > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={(e) => {
                e.preventDefault();
                void markAllRead();
              }}
            >
              <CheckCheck className="size-3.5" />
              Tout lu
            </Button>
          ) : null}
        </div>
        <DropdownMenuSeparator className="m-0" />
        <div className="max-h-80 overflow-y-auto">
          {!items ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              Chargement…
            </p>
          ) : items.length === 0 ? (
            <p className="px-3 py-8 text-center text-xs text-muted-foreground">
              Aucune notification pour le moment.
            </p>
          ) : (
            items.map((n) => (
              <DropdownMenuItem
                key={n._id}
                className={cn(
                  "flex cursor-pointer items-start gap-2 rounded-none px-3 py-2.5",
                  !n.readAt && "bg-brand-soft/40",
                )}
                onSelect={(e) => {
                  e.preventDefault();
                  void handleClick(n);
                }}
              >
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-sm bg-brand-soft text-brand">
                  {n.type.includes("department") ? (
                    <Users className="size-3.5" />
                  ) : (
                    <FileText className="size-3.5" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium leading-tight">
                    {n.title}
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                    {n.body}
                  </span>
                  <span className="mt-1 block text-[10px] text-muted-foreground/80">
                    {formatDateTime(n.createdAt)}
                    {n.documentId ? " · Appuyer pour ouvrir" : ""}
                  </span>
                </span>
                {!n.readAt ? (
                  <span className="mt-1 size-2 shrink-0 rounded-full bg-brand" />
                ) : null}
              </DropdownMenuItem>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
