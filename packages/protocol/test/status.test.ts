import { describe, expect, it } from "vitest";

import { InvalidSessionTransitionError, canTransition, assertTransition } from "../src/index.js";

describe("print session transitions", () => {
  it("allows the one-way happy path", () => {
    const path = [
      "waiting",
      "claimed",
      "upload_authorized",
      "uploading",
      "uploaded",
      "consumed",
      "validating",
      "printing",
      "completed",
    ] as const;
    for (let index = 0; index < path.length - 1; index += 1) {
      expect(canTransition(path[index]!, path[index + 1]!)).toBe(true);
    }
  });

  it("rejects reactivation and duplicate printing", () => {
    expect(canTransition("completed", "printing")).toBe(false);
    expect(canTransition("printing", "printing")).toBe(false);
    expect(() => assertTransition("completed", "waiting")).toThrow(InvalidSessionTransitionError);
  });
});
