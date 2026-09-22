import { describe, expect, it } from "vitest";
import { buildInterviewerInstructions } from "@/src/lib/realtime/session";

describe("buildInterviewerInstructions", () => {
  it("mentions the role, type, and difficulty, and forbids coaching", () => {
    const instructions = buildInterviewerInstructions({
      role: "Backend Engineer",
      type: "technical",
      difficulty: "advanced",
    });
    expect(instructions).toContain("Backend Engineer");
    expect(instructions.toLowerCase()).toContain("technical");
    expect(instructions.toLowerCase()).toContain("advanced");
    expect(instructions.toLowerCase()).toContain("do not coach");
  });
});
