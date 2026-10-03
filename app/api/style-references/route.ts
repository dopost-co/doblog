import { getSession } from "@/lib/get-session";
import { ApiError } from "@/lib/integrations/errors";
import { checkOrigin, errorResponse, privateJson } from "@/lib/integrations/http";
import { MAX_STYLE_REFERENCE_BYTES, uploadBrandAsset } from "@/src/server/services/growth/image-references";
import { requireBlogPermission } from "@/src/server/services/blogs/access";

/** Uploads a style reference, or the brand logo with kind=logo, for generated images. Blog owners only. */
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const session = await getSession();
    if (!session?.user?.id) throw new ApiError(401, "Unauthorized");
    // Bound multipart parsing even when Content-Length is missing or untrusted.
    const limit = MAX_STYLE_REFERENCE_BYTES + 64 * 1024;
    if (Number(request.headers.get("content-length")) > limit) throw new ApiError(413, "Use an image under 8 MB");
    let size = 0;
    const stream = request.body?.pipeThrough(new TransformStream({
      transform(chunk, controller) {
        size += chunk.byteLength;
        if (size > limit) throw new ApiError(413, "Use an image under 8 MB");
        controller.enqueue(chunk);
      },
    }));
    if (!stream) throw new ApiError(400, "Upload required");
    const formData = await new Response(stream, { headers: request.headers }).formData();
    const file = formData.get("image");
    const blogId = formData.get("blogId");
    if (!(file instanceof File) || typeof blogId !== "string") throw new ApiError(400, "Image and blogId required");
    await requireBlogPermission(blogId, "autopilot.manage");
    const kind = formData.get("kind") === "logo" ? "brand" : "references";
    const url = await uploadBrandAsset(blogId, kind, Buffer.from(await file.arrayBuffer()), file.type);
    return privateJson({ url });
  } catch (error) { return errorResponse(error); }
}
