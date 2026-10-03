import type { Problem } from "@/src/server/services/admin/problems";

const time = (value: Date) => value.toLocaleString("en", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

/** What failed in the month, newest first, with whose account it ran on. */
export function ProblemsList({ problems, failedSeoCalls, monthLabel }: { problems: Problem[]; failedSeoCalls: number; monthLabel: string }) {
  if (!problems.length) {
    return <p className="rounded-lg border bg-card px-4 py-6 text-center text-sm text-muted-foreground">Nothing failed in {monthLabel}.</p>;
  }
  return (
    <div className="space-y-2">
      {failedSeoCalls > 0 && (
        <p className="text-xs text-muted-foreground">{failedSeoCalls} DataForSEO {failedSeoCalls === 1 ? "request" : "requests"} failed in {monthLabel}. Failed requests are not charged.</p>
      )}
      <ul className="divide-y rounded-lg border bg-card">
        {problems.map((problem, index) => (
          <li key={`${problem.at.toISOString()}-${index}`} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
            <span className="w-28 shrink-0 text-xs tabular-nums text-muted-foreground">{time(problem.at)} UTC</span>
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="text-sm">{problem.message}</p>
              <p className="text-xs text-muted-foreground">
                {problem.kind} · {problem.blogName} · {problem.ownerEmail}
                {problem.paidBy && ` · ${problem.paidBy === "platform" ? "platform keys" : "their own keys"}`}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
