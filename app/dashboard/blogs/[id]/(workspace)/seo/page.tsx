import { permanentRedirect } from "next/navigation";

export default async function LegacyGrowthPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const [{ id }, { view }] = await Promise.all([params, searchParams]);
  const suffix = view === "ideas" || view === "settings" ? `?view=${view}` : "";
  permanentRedirect(`/dashboard/blogs/${id}/autopilot${suffix}`);
}
