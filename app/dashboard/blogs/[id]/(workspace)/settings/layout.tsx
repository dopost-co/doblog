import { PageHeader } from "@/components/PageHeader/PageHeader";
import { SettingsNav } from "@/components/SettingsNav/SettingsNav";

export default async function BlogSettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <PageHeader title="Settings" />
      <div className="flex flex-col gap-6 border-t pt-6 lg:flex-row lg:gap-10">
        <aside className="lg:w-44 lg:shrink-0">
          <SettingsNav blogId={id} />
        </aside>
        <div className="min-w-0 flex-1 lg:max-w-2xl">{children}</div>
      </div>
    </div>
  );
}
