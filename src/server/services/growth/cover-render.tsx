import { ImageResponse } from "next/og";
import { COVER_SIZE, type CoverTypography } from "@/lib/autopilot/thumbnail-templates";
import { COVER_FONT_FAMILY, CoverTemplate, coverTitleBox, type CoverTemplateProps } from "@/components/Growth/CoverTemplate";
import { FONT_TRACKING, fitTitle, fontFile } from "./cover-fonts";

export type CoverInput = Pick<CoverTemplateProps, "blogName" | "colors" | "illustration"> & {
  title: string;
  typography: CoverTypography;
};

/**
 * Draws a brand thumbnail to PNG bytes (see components/Growth/CoverTemplate.tsx
 * for the design). The title is sized, and if needed shortened, to fit first.
 */
export async function renderCoverPng({ title, typography, ...rest }: CoverInput) {
  const weight = typography.bold ? 700 : 400;
  const fitted = fitTitle(title, typography.font, weight, coverTitleBox(Boolean(rest.illustration), typography.size));
  const response = new ImageResponse(
    <CoverTemplate {...rest} title={fitted.text} titleSize={fitted.size} tracking={FONT_TRACKING[typography.font]} typography={typography} />,
    {
      ...COVER_SIZE,
      fonts: ([400, 700] as const).map((fontWeight) => ({
        name: COVER_FONT_FAMILY, data: fontFile(typography.font, fontWeight), weight: fontWeight, style: "normal" as const,
      })),
    },
  );
  return Buffer.from(await response.arrayBuffer());
}
