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

export const entityRoleValidator = v.union(
  v.literal("agent"),
  v.literal("chef_service"),
  v.literal("directeur"),
  v.literal("sg"),
  v.literal("cabinet"),
);
export type EntityRole = Infer<typeof entityRoleValidator>;

export const routingModeValidator = v.union(
  v.literal("hierarchique"),
  v.literal("direct"),
  v.literal("ampliation"),
);
export type RoutingMode = Infer<typeof routingModeValidator>;

export const transmissionStatusValidator = v.union(
  v.literal("brouillon"),
  v.literal("envoye"),
  v.literal("recu"),
  v.literal("lu"),
  v.literal("traite"),
  v.literal("retourne"),
  v.literal("transmis"),
);
export type TransmissionStatus = Infer<typeof transmissionStatusValidator>;

export const confidentialityValidator = v.union(
  v.literal("normal"),
  v.literal("restreint"),
  v.literal("confidentiel"),
);

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
      cguAcceptedAt: v.optional(v.number()),

      // account approval by the DG (auto-approved for the DG himself).
      accountStatus: v.optional(accountStatusValidator),
      reviewedBy: v.optional(v.id("users")),
      reviewedAt: v.optional(v.number()),

      // department placement. set by the DG (admin) or the department chef.
      departmentId: v.optional(v.id("departments")),
      departmentRole: v.optional(departmentRoleValidator),
      entityRole: v.optional(entityRoleValidator),
      createdAt: v.optional(v.number()),
      // Présence : dernière activité (heartbeat client)
      lastSeenAt: v.optional(v.number()),
      // Département souhaité à l'inscription (en attendant acceptation chef)
      requestedDepartmentId: v.optional(v.id("departments")),
    })
      .index("email", ["email"]) // index for the email. do not remove or modify
      .index("by_department", ["departmentId"]),

    // Departments are created by the DG (admin), who also appoints their chef.
    // Un chef peut créer des sous-départements (parentId).
    departments: defineTable({
      name: v.string(),
      /** Sigle officiel (DTD, DAF, SG…) */
      code: v.optional(v.string()),
      /**
       * direction | service | organisme | cabinet | sg | interregion | cellule
       * Utilisé pour l'envoi structurel (pas personne).
       */
      kind: v.optional(
        v.union(
          v.literal("direction"),
          v.literal("service"),
          v.literal("organisme"),
          v.literal("cabinet"),
          v.literal("sg"),
          v.literal("interregion"),
          v.literal("cellule"),
          v.literal("autre"),
        ),
      ),
      description: v.optional(v.string()),
      createdBy: v.id("users"),
      createdAt: v.number(),
      parentId: v.optional(v.id("departments")),
      logoStorageId: v.optional(v.id("_storage")),
    })
      .index("by_parent", ["parentId"])
      .index("by_code", ["code"]),

    // A document (file) sent from one person to another, with the task the
    // receiver must perform and the automatic summary of its content.
    documents: defineTable({
      fileName: v.string(),
      storageId: v.id("_storage"),
      contentType: v.optional(v.string()),
      size: v.optional(v.number()),
      // Objet de l'envoi (pourquoi ce document est transmis)
      objet: v.string(),
      /** Observations / instructions (ex. « DTD : M'en parler ») */
      observations: v.optional(v.string()),
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
      owningEntityId: v.optional(v.id("departments")),
      confidentiality: v.optional(confidentialityValidator),
      referenceNumber: v.optional(v.string()),
      /** Optionnel si envoi purement structurel (direction/service sans membre encore). */
      recipientId: v.optional(v.id("users")),
      recipientName: v.string(),
      recipientDepartmentId: v.optional(v.id("departments")),
      status: documentStatusValidator,
      // Identité unique (survît à l'impression / photocopie via QR + n°)
      /** Identifiant automatique lisible (ex. SD-2026-ABC123) */
      publicRef: v.optional(v.string()),
      revisionCount: v.optional(v.number()),
      lastRevisedAt: v.optional(v.number()),
      lastRevisedByName: v.optional(v.string()),
      // Circuit multi-personnes (séquentiel)
      hasCircuit: v.optional(v.boolean()),
      currentStepIndex: v.optional(v.number()),
      circuitTotalSteps: v.optional(v.number()),
      /** Échéance globale du dossier (ms) */
      dueAt: v.optional(v.number()),
      /** Délai max par étape en heures (SLA circuit) */
      stepDeadlineHours: v.optional(v.number()),
      /** Dernière relance émetteur (anti-spam) */
      lastAlertAt: v.optional(v.number()),
      /** Dernière alerte automatique (cron) */
      lastAutoAlertAt: v.optional(v.number()),
      lastAutoAlertKind: v.optional(
        v.union(v.literal("approaching"), v.literal("overdue")),
      ),
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
      .index("by_sender_archived", ["senderId", "archivedAt"])
      .index("by_publicRef", ["publicRef"])
      .index("by_recipient_department", ["recipientDepartmentId"]),

    // Versions renvoyées par les intermédiaires (même identifiant / dossier)
    documentRevisions: defineTable({
      documentId: v.id("documents"),
      storageId: v.id("_storage"),
      fileName: v.string(),
      contentType: v.optional(v.string()),
      size: v.optional(v.number()),
      uploadedBy: v.id("users"),
      uploadedByName: v.string(),
      stepIndex: v.optional(v.number()),
      note: v.optional(v.string()),
      createdAt: v.number(),
    }).index("by_document", ["documentId", "createdAt"]),

    // Étapes du circuit de traitement (ordre strict)
    documentSteps: defineTable({
      documentId: v.id("documents"),
      stepIndex: v.number(), // 0, 1, 2…
      assigneeId: v.id("users"),
      assigneeName: v.string(),
      assigneeDepartmentName: v.optional(v.string()),
      /** Envoi structurel : étape adressée à une direction/service */
      assigneeDepartmentId: v.optional(v.id("departments")),
      taskLabel: v.optional(v.string()), // ex. « Pour visa »
      status: v.union(
        v.literal("waiting"),
        v.literal("active"),
        v.literal("done"),
        v.literal("rejected"),
      ),
      note: v.optional(v.string()),
      actedAt: v.optional(v.number()),
      /** Quand l'étape est devenue active */
      activatedAt: v.optional(v.number()),
      /** Échéance de cette étape */
      dueAt: v.optional(v.number()),
      createdAt: v.number(),
    })
      .index("by_document", ["documentId", "stepIndex"])
      .index("by_assignee", ["assigneeId", "status"]),


    /**
     * Transmissions structurelles : un document unique, plusieurs destinataires
     * (directions/services). Le statut est partagé au niveau de la structure.
     */
    documentTransmissions: defineTable({
      documentId: v.id("documents"),
      departmentId: v.id("departments"),
      departmentName: v.string(),
      departmentCode: v.optional(v.string()),
      /** traitement = doit traiter ; ampliation = pour information */
      kind: v.union(v.literal("traitement"), v.literal("ampliation")),
      status: v.union(
        v.literal("envoye"),
        v.literal("consulte"),
        v.literal("en_cours"),
        v.literal("traite"),
        v.literal("retourne"),
      ),
      actedByUserId: v.optional(v.id("users")),
      actedByName: v.optional(v.string()),
      actedAt: v.optional(v.number()),
      note: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_document", ["documentId"])
      .index("by_department", ["departmentId"])
      .index("by_department_status", ["departmentId", "status"]),

    // Demandes d'intégration dans un département (utilisateur → chef)
    departmentJoinRequests: defineTable({
      userId: v.id("users"),
      departmentId: v.id("departments"),
      status: v.union(
        v.literal("pending"),
        v.literal("accepted"),
        v.literal("rejected"),
        v.literal("cancelled"),
      ),
      createdAt: v.number(),
      reviewedBy: v.optional(v.id("users")),
      reviewedAt: v.optional(v.number()),
    })
      .index("by_department", ["departmentId"])
      .index("by_user", ["userId"])
      .index("by_status", ["status"]),

    // Invitations chef → utilisateur
    departmentInvitations: defineTable({
      departmentId: v.id("departments"),
      inviteeEmail: v.string(),
      inviteeUserId: v.optional(v.id("users")),
      invitedBy: v.id("users"),
      status: v.union(
        v.literal("pending"),
        v.literal("accepted"),
        v.literal("rejected"),
        v.literal("cancelled"),
      ),
      createdAt: v.number(),
      respondedAt: v.optional(v.number()),
    })
      .index("by_email", ["inviteeEmail"])
      .index("by_department", ["departmentId"])
      .index("by_invitee", ["inviteeUserId"])
      .index("by_status", ["status"]),

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

    // Notifications in-app
    notifications: defineTable({
      userId: v.id("users"),
      type: v.string(), // document.received | document.status | system
      title: v.string(),
      body: v.string(),
      documentId: v.optional(v.id("documents")),
      readAt: v.optional(v.number()),
      createdAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_user_created", ["userId", "createdAt"])
      .index("by_user_unread", ["userId", "readAt"]),

    // Chat 1-1 entre utilisateurs (style Messenger)
    conversations: defineTable({
      // Toujours participantA < participantB (string id) pour unicité
      participantA: v.id("users"),
      participantB: v.id("users"),
      lastMessageAt: v.number(),
      lastMessagePreview: v.optional(v.string()),
      lastSenderId: v.optional(v.id("users")),
    })
      .index("by_pair", ["participantA", "participantB"])
      .index("by_a", ["participantA", "lastMessageAt"])
      .index("by_b", ["participantB", "lastMessageAt"]),

    chatMessages: defineTable({
      conversationId: v.id("conversations"),
      senderId: v.id("users"),
      body: v.string(),
      createdAt: v.number(),
      readAt: v.optional(v.number()),
    })
      .index("by_conversation", ["conversationId", "createdAt"])
      .index("by_conversation_unread", ["conversationId", "readAt"]),

    // Assistant personnel (mini-bot) — un profil par utilisateur
    botProfiles: defineTable({
      userId: v.id("users"),
      name: v.string(),
      mood: v.string(), // joyeux | calme | motivant | sérieux | blagueur
      personality: v.string(), // comment se comporter
      color: v.string(), // couleur du personnage
      gender: v.optional(v.union(v.literal("male"), v.literal("female"), v.literal("neutral"))),
      avatarStorageId: v.optional(v.id("_storage")),
      createdAt: v.number(),
      updatedAt: v.number(),
    }).index("by_user", ["userId"]),

    botMessages: defineTable({
      userId: v.id("users"),
      role: v.union(v.literal("user"), v.literal("assistant")),
      body: v.string(),
      createdAt: v.number(),
    }).index("by_user", ["userId", "createdAt"]),

    // Tâches apprises / automatisations du bot personnel
    botSkills: defineTable({
      userId: v.id("users"),
      name: v.string(),
      trigger: v.string(), // phrase ou mots-clés
      instruction: v.string(), // ce que le bot doit faire / répondre
      action: v.optional(
        v.union(
          v.literal("reply"),
        v.literal("open_home"),
        v.literal("open_inbox"),
        v.literal("open_sent"),
        v.literal("open_send"),
        v.literal("open_suivi"),
        v.literal("open_fichiers"),
        v.literal("open_messages"),
        v.literal("open_actualites"),
        v.literal("open_announcements"),
        v.literal("open_departments"),
        v.literal("open_settings"),
        v.literal("open_accounts"),
        v.literal("remind_tasks"),
        ),
      ),
      enabled: v.boolean(),
      useCount: v.number(),
      createdAt: v.number(),
      updatedAt: v.number(),
    }).index("by_user", ["userId"]),

    // Annonces internes (mur d'information)
    announcements: defineTable({
      authorId: v.id("users"),
      title: v.string(),
      body: v.string(),
      // Provenance / contexte
      origin: v.string(), // ex. Direction, Département RH, Service IT
      // Snapshot auteur au moment de la publication
      authorName: v.string(),
      authorFonction: v.optional(v.string()),
      authorDepartmentName: v.optional(v.string()),
      authorRoleLabel: v.optional(v.string()), // DG, Chef, Membre…
      priority: v.optional(
        v.union(v.literal("normal"), v.literal("important"), v.literal("urgent")),
      ),
      pinned: v.optional(v.boolean()),
      // Visibilité
      // public  = tous les départements
      // private = uniquement le département de l'auteur
      // custom  = liste d'utilisateurs (viewerIds)
      visibility: v.optional(
        v.union(v.literal("public"), v.literal("private"), v.literal("custom")),
      ),
      departmentId: v.optional(v.id("departments")), // pour private
      viewerIds: v.optional(v.array(v.id("users"))), // pour custom (+ auteur toujours inclus côté logique)
      mediaStorageId: v.optional(v.id("_storage")),
      mediaType: v.optional(v.union(v.literal("image"), v.literal("video"))),
      createdAt: v.number(),
      updatedAt: v.optional(v.number()),
    })
      .index("by_created", ["createdAt"])
      .index("by_author", ["authorId"])
      .index("by_department", ["departmentId"]),

    announcementReactions: defineTable({
      announcementId: v.id("announcements"),
      userId: v.id("users"),
      emoji: v.string(), // 👍 ❤️ 👏 🎉 😮
      createdAt: v.number(),
    })
      .index("by_announcement", ["announcementId"])
      .index("by_user_announcement", ["userId", "announcementId"]),

    announcementComments: defineTable({
      announcementId: v.id("announcements"),
      authorId: v.id("users"),
      authorName: v.string(),
      body: v.string(),
      createdAt: v.number(),
    }).index("by_announcement", ["announcementId", "createdAt"]),
    transmissions: defineTable({
      documentId: v.id("documents"),
      fromEntityId: v.id("departments"),
      toEntityId: v.id("departments"),
      fromUserId: v.id("users"),
      fromUserName: v.string(),
      toUserId: v.optional(v.id("users")),
      toUserName: v.optional(v.string()),
      routingMode: routingModeValidator,
      status: transmissionStatusValidator,
      isAmpliation: v.boolean(),
      comment: v.optional(v.string()),
      taskLabel: v.optional(v.string()),
      parentTransmissionId: v.optional(v.id("transmissions")),
      actedAt: v.optional(v.number()),
      actedBy: v.optional(v.id("users")),
      dueAt: v.optional(v.number()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_document", ["documentId", "createdAt"])
      .index("by_to_entity", ["toEntityId", "status"])
      .index("by_from_entity", ["fromEntityId", "createdAt"])
      .index("by_to_user", ["toUserId", "status"])
      .index("by_from_user", ["fromUserId", "createdAt"])
      .index("by_status", ["status"]),

    rateLimits: defineTable({
      key: v.string(), // userId:action
      count: v.number(),
      windowStart: v.number(),
    }).index("by_key", ["key"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
