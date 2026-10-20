/**
 * Assouplit les cookies OAuth de @convex-dev/auth :
 * - retire `partitioned` + préfixe `__Host-` qui cassent le retour Google
 *   sur certains navigateurs (session perdue → retour login sans erreur).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cookiesPath = path.join(root, "node_modules/@convex-dev/auth/dist/server/cookies.js");
const oauthPath = path.join(root, "node_modules/@convex-dev/auth/dist/server/oauth/convexAuth.js");

if (fs.existsSync(cookiesPath)) {
  let t = fs.readFileSync(cookiesPath, "utf8");
  t = t.replace(/partitioned:\s*true,?\n?/g, "");
  t = t.replace(/sameSite:\s*"none"/g, 'sameSite: "lax"');
  t = t.replace(
    /return\s*\(!isLocalHost\(process\.env\.CONVEX_SITE_URL\)\s*\?\s*"__Host-"\s*:\s*""\)\s*\+\s*providerId\s*\+\s*"RedirectTo";/,
    'return providerId + "RedirectTo";',
  );
  fs.writeFileSync(cookiesPath, t);
  console.log("[patch-auth-cookies] cookies.js OK");
}

if (fs.existsSync(oauthPath)) {
  let t = fs.readFileSync(oauthPath, "utf8");
  t = t.replace(
    /return\s*\(!isLocalHost\(process\.env\.CONVEX_SITE_URL\)\s*\?\s*"__Host-"\s*:\s*""\)\s*\+\s*providerId\s*\+\s*"OAuth"\s*\+\s*type;/,
    'return providerId + "OAuth" + type;',
  );
  fs.writeFileSync(oauthPath, t);
  console.log("[patch-auth-cookies] convexAuth.js OK");
}
