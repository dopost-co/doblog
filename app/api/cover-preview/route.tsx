import { getSession } from "@/lib/get-session";
import { prisma } from "@/lib/prisma";
import { LOGO_POSITIONS } from "@/lib/autopilot/logo";
import { coverTypography, thumbnailColors } from "@/lib/autopilot/thumbnail-templates";
import { renderCoverPng } from "@/src/server/services/growth/cover-render";
import { loadLogo, normalizeLogoUrl } from "@/src/server/services/growth/image-references";
import { withLogo } from "@/src/server/services/growth/images";

const flag = (value: string | null) => (value === null ? undefined : value === "1");

const isLogoPosition = (value: string | null): value is (typeof LOGO_POSITIONS)[number] =>
  Boolean(value) && (LOGO_POSITIONS as readonly string[]).includes(value!);

/**
 * Live preview of a brand thumbnail for the settings form, logo included so the
 * mark is placed before anything is generated. Signed-in owners only: it reads
 * the blog's logo, so the blog is checked against the session.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const params = new URL(request.url).searchParams;

  const blogId = params.get("blogId");
  const position = params.get("logoPosition");
  let logo: Buffer | null = null;
  if (blogId && isLogoPosition(position)) {
    const blog = await prisma.blog.findFirst({
      where: { id: blogId, userId: session.user.id, deletedAt: null },
      select: { id: true },
    });
    if (!blog) return new Response("Not found", { status: 404 });
    // A logo URL outside this blog's own uploads is rejected by normalizeLogoUrl.
    try { logo = await loadLogo(blogId, normalizeLogoUrl(blogId, params.get("logoUrl"))); } catch { logo = null; }
  }

  const png = await renderCoverPng({
    title: (params.get("title") || "Content batching").slice(0, 300),
    colors: thumbnailColors((params.get("colors") ?? "").split(",")),
    typography: coverTypography({
      font: params.get("font"), size: params.get("size"), align: params.get("align"),
      // Missing flags keep the defaults.
      bold: flag(params.get("bold")),
    }),
    illustration: params.get("format") === "template_illustration" ? "placeholder" : null,
  });

  const image = logo && isLogoPosition(position)
    ? await withLogo({ bytes: png, mimeType: "image/png", origin: "template", prompt: null, model: null }, { bytes: logo, position })
    : { bytes: png };

  return new Response(new Uint8Array(image.bytes), {
    headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=300" },
  });
}
