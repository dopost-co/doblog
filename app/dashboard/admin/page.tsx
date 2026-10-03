import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAdminPage } from "@/src/server/services/admin/access";
import { getAdminOverview } from "@/src/server/services/admin/queries";
import { getRecentProblems } from "@/src/server/services/admin/problems";
import { ProviderHealthCard, ProviderHealthFallback } from "@/components/Admin/ProviderHealthCard";
import { ProblemsList } from "@/components/Admin/ProblemsList";
import { parseUsageMonth, recentUsageMonths } from "@/src/server/services/usage/queries";
import { DashboardHeader } from "@/components/DashboardHeader/DashboardHeader";
import { MonthPicker } from "@/components/Usage/MonthPicker";
import { PlanSwitcher } from "@/components/Usage/PlanSwitcher";
import { formatUsd } from "@/components/Usage/format";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ month?: string | string[] }> }) {
  const admin = await requireAdminPage();
  const month = parseUsageMonth((await searchParams).month);
  const [overview, problems] = await Promise.all([getAdminOverview(month), getRecentProblems(month)]);
  const date = (value: string) => new Date(value).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />
      <main className="mx-auto w-full max-w-[1000px] space-y-8 px-6 py-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold">Admin</h1>
            <p className="text-sm text-muted-foreground">Accounts, their blogs and who can open them. Spend is for the month chosen.</p>
          </div>
          <MonthPicker months={recentUsageMonths()} value={month.key} />
        </div>

        <section className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2">
          <div className="space-y-2">
            <p className="text-sm font-medium">Platform keys</p>
            <p className="text-xs text-muted-foreground">Used for accounts on Subscription. Checked live.</p>
            <Suspense fallback={<ProviderHealthFallback />}>
              <ProviderHealthCard />
            </Suspense>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Paid by the platform</p>
            <p className="text-xs text-muted-foreground">Subscription usage in {month.label}.</p>
            <p className="text-sm tabular-nums">
              OpenAI {formatUsd(overview.platformSpend.openai)} <span className="text-muted-foreground">·</span> DataForSEO {formatUsd(overview.platformSpend.dataforseo)}
            </p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium">Problems <span className="text-muted-foreground">({problems.problems.length})</span></h2>
          <ProblemsList problems={problems.problems} failedSeoCalls={problems.failedSeoCalls} monthLabel={month.label} />
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium">Accounts <span className="text-muted-foreground">({overview.users.length})</span></h2>
          <ul className="divide-y rounded-lg border bg-card">
            {overview.users.map((user) => (
              <li key={user.id}>
                <details className="group">
                  <summary className="flex cursor-pointer list-none flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between [&::-webkit-details-marker]:hidden">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {user.email}
                        {user.id === admin.id && <span className="ml-2 text-xs font-normal text-muted-foreground">you</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {user.name ? `${user.name} · ` : ""}Joined {date(user.createdAt)} · {user.blogs.length} {user.blogs.length === 1 ? "blog" : "blogs"}
                        {user.plan === "lifetime" && ` · Own keys: OpenAI ${user.ownKeys.openai ? "yes" : "no"}, DataForSEO ${user.ownKeys.dataforseo ? "yes" : "no"}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-4">
                      <span className="text-sm tabular-nums" title={`Spend in ${month.label}`}>{formatUsd(user.spend)}</span>
                      <PlanSwitcher userId={user.id} plan={user.plan} label={`Plan for ${user.email}`} />
                    </div>
                  </summary>
                  <div className="border-t bg-muted/30 px-4 py-3">
                    {user.blogs.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No blogs.</p>
                    ) : (
                      <ul className="space-y-3">
                        {user.blogs.map((blog) => (
                          <li key={blog.id} className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <p className="text-sm font-medium">{blog.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {blog.posts} {blog.posts === 1 ? "post" : "posts"} · {blog.members.length
                                  ? <>Also open to {blog.members.join(", ")}</>
                                  : "Only the owner"}
                              </p>
                            </div>
                            <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
                              OpenAI {formatUsd(blog.spend.openai)} · DataForSEO {formatUsd(blog.spend.dataforseo)}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
