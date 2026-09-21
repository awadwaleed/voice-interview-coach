import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRealtimeCall } from "@/src/lib/realtime/createRealtimeCall";

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
  readyState: string = "connecting";
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
}

class MockPeerConnection {
  ontrack: ((event: { streams: MediaStream[] }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  connectionState = "new";
  closed = false;
  addedTracks: unknown[] = [];
  dataChannel: MockDataChannel | null = null;

  createOfferImpl = () =>
    Promise.resolve({ type: "offer", sdp: "mock-offer-sdp" });
  setLocalDescriptionImpl = () => Promise.resolve();
  setRemoteDescriptionImpl = () => Promise.resolve();

  addTrack(track: unknown) {
    this.addedTracks.push(track);
    return {};
  }

  createDataChannel() {
    this.dataChannel = new MockDataChannel();
    return this.dataChannel;
  }

  createOffer() {
    return this.createOfferImpl();
  }

  setLocalDescription() {
    return this.setLocalDescriptionImpl();
  }

  setRemoteDescription() {
    return this.setRemoteDescriptionImpl();
  }

  close() {
    this.closed = true;
    this.connectionState = "closed";
  }
}

function makeMicStream(): MediaStream {
  const track = { stop: vi.fn(), kind: "audio" };
  return {
    getAudioTracks: () => [track],
  } as unknown as MediaStream;
}

function makeAudioElement() {
  return {
    srcObject: null as unknown,
    play: vi.fn(() => Promise.resolve()),
    pause: vi.fn(),
  };
}

let lastPeerConnection: MockPeerConnection | undefined;

beforeEach(() => {
  lastPeerConnection = undefined;
  vi.stubGlobal(
    "RTCPeerConnection",
    vi.fn().mockImplementation(function MockRTCPeerConnection() {
      lastPeerConnection = new MockPeerConnection();
      return lastPeerConnection;
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("createRealtimeCall", () => {
  it("attaches the mic track and creates the oai-events data channel synchronously", () => {
    const micStream = makeMicStream();
    const audioElement = makeAudioElement();
    createRealtimeCall({
      micStream,
      getAudioElement: () => audioElement as unknown as HTMLAudioElement,
      onEvent: vi.fn(),
      onConnectionStateChange: vi.fn(),
      onAudioBlocked: vi.fn(),
    });

    expect(lastPeerConnection?.addedTracks).toHaveLength(1);
    expect(lastPeerConnection?.dataChannel).toBeTruthy();
  });

  it("completes negotiate() end to end and lets sendEvent send once the channel is open", async () => {
    const micStream = makeMicStream();
    const audioElement = makeAudioElement();
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve("mock-answer-sdp"),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const call = createRealtimeCall({
      micStream,
      getAudioElement: () => audioElement as unknown as HTMLAudioElement,
      onEvent: vi.fn(),
      onConnectionStateChange: vi.fn(),
      onAudioBlocked: vi.fn(),
    });

    await call.negotiate("ek_test");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/realtime/calls",
      expect.objectContaining({
        method: "POST",
        body: "mock-offer-sdp",
        headers: expect.objectContaining({ Authorization: "Bearer ek_test" }),
      }),
    );

    lastPeerConnection!.dataChannel!.readyState = "open";
    call.sendEvent({ type: "response.create" });
    expect(lastPeerConnection!.dataChannel!.sent).toEqual([
      JSON.stringify({ type: "response.create" }),
    ]);
  });

  it("ignores sendEvent when the data channel is not open", () => {
    const micStream = makeMicStream();
    const audioElement = makeAudioElement();
    const call = createRealtimeCall({
      micStream,
      getAudioElement: () => audioElement as unknown as HTMLAudioElement,
      onEvent: vi.fn(),
      onConnectionStateChange: vi.fn(),
      onAudioBlocked: vi.fn(),
    });

    call.sendEvent({ type: "response.create" });
    expect(lastPeerConnection!.dataChannel!.sent).toEqual([]);
  });

  it("stops checking closed and never calls setRemoteDescription if disconnected mid-negotiation (during createOffer)", async () => {
    const micStream = makeMicStream();
    const audioElement = makeAudioElement();
    const offerDeferred = createDeferred<{ type: string; sdp: string }>();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const call = createRealtimeCall({
      micStream,
      getAudioElement: () => audioElement as unknown as HTMLAudioElement,
      onEvent: vi.fn(),
      onConnectionStateChange: vi.fn(),
      onAudioBlocked: vi.fn(),
    });
    lastPeerConnection!.createOfferImpl = () => offerDeferred.promise;

    const negotiatePromise = call.negotiate("ek_test");
    call.disconnect();
    offerDeferred.resolve({ type: "offer", sdp: "mock-offer-sdp" });
    await negotiatePromise;

    expect(fetchMock).not.toHaveBeenCalled();
    expect(lastPeerConnection!.closed).toBe(true);
  });

  it("aborts the SDP fetch and never calls setRemoteDescription if disconnected while it's in flight", async () => {
    const micStream = makeMicStream();
    const audioElement = makeAudioElement();
    let capturedSignal: AbortSignal | undefined;
    const fetchDeferred = createDeferred<Response>();
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      capturedSignal = init?.signal ?? undefined;
      return fetchDeferred.promise;
    });
    vi.stubGlobal("fetch", fetchMock);

    const call = createRealtimeCall({
      micStream,
      getAudioElement: () => audioElement as unknown as HTMLAudioElement,
      onEvent: vi.fn(),
      onConnectionStateChange: vi.fn(),
      onAudioBlocked: vi.fn(),
    });

    const setRemoteSpy = vi.spyOn(lastPeerConnection!, "setRemoteDescription");
    const negotiatePromise = call.negotiate("ek_test");
    // Let negotiate() run past its createOffer()/setLocalDescription()
    // awaits so the SDP fetch has actually started before disconnecting.
    await Promise.resolve();
    await Promise.resolve();
    call.disconnect();

    expect(capturedSignal?.aborted).toBe(true);

    // The abort makes the underlying fetch reject — createRealtimeCall
    // doesn't swallow that itself (createRealtimeInterviewClient does, by
    // checking the same signal), so negotiate() is expected to reject too.
    fetchDeferred.reject(new DOMException("Aborted", "AbortError"));
    await expect(negotiatePromise).rejects.toThrow();
    expect(setRemoteSpy).not.toHaveBeenCalled();
  });

  it("never calls setRemoteDescription if disconnected after the SDP response arrives but before text() resolves", async () => {
    const micStream = makeMicStream();
    const audioElement = makeAudioElement();
    const textDeferred = createDeferred<string>();
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, text: () => textDeferred.promise }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const call = createRealtimeCall({
      micStream,
      getAudioElement: () => audioElement as unknown as HTMLAudioElement,
      onEvent: vi.fn(),
      onConnectionStateChange: vi.fn(),
      onAudioBlocked: vi.fn(),
    });
    const setRemoteSpy = vi.spyOn(lastPeerConnection!, "setRemoteDescription");

    const negotiatePromise = call.negotiate("ek_test");
    // Let the fetch itself resolve, then disconnect before text() resolves.
    await Promise.resolve();
    await Promise.resolve();
    call.disconnect();
    textDeferred.resolve("mock-answer-sdp");
    await negotiatePromise;

    expect(setRemoteSpy).not.toHaveBeenCalled();
  });

  it("disconnect() is idempotent and closes pc/dc, nulls handlers, and detaches remote audio", () => {
    const micStream = makeMicStream();
    const audioElement = makeAudioElement();
    audioElement.srcObject = {} as unknown;

    const call = createRealtimeCall({
      micStream,
      getAudioElement: () => audioElement as unknown as HTMLAudioElement,
      onEvent: vi.fn(),
      onConnectionStateChange: vi.fn(),
      onAudioBlocked: vi.fn(),
    });

    call.disconnect();
    call.disconnect(); // must not throw

    expect(lastPeerConnection!.closed).toBe(true);
    expect(lastPeerConnection!.dataChannel!.closed).toBe(true);
    expect(lastPeerConnection!.ontrack).toBeNull();
    expect(lastPeerConnection!.onconnectionstatechange).toBeNull();
    expect(audioElement.pause).toHaveBeenCalled();
    expect(audioElement.srcObject).toBeNull();
  });

  it("never stops the microphone track itself — that stays owned by the caller", () => {
    const micStream = makeMicStream();
    const [track] = micStream.getAudioTracks();
    const audioElement = makeAudioElement();

    const call = createRealtimeCall({
      micStream,
      getAudioElement: () => audioElement as unknown as HTMLAudioElement,
      onEvent: vi.fn(),
      onConnectionStateChange: vi.fn(),
      onAudioBlocked: vi.fn(),
    });
    call.disconnect();

    expect((track as unknown as { stop: ReturnType<typeof vi.fn> }).stop).not.toHaveBeenCalled();
  });

  it("guards a delayed play() rejection against a call that's already been disconnected", async () => {
    const micStream = makeMicStream();
    const playDeferred = createDeferred<void>();
    const audioElement = {
      srcObject: null as unknown,
      play: vi.fn(() => playDeferred.promise),
      pause: vi.fn(),
    };
    const onAudioBlocked = vi.fn();

    const call = createRealtimeCall({
      micStream,
      getAudioElement: () => audioElement as unknown as HTMLAudioElement,
      onEvent: vi.fn(),
      onConnectionStateChange: vi.fn(),
      onAudioBlocked,
    });

    lastPeerConnection!.ontrack?.({ streams: [{} as MediaStream] });
    call.disconnect();
    playDeferred.reject(new Error("NotAllowedError"));
    await Promise.resolve().then(() => Promise.resolve());

    expect(onAudioBlocked).not.toHaveBeenCalled();
  });

  it("reports audio blocked when play() rejects on a still-connected call", async () => {
    const micStream = makeMicStream();
    const audioElement = {
      srcObject: null as unknown,
      play: vi.fn(() => Promise.reject(new Error("NotAllowedError"))),
      pause: vi.fn(),
    };
    const onAudioBlocked = vi.fn();

    createRealtimeCall({
      micStream,
      getAudioElement: () => audioElement as unknown as HTMLAudioElement,
      onEvent: vi.fn(),
      onConnectionStateChange: vi.fn(),
      onAudioBlocked,
    });

    lastPeerConnection!.ontrack?.({ streams: [{} as MediaStream] });
    await Promise.resolve().then(() => Promise.resolve());

    expect(onAudioBlocked).toHaveBeenCalledTimes(1);
  });

  it("cleans up a partially-created peer connection if synchronous setup throws", () => {
    vi.stubGlobal(
      "RTCPeerConnection",
      vi.fn().mockImplementation(function MockRTCPeerConnection() {
        const pc = new MockPeerConnection();
        pc.createDataChannel = () => {
          throw new Error("boom");
        };
        lastPeerConnection = pc;
        return pc;
      }),
    );
    const micStream = makeMicStream();
    const audioElement = makeAudioElement();

    expect(() =>
      createRealtimeCall({
        micStream,
        getAudioElement: () => audioElement as unknown as HTMLAudioElement,
        onEvent: vi.fn(),
        onConnectionStateChange: vi.fn(),
        onAudioBlocked: vi.fn(),
      }),
    ).toThrow("boom");

    expect(lastPeerConnection!.closed).toBe(true);
  });

  it("ignores connection state changes and data-channel messages after disconnect", () => {
    const micStream = makeMicStream();
    const audioElement = makeAudioElement();
    const onEvent = vi.fn();
    const onConnectionStateChange = vi.fn();

    const call = createRealtimeCall({
      micStream,
      getAudioElement: () => audioElement as unknown as HTMLAudioElement,
      onEvent,
      onConnectionStateChange,
      onAudioBlocked: vi.fn(),
    });

    const dc = lastPeerConnection!.dataChannel!;
    const onMessageBeforeDisconnect = dc.onmessage;
    const onStateChangeBeforeDisconnect = lastPeerConnection!.onconnectionstatechange;

    call.disconnect();

    // Simulate late-arriving browser events using the handlers captured
    // before disconnect() nulled them out on the (now-closed) objects.
    onMessageBeforeDisconnect?.({ data: JSON.stringify({ type: "session.created" }) });
    onStateChangeBeforeDisconnect?.();

    expect(onEvent).not.toHaveBeenCalled();
    expect(onConnectionStateChange).not.toHaveBeenCalled();
  });
});
