import type { ApiScope } from "@/lib/integrations/scopes";

/**
 * Blog access, in one place. Every check (pages, server actions, the API and
 * MCP) asks `can(role, permission)`; the Roles page of the docs renders this
 * same table, so the two cannot drift apart.
 *
 * To extend: add a permission to BLOG_PERMISSIONS with the lowest role that
 * holds it, or add a role to ROLE_ORDER at its place in the ladder.
 */

/** Roles an owner or admin can give to people they invite. */
export const BLOG_ROLES = ["viewer", "member", "admin"] as const;
export type BlogRole = typeof BLOG_ROLES[number];
/** The account that created the blog. Not assignable: it pays for the blog's AI and SEO work. */
export type BlogAccessRole = BlogRole | "owner";

/** Lowest to highest: each role holds every permission of the roles before it. */
const ROLE_ORDER: readonly BlogAccessRole[] = ["viewer", "member", "admin", "owner"];

export const DEFAULT_BLOG_ROLE: BlogRole = "member";

export const ROLE_DETAILS: Record<BlogAccessRole, { label: string; description: string }> = {
  viewer: { label: "Viewer", description: "Reads everything in the blog and changes nothing." },
  member: { label: "Member", description: "Writes and publishes content and works with Autopilot ideas. No settings, keys or members." },
  admin: { label: "Admin", description: "Everything in the blog, including settings, Autopilot, API keys and members." },
  owner: { label: "Owner", description: "Created the blog and pays for its AI and SEO usage. Admin, plus billing and deleting the blog." },
};

type PermissionDefinition = { minimum: BlogAccessRole; group: string; label: string };

export const BLOG_PERMISSIONS = {
  "content.read": { minimum: "viewer", group: "Content", label: "View posts, drafts, calendar, categories, tags and authors" },
  "content.write": { minimum: "member", group: "Content", label: "Create, edit, publish and delete posts; manage categories, tags and authors; upload images; translate; import" },
  "autopilot.read": { minimum: "viewer", group: "Autopilot", label: "View Autopilot ideas and their progress" },
  "autopilot.write": { minimum: "member", group: "Autopilot", label: "Add and remove ideas, write a draft now, redraw a post's cover" },
  "autopilot.manage": { minimum: "admin", group: "Autopilot", label: "Settings, schedule, turning it on or off, finding ideas with SEO research" },
  "blog.manage": { minimum: "admin", group: "Blog", label: "Change the blog's name and languages" },
  "members.manage": { minimum: "admin", group: "Blog", label: "Invite people, change their role and remove them" },
  "integrations.manage": { minimum: "admin", group: "Blog", label: "Create and revoke API keys" },
  "account.manage": { minimum: "owner", group: "Account", label: "Providers, usage and billing (the owner's account)" },
  "account.spending": { minimum: "owner", group: "Account", label: "Turn SEO research on or off, pick the DataForSEO connection and set its spending limits" },
  "blog.delete": { minimum: "owner", group: "Account", label: "Delete the blog" },
} as const satisfies Record<string, PermissionDefinition>;

export type BlogPermission = keyof typeof BLOG_PERMISSIONS;

const rank = (role: BlogAccessRole) => ROLE_ORDER.indexOf(role);

export function isBlogRole(value: unknown): value is BlogRole {
  return typeof value === "string" && (BLOG_ROLES as readonly string[]).includes(value);
}

/** Whether a role holds a permission. No role (no access) holds nothing. */
export function can(role: BlogAccessRole | null | undefined, permission: BlogPermission) {
  return role ? rank(role) >= rank(BLOG_PERMISSIONS[permission].minimum) : false;
}

/** Every permission of a role, for passing to client components. */
export function permissionsOf(role: BlogAccessRole | null | undefined) {
  return Object.fromEntries((Object.keys(BLOG_PERMISSIONS) as BlogPermission[]).map((permission) => [permission, can(role, permission)])) as Record<BlogPermission, boolean>;
}

/**
 * The most an API client acting for this role may do. OAuth (MCP) grants and
 * dashboard sessions are limited to these scopes on each blog.
 */
export function roleApiScopes(role: BlogAccessRole | null | undefined): ApiScope[] {
  const scopes: ApiScope[] = [];
  if (can(role, "content.read")) scopes.push("content:read");
  if (can(role, "content.write")) scopes.push("content:write", "content:publish", "content:delete", "media:write");
  if (can(role, "blog.manage")) scopes.push("blog:write");
  if (can(role, "autopilot.manage")) scopes.push("seo:write");
  return scopes;
}
