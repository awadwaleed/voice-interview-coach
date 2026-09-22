import { describe, expect, it } from "vitest";
import {
  InvalidTranscriptError,
  hasEvaluableContent,
  hasMissingCandidateContent,
  validateTranscript,
} from "@/src/lib/feedback/validateTranscript";
import type { InterviewTurn } from "@/src/types/interview";

/** Valid, well-typed turn — for exercising hasEvaluableContent(). */
function turn(overrides: Partial<InterviewTurn> = {}): InterviewTurn {
  return {
    id: "turn_1",
    speaker: "candidate",
    transcript: "I rebuilt our checkout flow under a tight deadline.",
    timestamp: 1234567890,
    status: "complete",
    ...overrides,
  };
}

/** Deliberately loose — for exercising validateTranscript()'s rejections. */
function invalidTurn(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "turn_1",
    speaker: "candidate",
    transcript: "I rebuilt our checkout flow under a tight deadline.",
    timestamp: 1234567890,
    status: "complete",
    ...overrides,
  };
}

describe("validateTranscript", () => {
  it("accepts a well-formed transcript", () => {
    const result = validateTranscript([
      invalidTurn(),
      invalidTurn({ id: "turn_2", speaker: "interviewer" }),
    ]);
    expect(result).toHaveLength(2);
  });

  it("rejects a non-array body", () => {
    expect(() => validateTranscript(undefined)).toThrow(InvalidTranscriptError);
    expect(() => validateTranscript({})).toThrow(InvalidTranscriptError);
  });

  it("rejects an empty transcript", () => {
    expect(() => validateTranscript([])).toThrow(InvalidTranscriptError);
  });

  it("rejects a transcript over the turn-count limit", () => {
    const turns = Array.from({ length: 201 }, (_, i) => invalidTurn({ id: `turn_${i}` }));
    expect(() => validateTranscript(turns)).toThrow(InvalidTranscriptError);
  });

  it("rejects a turn missing a valid id", () => {
    expect(() => validateTranscript([invalidTurn({ id: "" })])).toThrow(InvalidTranscriptError);
    expect(() => validateTranscript([invalidTurn({ id: 123 })])).toThrow(InvalidTranscriptError);
  });

  it("rejects a turn with an invalid speaker", () => {
    expect(() => validateTranscript([invalidTurn({ speaker: "narrator" })])).toThrow(
      InvalidTranscriptError,
    );
  });

  it("rejects a turn whose transcript text exceeds the length limit", () => {
    expect(() => validateTranscript([invalidTurn({ transcript: "a".repeat(4001) })])).toThrow(
      InvalidTranscriptError,
    );
  });

  it("rejects a turn with a non-numeric timestamp", () => {
    expect(() => validateTranscript([invalidTurn({ timestamp: "yesterday" })])).toThrow(
      InvalidTranscriptError,
    );
  });

  it("rejects a turn with an invalid status", () => {
    expect(() => validateTranscript([invalidTurn({ status: "vibing" })])).toThrow(
      InvalidTranscriptError,
    );
  });
});

describe("hasEvaluableContent", () => {
  it("is true when a candidate turn has complete, non-empty text", () => {
    expect(hasEvaluableContent([turn()])).toBe(true);
  });

  it("is true for an interrupted candidate turn with text", () => {
    expect(hasEvaluableContent([turn({ status: "interrupted" })])).toBe(true);
  });

  it("is false when there are no candidate turns", () => {
    expect(hasEvaluableContent([turn({ speaker: "interviewer" })])).toBe(false);
  });

  it("is false when the only candidate turns are pending/failed/unavailable", () => {
    expect(
      hasEvaluableContent([
        turn({ id: "a", status: "pending", transcript: "" }),
        turn({ id: "b", status: "failed", transcript: "" }),
        turn({ id: "c", status: "unavailable", transcript: "" }),
      ]),
    ).toBe(false);
  });

  it("is false when candidate text is only whitespace", () => {
    expect(hasEvaluableContent([turn({ transcript: "   " })])).toBe(false);
  });
});

describe("hasMissingCandidateContent", () => {
  it("is true when a candidate turn failed transcription", () => {
    expect(
      hasMissingCandidateContent([turn({ status: "failed", transcript: "" })]),
    ).toBe(true);
  });

  it("is true when a candidate turn is unavailable (connection lost)", () => {
    expect(
      hasMissingCandidateContent([turn({ status: "unavailable", transcript: "" })]),
    ).toBe(true);
  });

  it("is false when all candidate turns are complete", () => {
    expect(hasMissingCandidateContent([turn()])).toBe(false);
  });

  it("is false for an interviewer turn that failed/is unavailable", () => {
    expect(
      hasMissingCandidateContent([
        turn({ speaker: "interviewer", status: "failed", transcript: "" }),
      ]),
    ).toBe(false);
  });

  it("is false for a merely pending candidate turn", () => {
    expect(
      hasMissingCandidateContent([turn({ status: "pending", transcript: "" })]),
    ).toBe(false);
  });
});
