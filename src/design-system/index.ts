/* Cambrian Web UI — the design system library entry.
 *
 * Per UI-001 v0.2 (Tailwind v4 + shadcn/ui component library).
 *
 * This is the public surface of the design system. Components, tokens, and
 * utilities are re-exported from here. Screens and other surfaces import from
 * `@/design-system`, never from internal paths.
 *
 * For V1 the library lives in the same package as the app. Cross-frontend
 * distribution uses the shadcn pattern: copy + edit (per the technical
 * document §5.3).
 */

export * from "./tokens";
export { cn } from "./lib/utils";
