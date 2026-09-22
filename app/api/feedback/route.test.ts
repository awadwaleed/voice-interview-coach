import { inspect } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createMock = vi.fn();

class MockAPIError extends Error {
  status?: number;
  code?: string;
  type?: string;
  requestID?: string;

  constructor(
    message: string,
    fields: { status?: number; code?: string; type?: string; requestID?: string } = {},
  ) {
    super(message);
    Object.assign(this, fields);
  }
}

vi.mock("openai", () => {
  const OpenAIMock = vi.fn().mockImplementation(function MockOpenAI() {
    return { responses: { create: createMock } };
  });
  (OpenAIMock as unknown as { APIError: unknown }).APIError = MockAPIError;
  return { default: OpenAIMock };
});

const { POST } = await import("./route");

function makeRequest(rawBody: string) {
  return new Request("http://localhost/api/feedback", {
    method: "POST",
    body: rawBody,
  });
}

function makeJsonRequest(body: unknown) {
  return makeRequest(JSON.stringify(body));
}

const VALID_CONFIG = { role: "Backend Engineer", type: "technical", difficulty: "advanced" };
const VALID_TRANSCRIPT = [
  {
    id: "turn_1",
    speaker: "candidate",
    transcript: "I rebuilt our checkout flow under a tight deadline.",
    timestamp: 1234567890,
    status: "complete",
  },
];

const VALID_FEEDBACK = {
  overallScore: 7,
  overallSummary: "Solid answers with room to grow on specificity.",
  strengths: ["Clear structure"],
  improvements: ["More quantifiable results"],
  communicationFeedback: "Spoke clearly and at a good pace.",
  answerFeedback: [
    { turnId: "turn_1", strengths: ["Good context"], improvements: ["Mention the outcome"] },
  ],
  suggestionsForNextPractice: ["Practice quantifying impact."],
};

describe("POST /api/feedback", () => {
  const originalKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    createMock.mockReset();
    process.env.OPENAI_API_KEY = "test-key";
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = originalKey;
  });

  it("returns 400 for malformed JSON", async () => {
    const res = await POST(makeRequest("{not json"));
    expect(res.status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid config", async () => {
    const res = await POST(
      makeJsonRequest({
        config: { role: "", type: "technical", difficulty: "entry" },
        transcript: VALID_TRANSCRIPT,
      }),
    );
    expect(res.status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid transcript", async () => {
    const res = await POST(makeJsonRequest({ config: VALID_CONFIG, transcript: [] }));
    expect(res.status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns 400 for a transcript with a malformed turn", async () => {
    const res = await POST(
      makeJsonRequest({
        config: VALID_CONFIG,
        transcript: [{ id: "turn_1", speaker: "narrator", transcript: "", timestamp: 1, status: "complete" }],
      }),
    );
    expect(res.status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns 400 and never calls the model for a transcript with no evaluable candidate content", async () => {
    const res = await POST(
      makeJsonRequest({
        config: VALID_CONFIG,
        transcript: [
          {
            id: "turn_1",
            speaker: "interviewer",
            transcript: "Tell me about yourself.",
            timestamp: 1,
            status: "complete",
          },
          {
            id: "turn_2",
            speaker: "candidate",
            transcript: "",
            timestamp: 2,
            status: "pending",
          },
        ],
      }),
    );
    expect(res.status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns 500 and does not call OpenAI when the API key is missing", async () => {
    delete process.env.OPENAI_API_KEY;
    const res = await POST(
      makeJsonRequest({ config: VALID_CONFIG, transcript: VALID_TRANSCRIPT }),
    );
    expect(res.status).toBe(500);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns { feedback } with Cache-Control: no-store on success", async () => {
    createMock.mockResolvedValue({ output_text: JSON.stringify(VALID_FEEDBACK) });

    const res = await POST(
      makeJsonRequest({ config: VALID_CONFIG, transcript: VALID_TRANSCRIPT }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const json = await res.json();
    expect(json).toEqual({ feedback: VALID_FEEDBACK });

    const callArgs = createMock.mock.calls[0][0];
    expect(callArgs.model).toBe("gpt-5");
    expect(callArgs.input).toContain("Backend Engineer");
  });

  it("returns 502 when the model response doesn't match the expected shape, without leaking it", async () => {
    createMock.mockResolvedValue({ output_text: JSON.stringify({ unexpected: "shape" }) });

    const res = await POST(
      makeJsonRequest({ config: VALID_CONFIG, transcript: VALID_TRANSCRIPT }),
    );

    expect(res.status).toBe(502);
    const json = await res.json();
    expect(JSON.stringify(json)).not.toContain("unexpected");
  });

  it("returns 502 without leaking upstream error details in the response or logs", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    createMock.mockRejectedValue(new Error("upstream detail: sk-should-not-leak"));

    const res = await POST(
      makeJsonRequest({ config: VALID_CONFIG, transcript: VALID_TRANSCRIPT }),
    );

    expect(res.status).toBe(502);
    const json = await res.json();
    expect(JSON.stringify(json)).not.toContain("sk-should-not-leak");
    expect(inspect(consoleErrorSpy.mock.calls, { depth: null })).not.toContain(
      "sk-should-not-leak",
    );

    consoleErrorSpy.mockRestore();
  });

  it("logs only structured diagnostics for an upstream API error, never its message", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    createMock.mockRejectedValue(
      new MockAPIError("sensitive upstream text: sk-should-not-leak", {
        status: 429,
        code: "rate_limit_exceeded",
        type: "rate_limit_error",
        requestID: "req_abc123",
      }),
    );

    const res = await POST(
      makeJsonRequest({ config: VALID_CONFIG, transcript: VALID_TRANSCRIPT }),
    );

    expect(res.status).toBe(502);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const [, diagnostics] = consoleErrorSpy.mock.calls[0];
    expect(diagnostics).not.toBeInstanceOf(Error);
    expect(diagnostics).toEqual({
      status: 429,
      code: "rate_limit_exceeded",
      type: "rate_limit_error",
      requestID: "req_abc123",
    });
    expect(inspect(consoleErrorSpy.mock.calls, { depth: null })).not.toContain(
      "sk-should-not-leak",
    );

    consoleErrorSpy.mockRestore();
  });
});
