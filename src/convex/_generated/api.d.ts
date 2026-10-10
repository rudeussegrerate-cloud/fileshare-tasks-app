/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ai from "../ai.js";
import type * as announcements from "../announcements.js";
import type * as assistantBot from "../assistantBot.js";
import type * as audit from "../audit.js";
import type * as auth from "../auth.js";
import type * as auth_emailOtp from "../auth/emailOtp.js";
import type * as auth_passwordReset from "../auth/passwordReset.js";
import type * as bot from "../bot.js";
import type * as chat from "../chat.js";
import type * as departmentMembership from "../departmentMembership.js";
import type * as documents from "../documents.js";
import type * as http from "../http.js";
import type * as inAppNotifications from "../inAppNotifications.js";
import type * as lib_groq from "../lib/groq.js";
import type * as lib_security from "../lib/security.js";
import type * as notifications from "../notifications.js";
import type * as presence from "../presence.js";
import type * as smart from "../smart.js";
import type * as users from "../users.js";
import type * as workspace from "../workspace.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  ai: typeof ai;
  announcements: typeof announcements;
  assistantBot: typeof assistantBot;
  audit: typeof audit;
  auth: typeof auth;
  "auth/emailOtp": typeof auth_emailOtp;
  "auth/passwordReset": typeof auth_passwordReset;
  bot: typeof bot;
  chat: typeof chat;
  departmentMembership: typeof departmentMembership;
  documents: typeof documents;
  http: typeof http;
  inAppNotifications: typeof inAppNotifications;
  "lib/groq": typeof lib_groq;
  "lib/security": typeof lib_security;
  notifications: typeof notifications;
  presence: typeof presence;
  smart: typeof smart;
  users: typeof users;
  workspace: typeof workspace;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
