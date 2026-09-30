import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        // Soft, slightly glossy surface: a light top edge and a shaded bottom inside the button, pressed in on click.
        // White in light mode (a stronger border than outline keeps it primary); a raised dark surface in dark mode.
        default: [
          "border border-neutral-300 bg-linear-to-b from-white to-neutral-100 text-foreground",
          "shadow-[inset_0_1px_0_rgb(255_255_255),inset_0_-2px_1px_rgb(0_0_0/0.06),0_1px_2px_rgb(0_0_0/0.08)]",
          "hover:from-neutral-50 hover:to-neutral-200/70",
          "active:shadow-[inset_0_2px_3px_rgb(0_0_0/0.1)] active:from-neutral-100 active:to-neutral-100",
          "dark:border-white/10 dark:from-neutral-700 dark:to-neutral-800 dark:text-foreground",
          "dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.12),inset_0_-2px_1px_rgb(0_0_0/0.3),0_1px_2px_rgb(0_0_0/0.4)]",
          "dark:hover:from-neutral-600 dark:hover:to-neutral-700 dark:active:shadow-[inset_0_2px_3px_rgb(0_0_0/0.4)] dark:active:from-neutral-800 dark:active:to-neutral-800",
        ].join(" "),
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border border-border bg-card shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-field dark:border-input dark:hover:bg-accent",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
