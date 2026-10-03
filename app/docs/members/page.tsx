import { DocsLayout } from "@/components/Docs/DocsLayout";
import { DocsSidebar } from "@/components/Docs/DocsSidebar";
import { DocsSection } from "@/components/Docs/DocsSection";
import { RolesTable } from "@/components/Docs/RolesTable";
import { BLOG_ROLES, ROLE_DETAILS, roleApiScopes } from "@/lib/permissions";

export default function MembersDocsPage() {
  return (
    <DocsLayout>
      <DocsSidebar />
      <main className="relative py-6 lg:gap-10 lg:py-8">
        <div className="mx-auto w-full min-w-0 max-w-3xl">
          <div className="mb-8 space-y-2">
            <h1 className="scroll-m-20 text-4xl font-bold tracking-tight">Members &amp; roles</h1>
            <p className="text-lg text-muted-foreground">
              Invite people to a blog by email and choose what they can do with a role.
            </p>
          </div>

          <DocsSection id="roles" title="Roles">
            <ul className="space-y-2 text-muted-foreground">
              {[...BLOG_ROLES, "owner" as const].map((role) => (
                <li key={role}><span className="font-medium text-foreground">{ROLE_DETAILS[role].label}.</span> {ROLE_DETAILS[role].description}</li>
              ))}
            </ul>
            <RolesTable />
          </DocsSection>

          <DocsSection id="inviting" title="Inviting people">
            <p className="text-muted-foreground">
              In <span className="text-foreground">Settings → Members</span>, enter an email and pick a role. The person gets access as
              soon as they sign in or sign up with that email; copy the invite link to send it to them. Owners and admins can change a
              role or remove someone at any time, and the change applies on their next click.
            </p>
            <p className="text-muted-foreground">
              Each blog has one owner: the account that created it. The owner&apos;s OpenAI and DataForSEO keys (or plan) pay for the
              blog&apos;s AI and SEO work, which is why spending settings and billing stay with the owner.
            </p>
          </DocsSection>

          <DocsSection id="mcp" title="MCP and the API">
            <p className="text-muted-foreground">
              When a member connects an MCP client, it can never do more on a blog than their role allows, whatever scopes the
              connection asked for. Changing someone&apos;s role changes what their connection can do right away.
            </p>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted"><tr><th className="p-3 font-medium">Role</th><th className="p-3 font-medium">Most an MCP connection can use</th></tr></thead>
                <tbody>
                  {[...BLOG_ROLES, "owner" as const].map((role) => (
                    <tr key={role} className="border-t">
                      <td className="p-3">{ROLE_DETAILS[role].label}</td>
                      <td className="p-3 font-mono text-xs">{roleApiScopes(role).join(" ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-muted-foreground">
              API keys belong to the blog, not to a person: admins create them with the scopes they choose.
            </p>
          </DocsSection>
        </div>
      </main>
    </DocsLayout>
  );
}
