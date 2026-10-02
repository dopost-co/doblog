import { notFound } from "next/navigation";
import { getSession } from "@/lib/get-session";
import { isAdminEmail } from "@/lib/admin";
import { ApiError } from "@/lib/integrations/errors";

/** The signed-in administrator, or a 403 for anyone else (server actions). */
export async function requireAdmin() {
  const session = await getSession();
  if (!session?.user?.id || !isAdminEmail(session.user.email)) throw new ApiError(403, "Only administrators can do this");
  return { id: session.user.id, email: session.user.email! };
}

/** For admin pages: anyone else gets a plain 404, so the page does not advertise itself. */
export async function requireAdminPage() {
  const session = await getSession();
  if (!session?.user?.id || !isAdminEmail(session.user.email)) notFound();
  return { id: session.user.id, email: session.user.email! };
}
