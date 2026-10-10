/**
 * Utilitaires de sécurité partagés (validation, rate-limit).
 */
import type { MutationCtx } from "../_generated/server";

export function assertStrongPassword(password: string) {
  if (password.length < 8) {
    throw new Error("Le mot de passe doit contenir au moins 8 caractères.");
  }
  if (password.length > 128) {
    throw new Error("Mot de passe trop long.");
  }
  if (!/[a-z]/.test(password)) {
    throw new Error("Le mot de passe doit contenir au moins une minuscule.");
  }
  if (!/[A-Z]/.test(password)) {
    throw new Error("Le mot de passe doit contenir au moins une majuscule.");
  }
  if (!/[0-9]/.test(password)) {
    throw new Error("Le mot de passe doit contenir au moins un chiffre.");
  }
}

export function sanitizeText(input: string, max: number): string {
  return input
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .trim()
    .slice(0, max);
}

export function sanitizeEmail(email: string): string {
  return email.trim().toLowerCase().slice(0, 254);
}

/** Rate-limit en base : max N actions par fenêtre glissante. */
export async function assertRateLimit(
  ctx: MutationCtx,
  args: {
    userId: string;
    action: string;
    maxPerWindow: number;
    windowMs: number;
  },
) {
  const key = `${args.userId}:${args.action}`;
  const now = Date.now();
  const existing = await ctx.db
    .query("rateLimits")
    .withIndex("by_key", (q: any) => q.eq("key", key))
    .first();

  if (!existing || now - existing.windowStart > args.windowMs) {
    if (existing) {
      await ctx.db.patch(existing._id, { count: 1, windowStart: now });
    } else {
      await ctx.db.insert("rateLimits", {
        key,
        count: 1,
        windowStart: now,
      });
    }
    return;
  }

  if (existing.count >= args.maxPerWindow) {
    throw new Error(
      "Trop de tentatives. Attendez quelques minutes avant de réessayer.",
    );
  }
  await ctx.db.patch(existing._id, { count: existing.count + 1 });
}

export async function writeAudit(
  ctx: MutationCtx,
  args: {
    action: string;
    actorId: any;
    actorName: string;
    details?: string;
    documentId?: any;
    metadata?: any;
  },
) {
  await ctx.db.insert("auditLogs", {
    action: args.action,
    actorId: args.actorId,
    actorName: args.actorName,
    details: args.details,
    documentId: args.documentId,
    metadata: args.metadata,
    createdAt: Date.now(),
  });
}
