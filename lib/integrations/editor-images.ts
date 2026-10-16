export type EditorImageInput = {
  url: string;
  alt: string;
  caption: string;
  afterBlockId?: string;
};

type EditorBlock = {
  id?: string;
  type: string;
  data: Record<string, unknown>;
  tunes?: Record<string, unknown>;
};

type EditorDocument = {
  time?: number;
  version?: string;
  blocks: EditorBlock[];
};

/**
 * Adds uploaded images to the current Editor.js document without accepting a
 * stale text snapshot from the caller. Existing and repeated URLs are skipped,
 * which makes a retried image-only request safe.
 */
export function mergeUploadedImages(content: unknown, images: EditorImageInput[]) {
  const candidate = content as { blocks?: unknown } | null;
  if (!Array.isArray(candidate?.blocks)) return null;
  const document = content as EditorDocument;

  const blocks = document.blocks.map((block) => ({ ...block, data: { ...block.data } }));
  const existingUrls = new Set(blocks.flatMap((block) => {
    const file = block.type === "image" ? block.data.file as { url?: unknown } | undefined : undefined;
    return typeof file?.url === "string" ? [file.url] : [];
  }));
  const pending = images.flatMap((image, order) => {
    if (existingUrls.has(image.url)) return [];
    existingUrls.add(image.url);
    const match = image.afterBlockId ? blocks.findIndex((block) => block.id === image.afterBlockId) : -1;
    return [{ image, order, at: match >= 0 ? match + 1 : blocks.length }];
  }).sort((a, b) => b.at - a.at || b.order - a.order);

  for (const { image, at } of pending) {
    blocks.splice(at, 0, {
      type: "image",
      data: {
        file: { url: image.url },
        alt: image.alt,
        caption: image.caption || image.alt,
        withBorder: false,
        withBackground: false,
        stretched: false,
      },
    });
  }

  return {
    added: pending.length,
    content: pending.length ? { ...document, time: Date.now(), blocks } : document,
  };
}
