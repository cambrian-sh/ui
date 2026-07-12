/* Tools & Skills route.
 *
 * Tools are deterministic capability declarations (TraitTool agents). Skills
 * are named instruction bundles the LLM may invoke. Both carry an explicit
 * Scope (required / any-of / forbidden tags) and a k-anonymity floor.
 *
 * Surfaces here:
 *  - Per-tool card: name, scope, grant state (operator-only toggle)
 *  - Per-skill card: name, instructions, tool grants
 *  - "Used by" backlink: which Cognitive/Model agents reference this tool
 *  - Blast-radius preview before any grant/revoke mutation
 *
 * Per PRD story 19: "As an operator, I can grant or revoke a tool for an
 * agent and see the blast radius before I commit."
 */

import { createFileRoute } from '@tanstack/react-router';
import { ToolsSkillsConsole } from '@/screens/tools/ToolsSkillsConsole';

export const Route = createFileRoute('/tools')({
  validateSearch: (search: Record<string, unknown>) => ({
    focus: search.focus as string | undefined,
    tab: search.tab as 'tools' | 'skills' | undefined,
  }),
  component: ToolsSkillsConsole,
});
