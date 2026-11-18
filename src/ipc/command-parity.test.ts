// @vitest-environment node
/**
 * Every Tauri command the webview invokes must be registered by the Rust core,
 * and every registered command must have a webview caller.
 *
 * The rest of the suite runs on the IPC mock (`mock.ts`), which implements every
 * method itself — so a command the Rust core never registered passes every test
 * and fails only in the real app. That is exactly how Settings > Telemetry shipped
 * dead (T-20261106-langfuse-secret-key-cannot-be-set-from-the). This is the cheap
 * first layer of T-20261031-ui-tests-never-leave-the-ipc-mock-no-test: it reads
 * the source, so it needs neither a Tauri runtime nor a kernel.
 */
import { describe, it, expect } from 'vitest';

// The webview tsconfig carries no Node types (no @types/node), so `node:fs`
// is loaded through a string-typed specifier, as tokens.test.ts does; a
// static import typechecked only where an ancestor directory happened to
// hold @types/node, and failed CI's `bun run typecheck` (ENG-2037). Paths
// are relative to the ui/ package root, where vitest runs.
type Fs = {
  readdirSync(dir: string): string[];
  readFileSync(file: string, encoding: 'utf8'): string;
};
const fsModule: string = 'node:fs';
const { readFileSync, readdirSync } = (await import(/* @vite-ignore */ fsModule)) as Fs;

const IPC_DIR = 'src/ipc';
const LIB_RS = 'src-tauri/src/lib.rs';

function webviewCommands(): Set<string> {
  const out = new Set<string>();
  const call = /invoke(?:<[^(]*>)?\(\s*'(op_[a-z0-9_]+)'/g;
  for (const f of readdirSync(IPC_DIR)) {
    if (!/\.ts$/.test(f) || /\.test\.ts$/.test(f) || f.startsWith('mock')) continue;
    const src = readFileSync(`${IPC_DIR}/${f}`, 'utf8');
    for (const m of src.matchAll(call)) out.add(m[1]);
  }
  return out;
}

function registeredCommands(): Set<string> {
  const src = readFileSync(LIB_RS, 'utf8');
  const block = /generate_handler!\[([\s\S]*?)\]/.exec(src);
  if (!block) throw new Error('generate_handler! not found in lib.rs');
  return new Set([...block[1].matchAll(/\b(op_[a-z0-9_]+)\b/g)].map((m) => m[1]));
}

describe('webview ↔ Rust command parity', () => {
  const ts = webviewCommands();
  const rs = registeredCommands();

  it('finds the commands on both sides', () => {
    expect(ts.size).toBeGreaterThan(100);
    expect(rs.size).toBeGreaterThan(100);
  });

  it('every command the webview invokes is registered in generate_handler!', () => {
    expect([...ts].filter((c) => !rs.has(c)).sort()).toEqual([]);
  });

  it('every registered command has a webview caller', () => {
    expect([...rs].filter((c) => !ts.has(c)).sort()).toEqual([]);
  });
});
