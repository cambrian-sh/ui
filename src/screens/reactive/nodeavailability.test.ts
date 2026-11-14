import { describe, expect, it } from "vitest";
import { NO_DISPATCHER, isUnavailableHere, refusalAction } from "./nodeVocabulary";

// ADR-0155 D3 (ENG-1265): the kernel refuses an effect node no runtime in this
// deployment can execute with the stable constraint "no-dispatcher"; the canvas
// greys that node and offers the one move that resolves it.
describe("no-dispatcher refusals", () => {
  it("matches the kernel's stable constraint id", () => {
    expect(NO_DISPATCHER).toBe("no-dispatcher");
  });
  it("marks a node unavailable only for that constraint", () => {
    expect(isUnavailableHere([{ constraint: "no-dispatcher" }])).toBe(true);
    expect(isUnavailableHere([{ constraint: "unwired-port" }])).toBe(false);
    expect(isUnavailableHere([])).toBe(false);
  });
  it("offers removal as the resolving action", () => {
    expect(refusalAction(NO_DISPATCHER)).toMatch(/Remove it/);
  });
});
