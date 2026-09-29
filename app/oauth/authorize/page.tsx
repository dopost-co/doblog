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
            Choose every blog you want it to manage on your behalf with the permissions below.
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
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Blogs</legend>
                <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-input bg-card p-3">
                  {blogs.map((blog) => (
                    <label key={blog.id} className="flex cursor-pointer items-start gap-3 text-sm">
                      <input
                        type="checkbox"
                        name="blog_ids"
                        value={blog.id}
                        defaultChecked
                        className="mt-0.5 size-4 rounded border-input"
                      />
                      <span>
                        <span className="block font-medium">{blog.name}</span>
                        <span className="block text-xs text-muted-foreground">{blog.slug}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <p className="text-xs text-muted-foreground">
                {clientName} will only be able to access the blogs selected here. You can reconnect later to change
                this selection or revoke the connection from {clientName}&apos;s own settings.
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
