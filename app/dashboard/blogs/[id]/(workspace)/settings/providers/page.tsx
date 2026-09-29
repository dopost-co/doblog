import { redirect } from "next/navigation";
import { getSession } from "@/lib/get-session";
import { getBlogById } from "@/src/server/services/blogs/queries";
import { getProviderSettings } from "@/src/server/services/providers/actions";
import { ProvidersManager } from "@/components/ProviderKeys/ProvidersManager";
import { SettingsSectionHeader } from "@/components/SettingsNav/SettingsNav";

export default async function BlogProvidersPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  const { id } = await params;
  const blog = await getBlogById(id);
  if (!blog) redirect("/dashboard");

  // Keys belong to the account that owns the blog, so only the owner manages them here.
  if (blog.userId !== session?.user?.id) {
    return (
      <div className="space-y-6">
        <SettingsSectionHeader title="Providers" />
        <p className="text-sm text-muted-foreground">Managed by the blog owner.</p>
      </div>
    );
  }

  const settings = await getProviderSettings();
  return (
    <div className="space-y-6">
      <SettingsSectionHeader title="Providers" description="Shared by all your blogs." />
      <ProvidersManager settings={settings} />
    </div>
  );
}
