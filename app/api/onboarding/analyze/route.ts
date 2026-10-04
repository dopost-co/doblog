import { z } from "zod";
import { getSession } from "@/lib/get-session";
import { ApiError, apiError } from "@/lib/integrations/errors";
import { checkOrigin, errorResponse } from "@/lib/integrations/http";
import { requireBlogPermission } from "@/src/server/services/blogs/access";
import { analyzeWebsite, applySiteAnalysis } from "@/src/server/services/onboarding/site-analysis";
import type { AnalysisMessage } from "@/lib/onboarding/analysis";

/** Reading the site, searching the web and looking at its images takes a while. */
export const maxDuration = 180;

const bodySchema = z.object({ blogId: z.string().min(1).max(128), website: z.string().trim().min(3).max(2048) }).strict();

/**
 * Analyzes the blog's website during setup and saves what it finds. Streams
 * one JSON object per line: each stage's progress, then the result (or an error).
 */
export async function POST(request: Request) {
  let input: z.infer<typeof bodySchema>;
  try {
    checkOrigin(request);
    const session = await getSession();
    if (!session?.user?.id) throw new ApiError(401, "Unauthorized");
    input = bodySchema.parse(await request.json());
    await requireBlogPermission(input.blogId, "autopilot.manage");
  } catch (error) { return errorResponse(error); }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // The analysis finishes and is saved even if the browser leaves the page.
      const send = (value: AnalysisMessage) => {
        try { controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`)); } catch { /* Stream closed by the client. */ }
      };
      try {
        const analysis = await analyzeWebsite(input.blogId, input.website, event => send({ type: "stage", ...event }));
        await applySiteAnalysis(input.blogId, analysis);
        send({ type: "result", analysis });
      } catch (error) {
        send({ type: "error", error: apiError(error).error });
      } finally {
        try { controller.close(); } catch { /* Already closed. */ }
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
