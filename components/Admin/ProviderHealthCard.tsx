import { checkPlatformProviders, LOW_DATAFORSEO_BALANCE_USD, type ProviderHealth } from "@/src/server/services/admin/provider-health";
import { cn } from "@/lib/utils";

const LABELS: Record<ProviderHealth["status"], string> = {
  ok: "Working", missing: "Not set", rejected: "Credentials rejected", no_credit: "Out of credit", unreachable: "Not responding",
};

function Row({ name, health, note }: { name: string; health: ProviderHealth; note?: string }) {
  const warn = health.status === "ok" && health.low;
  const tone = health.status === "ok" ? (warn ? "bg-amber-500" : "bg-emerald-500") : health.status === "missing" ? "bg-muted-foreground" : "bg-red-500";
  return (
    <div className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="flex items-center gap-2 text-sm">
        <span className={cn("size-2 shrink-0 rounded-full", tone)} />
        <span className="font-medium">{name}</span>
        <span className={cn(health.status === "ok" ? "text-muted-foreground" : "text-red-600 dark:text-red-400", warn && "text-amber-600 dark:text-amber-400")}>
          {warn ? "Low balance" : LABELS[health.status]}
        </span>
      </div>
      <p className="text-sm text-muted-foreground sm:text-right">
        {health.status === "ok"
          ? health.balanceUsd != null ? `Balance $${health.balanceUsd.toFixed(2)}${warn ? ` (under $${LOW_DATAFORSEO_BALANCE_USD})` : ""}` : note
          : health.message}
      </p>
    </div>
  );
}

/** Checks the platform keys live on every visit; both checks are free. */
export async function ProviderHealthCard() {
  const health = await checkPlatformProviders();
  return (
    <div className="divide-y">
      <Row name="OpenAI" health={health.openai} note="OpenAI doesn't share the balance; see spend in Usage" />
      <Row name="DataForSEO" health={health.dataforseo} />
    </div>
  );
}

export function ProviderHealthFallback() {
  return <p className="text-sm text-muted-foreground">Checking OpenAI and DataForSEO…</p>;
}
