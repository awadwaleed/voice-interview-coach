import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InterviewConfig, InterviewTurn } from "@/src/types/interview";

const CONFIG: InterviewConfig = {
  role: "Backend Engineer",
  type: "behavioral",
  difficulty: "advanced",
};

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

const VALID_FEEDBACK = {
  overallScore: 7,
  overallSummary: "Solid answers with room to grow on specificity.",
  strengths: ["Clear structure"],
  improvements: ["More quantifiable results"],
  communicationFeedback: "Spoke clearly and at a good pace.",
  answerFeedback: [
    {
      turnId: "turn_1",
      strengths: ["Good context setting"],
      improvements: ["Mention the outcome"],
      starStructureNotes: "Covered Situation and Task, light on Result.",
    },
  ],
  suggestionsForNextPractice: ["Practice quantifying impact."],
};

describe("buildFeedbackPrompt", () => {
  it("includes role/type/difficulty context and formatted transcript turns", async () => {
    const { buildFeedbackPrompt } = await import("@/src/lib/feedback/generateFeedback");
    const prompt = buildFeedbackPrompt(CONFIG, [
      turn({ speaker: "interviewer", id: "i1", transcript: "Tell me about a challenge." }),
      turn(),
    ]);

    expect(prompt).toContain("Backend Engineer");
    expect(prompt).toContain("advanced");
    expect(prompt).toContain("behavioral");
    expect(prompt).toContain("Interviewer: Tell me about a challenge.");
    expect(prompt).toContain("Candidate: I rebuilt our checkout flow under a tight deadline.");
  });

  it("excludes pending/failed/unavailable turns, and flags interrupted turns as cut short", async () => {
    const { buildFeedbackPrompt } = await import("@/src/lib/feedback/generateFeedback");
    const prompt = buildFeedbackPrompt(CONFIG, [
      turn({ id: "a", status: "pending", transcript: "" }),
      turn({ id: "b", status: "failed", transcript: "" }),
      turn({ id: "c", status: "unavailable", transcript: "" }),
      turn({ id: "d", status: "interrupted", transcript: "partial answer" }),
    ]);

    expect(prompt).not.toContain("turn_a");
    expect(prompt).toContain("[cut short]");
    expect(prompt).toContain("partial answer");
  });
});

describe("parseFeedbackResponse", () => {
  it("accepts a well-formed response", async () => {
    const { parseFeedbackResponse } = await import("@/src/lib/feedback/generateFeedback");
    expect(parseFeedbackResponse(VALID_FEEDBACK)).toEqual(VALID_FEEDBACK);
  });

  it("drops a null starStructureNotes rather than including it as null", async () => {
    const { parseFeedbackResponse } = await import("@/src/lib/feedback/generateFeedback");
    const result = parseFeedbackResponse({
      ...VALID_FEEDBACK,
      answerFeedback: [{ ...VALID_FEEDBACK.answerFeedback[0], starStructureNotes: null }],
    });
    expect(result.answerFeedback[0]).not.toHaveProperty("starStructureNotes");
  });

  it("rejects a non-object response", async () => {
    const { InvalidFeedbackResponseError, parseFeedbackResponse } = await import(
      "@/src/lib/feedback/generateFeedback"
    );
    expect(() => parseFeedbackResponse(null)).toThrow(InvalidFeedbackResponseError);
    expect(() => parseFeedbackResponse("nope")).toThrow(InvalidFeedbackResponseError);
  });

  it("rejects a response missing required fields", async () => {
    const { InvalidFeedbackResponseError, parseFeedbackResponse } = await import(
      "@/src/lib/feedback/generateFeedback"
    );
    const missingSummary: Record<string, unknown> = { ...VALID_FEEDBACK };
    delete missingSummary.overallSummary;
    expect(() => parseFeedbackResponse(missingSummary)).toThrow(InvalidFeedbackResponseError);
  });

  it("rejects an answerFeedback entry with the wrong shape", async () => {
    const { InvalidFeedbackResponseError, parseFeedbackResponse } = await import(
      "@/src/lib/feedback/generateFeedback"
    );
    expect(() =>
      parseFeedbackResponse({ ...VALID_FEEDBACK, answerFeedback: [{ turnId: "x" }] }),
    ).toThrow(InvalidFeedbackResponseError);
  });
});

describe("generateInterviewFeedback", () => {
  const createMock = vi.fn();

  beforeEach(() => {
    createMock.mockReset();
    // The other describe blocks above import generateFeedback.ts (and the
    // real "openai" package) unmocked; reset the module registry so this
    // block's doMock actually takes effect on the next dynamic import,
    // rather than returning an already-cached unmocked module.
    vi.resetModules();
    vi.doMock("openai", () => ({
      default: vi.fn().mockImplementation(function MockOpenAI() {
        return { responses: { create: createMock } };
      }),
    }));
  });

  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("openai");
  });

  it("calls the Responses API with a json_schema format and parses the result", async () => {
    createMock.mockResolvedValue({ output_text: JSON.stringify(VALID_FEEDBACK) });
    const { generateInterviewFeedback } = await import("@/src/lib/feedback/generateFeedback");

    const feedback = await generateInterviewFeedback({
      apiKey: "test-key",
      config: CONFIG,
      transcript: [turn()],
    });

    expect(feedback).toEqual(VALID_FEEDBACK);
    const callArgs = createMock.mock.calls[0][0];
    expect(callArgs.model).toBe("gpt-5");
    expect(callArgs.text.format.type).toBe("json_schema");
    expect(callArgs.text.format.strict).toBe(true);
    expect(callArgs.input).toContain("Backend Engineer");
  });

  it("throws InvalidFeedbackResponseError when the model output isn't valid JSON", async () => {
    createMock.mockResolvedValue({ output_text: "not json" });
    const { InvalidFeedbackResponseError, generateInterviewFeedback } = await import(
      "@/src/lib/feedback/generateFeedback"
    );

    await expect(
      generateInterviewFeedback({ apiKey: "test-key", config: CONFIG, transcript: [turn()] }),
    ).rejects.toThrow(InvalidFeedbackResponseError);
  });

  it("throws InvalidFeedbackResponseError when the model output doesn't match the expected shape", async () => {
    createMock.mockResolvedValue({ output_text: JSON.stringify({ foo: "bar" }) });
    const { InvalidFeedbackResponseError, generateInterviewFeedback } = await import(
      "@/src/lib/feedback/generateFeedback"
    );

    await expect(
      generateInterviewFeedback({ apiKey: "test-key", config: CONFIG, transcript: [turn()] }),
    ).rejects.toThrow(InvalidFeedbackResponseError);
  });
});
