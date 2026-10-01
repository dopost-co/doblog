import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { missingAutopilotStep } from "@/lib/autopilot/setup";
import { LinkTabs } from "@/components/ui/link-tabs";
import { BlogIntegrationLayout, integrationBlog } from "@/components/Integrations/BlogIntegrationLayout";
import { AutopilotToggle } from "@/components/Growth/AutopilotToggle";
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
  if (!isOwner) {
    return <BlogIntegrationLayout blog={blog} title="Autopilot">
      <p className="text-sm text-muted-foreground">Only the blog owner can manage Autopilot.</p>
    </BlogIntegrationLayout>;
  }

  // Blogs created before onboarding asked about Autopilot finish setting it up there.
  const setup = await prisma.blogSeoSettings.findUnique({ where: { blogId: id }, select: { targetDomain: true, audience: true, brandVoice: true } });
  if (missingAutopilotStep(setup)) redirect(`/onboarding/autopilot?blog=${id}`);

  const active = view === "ideas" || view === "settings" ? view : "schedule";
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
    />}
  >
    <div className="space-y-6">
      <LinkTabs active={active} items={[
        { id: "schedule", label: "Schedule", href: base },
        { id: "ideas", label: data.items.length ? `Ideas ${data.items.length}` : "Ideas", href: `${base}?view=ideas` },
        { id: "settings", label: "Settings", href: `${base}?view=settings` },
      ]} />

      {active === "settings" && settingsData ? (
        <SeoSettingsManager blogId={id} plan={settingsData.plan} credentials={settingsData.credentials} settings={settingsData.settings} languages={settingsData.languages} posts={settingsData.posts} />
      ) : active === "ideas" ? (
        <GrowthPlanManager
          blogId={id}
          defaultLanguage={data.defaultLanguage}
          aiReady={data.aiReady}
          mediaReady={data.mediaReady}
          publishingMode={data.discovery.publishingMode}
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
