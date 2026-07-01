/* Cambrian Web UI — the shadcn/ui cn() utility.
 *
 * Per UI-001 v0.2 (Tailwind v4 + shadcn/ui component library).
 * clsx for conditional class composition, tailwind-merge to resolve Tailwind
 * conflicts (e.g. `p-2` vs `p-4` → `p-4` wins). The standard shadcn/ui cn().
 */

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
