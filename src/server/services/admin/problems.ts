import { prisma } from "@/lib/prisma";
import { seoOperationLabel, type UsageMonth } from "@/src/server/services/usage/queries";

export type Problem = {
  at: Date;
  kind: "DataForSEO" | "Topic ideas" | "Article";
  blogName: string;
  ownerEmail: string;
  message: string;
  /** Whose account the failed work was billed to. */
  paidBy: "platform" | "owner" | null;
};

const blogSelect = { name: true, user: { select: { email: true, plan: true } } } as const;
const LIMIT = 40;

/** Turning research off is a choice, not a failure; every other discovery warning is worth seeing. */
const isProblemWarning = (warning: string) => !warning.startsWith("DataForSEO research is off");

/**
 * What went wrong in a month, newest first: failed DataForSEO requests, idea
 * runs that failed or ran without part of their search data, and articles that
 * could not be written.
 */
export async function getRecentProblems(month: UsageMonth): Promise<{ problems: Problem[]; failedSeoCalls: number }> {
  const createdAt = { gte: month.start, lt: month.end };
  const [seoFailures, failedSeoCalls, discoveryRuns, articleRuns] = await Promise.all([
    prisma.seoUsageEntry.findMany({
      where: { createdAt, status: "failed" }, orderBy: { createdAt: "desc" }, take: LIMIT,
      select: { createdAt: true, endpoint: true, error: true, credentialId: true, blog: { select: blogSelect } },
    }),
    prisma.seoUsageEntry.count({ where: { createdAt, status: "failed" } }),
    prisma.contentDiscoveryRun.findMany({
      where: { createdAt, OR: [{ status: "failed" }, { warnings: { isEmpty: false } }] }, orderBy: { createdAt: "desc" }, take: LIMIT,
      select: { createdAt: true, status: true, error: true, warnings: true, blog: { select: blogSelect } },
    }),
    prisma.generationRun.findMany({
      where: { createdAt, status: "failed" }, orderBy: { createdAt: "desc" }, take: LIMIT,
      select: { createdAt: true, error: true, blog: { select: blogSelect } },
    }),
  ]);

  const payer = (plan: string) => plan === "subscription" ? "platform" as const : "owner" as const;
  const problems: Problem[] = [
    ...seoFailures.map((entry) => ({
      at: entry.createdAt, kind: "DataForSEO" as const, blogName: entry.blog.name, ownerEmail: entry.blog.user.email,
      message: `${seoOperationLabel(entry.endpoint)}: ${entry.error ?? "failed (reason not recorded)"}`,
      paidBy: entry.credentialId ? "owner" as const : "platform" as const,
    })),
    ...discoveryRuns.flatMap((run) => {
      const messages = run.status === "failed" ? [run.error ?? "Failed"] : run.warnings.filter(isProblemWarning);
      return messages.map((message) => ({
        at: run.createdAt, kind: "Topic ideas" as const, blogName: run.blog.name, ownerEmail: run.blog.user.email,
        message, paidBy: payer(run.blog.user.plan),
      }));
    }),
    ...articleRuns.map((run) => ({
      at: run.createdAt, kind: "Article" as const, blogName: run.blog.name, ownerEmail: run.blog.user.email,
      message: run.error ?? "Failed", paidBy: payer(run.blog.user.plan),
    })),
  ];
  return { problems: problems.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, LIMIT), failedSeoCalls };
}
