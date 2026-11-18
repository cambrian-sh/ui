// Deliberately empty stand-in for @types/node (ENG-2042).
//
// The webview code and its vitest tests must not use Node APIs: ui has no
// @types/node, and CI's `tsc --noEmit` rejects `node:fs`, `__dirname` and
// friends. But library declarations (vite's dist/node/index.d.ts) carry
// `/// <reference types="node" />`, and TypeScript resolves that by walking
// every ancestor node_modules, so a stray @types/node above the checkout (a
// home-directory node_modules) silently pulled Node's globals and ambient
// `node:*` modules into the program: Node-only code typechecked on such a
// machine and failed in CI. tsconfig.json lists this directory in
// `typeRoots`, so that reference resolves here first, to nothing, on every
// machine alike. Do not add declarations to this file.
export {};
