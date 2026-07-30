import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/design-system/lib/utils";

/**
 * An edge-anchored panel. Built on the dialog primitive already in the bundle
 * rather than a second overlay library, so focus trapping, escape handling and
 * scroll locking behave exactly like every other modal surface here.
 *
 * Its main job is the mobile approval sheet (side="bottom"), where the decision
 * has to be readable and reversible under a thumb.
 */
const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;
const SheetPortal = DialogPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn("fixed inset-0 z-50 bg-[var(--dialog-overlay-bg)]", className)}
    {...props}
  />
));
SheetOverlay.displayName = DialogPrimitive.Overlay.displayName;

const sheetVariants = cva(
  "fixed z-50 flex flex-col bg-[var(--bg-elevated)] focus-visible:outline-none",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 rounded-b-[var(--radius-sheet)]",
        bottom:
          "inset-x-0 bottom-0 rounded-t-[var(--radius-sheet)] shadow-[var(--elevation-sheet)]",
        left: "inset-y-0 left-0 h-full w-3/4 max-w-sm shadow-[var(--elevation-3)]",
        right:
          "inset-y-0 right-0 h-full w-3/4 max-w-sm shadow-[var(--elevation-3)]",
      },
    },
    defaultVariants: { side: "bottom" },
  },
);

export interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>,
    VariantProps<typeof sheetVariants> {
  /** The 38×4px drag handle. Bottom sheets get one; edge panels do not. */
  showGrabber?: boolean;
}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  SheetContentProps
>(({ side = "bottom", showGrabber, className, children, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(sheetVariants({ side }), className)}
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      {...props}
    >
      {(showGrabber ?? side === "bottom") && (
        <div
          aria-hidden="true"
          className="mx-auto mt-2.5 h-1 w-[38px] shrink-0 rounded-full bg-[var(--border-strong)]"
        />
      )}
      {children}
    </DialogPrimitive.Content>
  </SheetPortal>
));
SheetContent.displayName = DialogPrimitive.Content.displayName;

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-[17px] font-medium leading-[1.4] text-[var(--fg-primary)]",
      className,
    )}
    {...props}
  />
));
SheetTitle.displayName = DialogPrimitive.Title.displayName;

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-[13px] leading-[1.55] text-[var(--fg-secondary)]", className)}
    {...props}
  />
));
SheetDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetPortal,
  SheetOverlay,
  SheetContent,
  SheetTitle,
  SheetDescription,
};
