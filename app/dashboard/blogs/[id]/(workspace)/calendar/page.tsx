import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getBlogAccess } from "@/src/server/services/blogs/access";
import { ContentCalendar } from "@/components/Calendar/ContentCalendar";
import {
  getCalendarRange,
  parseCalendarDate,
  parseCalendarView,
  toDateKey,
  type CalendarPostStatus,
} from "@/components/Calendar/calendar-utils";

export default async function BlogCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;

  const access = await getBlogAccess(id);
  if (!access) redirect("/dashboard");

  // Week and list views exist but are hidden for now; the calendar is month-only.
  const view = parseCalendarView("month");
  const date = parseCalendarDate(query.date);
  const { start, end } = getCalendarRange(view, date);

  const [posts, drafts] = await Promise.all([
    prisma.post.findMany({
      where: { blogId: id, status: { in: ["scheduled", "published"] }, publishedAt: { gte: start, lt: end } },
      select: { id: true, title: true, status: true, publishedAt: true, language: true, coverImage: true, translationGroupId: true },
      orderBy: { publishedAt: "asc" },
      take: 1000,
    }),
    prisma.post.findMany({
      where: { blogId: id, status: "draft" },
      select: { id: true, title: true, language: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),
  ]);

  return (
    <ContentCalendar
      blogId={id}
      view={view}
      date={toDateKey(date)}
      posts={posts.map((post) => ({
        ...post,
        status: post.status as CalendarPostStatus,
        publishedAt: post.publishedAt!.toISOString(),
      }))}
      drafts={drafts.map((draft) => ({ ...draft, updatedAt: draft.updatedAt.toISOString() }))}
      readOnly={!access.can("content.write")}
    />
  );
}
