import Link from "next/link";
import { AlertTriangle } from "lucide-react";

type Run = { status: string; suggestionsAdded: number; warnings: string[]; error: string | null; createdAt: Date };

const RESEARCH_OFF = "DataForSEO research is off";
const date = (value: Date) => value.toLocaleDateString("en", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * How the last idea run went and whether it had search data, so a DataForSEO
 * or sitemap problem is never silent.
 */
export function LastIdeasRun({ run, researchOn, settingsHref }: {
  run: Run | null;
  researchOn: boolean;
  /** Only for people who can change the settings. */
  settingsHref?: string;
}) {
  if (!run || run.status === "running") return null;
  if (run.status === "failed") {
    return (
      <p className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-700 dark:text-red-300">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <span>The last ideas run on {date(run.createdAt)} failed: {run.error ?? "unknown error"}</span>
      </p>
    );
  }
  const problems = run.warnings.filter((warning) => !warning.startsWith(RESEARCH_OFF));
  return (
    <div className="space-y-1.5 text-sm">
      <p className="text-muted-foreground">
        Last ideas run {date(run.createdAt)} · {run.suggestionsAdded} added · {researchOn
          ? problems.some((warning) => warning.includes("unavailable")) ? "with partial search data" : "with search data"
          : <>without search data{settingsHref && <> (<Link href={settingsHref} className="underline underline-offset-4">turn on SEO research</Link>)</>}</>}
      </p>
      {problems.length > 0 && (
        <ul className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-amber-800 dark:text-amber-300">
          {problems.map((warning) => (
            <li key={warning} className="flex items-start gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{warning}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
