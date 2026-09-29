import type { ComponentType } from "react";
import { OnboardingTool } from "./tools/OnboardingTool";

/**
 * Tools shown in the dev tools panel, in order. To add one, create a component
 * in ./tools and register it here.
 */
export type DevTool = { id: string; title: string; component: ComponentType };

export const DEV_TOOLS: DevTool[] = [
  { id: "onboarding", title: "Onboarding", component: OnboardingTool },
];
