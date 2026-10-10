import { getAuthUserId } from "@convex-dev/auth/server";
import { query } from "./_generated/server";

/**
 * Synthèse intelligente : tâches non finies, messages, annonces, validations.
 */
export const digest = query({
  args: {},
  handler: async (ctx) => {
    try {
      const userId = await getAuthUserId(ctx);
      if (!userId) return { items: [] as const, generatedAt: Date.now() };
      const me = await ctx.db.get(userId);
      if (!me) return { items: [] as const, generatedAt: Date.now() };

      const items: Array<{
        id: string;
        level: "info" | "warn" | "urgent";
        title: string;
        body: string;
        view?: string;
      }> = [];

      const inbox = await ctx.db
        .query("documents")
        .withIndex("by_recipient", (q) => q.eq("recipientId", userId))
        .collect();
      const open = inbox.filter(
        (d) =>
          !d.archivedAt &&
          (d.status === "envoye" ||
            d.status === "consulte" ||
            d.status === "en_cours"),
      );
      const urgentDocs = open.filter((d) => {
        const age = Date.now() - (d.createdAt ?? d._creationTime);
        return age > 48 * 3600 * 1000;
      });
      if (open.length > 0) {
        items.push({
          id: "docs-open",
          level: urgentDocs.length > 0 ? "urgent" : "warn",
          title: `${open.length} document${open.length > 1 ? "s" : ""} à traiter`,
          body:
            urgentDocs.length > 0
              ? `${urgentDocs.length} en attente depuis plus de 48 h`
              : "Des pièces reçues attendent votre action",
          view: "inbox",
        });
      }

      try {
        const asA = await ctx.db
          .query("conversations")
          .withIndex("by_a", (q) => q.eq("participantA", userId))
          .collect();
        const asB = await ctx.db
          .query("conversations")
          .withIndex("by_b", (q) => q.eq("participantB", userId))
          .collect();
        let unread = 0;
        for (const c of [...asA, ...asB]) {
          const msgs = await ctx.db
            .query("chatMessages")
            .withIndex("by_conversation", (q) =>
              q.eq("conversationId", c._id),
            )
            .collect();
          unread += msgs.filter(
            (m) => m.senderId !== userId && !m.readAt,
          ).length;
        }
        if (unread > 0) {
          items.push({
            id: "msg-unread",
            level: "info",
            title: `${unread} message${unread > 1 ? "s" : ""} non lu${unread > 1 ? "s" : ""}`,
            body: "Des collègues vous ont écrit",
            view: "messages",
          });
        }
      } catch {
        /* optional */
      }

      try {
        const since = Date.now() - 24 * 3600 * 1000;
        const anns = await ctx.db
          .query("announcements")
          .withIndex("by_created")
          .order("desc")
          .take(20);
        const recent = anns.filter((a) => {
          if ((a.createdAt ?? 0) < since) return false;
          if (String(a.authorId) === String(userId)) return false;
          const vis = a.visibility ?? "public";
          if (vis === "public") return true;
          if (vis === "private") {
            return Boolean(
              a.departmentId &&
                me.departmentId &&
                String(a.departmentId) === String(me.departmentId),
            );
          }
          if (vis === "custom") {
            return (a.viewerIds ?? []).some(
              (id) => String(id) === String(userId),
            );
          }
          return false;
        });
        if (recent.length > 0) {
          items.push({
            id: "ann-new",
            level: "info",
            title: `${recent.length} nouvelle${recent.length > 1 ? "s" : ""} annonce${recent.length > 1 ? "s" : ""}`,
            body: recent[0]!.title,
            view: "actualites",
          });
        }
      } catch {
        /* optional */
      }

      if (me.role === "admin" || me.role === "root") {
        const users = await ctx.db.query("users").take(300);
        const pending = users.filter((u) => u.accountStatus === "en_attente");
        if (pending.length > 0) {
          items.push({
            id: "accounts-pending",
            level: "warn",
            title: `${pending.length} compte${pending.length > 1 ? "s" : ""} à valider`,
            body: "Nouvelles inscriptions en attente",
            view: "accounts",
          });
        }
      }

      if (me.departmentRole === "chef" && me.departmentId) {
        try {
          const reqs = await ctx.db
            .query("departmentJoinRequests")
            .collect();
          const pending = reqs.filter(
            (r: { status?: string; departmentId?: string }) =>
              r.status === "pending" &&
              String(r.departmentId) === String(me.departmentId),
          );
          if (pending.length > 0) {
            items.push({
              id: "join-pending",
              level: "warn",
              title: `${pending.length} demande${pending.length > 1 ? "s" : ""} d'adhésion`,
              body: "À valider dans Départements",
              view: "departments",
            });
          }
        } catch {
          /* optional */
        }
      }

      return { items, generatedAt: Date.now() };
    } catch (e) {
      console.error("[smart.digest]", e);
      return { items: [], generatedAt: Date.now() };
    }
  },
});
