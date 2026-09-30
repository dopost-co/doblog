"use client";

import { API_SCOPES, SCOPE_DESCRIPTIONS, type ApiScope } from "@/lib/integrations/scopes";
import { Checkbox } from "@/components/ui/checkbox";

/** Permission picker shared by API keys and MCP connections. */
export function ScopeChecklist({ value, onChange, disabled }: {
  value: ApiScope[];
  onChange: (value: ApiScope[]) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="grid gap-2" disabled={disabled}>
      <legend className="mb-2 text-sm font-medium">Permissions</legend>
      <div className="divide-y rounded-lg border bg-card">
        {API_SCOPES.map((scope) => (
          <label key={scope} className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-accent/40">
            <Checkbox
              className="mt-0.5"
              checked={value.includes(scope)}
              disabled={disabled}
              onCheckedChange={(checked) => onChange(checked ? [...value, scope] : value.filter((item) => item !== scope))}
            />
            <span className="grid gap-0.5">
              <span className="font-mono text-xs">{scope}</span>
              <span className="text-xs text-muted-foreground">{SCOPE_DESCRIPTIONS[scope]}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
