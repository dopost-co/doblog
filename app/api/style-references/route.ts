import { getSession } from "@/lib/get-session";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/integrations/errors";
import { checkOrigin, errorResponse, privateJson } from "@/lib/integrations/http";
import { MAX_STYLE_REFERENCE_BYTES, uploadStyleReference } from "@/src/server/services/growth/image-references";

/** Uploads a style reference for generated images. Blog owners only. */
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
    const blog = await prisma.blog.findFirst({ where: { id: blogId, userId: session.user.id, deletedAt: null }, select: { id: true } });
    if (!blog) throw new ApiError(403, "Only the blog owner can add style references");
    const url = await uploadStyleReference(blog.id, Buffer.from(await file.arrayBuffer()), file.type);
    return privateJson({ url });
  } catch (error) { return errorResponse(error); }
}
