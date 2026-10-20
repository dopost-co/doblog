"use client";

import { useEffect, useRef } from "react";
import EditorJS, { OutputData, type InlineToolConstructable } from "@editorjs/editorjs";
import Header from "@editorjs/header";
import List from "@editorjs/list";
import Quote from "@editorjs/quote";
import Code from "@editorjs/code";
import LinkTool from "@editorjs/link";
import Image from "@editorjs/image";
import Table from "@editorjs/table";
import RawTool from "@editorjs/raw";
import Delimiter from "@editorjs/delimiter";
import InlineCode from "@editorjs/inline-code";
import { attachMarkdownSupport } from "./markdown-support";
import { toast } from "sonner";
import { LinkEditorDialog } from "./LinkEditorDialog";
import { ModalLinkTool } from "./link-tool";

interface EditorProps {
  data?: OutputData;
  onChange?: (data: OutputData) => void;
  placeholder?: string;
  blogId: string;
}

export function Editor({ data, onChange, placeholder, blogId }: EditorProps) {
  const editorRef = useRef<EditorJS | null>(null);
  const holderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!holderRef.current) return;

    if (!editorRef.current) {
      editorRef.current = new EditorJS({
        holder: holderRef.current,
        placeholder: placeholder || "Start writing or use '/' for commands",
        data: data || {
          blocks: [],
        },
        tools: {
          // Editor.js supports MenuConfig, but its constructor type still requires HTMLElement.
          link: ModalLinkTool as unknown as InlineToolConstructable,
          header: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            class: Header as any,
            inlineToolbar: true,
            config: {
              placeholder: "Enter a header",
              levels: [1, 2, 3, 4],
              defaultLevel: 2,
            },
          },
          list: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            class: List as any,
            inlineToolbar: true,
            config: {
              defaultStyle: "unordered",
            },
          },
          quote: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            class: Quote as any,
            inlineToolbar: true,
            shortcut: "CMD+SHIFT+O",
            config: {
              quotePlaceholder: "Enter a quote",
              captionPlaceholder: "Quote's author",
            },
          },
          code: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            class: Code as any,
            config: {
              placeholder: "Enter code",
            },
          },
          table: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            class: Table as any,
            inlineToolbar: true,
            // Only new blocks get headings; existing tables retain their choice.
            toolbox: { title: "Table", data: { withHeadings: true } },
            config: {
              rows: 2,
              cols: 3,
            },
          },
          linkTool: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            class: LinkTool as any,
            config: {
              endpoint: "/api/link",
            },
          },
          image: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            class: Image as any,
            config: {
              uploader: {
                async uploadByFile(file: File) {
                  try {
                    const formData = new FormData();
                    formData.append('image', file);
                    formData.append('blogId', blogId);

                    const response = await fetch('/api/upload', {
                      method: 'POST',
                      body: formData,
                    });

                    const data = await response.json();

                    if (!response.ok) {
                      throw new Error(data.error || 'Upload failed');
                    }

                    return data;
                  } catch (error) {
                    console.error('Image upload error:', error);
                    toast.error(error instanceof Error ? error.message : 'The image could not be uploaded');
                    return {
                      success: 0,
                      error: error instanceof Error ? error.message : 'Upload failed',
                    };
                  }
                },
              },
            },
          },
          raw: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            class: RawTool as any,
            config: {
              placeholder: "Paste HTML embed code (Twitter, YouTube, etc.)",
            },
          },
          delimiter: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            class: Delimiter as any,
          },
          inlineCode: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            class: InlineCode as any,
            shortcut: "CMD+SHIFT+M",
          },
        },
        onChange: async () => {
          if (editorRef.current && onChange) {
            const outputData = await editorRef.current.save();
            onChange(outputData);
          }
        },
      });
    }

    const editor = editorRef.current;
    const holder = holderRef.current;
    let detachMarkdown: (() => void) | undefined;
    let cancelled = false;
    editor.isReady.then(() => {
      if (!cancelled) detachMarkdown = attachMarkdownSupport(editor, holder);
    }).catch(() => undefined);

    return () => {
      cancelled = true;
      detachMarkdown?.();
      if (editorRef.current && editorRef.current.destroy) {
        editorRef.current.destroy();
        editorRef.current = null;
      }
    };
  }, []);

  return (
    <>
      <div className="prose prose-sm max-w-none">
        <div ref={holderRef} className="min-h-[400px]" />
      </div>
      <LinkEditorDialog holderRef={holderRef} editorRef={editorRef} />
    </>
  );
}
