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
    return { realtime: { clientSecrets: { create: createMock } } };
  });
  // The real OpenAI class exposes APIError as a static property (`OpenAI.APIError`),
  // not just a named export — the route's `instanceof` check relies on that.
  (OpenAIMock as unknown as { APIError: unknown }).APIError = MockAPIError;
  return { default: OpenAIMock };
});

const { POST } = await import("./route");

function makeRequest(rawBody: string) {
  return new Request("http://localhost/api/realtime/session", {
    method: "POST",
    body: rawBody,
  });
}

function makeJsonRequest(body: unknown) {
  return makeRequest(JSON.stringify(body));
}

describe("POST /api/realtime/session", () => {
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
      }),
    );
    expect(res.status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns 500 and does not call OpenAI when the API key is missing", async () => {
    delete process.env.OPENAI_API_KEY;
    const res = await POST(
      makeJsonRequest({
        config: { role: "Engineer", type: "technical", difficulty: "entry" },
      }),
    );
    expect(res.status).toBe(500);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns only { value, expires_at } with Cache-Control: no-store on success", async () => {
    createMock.mockResolvedValue({
      value: "ek_test123",
      expires_at: 1234567890,
      session: { id: "sess_abc", instructions: "internal session config" },
    });

    const res = await POST(
      makeJsonRequest({
        config: {
          role: "Backend Engineer",
          type: "technical",
          difficulty: "advanced",
        },
      }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");

    const json = await res.json();
    expect(json).toEqual({ value: "ek_test123", expires_at: 1234567890 });

    const callArgs = createMock.mock.calls[0][0];
    expect(callArgs.session.model).toBe("gpt-realtime");
    expect(callArgs.session.instructions).toContain("Backend Engineer");
  });

  it("returns 502 without leaking upstream error details in the response or logs", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    createMock.mockRejectedValue(new Error("upstream detail: sk-should-not-leak"));

    const res = await POST(
      makeJsonRequest({
        config: { role: "Engineer", type: "technical", difficulty: "entry" },
      }),
    );

    expect(res.status).toBe(502);
    const json = await res.json();
    expect(JSON.stringify(json)).not.toContain("sk-should-not-leak");

    // Assert the exact logged arguments rather than JSON.stringify-ing them:
    // Error.message is non-enumerable, so JSON.stringify(new Error(...)) is
    // "{}" and would silently pass even if the raw Error were logged again.
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const [message, diagnostics] = consoleErrorSpy.mock.calls[0];
    expect(message).toBe("Failed to create realtime client secret.");
    expect(diagnostics).not.toBeInstanceOf(Error);
    expect(diagnostics).toEqual({ name: "Error" });

    // Defense in depth: a console-style rendering of exactly what was
    // logged (not just JSON.stringify) must not contain the sensitive text.
    expect(inspect(consoleErrorSpy.mock.calls, { depth: null })).not.toContain(
      "sk-should-not-leak",
    );

    consoleErrorSpy.mockRestore();
  });

  it("logs only structured diagnostics (status/code/type/requestID) for an upstream API error, never its message", async () => {
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
      makeJsonRequest({
        config: { role: "Engineer", type: "technical", difficulty: "entry" },
      }),
    );

    expect(res.status).toBe(502);

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const [message, diagnostics] = consoleErrorSpy.mock.calls[0];
    expect(message).toBe("Failed to create realtime client secret.");
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
