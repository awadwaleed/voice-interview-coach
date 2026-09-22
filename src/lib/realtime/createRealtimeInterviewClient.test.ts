import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRealtimeInterviewClient } from "@/src/lib/realtime/createRealtimeInterviewClient";
import type { InterviewConfig } from "@/src/types/interview";

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

class MockDataChannel {
  readyState: string = "open";
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  sent: string[] = [];
  closed = false;

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.closed = true;
    this.readyState = "closed";
  }

  simulateMessage(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
}

class MockPeerConnection {
  ontrack: ((event: { streams: MediaStream[] }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  connectionState = "new";
  closed = false;
  dataChannel: MockDataChannel | null = null;

  addTrack() {
    return {};
  }

  createDataChannel() {
    this.dataChannel = new MockDataChannel();
    return this.dataChannel;
  }

  createOffer() {
    return Promise.resolve({ type: "offer", sdp: "mock-offer-sdp" });
  }

  setLocalDescription() {
    return Promise.resolve();
  }

  setRemoteDescription() {
    return Promise.resolve();
  }

  close() {
    this.closed = true;
    this.connectionState = "closed";
  }

  simulateConnectionState(state: string) {
    this.connectionState = state;
    this.onconnectionstatechange?.();
  }
}

function makeMicStream() {
  const track = { stop: vi.fn(), kind: "audio" };
  return {
    stream: { getAudioTracks: () => [track] } as unknown as MediaStream,
    track,
  };
}

function makeAudioElement() {
  return {
    srcObject: null as unknown,
    play: vi.fn(() => Promise.resolve()),
    pause: vi.fn(),
  };
}

const CONFIG: InterviewConfig = {
  role: "Backend Engineer",
  type: "technical",
  difficulty: "advanced",
};

let peerConnections: MockPeerConnection[];

function sdpFetchResponse() {
  return { ok: true, status: 200, text: () => Promise.resolve("mock-answer-sdp") };
}

function sessionFetchResponse(value = "ek_test") {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ value, expires_at: 1234567890 }),
  };
}

