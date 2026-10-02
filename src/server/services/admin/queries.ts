import { prisma } from "@/lib/prisma";
import { isManagedPlan } from "@/src/server/services/providers/credentials";
import { getUsageReport, platformProviderStatus, type UsageMonth } from "@/src/server/services/usage/queries";

/** Every account with its blogs, who else can open each blog, and the month's provider spend. */
export async function getAdminOverview(month: UsageMonth) {
  const [users, usage] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true, email: true, name: true, plan: true, createdAt: true, openaiKeyHint: true,
        _count: { select: { seoCredentials: true } },
        blogs: {
          where: { deletedAt: null }, orderBy: { createdAt: "asc" },
          select: { id: true, name: true, _count: { select: { posts: true } }, members: { orderBy: { createdAt: "asc" }, select: { userEmail: true } } },
        },
      },
    }),
    getUsageReport(month),
  ]);
  const spend = (blogId: string) => usage.byBlog.get(blogId) ?? { openai: 0, dataforseo: 0 };
  return {
    providers: platformProviderStatus(),
    platformSpend: {
      openai: usage.openai.byPaidBy.platform,
      dataforseo: usage.dataforseo.byPaidBy.platform,
    },
    users: users.map((user) => {
      const blogs = user.blogs.map((blog) => ({
        id: blog.id, name: blog.name, posts: blog._count.posts,
        members: blog.members.map((member) => member.userEmail), spend: spend(blog.id),
      }));
      return {
        id: user.id, email: user.email, name: user.name, createdAt: user.createdAt.toISOString(),
        plan: isManagedPlan(user.plan) ? "subscription" as const : "lifetime" as const,
        ownKeys: { openai: Boolean(user.openaiKeyHint), dataforseo: user._count.seoCredentials > 0 },
        blogs,
        spend: blogs.reduce((total, blog) => total + blog.spend.openai + blog.spend.dataforseo, 0),
      };
    }),
  };
}
