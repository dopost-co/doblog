import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { missingAutopilotStep } from "@/lib/autopilot/setup";
import { LinkTabs } from "@/components/ui/link-tabs";
import { BlogIntegrationLayout, integrationBlog } from "@/components/Integrations/BlogIntegrationLayout";
import { AutopilotToggle } from "@/components/Growth/AutopilotToggle";
import { GrowthPlanManager } from "@/components/Growth/GrowthPlanManager";
import { OpportunityRadar } from "@/components/Growth/OpportunityRadar";
import { LastIdeasRun } from "@/components/Growth/LastIdeasRun";
import { DiscoveryProgress } from "@/components/Growth/DiscoveryProgress";
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
  const { blog, access } = await integrationBlog(id);
  const canManage = access.can("autopilot.manage");

  // Blogs created before onboarding asked about Autopilot finish setting it up there.
  const setup = await prisma.blogSeoSettings.findUnique({ where: { blogId: id }, select: { targetDomain: true, audience: true, brandVoice: true } });
  if (missingAutopilotStep(setup)) {
    // Setup turns Autopilot on with the owner's AI keys, so it is the owner's step.
    if (access.role === "owner") redirect(`/onboarding/autopilot?blog=${id}`);
    return <BlogIntegrationLayout blog={blog} title="Autopilot">
      <p className="text-sm text-muted-foreground">Autopilot isn’t set up for this blog yet. The blog owner can set it up.</p>
    </BlogIntegrationLayout>;
  }

  // Schedule and Settings are admin tools; everyone else works from the ideas.
  const active = !canManage ? "ideas" : view === "ideas" || view === "settings" ? view : "schedule";
  const [data, settingsData] = await Promise.all([
    getGrowthDashboard(id),
    active === "settings" ? getSeoDashboardData(id) : null,
  ]);
  const base = `/dashboard/blogs/${id}/autopilot`;

  return <BlogIntegrationLayout
    blog={blog}
    title="Autopilot"
    actions={<AutopilotToggle
      blogId={id}
      active={data.discovery.active}
      nextDiscoveryAt={data.discovery.nextDiscoveryAt?.toISOString() || null}
      running={data.discovery.running}
      aiReady={data.aiReady}
      canManage={canManage}
    />}
  >
    <div className="space-y-6">
      {canManage && <LinkTabs active={active} items={[
        { id: "schedule", label: "Schedule", href: base },
        { id: "ideas", label: data.items.length ? `Ideas ${data.items.length}` : "Ideas", href: `${base}?view=ideas` },
        { id: "settings", label: "Settings", href: `${base}?view=settings` },
      ]} />}

      {data.discovery.running && data.discovery.lastRun?.status === "running" && <DiscoveryProgress stage={data.discovery.lastRun.stage} />}
      <LastIdeasRun
        run={data.discovery.lastRun}
        researchOn={data.seoReady}
        settingsHref={canManage ? `${base}?view=settings` : undefined}
      />

      {active === "settings" && settingsData ? (
        <SeoSettingsManager blogId={id} plan={settingsData.plan} credentials={settingsData.credentials} settings={settingsData.settings} languages={settingsData.languages} posts={settingsData.posts} canSpend={settingsData.canSpend} />
      ) : active === "ideas" ? (
        <GrowthPlanManager
          blogId={id}
          defaultLanguage={data.defaultLanguage}
          aiReady={data.aiReady}
          mediaReady={data.mediaReady}
          publishingMode={data.discovery.publishingMode}
          canEdit={access.can("autopilot.write")}
          translateTo={data.translateTo}
          items={data.items.map((item) => ({
            ...item,
            opportunitySnapshot: item.opportunitySnapshot ? JSON.parse(JSON.stringify(item.opportunitySnapshot)) : null,
            createdAt: item.createdAt.toISOString(),
            scheduledFor: item.scheduledFor?.toISOString() || null,
            post: item.post ? { ...item.post, publishedAt: item.post.publishedAt?.toISOString() || null } : null,
            runs: item.runs.map((run) => ({ ...run, createdAt: run.createdAt.toISOString(), completedAt: run.completedAt?.toISOString() || null })),
          }))}
        />
      ) : (
        <OpportunityRadar blogId={id} aiReady={data.aiReady} discovery={data.discovery} />
      )}
    </div>
  </BlogIntegrationLayout>;
}
