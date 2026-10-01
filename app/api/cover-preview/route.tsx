import { getSession } from "@/lib/get-session";
import { coverTypography, thumbnailColors } from "@/lib/autopilot/thumbnail-templates";
import { renderCoverPng } from "@/src/server/services/growth/cover-render";

const flag = (value: string | null) => (value === null ? undefined : value === "1");

/** Live preview of a brand thumbnail for the settings form. Signed-in users only. */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const params = new URL(request.url).searchParams;
  const png = await renderCoverPng({
    title: (params.get("title") || "How to plan a month of articles in one afternoon").slice(0, 300),
    blogName: (params.get("blog") || "Your blog").slice(0, 80),
    colors: thumbnailColors((params.get("colors") ?? "").split(",")),
    typography: coverTypography({
      font: params.get("font"), size: params.get("size"), align: params.get("align"),
      // Missing flags keep the defaults.
      bold: flag(params.get("bold")), showBlogName: flag(params.get("name")),
    }),
    illustration: params.get("format") === "template_illustration" ? "placeholder" : null,
  });
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=300" } });
}
