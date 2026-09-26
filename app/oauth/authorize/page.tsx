import { redirect } from "next/navigation";
import { getSession } from "@/lib/get-session";
import { getBlogsByUserId } from "@/src/server/services/blogs/queries";
import { OAuthError, validateAuthorizationRequest } from "@/lib/integrations/oauth";
import { SCOPE_DESCRIPTIONS } from "@/lib/integrations/scopes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type SearchParams = Record<string, string | string[] | undefined>;

function single(params: SearchParams, key: string): string {
  const value = params[key];
  return typeof value === "string" ? value : "";
}

export default async function OAuthAuthorizePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const query = await searchParams;
  const input = {
    clientId: single(query, "client_id"),
    redirectUri: single(query, "redirect_uri"),
    responseType: single(query, "response_type"),
    codeChallenge: single(query, "code_challenge"),
    codeChallengeMethod: single(query, "code_challenge_method"),
    resource: single(query, "resource") || null,
    scope: single(query, "scope") || null,
  };

  let authorization: Awaited<ReturnType<typeof validateAuthorizationRequest>>;
  try {
    authorization = await validateAuthorizationRequest(input);
  } catch (error) {
    const message = error instanceof OAuthError ? error.message : "The authorization request is invalid.";
    return <AuthorizationError message={message} />;
  }

  const session = await getSession();
  if (!session?.user?.id || !session.user.email) {
    const callback = `/oauth/authorize?${new URLSearchParams(
      Object.entries(query).flatMap(([key, value]) => (typeof value === "string" ? [[key, value]] : [])),
    ).toString()}`;
    redirect(`/?callbackUrl=${encodeURIComponent(callback)}`);
  }

  const blogs = await getBlogsByUserId(session.user.id, session.user.email);
  if (blogs.length === 0) {
    return <AuthorizationError message="Create a blog first, then start the connection again from your MCP client." />;
  }

  const hidden: Record<string, string> = {
    client_id: input.clientId,
    redirect_uri: authorization.redirectUri,
    response_type: input.responseType,
    code_challenge: input.codeChallenge,
    code_challenge_method: input.codeChallengeMethod,
    resource: authorization.resource,
    scope: authorization.scopes.join(" "),
    state: single(query, "state"),
  };
  const clientName = authorization.client.clientName?.trim() || "This app";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Connect {clientName}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            It will be able to manage one of your blogs on your behalf with the permissions below.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Requested permissions</CardTitle>
            <CardDescription>{clientName} is asking for:</CardDescription>
          </CardHeader>
          <CardContent>
            <form action="/api/oauth/authorize" method="post" className="space-y-4">
              {Object.entries(hidden).map(([name, value]) => (
                <input key={name} type="hidden" name={name} value={value} />
              ))}
              <ul className="space-y-2 text-sm">
                {authorization.scopes.map((scope) => (
                  <li key={scope} className="flex gap-2">
                    <span aria-hidden>&bull;</span>
                    <span>{SCOPE_DESCRIPTIONS[scope]}</span>
                  </li>
                ))}
              </ul>
              <div className="space-y-2">
                <label htmlFor="blog_id" className="text-sm font-medium">Blog</label>
                <select
                  id="blog_id"
                  name="blog_id"
                  required
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                >
                  {blogs.map((blog) => (
                    <option key={blog.id} value={blog.id}>{blog.name}</option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-muted-foreground">
                {clientName} will only be able to access this blog with the permissions above. You can revoke this
                connection from {clientName}&apos;s own settings. To connect another blog, add another connection and
                choose it here.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Button type="submit" name="decision" value="deny" variant="outline">Cancel</Button>
                <Button type="submit" name="decision" value="approve">Connect</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function AuthorizationError({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle>Cannot connect this client</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{message}</p>
        </CardContent>
      </Card>
    </div>
  );
}
