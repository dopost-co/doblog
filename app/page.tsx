import { redirect } from "next/navigation";
import { getSession } from "@/lib/get-session";
import { safeCallbackUrl } from "@/lib/safe-redirect";
import { AuthPage } from "@/components/AuthPage/AuthPage";

export default async function Home({ searchParams }: { searchParams: Promise<{ callbackUrl?: string; email?: string }> }) {
  const session = await getSession();
  const params = await searchParams;
  const callbackUrl = safeCallbackUrl(params.callbackUrl);
  const invitedEmail = typeof params.email === "string" && params.email.length <= 320 ? params.email.trim().toLowerCase() : "";

  if (session) {
    redirect(callbackUrl);
  }

  return <AuthPage callbackUrl={callbackUrl} invitedEmail={invitedEmail} />;
}
