/** What an image should depict, read from an article that already exists. */

const plain = (value: string) => value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

export type SubjectPost = { title: string; excerpt: string | null; content: unknown };

/**
 * The prompt for a cover or an inline image of an existing article: its topic
 * for a cover, its first section for an inline image. Generation writes its own
 * prompts while drafting; this is for covers made afterwards, by a preview or a
 * refresh, where only the saved article is available.
 */
export function imageSubject(kind: "cover" | "inline", post: SubjectPost) {
  const blocks = ((post.content as { blocks?: Array<{ type?: string; data?: { text?: unknown } }> } | null)?.blocks ?? []);
  if (kind === "cover") return `Cover image for an article titled "${post.title}". ${plain(post.excerpt ?? "")}`.slice(0, 900);
  const headingIndex = blocks.findIndex((block) => block.type === "header" && typeof block.data?.text === "string");
  const heading = headingIndex >= 0 ? plain(String(blocks[headingIndex].data!.text)) : post.title;
  const paragraph = blocks.slice(headingIndex + 1).find((block) => block.type === "paragraph" && typeof block.data?.text === "string");
  return `Explanatory image for the section "${heading}" of an article titled "${post.title}". ${plain(String(paragraph?.data?.text ?? post.excerpt ?? ""))}`.slice(0, 900);
}
