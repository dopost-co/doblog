import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/get-session";
import { prisma } from "@/lib/prisma";
import { isAdminEmail } from "@/lib/admin";
import { getBlogById } from "@/src/server/services/blogs/queries";
import { isManagedPlan } from "@/src/server/services/providers/credentials";
import { SettingsSectionHeader } from "@/components/SettingsNav/SettingsNav";
import { PlanSwitcher } from "@/components/Usage/PlanSwitcher";

const PLAN_COPY = {
  lifetime: {
    name: "Lifetime",
    summary: "You connect your own OpenAI and DataForSEO accounts in Providers, and they bill you directly for what your blogs use.",
  },
  subscription: {
    name: "Subscription",
    summary: "OpenAI and DataForSEO are included. You don't need your own keys.",
  },
} as const;

export default async function BlogBillingPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  const { id } = await params;
  const blog = await getBlogById(id);
  if (!blog) redirect("/dashboard");

  if (blog.userId !== session?.user?.id) {
    return (
      <div className="space-y-6">
        <SettingsSectionHeader title="Billing" />
        <p className="text-sm text-muted-foreground">Managed by the blog owner.</p>
      </div>
    );
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id }, select: { plan: true } });
  const plan = isManagedPlan(user.plan) ? "subscription" : "lifetime";
  const admin = isAdminEmail(session.user.email);

  return (
    <div className="space-y-6">
      <SettingsSectionHeader title="Billing" description="Applies to your whole account." />
      <section className="divide-y rounded-lg border bg-card">
        <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium">{PLAN_COPY[plan].name} plan</p>
            <p className="text-sm text-muted-foreground">{PLAN_COPY[plan].summary}</p>
          </div>
          {admin && <div className="shrink-0"><PlanSwitcher userId={session.user.id} plan={plan} label="Your plan" /></div>}
        </div>
        <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
          <span className="text-muted-foreground">See what your blogs spend each month.</span>
          <Link href={`/dashboard/blogs/${id}/settings/usage`} className="font-medium underline-offset-4 hover:underline">Usage</Link>
        </div>
      </section>
      {admin && (
        <p className="text-xs text-muted-foreground">
          As an administrator you can switch plans here or for any account in the <Link href="/dashboard/admin" className="underline underline-offset-4">admin panel</Link>. Switching changes whose keys pay from now on; nothing is charged.
        </p>
      )}
    </div>
  );
}
