/**
 * Onboarding steps, in order. To add a step, add an entry here and (if it
 * saves anything) a handler with the same id in
 * src/server/services/onboarding/actions.ts. Removing an entry removes the step.
 */
export type OnboardingField = {
  name: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
  /** Lets the user add several values, e.g. more than one blog. */
  multiple?: boolean;
  addLabel?: string;
};

export type OnboardingStep = {
  id: string;
  title: string;
  description?: string;
  fields: OnboardingField[];
};

export const ONBOARDING_STEPS = [
  {
    id: "profile",
    title: "What’s your name?",
    fields: [{ name: "name", label: "Name", placeholder: "Jane Doe", required: true, maxLength: 80 }],
  },
  {
    id: "blogs",
    title: "Name your blog",
    description: "You can add more later.",
    fields: [{ name: "blogs", label: "Blog name", placeholder: "My blog", required: true, maxLength: 120, multiple: true, addLabel: "Add another blog" }],
  },
] as const satisfies readonly OnboardingStep[];

export type OnboardingStepId = typeof ONBOARDING_STEPS[number]["id"];
export type OnboardingValues = Record<string, string | string[]>;

export function stepIndex(id: string | null | undefined) {
  const index = ONBOARDING_STEPS.findIndex((step) => step.id === id);
  return index === -1 ? 0 : index;
}
