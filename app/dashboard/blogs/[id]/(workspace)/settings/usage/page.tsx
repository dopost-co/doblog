import { redirect } from "next/navigation";
import { getSession } from "@/lib/get-session";
import { prisma } from "@/lib/prisma";
import { getBlogById } from "@/src/server/services/blogs/queries";
import { isManagedPlan } from "@/src/server/services/providers/credentials";
import { getUsageReport, parseUsageMonth, recentUsageMonths } from "@/src/server/services/usage/queries";
import { SettingsSectionHeader } from "@/components/SettingsNav/SettingsNav";
import { MonthPicker } from "@/components/Usage/MonthPicker";
import { UsageReport } from "@/components/Usage/UsageReport";

export default async function BlogUsagePage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string | string[] }>;
}) {
  const session = await getSession();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const blog = await getBlogById(id);
  if (!blog) redirect("/dashboard");

  // Spend belongs to the account that owns the blog and pays its providers.
  if (blog.userId !== session?.user?.id) {
    return (
      <div className="space-y-6">
        <SettingsSectionHeader title="Usage" />
        <p className="text-sm text-muted-foreground">Managed by the blog owner.</p>
      </div>
    );
  }

  const month = parseUsageMonth(query.month);
  const [user, blogs] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: session.user.id }, select: { plan: true } }),
    prisma.blog.findMany({ where: { userId: session.user.id, deletedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } }),
  ]);
  const report = await getUsageReport(month, blogs.map((item) => item.id));

  return (
    <div className="space-y-6">
      <SettingsSectionHeader
        title="Usage"
        description="AI and SEO spend across all your blogs."
        action={<MonthPicker months={recentUsageMonths()} value={month.key} />}
      />
      <UsageReport
        report={report}
        blogs={blogs}
        payerNote={isManagedPlan(user.plan)
          ? "Included in your plan: these amounts are not billed to you."
          : "Billed by OpenAI and DataForSEO to the accounts you connected in Providers."}
      />
    </div>
  );
}
