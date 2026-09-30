import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { missingAutopilotStep } from "@/lib/autopilot/setup";
import { Button } from "@/components/ui/button";
import { BlogIntegrationLayout, integrationBlog } from "@/components/Integrations/BlogIntegrationLayout";
import { GrowthPlanManager } from "@/components/Growth/GrowthPlanManager";
import { OpportunityRadar } from "@/components/Growth/OpportunityRadar";
import { SeoSettingsManager } from "@/components/Seo/SeoSettingsManager";
import { getSeoDashboardData } from "@/src/server/services/seo/actions";
import { getGrowthDashboard } from "@/src/server/services/growth/service";

export const maxDuration = 300;

export default async function AutopilotPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { id } = await params;
  const { view } = await searchParams;
  const { blog, isOwner } = await integrationBlog(id);
  if (isOwner) {
    // Blogs created before onboarding asked about Autopilot finish setting it up there.
    const setup = await prisma.blogSeoSettings.findUnique({ where: { blogId: id }, select: { targetDomain: true, audience: true, brandVoice: true } });
    if (missingAutopilotStep(setup)) redirect(`/onboarding/autopilot?blog=${id}`);
  }
  const settingsView = view === "settings";
  const ideasView = view === "ideas";
  const settingsData = isOwner && settingsView ? await getSeoDashboardData(id) : null;
  const autopilotData = isOwner && !settingsView ? await getGrowthDashboard(id) : null;
  const base = `/dashboard/blogs/${id}/autopilot`;

  return <BlogIntegrationLayout blog={blog} title="Autopilot" description="Zenex keeps your idea queue full, writes on schedule and publishes the way you choose.">
    <div className="flex gap-1 border-b">
      <Button asChild variant={!settingsView && !ideasView ? "secondary" : "ghost"} size="sm" className="rounded-b-none"><Link href={base}>Autopilot</Link></Button>
      <Button asChild variant={ideasView ? "secondary" : "ghost"} size="sm" className="rounded-b-none"><Link href={`${base}?view=ideas`}>Ideas{autopilotData?.items.length ? ` (${autopilotData.items.length})` : ""}</Link></Button>
      <Button asChild variant={settingsView ? "secondary" : "ghost"} size="sm" className="rounded-b-none"><Link href={`${base}?view=settings`}>Settings</Link></Button>
    </div>

    {!isOwner ? <p className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">Only the blog owner can manage Autopilot.</p>
      : settingsData ? <SeoSettingsManager blogId={id} plan={settingsData.plan} credentials={settingsData.credentials} settings={settingsData.settings} />
        : autopilotData && !ideasView ? <OpportunityRadar
            blogId={id}
            aiReady={autopilotData.aiReady}
            seoReady={autopilotData.seoReady}
            discovery={{
              ...autopilotData.discovery,
              nextDiscoveryAt: autopilotData.discovery.nextDiscoveryAt?.toISOString() || null,
              lastDiscoveryAt: autopilotData.discovery.lastDiscoveryAt?.toISOString() || null,
              lastRun: autopilotData.discovery.lastRun ? {
                ...autopilotData.discovery.lastRun,
                createdAt: autopilotData.discovery.lastRun.createdAt.toISOString(),
                completedAt: autopilotData.discovery.lastRun.completedAt?.toISOString() || null,
              } : null,
            }}
          />
        : autopilotData ? <GrowthPlanManager
            blogId={id}
            defaultLanguage={autopilotData.defaultLanguage}
            aiReady={autopilotData.aiReady}
            mediaReady={autopilotData.mediaReady}
            publishingMode={autopilotData.discovery.publishingMode}
            items={autopilotData.items.map((item) => ({
              ...item,
              opportunitySnapshot: item.opportunitySnapshot ? JSON.parse(JSON.stringify(item.opportunitySnapshot)) : null,
              createdAt: item.createdAt.toISOString(),
              scheduledFor: item.scheduledFor?.toISOString() || null,
              post: item.post ? { ...item.post, publishedAt: item.post.publishedAt?.toISOString() || null } : null,
              runs: item.runs.map((run) => ({ ...run, createdAt: run.createdAt.toISOString(), completedAt: run.completedAt?.toISOString() || null })),
            }))}
          />
        : null}
  </BlogIntegrationLayout>;
}
