import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InterviewConfig, InterviewTurn } from "@/src/types/interview";

const CONFIG: InterviewConfig = {
  role: "Backend Engineer",
  type: "behavioral",
  difficulty: "advanced",
};

function turn(overrides: Partial<InterviewTurn> = {}): InterviewTurn {
  return {
    id: "candidate_1",
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
      turnId: "candidate_1",
      strengths: ["Good context setting"],
      improvements: ["Mention the outcome"],
      starStructureNotes: "Covered Situation and Task, light on Result.",
    },
  ],
  suggestionsForNextPractice: ["Practice quantifying impact."],
};

const ELIGIBLE_IDS = new Set(["candidate_1"]);

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
    expect(prompt).toContain(
      "Candidate [id: candidate_1]: I rebuilt our checkout flow under a tight deadline.",
    );
  });

  it("tags candidate lines with their id but never tags interviewer lines", async () => {
    const { buildFeedbackPrompt } = await import("@/src/lib/feedback/generateFeedback");
    const prompt = buildFeedbackPrompt(CONFIG, [
      turn({ speaker: "interviewer", id: "interviewer_1", transcript: "Hello." }),
    ]);
    expect(prompt).not.toContain("[id: interviewer_1]");
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

describe("getEligibleAnswerTurnIds", () => {
  it("includes only evaluable candidate turns, excluding interviewer/pending/failed/unavailable/empty ones", async () => {
    const { getEligibleAnswerTurnIds } = await import("@/src/lib/feedback/generateFeedback");
    const ids = getEligibleAnswerTurnIds([
      turn({ id: "eligible", status: "complete" }),
      turn({ id: "eligible-interrupted", status: "interrupted" }),
      turn({ id: "interviewer", speaker: "interviewer" }),
      turn({ id: "pending", status: "pending", transcript: "" }),
      turn({ id: "empty-text", transcript: "   " }),
    ]);
    expect(ids).toEqual(new Set(["eligible", "eligible-interrupted"]));
  });
});

describe("parseFeedbackResponse", () => {
  it("accepts a well-formed response", async () => {
    const { parseFeedbackResponse } = await import("@/src/lib/feedback/generateFeedback");
    expect(parseFeedbackResponse(VALID_FEEDBACK, ELIGIBLE_IDS)).toEqual(VALID_FEEDBACK);
  });

  it("drops a null starStructureNotes rather than including it as null", async () => {
    const { parseFeedbackResponse } = await import("@/src/lib/feedback/generateFeedback");
    const result = parseFeedbackResponse(
      {
        ...VALID_FEEDBACK,
        answerFeedback: [{ ...VALID_FEEDBACK.answerFeedback[0], starStructureNotes: null }],
      },
      ELIGIBLE_IDS,
    );
    expect(result.answerFeedback[0]).not.toHaveProperty("starStructureNotes");
  });

  it("rejects a non-object response", async () => {
    const { InvalidFeedbackResponseError, parseFeedbackResponse } = await import(
      "@/src/lib/feedback/generateFeedback"
    );
    expect(() => parseFeedbackResponse(null, ELIGIBLE_IDS)).toThrow(InvalidFeedbackResponseError);
    expect(() => parseFeedbackResponse("nope", ELIGIBLE_IDS)).toThrow(
      InvalidFeedbackResponseError,
    );
  });

  it("rejects a response missing required fields", async () => {
    const { InvalidFeedbackResponseError, parseFeedbackResponse } = await import(
      "@/src/lib/feedback/generateFeedback"
    );
    const missingSummary: Record<string, unknown> = { ...VALID_FEEDBACK };
    delete missingSummary.overallSummary;
    expect(() => parseFeedbackResponse(missingSummary, ELIGIBLE_IDS)).toThrow(
      InvalidFeedbackResponseError,
    );
  });

  it("rejects an answerFeedback entry with the wrong shape", async () => {
    const { InvalidFeedbackResponseError, parseFeedbackResponse } = await import(
      "@/src/lib/feedback/generateFeedback"
    );
    expect(() =>
      parseFeedbackResponse(
        { ...VALID_FEEDBACK, answerFeedback: [{ turnId: "candidate_1" }] },
        ELIGIBLE_IDS,
      ),
    ).toThrow(InvalidFeedbackResponseError);
  });

  it.each([100, -1, 0, 11, 7.5])(
    "rejects an overallScore of %s (must be an integer from 1 to 10)",
    async (badScore) => {
      const { InvalidFeedbackResponseError, parseFeedbackResponse } = await import(
        "@/src/lib/feedback/generateFeedback"
      );
      expect(() =>
        parseFeedbackResponse({ ...VALID_FEEDBACK, overallScore: badScore }, ELIGIBLE_IDS),
      ).toThrow(InvalidFeedbackResponseError);
    },
  );

  it.each([1, 10])("accepts a boundary overallScore of %s", async (goodScore) => {
    const { parseFeedbackResponse } = await import("@/src/lib/feedback/generateFeedback");
    expect(
      parseFeedbackResponse({ ...VALID_FEEDBACK, overallScore: goodScore }, ELIGIBLE_IDS)
        .overallScore,
    ).toBe(goodScore);
  });

  it("rejects an answerFeedback turnId that doesn't reference an eligible candidate turn", async () => {
    const { InvalidFeedbackResponseError, parseFeedbackResponse } = await import(
      "@/src/lib/feedback/generateFeedback"
    );
    expect(() =>
      parseFeedbackResponse(
        {
          ...VALID_FEEDBACK,
          answerFeedback: [{ ...VALID_FEEDBACK.answerFeedback[0], turnId: "invented_id" }],
        },
        ELIGIBLE_IDS,
      ),
    ).toThrow(InvalidFeedbackResponseError);
  });

  it("rejects a duplicate turnId across two answerFeedback entries", async () => {
    const { InvalidFeedbackResponseError, parseFeedbackResponse } = await import(
      "@/src/lib/feedback/generateFeedback"
    );
    expect(() =>
      parseFeedbackResponse(
        {
          ...VALID_FEEDBACK,
          answerFeedback: [VALID_FEEDBACK.answerFeedback[0], VALID_FEEDBACK.answerFeedback[0]],
        },
        ELIGIBLE_IDS,
      ),
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
    expect(callArgs.text.format.schema.properties.overallScore).toEqual({
      type: "integer",
      minimum: 1,
      maximum: 10,
    });
    expect(callArgs.input).toContain("Backend Engineer");
    expect(callArgs.input).toContain("[id: candidate_1]");
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

  it("throws InvalidFeedbackResponseError end-to-end when the model invents a turnId not present in the transcript", async () => {
    createMock.mockResolvedValue({
      output_text: JSON.stringify({
        ...VALID_FEEDBACK,
        answerFeedback: [{ ...VALID_FEEDBACK.answerFeedback[0], turnId: "hallucinated_id" }],
      }),
    });
    const { InvalidFeedbackResponseError, generateInterviewFeedback } = await import(
      "@/src/lib/feedback/generateFeedback"
    );

    await expect(
      generateInterviewFeedback({ apiKey: "test-key", config: CONFIG, transcript: [turn()] }),
    ).rejects.toThrow(InvalidFeedbackResponseError);
  });
});
