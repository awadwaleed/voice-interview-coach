import { describe, expect, it } from "vitest";
import {
  InvalidInterviewConfigError,
  validateInterviewConfig,
} from "@/src/lib/interview/config";

describe("validateInterviewConfig", () => {
  it("accepts a valid config and trims the role", () => {
    const config = validateInterviewConfig({
      role: "  Frontend Engineer  ",
      type: "technical",
      difficulty: "advanced",
    });
    expect(config).toEqual({
      role: "Frontend Engineer",
      type: "technical",
      difficulty: "advanced",
    });
  });

  it("rejects a non-object body", () => {
    expect(() => validateInterviewConfig(undefined)).toThrow(
      InvalidInterviewConfigError,
    );
    expect(() => validateInterviewConfig("nope")).toThrow(
      InvalidInterviewConfigError,
    );
    expect(() => validateInterviewConfig(null)).toThrow(
      InvalidInterviewConfigError,
    );
  });

  it("rejects an empty or whitespace-only role", () => {
    expect(() =>
      validateInterviewConfig({
        role: "   ",
        type: "behavioral",
        difficulty: "entry",
      }),
    ).toThrow(InvalidInterviewConfigError);
  });

  it("rejects a role over the length limit", () => {
    expect(() =>
      validateInterviewConfig({
        role: "a".repeat(101),
        type: "behavioral",
        difficulty: "entry",
      }),
    ).toThrow(InvalidInterviewConfigError);
  });

  it("rejects an invalid interview type", () => {
    expect(() =>
      validateInterviewConfig({
        role: "Engineer",
        type: "casual",
        difficulty: "entry",
      }),
    ).toThrow(InvalidInterviewConfigError);
  });

  it("rejects an invalid difficulty", () => {
    expect(() =>
      validateInterviewConfig({
        role: "Engineer",
        type: "behavioral",
        difficulty: "expert",
      }),
    ).toThrow(InvalidInterviewConfigError);
  });
});
