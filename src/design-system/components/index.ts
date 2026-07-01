/* The design-system component inventory.
 *
 * Re-exports every shadcn/ui primitive (customised to consume our 4-layer
 * component tokens) + every Cambrian-specific component. Screens import from
 * `@/design-system/components`, never from internal paths.
 */

export * from "./ui/button";
export * from "./ui/card";
export * from "./ui/separator";
export * from "./ui/scroll-area";
export * from "./ui/input";
export * from "./ui/dialog";
export * from "./ui/popover";
export * from "./ui/tooltip";
export * from "./ui/select";
export * from "./ui/tabs";
export * from "./cambrian/nav-rail";
export * from "./cambrian/status-strip";
export * from "./cambrian/skeleton";
export * from "./cambrian/empty-state";
export * from "./cambrian/error-state";
export * from "./cambrian/memory-list-row";
export * from "./cambrian/memory-list";
export * from "./cambrian/audit-entry";
export * from "./cambrian/audit-list";
export * from "./cambrian/chat-message";
export * from "./cambrian/chat-input";
export * from "./cambrian/inject-input";
export * from "./cambrian/plan-card";
export * from "./cambrian/bid-panel";
export * from "./cambrian/agent-output-stream";
export * from "./cambrian/hitl-inline";
