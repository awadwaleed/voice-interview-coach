import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createMock = vi.fn();

vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(function MockOpenAI() {
    return { realtime: { clientSecrets: { create: createMock } } };
  }),
}));

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

  it("returns 502 without leaking upstream error details when the OpenAI call fails", async () => {
    createMock.mockRejectedValue(new Error("upstream detail: sk-should-not-leak"));

    const res = await POST(
      makeJsonRequest({
        config: { role: "Engineer", type: "technical", difficulty: "entry" },
      }),
    );

    expect(res.status).toBe(502);
    const json = await res.json();
    expect(JSON.stringify(json)).not.toContain("sk-should-not-leak");
  });
});
