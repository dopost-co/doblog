import { revokeToken } from "@/lib/integrations/oauth";

export async function POST(request: Request) {
  const form = await request.formData();
  const token = String(form.get("token") || "");
  const clientId = String(form.get("client_id") || "");
  if (token && clientId) await revokeToken(token, clientId);
  return new Response(null, { status: 200, headers: { "Cache-Control": "no-store" } });
}
