import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
//
// - `root`  : super utilisateur, au-dessus du DG. Il gère les comptes de DG.
// - `admin` : le DG général (admin principal) qui crée les départements.
export const ROLES = {
  ROOT: "root",
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ROOT),
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

// Role inside a department. The chef runs their own department; members belong
// to it. The global admin (DG) can see and manage every department.
export const departmentRoleValidator = v.union(
  v.literal("chef"),
  v.literal("membre"),
);
export type DepartmentRole = Infer<typeof departmentRoleValidator>;

// Lifecycle of a shared document, seen by both the sender and the receiver.
export const documentStatusValidator = v.union(
  v.literal("envoye"),
  v.literal("consulte"),
  v.literal("en_cours"),
  v.literal("traite"),
);
export type DocumentStatus = Infer<typeof documentStatusValidator>;

// A new account is created as pending and only becomes usable once the DG
// (main admin) has approved it. A rejected account stays rejected until the DG
// changes their mind.
export const accountStatusValidator = v.union(
  v.literal("en_attente"),
  v.literal("valide"),
  v.literal("rejete"),
);
export type AccountStatus = Infer<typeof accountStatusValidator>;

export const summaryStatusValidator = v.union(
  v.literal("en_attente"),
  v.literal("pret"),
  v.literal("indisponible"),
);

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove

      // profile filled in when the account is created. A person can only be
      // added to a department once these are complete, so the DG and chefs
      // always pick from real, identified accounts.
      fonction: v.optional(v.string()),
      phone: v.optional(v.string()),
      profileCompletedAt: v.optional(v.number()),

      // account approval by the DG (auto-approved for the DG himself).
      accountStatus: v.optional(accountStatusValidator),
      reviewedBy: v.optional(v.id("users")),
      reviewedAt: v.optional(v.number()),

      // department placement. set by the DG (admin) or the department chef.
      departmentId: v.optional(v.id("departments")),
      departmentRole: v.optional(departmentRoleValidator),
      createdAt: v.optional(v.number()),
    })
      .index("email", ["email"]) // index for the email. do not remove or modify
      .index("by_department", ["departmentId"]),

    // Departments are created by the DG (admin), who also appoints their chef.
    departments: defineTable({
      name: v.string(),
      description: v.optional(v.string()),
      createdBy: v.id("users"),
      createdAt: v.number(),
    }),

    // A document (file) sent from one person to another, with the task the
    // receiver must perform and the automatic summary of its content.
    documents: defineTable({
      fileName: v.string(),
      storageId: v.id("_storage"),
      contentType: v.optional(v.string()),
      size: v.optional(v.number()),
      // Objet de l'envoi (pourquoi ce document est transmis)
      objet: v.string(),
      // Tâches prédéfinies sélectionnées (cases à cocher multiples)
      tasks: v.array(v.string()),
      // Champ legacy conservé pour compatibilité (jointure des tâches)
      task: v.optional(v.string()),
      // De la part de qui
      onBehalfOfType: v.union(v.literal("internal"), v.literal("external")),
      onBehalfOfUserId: v.optional(v.id("users")),
      onBehalfOfName: v.optional(v.string()),
      onBehalfOfFunction: v.optional(v.string()),
      onBehalfOfDepartment: v.optional(v.string()),
      // text pulled from the file on the client, used to build the summary
      extractedText: v.optional(v.string()),
      summary: v.optional(v.string()),
      summaryStatus: summaryStatusValidator,
      summarySource: v.optional(
        v.union(v.literal("ia"), v.literal("extrait")),
      ),
      senderId: v.id("users"),
      senderName: v.string(),
      senderDepartmentId: v.optional(v.id("departments")),
      recipientId: v.id("users"),
      recipientName: v.string(),
      recipientDepartmentId: v.optional(v.id("departments")),
      status: documentStatusValidator,
      createdAt: v.number(),
      updatedAt: v.number(),
      viewedAt: v.optional(v.number()),
      // Archivage (soft delete) — le document reste accessible mais hors inbox
      archivedAt: v.optional(v.number()),
      archivedBy: v.optional(v.id("users")),
    })
      .index("by_recipient", ["recipientId"])
      .index("by_sender", ["senderId"])
      .index("by_recipient_status", ["recipientId", "status"])
      .index("by_recipient_archived", ["recipientId", "archivedAt"])
      .index("by_sender_archived", ["senderId", "archivedAt"]),

    // Journal d'audit — traçabilité des actions importantes
    auditLogs: defineTable({
      action: v.string(), // document.sent | document.viewed | document.status_changed | document.archived | document.deleted | document.downloaded
      actorId: v.id("users"),
      actorName: v.string(),
      documentId: v.optional(v.id("documents")),
      details: v.optional(v.string()),
      metadata: v.optional(v.any()),
      createdAt: v.number(),
    })
      .index("by_document", ["documentId"])
      .index("by_actor", ["actorId"])
      .index("by_created", ["createdAt"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
