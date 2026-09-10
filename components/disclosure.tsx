"use client";

import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

/**
 * Bordered card with a titled, keyboard-operable header that reveals its
 * body. `trailing` renders on the right of the header outside the trigger so
 * it can hold links or status text without nesting interactive elements.
 */
export function Disclosure({
  title,
  trailing,
  onOpenChange,
  className,
  children,
}: {
  title: ReactNode;
  trailing?: ReactNode;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Collapsible
      onOpenChange={onOpenChange}
      className={cn("rounded-xl border", className)}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <CollapsibleTrigger className="group -mx-1 flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 text-left text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <ChevronRight
            className="size-4 shrink-0 text-muted-foreground transition-transform group-aria-expanded:rotate-90"
            aria-hidden="true"
          />
          {title}
        </CollapsibleTrigger>
        {trailing ? (
          <div className="flex shrink-0 items-center text-xs text-muted-foreground">
            {trailing}
          </div>
        ) : null}
      </div>
      <CollapsibleContent className="border-t px-4 py-4">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
