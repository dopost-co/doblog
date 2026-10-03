import { Check, Minus } from "lucide-react";
import { BLOG_PERMISSIONS, ROLE_DETAILS, can, type BlogAccessRole, type BlogPermission } from "@/lib/permissions";

const COLUMNS: BlogAccessRole[] = ["viewer", "member", "admin", "owner"];

/** Who can do what, read straight from lib/permissions.ts so it always matches the app. */
export function RolesTable() {
  const permissions = Object.entries(BLOG_PERMISSIONS) as [BlogPermission, (typeof BLOG_PERMISSIONS)[BlogPermission]][];
  const groups = [...new Set(permissions.map(([, definition]) => definition.group))];

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted">
          <tr>
            <th className="p-3 font-medium">Permission</th>
            {COLUMNS.map((role) => <th key={role} className="w-20 p-3 text-center font-medium">{ROLE_DETAILS[role].label}</th>)}
          </tr>
        </thead>
        {groups.map((group) => (
          <tbody key={group}>
            <tr className="border-t bg-muted/40">
              <th colSpan={COLUMNS.length + 1} className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{group}</th>
            </tr>
            {permissions.filter(([, definition]) => definition.group === group).map(([permission, definition]) => (
              <tr key={permission} className="border-t">
                <td className="p-3">{definition.label}</td>
                {COLUMNS.map((role) => (
                  <td key={role} className="p-3 text-center">
                    {can(role, permission)
                      ? <Check className="mx-auto size-4 text-emerald-600 dark:text-emerald-400" aria-label="Allowed" />
                      : <Minus className="mx-auto size-4 text-muted-foreground/50" aria-label="Not allowed" />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}