beforeEach(() => {
  peerConnections = [];
  vi.stubGlobal(
    "RTCPeerConnection",
    vi.fn().mockImplementation(function MockRTCPeerConnectionCtor() {
      const pc = new MockPeerConnection();
      peerConnections.push(pc);
      return pc;
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function flush(times = 4) {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}

describe("createRealtimeInterviewClient", () => {
  it("goes idle -> connecting -> active only once session.created arrives, and sends response.create", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/realtime/session") return Promise.resolve(sessionFetchResponse());
      return Promise.resolve(sdpFetchResponse());
    });
    vi.stubGlobal("fetch", fetchMock);
    const { stream } = makeMicStream();
    const audioElement = makeAudioElement();

    const client = createRealtimeInterviewClient({
      config: CONFIG,
      micStream: stream,
      getAudioElement: () => audioElement as unknown as HTMLAudioElement,
    });

    expect(client.getState().status).toBe("idle");
    client.connect();
    expect(client.getState().status).toBe("connecting");

    await flush();
    // negotiate() has resolved by now, but session.created hasn't arrived yet.
    expect(client.getState().status).toBe("connecting");

    peerConnections[0].dataChannel!.simulateMessage({ type: "session.created" });
    expect(client.getState().status).toBe("active");
    expect(peerConnections[0].dataChannel!.sent).toEqual([
      JSON.stringify({ type: "response.create" }),
    ]);
  });

  it("ignores a duplicate connect() while already connecting, without disturbing the in-flight attempt", async () => {
    const sessionDeferred = createDeferred<ReturnType<typeof sessionFetchResponse>>();
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/realtime/session") return sessionDeferred.promise;
      return Promise.resolve(sdpFetchResponse());
    });
    vi.stubGlobal("fetch", fetchMock);
    const { stream } = makeMicStream();
    const audioElement = makeAudioElement();

    const client = createRealtimeInterviewClient({
      config: CONFIG,
      micStream: stream,
      getAudioElement: () => audioElement as unknown as HTMLAudioElement,
    });

    client.connect();
    client.connect(); // duplicate — must be a no-op
    client.connect(); // duplicate — must be a no-op

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(peerConnections).toHaveLength(1);

    sessionDeferred.resolve(sessionFetchResponse());
    await flush();
    peerConnections[0].dataChannel!.simulateMessage({ type: "session.created" });

    expect(client.getState().status).toBe("active");
  });

  it("disconnect() during the credential fetch aborts it and leaves the mic untouched", async () => {
    const sessionDeferred = createDeferred<ReturnType<typeof sessionFetchResponse>>();
    let capturedSignal: AbortSignal | undefined;
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url === "/api/realtime/session") {
        capturedSignal = init?.signal ?? undefined;
        return sessionDeferred.promise;
      }
      return Promise.resolve(sdpFetchResponse());
    });
    vi.stubGlobal("fetch", fetchMock);
    const { stream, track } = makeMicStream();
    const audioElement = makeAudioElement();

    const client = createRealtimeInterviewClient({
      config: CONFIG,
      micStream: stream,
      getAudioElement: () => audioElement as unknown as HTMLAudioElement,
    });

    client.connect();
    client.disconnect();

    expect(capturedSignal?.aborted).toBe(true);
    expect(client.getState().status).toBe("idle");
    expect(track.stop).not.toHaveBeenCalled();

    // A late (superseded) resolution must not resurrect the connection.
    sessionDeferred.resolve(sessionFetchResponse());
    await flush();
    expect(client.getState().status).toBe("idle");
    expect(peerConnections[0].dataChannel!.sent).toEqual([]);
  });

  it("disconnect() during SDP negotiation tears down the peer connection and leaves the mic untouched", async () => {
    const sdpDeferred = createDeferred<ReturnType<typeof sdpFetchResponse>>();
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/realtime/session") return Promise.resolve(sessionFetchResponse());
      return sdpDeferred.promise;
    });
    vi.stubGlobal("fetch", fetchMock);
    const { stream, track } = makeMicStream();
    const audioElement = makeAudioElement();

    const client = createRealtimeInterviewClient({
      config: CONFIG,
      micStream: stream,
      getAudioElement: () => audioElement as unknown as HTMLAudioElement,
    });

    client.connect();
    await flush(); // let the credential fetch resolve and negotiate() start
    client.disconnect();

    expect(peerConnections[0].closed).toBe(true);
    expect(track.stop).not.toHaveBeenCalled();

    sdpDeferred.resolve(sdpFetchResponse());
    await flush();
    expect(client.getState().status).toBe("idle");
  });

  it("on connection failure, tears down the call, keeps status error, and leaves the mic untouched for Retry", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/realtime/session") return Promise.resolve(sessionFetchResponse());
      return Promise.resolve(sdpFetchResponse());
    });
    vi.stubGlobal("fetch", fetchMock);
    const { stream, track } = makeMicStream();
    const audioElement = makeAudioElement();

    const client = createRealtimeInterviewClient({
      config: CONFIG,
      micStream: stream,
      getAudioElement: () => audioElement as unknown as HTMLAudioElement,
    });

    client.connect();
    await flush();
    peerConnections[0].dataChannel!.simulateMessage({ type: "session.created" });
    expect(client.getState().status).toBe("active");

    peerConnections[0].simulateConnectionState("failed");

    expect(client.getState().status).toBe("error");
    expect(peerConnections[0].closed).toBe(true);
    expect(track.stop).not.toHaveBeenCalled();

    // Retry should work — a fresh attempt, fresh peer connection.
    client.connect();
    await flush();
    peerConnections[1].dataChannel!.simulateMessage({ type: "session.created" });
    expect(client.getState().status).toBe("active");
    expect(peerConnections).toHaveLength(2);
  });

  it("an error event from a stale (disconnected) attempt does not affect a newer attempt's state", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/realtime/session") return Promise.resolve(sessionFetchResponse());
      return Promise.resolve(sdpFetchResponse());
    });
    vi.stubGlobal("fetch", fetchMock);
    const { stream } = makeMicStream();
    const audioElement = makeAudioElement();

    const client = createRealtimeInterviewClient({
      config: CONFIG,
      micStream: stream,
      getAudioElement: () => audioElement as unknown as HTMLAudioElement,
    });

    client.connect();
    await flush();
    const staleDataChannel = peerConnections[0].dataChannel!;
    client.disconnect();

    client.connect(); // second, current attempt
    await flush();
    peerConnections[1].dataChannel!.simulateMessage({ type: "session.created" });
    expect(client.getState().status).toBe("active");

    // The stale first call's data channel fires an error after being
    // superseded — it must not clobber the second attempt's "active" state.
    staleDataChannel.simulateMessage({
      type: "error",
      error: { message: "stale failure" },
    });

    expect(client.getState().status).toBe("active");
    expect(client.getState().error).toBeNull();
  });

  it("a delayed play() rejection from a superseded attempt does not mark a newer attempt as audio-blocked", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/realtime/session") return Promise.resolve(sessionFetchResponse());
      return Promise.resolve(sdpFetchResponse());
    });
    vi.stubGlobal("fetch", fetchMock);
    const { stream } = makeMicStream();
    const playDeferred = createDeferred<void>();
    let playCallCount = 0;
    const audioElement = {
      srcObject: null as unknown,
      play: vi.fn(() => (playCallCount++ === 0 ? playDeferred.promise : Promise.resolve())),
      pause: vi.fn(),
    };

    const client = createRealtimeInterviewClient({
      config: CONFIG,
      micStream: stream,
      getAudioElement: () => audioElement as unknown as HTMLAudioElement,
    });

    client.connect();
    await flush();
    peerConnections[0].ontrack?.({ streams: [{} as MediaStream] });
    client.disconnect();

    client.connect();
    await flush();
    peerConnections[1].dataChannel!.simulateMessage({ type: "session.created" });
    expect(client.getState().audioBlocked).toBe(false);

    // The first (superseded) call's play() promise rejects late.
    playDeferred.reject(new Error("NotAllowedError"));
    await flush();

    expect(client.getState().audioBlocked).toBe(false);
  });

  it("repeated disconnect() is idempotent", () => {
    const { stream } = makeMicStream();
    const audioElement = makeAudioElement();
    const client = createRealtimeInterviewClient({
      config: CONFIG,
      micStream: stream,
      getAudioElement: () => audioElement as unknown as HTMLAudioElement,
    });

    expect(() => {
      client.disconnect();
      client.disconnect();
      client.disconnect();
    }).not.toThrow();
    expect(client.getState().status).toBe("idle");
  });

  it("subscribe() immediately invokes the listener with the current state", () => {
    const { stream } = makeMicStream();
    const audioElement = makeAudioElement();
    const client = createRealtimeInterviewClient({
      config: CONFIG,
      micStream: stream,
      getAudioElement: () => audioElement as unknown as HTMLAudioElement,
    });

    const listener = vi.fn();
    client.subscribe(listener);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("a synchronous transport setup failure surfaces status: error (not stuck connecting), preserves the mic, and allows Retry", async () => {
    // Force RTCPeerConnection construction itself to throw, simulating any
    // synchronous createRealtimeCall() setup failure (constructor,
    // addTrack, createDataChannel).
    vi.stubGlobal(
      "RTCPeerConnection",
      vi.fn().mockImplementation(function ThrowingRTCPeerConnection() {
        throw new Error("RTCPeerConnection is not supported");
      }),
    );
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { stream, track } = makeMicStream();
    const audioElement = makeAudioElement();

    const client = createRealtimeInterviewClient({
      config: CONFIG,
      micStream: stream,
      getAudioElement: () => audioElement as unknown as HTMLAudioElement,
    });

    client.connect();

    expect(client.getState().status).toBe("error");
    expect(client.getState().error).toContain("RTCPeerConnection");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(track.stop).not.toHaveBeenCalled();

    // Retry must work — connect() shouldn't be permanently stuck.
    vi.stubGlobal(
      "RTCPeerConnection",
      vi.fn().mockImplementation(function MockRTCPeerConnectionCtor() {
        const pc = new MockPeerConnection();
        peerConnections.push(pc);
        return pc;
      }),
    );
    const workingFetchMock = vi.fn((url: string) => {
      if (url === "/api/realtime/session") return Promise.resolve(sessionFetchResponse());
      return Promise.resolve(sdpFetchResponse());
    });
    vi.stubGlobal("fetch", workingFetchMock);

    client.connect();
    await flush();
    peerConnections[0].dataChannel!.simulateMessage({ type: "session.created" });
    expect(client.getState().status).toBe("active");
  });

  it("a stale resumeAudio() completion from a superseded attempt does not clear a newer attempt's audioBlocked flag", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/realtime/session") return Promise.resolve(sessionFetchResponse());
      return Promise.resolve(sdpFetchResponse());
    });
    vi.stubGlobal("fetch", fetchMock);
    const { stream } = makeMicStream();

    const staleResumeDeferred = createDeferred<void>();
    let playCallCount = 0;
    const audioElement = {
      srcObject: null as unknown,
      // Call 1: attempt 1's ontrack -> rejects (blocked).
      // Call 2: attempt 1's resumeAudio() -> stays pending (resolved later, after attempt 2 exists).
      // Call 3: attempt 2's ontrack -> rejects (also blocked, independently).
      play: vi.fn(() => {
        playCallCount += 1;
        if (playCallCount === 1) return Promise.reject(new Error("blocked"));
        if (playCallCount === 2) return staleResumeDeferred.promise;
        return Promise.reject(new Error("blocked"));
      }),
      pause: vi.fn(),
    };

    const client = createRealtimeInterviewClient({
      config: CONFIG,
      micStream: stream,
      getAudioElement: () => audioElement as unknown as HTMLAudioElement,
    });

    client.connect();
    await flush();
    peerConnections[0].ontrack?.({ streams: [{} as MediaStream] });
    await flush();
    peerConnections[0].dataChannel!.simulateMessage({ type: "session.created" });
    await flush();
    expect(client.getState().audioBlocked).toBe(true);

    client.resumeAudio(); // attempt 1's resumeAudio — its play() stays pending
    client.disconnect();

    client.connect(); // attempt 2
    await flush();
    peerConnections[1].ontrack?.({ streams: [{} as MediaStream] });
    await flush();
    peerConnections[1].dataChannel!.simulateMessage({ type: "session.created" });
    await flush();
    expect(client.getState().audioBlocked).toBe(true); // attempt 2 is genuinely blocked too

    // Attempt 1's stale resumeAudio() now succeeds — must not clear
    // attempt 2's (still genuinely blocked) audioBlocked flag.
    staleResumeDeferred.resolve();
    await flush();

    expect(client.getState().audioBlocked).toBe(true);
  });

  it("builds the transcript from data-channel events as the conversation progresses", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/realtime/session") return Promise.resolve(sessionFetchResponse());
      return Promise.resolve(sdpFetchResponse());
    });
    vi.stubGlobal("fetch", fetchMock);
    const { stream } = makeMicStream();
    const audioElement = makeAudioElement();

    const client = createRealtimeInterviewClient({
      config: CONFIG,
      micStream: stream,
      getAudioElement: () => audioElement as unknown as HTMLAudioElement,
    });

    client.connect();
    await flush();
    const dc = peerConnections[0].dataChannel!;
    dc.simulateMessage({ type: "session.created" });

    dc.simulateMessage({
      type: "conversation.item.added",
      item: { id: "item_interviewer_1", role: "assistant", type: "message" },
      previous_item_id: null,
    });
    dc.simulateMessage({
      type: "response.output_audio_transcript.done",
      item_id: "item_interviewer_1",
      transcript: "Tell me about a challenging project.",
    });
    dc.simulateMessage({
      type: "conversation.item.added",
      item: { id: "item_candidate_1", role: "user", type: "message" },
      previous_item_id: "item_interviewer_1",
    });
    dc.simulateMessage({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "item_candidate_1",
      transcript: "Sure, let me walk you through it.",
    });

    const transcript = client.getState().transcript;
    expect(transcript).toEqual([
      expect.objectContaining({
        id: "item_interviewer_1",
        speaker: "interviewer",
        transcript: "Tell me about a challenging project.",
        status: "complete",
      }),
      expect.objectContaining({
        id: "item_candidate_1",
        speaker: "candidate",
        transcript: "Sure, let me walk you through it.",
        status: "complete",
      }),
    ]);
  });

  it("resets the transcript to empty when retrying connect() after a failure (fail() itself doesn't clear it)", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/realtime/session") return Promise.resolve(sessionFetchResponse());
      return Promise.resolve(sdpFetchResponse());
    });
    vi.stubGlobal("fetch", fetchMock);
    const { stream } = makeMicStream();
    const audioElement = makeAudioElement();

    const client = createRealtimeInterviewClient({
      config: CONFIG,
      micStream: stream,
      getAudioElement: () => audioElement as unknown as HTMLAudioElement,
    });

    client.connect();
    await flush();
    peerConnections[0].dataChannel!.simulateMessage({
      type: "conversation.item.added",
      item: { id: "stale_item", role: "user", type: "message" },
    });
    expect(client.getState().transcript).toHaveLength(1);

    // A connection failure (not an explicit disconnect()) — fail() itself
    // doesn't clear the transcript, so this only works if connect() does.
    peerConnections[0].simulateConnectionState("failed");
    expect(client.getState().status).toBe("error");
    expect(client.getState().transcript).toHaveLength(1); // still there right after failure

    client.connect(); // Retry — a fresh attempt / fresh server-side conversation
    expect(client.getState().transcript).toEqual([]);
  });

  it("marks an interviewer turn interrupted on output_audio_buffer.cleared, correlated via response.output_item.added", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/realtime/session") return Promise.resolve(sessionFetchResponse());
      return Promise.resolve(sdpFetchResponse());
    });
    vi.stubGlobal("fetch", fetchMock);
    const { stream } = makeMicStream();
    const audioElement = makeAudioElement();

    const client = createRealtimeInterviewClient({
      config: CONFIG,
      micStream: stream,
      getAudioElement: () => audioElement as unknown as HTMLAudioElement,
    });

    client.connect();
    await flush();
    const dc = peerConnections[0].dataChannel!;
    dc.simulateMessage({ type: "session.created" });

    // response.output_item.added establishes the response_id -> item_id
    // correlation before generation/transcription completes.
    dc.simulateMessage({
      type: "response.output_item.added",
      response_id: "resp_1",
      output_index: 0,
      item: { id: "interviewer_1", role: "assistant", type: "message" },
    });
    dc.simulateMessage({
      type: "conversation.item.added",
      item: { id: "interviewer_1", role: "assistant", type: "message" },
      previous_item_id: null,
    });
    dc.simulateMessage({
      type: "response.output_audio_transcript.done",
      item_id: "interviewer_1",
      transcript: "Let's talk about your background and ex",
    });
    expect(client.getState().transcript[0].status).toBe("complete");

    // The candidate barges in mid-playback — the automatic WebRTC
    // interruption signal only carries response_id.
    dc.simulateMessage({ type: "output_audio_buffer.cleared", response_id: "resp_1" });

    expect(client.getState().transcript[0]).toMatchObject({
      status: "interrupted",
      transcript: "Let's talk about your background and ex",
    });
  });

  it("still records the transcript text if output_audio_buffer.cleared arrives before the transcript-done event", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/realtime/session") return Promise.resolve(sessionFetchResponse());
      return Promise.resolve(sdpFetchResponse());
    });
    vi.stubGlobal("fetch", fetchMock);
    const { stream } = makeMicStream();
    const audioElement = makeAudioElement();

    const client = createRealtimeInterviewClient({
      config: CONFIG,
      micStream: stream,
      getAudioElement: () => audioElement as unknown as HTMLAudioElement,
    });

    client.connect();
    await flush();
    const dc = peerConnections[0].dataChannel!;
    dc.simulateMessage({ type: "session.created" });

    dc.simulateMessage({
      type: "response.output_item.added",
      response_id: "resp_1",
      output_index: 0,
      item: { id: "interviewer_1", role: "assistant", type: "message" },
    });
    dc.simulateMessage({
      type: "conversation.item.added",
      item: { id: "interviewer_1", role: "assistant", type: "message" },
      previous_item_id: null,
    });

    // The interruption is detected (VAD) before this item's own
    // transcript-done event arrives.
    dc.simulateMessage({ type: "output_audio_buffer.cleared", response_id: "resp_1" });
    expect(client.getState().transcript[0]).toMatchObject({
      status: "interrupted",
      transcript: "",
    });

    dc.simulateMessage({
      type: "response.output_audio_transcript.done",
      item_id: "interviewer_1",
      transcript: "Let's talk about your background and ex",
    });

    // The text is still legitimate content and must be recorded, while the
    // status must not revert to "complete".
    expect(client.getState().transcript[0]).toMatchObject({
      status: "interrupted",
      transcript: "Let's talk about your background and ex",
    });
  });

  it("ignores output_audio_buffer.cleared for an unrecognized response_id", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/realtime/session") return Promise.resolve(sessionFetchResponse());
      return Promise.resolve(sdpFetchResponse());
    });
    vi.stubGlobal("fetch", fetchMock);
    const { stream } = makeMicStream();
    const audioElement = makeAudioElement();

    const client = createRealtimeInterviewClient({
      config: CONFIG,
      micStream: stream,
      getAudioElement: () => audioElement as unknown as HTMLAudioElement,
    });

    client.connect();
    await flush();
    const dc = peerConnections[0].dataChannel!;
    dc.simulateMessage({ type: "session.created" });

    expect(() =>
      dc.simulateMessage({ type: "output_audio_buffer.cleared", response_id: "resp_unknown" }),
    ).not.toThrow();
    expect(client.getState().transcript).toEqual([]);
  });

  it("marks pending turns unavailable (not stuck on '…' forever) when the connection fails mid-transcription", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/realtime/session") return Promise.resolve(sessionFetchResponse());
      return Promise.resolve(sdpFetchResponse());
    });
    vi.stubGlobal("fetch", fetchMock);
    const { stream } = makeMicStream();
    const audioElement = makeAudioElement();

    const client = createRealtimeInterviewClient({
      config: CONFIG,
      micStream: stream,
      getAudioElement: () => audioElement as unknown as HTMLAudioElement,
    });

    client.connect();
    await flush();
    const dc = peerConnections[0].dataChannel!;
    dc.simulateMessage({ type: "session.created" });

    // A candidate turn is created but its transcription never arrives —
    // the connection dies first.
    dc.simulateMessage({
      type: "conversation.item.added",
      item: { id: "candidate_1", role: "user", type: "message" },
      previous_item_id: null,
    });
    // A completed interviewer turn should be left alone.
    dc.simulateMessage({
      type: "conversation.item.added",
      item: { id: "interviewer_1", role: "assistant", type: "message" },
      previous_item_id: "candidate_1",
    });
    dc.simulateMessage({
      type: "response.output_audio_transcript.done",
      item_id: "interviewer_1",
      transcript: "Welcome to the interview.",
    });
    expect(client.getState().transcript.map((t) => t.status)).toEqual([
      "pending",
      "complete",
    ]);

    peerConnections[0].simulateConnectionState("failed");

    expect(client.getState().status).toBe("error");
    const transcript = client.getState().transcript;
    expect(transcript.find((t) => t.id === "candidate_1")).toMatchObject({
      status: "unavailable",
    });
    expect(transcript.find((t) => t.id === "interviewer_1")).toMatchObject({
      status: "complete",
      transcript: "Welcome to the interview.",
    });
  });
});
