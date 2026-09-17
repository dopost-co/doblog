import { redirect } from "next/navigation";
import { getSession } from "@/lib/get-session";
import { safeCallbackUrl } from "@/lib/safe-redirect";
import { AuthPage } from "@/components/AuthPage/AuthPage";

export default async function Home({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const session = await getSession();
  const callbackUrl = safeCallbackUrl((await searchParams).callbackUrl);

  if (session) {
    redirect(callbackUrl);
  }

  return <AuthPage callbackUrl={callbackUrl} />;
}
