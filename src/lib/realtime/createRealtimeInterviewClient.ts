import type {
  InterviewConfig,
  InterviewStatus,
  InterviewTurn,
} from "@/src/types/interview";
import { createRealtimeCall } from "@/src/lib/realtime/createRealtimeCall";
import { applyRealtimeEventToTranscript } from "@/src/lib/realtime/transcript";

const SESSION_ENDPOINT = "/api/realtime/session";

export interface RealtimeInterviewState {
  status: InterviewStatus;
  error: string | null;
  audioBlocked: boolean;
  transcript: InterviewTurn[];
}

export interface RealtimeInterviewClient {
  getState: () => RealtimeInterviewState;
  /** Adds the listener and immediately invokes it once with the current state. */
  subscribe: (listener: () => void) => () => void;
  connect: () => void;
  disconnect: () => void;
  resumeAudio: () => void;
}

interface CreateRealtimeInterviewClientOptions {
  config: InterviewConfig;
  micStream: MediaStream;
  getAudioElement: () => HTMLAudioElement | null;
}

const IDLE_STATE: RealtimeInterviewState = {
  status: "idle",
  error: null,
  audioBlocked: false,
  transcript: [],
};

/**
 * Orchestrates a single realtime interview connection: fetches an ephemeral
 * credential, hands it to the WebRTC transport, and translates transport
 * events into InterviewStatus. Plain TypeScript (no React) so the hard
 * concurrency/cancellation logic here is unit-testable without a DOM.
 *
 * This client never touches the microphone's lifecycle — it only reads
 * `micStream`'s tracks. Stopping/starting the microphone remains the sole
 * responsibility of useMicrophoneStream. On connection failure this client
 * tears down its own call but deliberately leaves the microphone alone so
 * the caller can offer both Retry and Stop Microphone.
 */
export function createRealtimeInterviewClient({
  config,
  micStream,
  getAudioElement,
}: CreateRealtimeInterviewClientOptions): RealtimeInterviewClient {
  let state: RealtimeInterviewState = IDLE_STATE;
  const listeners = new Set<() => void>();

  function setState(patch: Partial<RealtimeInterviewState>) {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  }

  // Bumped on every accepted connect()/disconnect() so a stale attempt's
  // callbacks/continuations can recognize they've been superseded. Only an
  // *accepted* new attempt advances this — a rejected duplicate connect()
  // call must never invalidate the attempt already in flight.
  let attemptId = 0;
  let activeCall: ReturnType<typeof createRealtimeCall> | null = null;
  let credentialFetchController: AbortController | null = null;

  function teardown() {
    // Pure resource cleanup — never touches `state`. Callers decide whether
    // and what to set afterward.
    credentialFetchController?.abort();
    credentialFetchController = null;
    activeCall?.disconnect();
    activeCall = null;
  }

  function disconnect() {
    attemptId += 1;
    teardown();
    setState(IDLE_STATE);
  }

  function connect() {
    if (state.status === "connecting" || state.status === "active") return;

    const myAttempt = ++attemptId;
    teardown(); // defensive: clear any stale call left over from a prior error path
    // A new attempt is a brand-new server-side conversation (fresh
    // credential, fresh SDP negotiation) with no continuity from any prior
    // attempt, so carrying over old turns would misrepresent what the
    // model actually has context on.
    setState({ status: "connecting", error: null, audioBlocked: false, transcript: [] });

    const controller = new AbortController();
    credentialFetchController = controller;

    function fail(message: string) {
      if (attemptId !== myAttempt) return;
      teardown();
      setState({ status: "error", error: message });
    }

    let call: ReturnType<typeof createRealtimeCall>;
    try {
      call = createRealtimeCall({
        micStream,
        getAudioElement,
        onEvent: (event) => {
          if (attemptId !== myAttempt) return;
          handleEvent(event, call);
        },
        onConnectionStateChange: (rtcState) => {
          if (attemptId !== myAttempt) return;
          if (rtcState === "failed" || rtcState === "closed") {
            fail("The realtime connection was lost.");
          }
        },
        onAudioBlocked: () => {
          if (attemptId !== myAttempt) return;
          setState({ audioBlocked: true });
        },
      });
    } catch (err) {
      // Synchronous transport setup (RTCPeerConnection/addTrack/
      // createDataChannel) failed before any async work even started.
      // Without this, status would be stuck at "connecting" forever: no
      // error state, no Retry, Stop Microphone hidden, future connect()
      // calls ignored. fail() -> teardown() aborts/clears
      // credentialFetchController for us.
      fail(
        err instanceof Error
          ? err.message
          : "Failed to start the realtime connection.",
      );
      return;
    }
    activeCall = call;

    function handleEvent(event: unknown, thisCall: typeof call) {
      const type = (event as { type?: unknown } | null)?.type;
      if (type === "session.created") {
        thisCall.sendEvent({ type: "response.create" });
        setState({ status: "active" });
      } else if (type === "error") {
        const message =
          (event as { error?: { message?: string } }).error?.message ??
          "A realtime session error occurred.";
        fail(message);
      } else {
        const nextTranscript = applyRealtimeEventToTranscript(
          state.transcript,
          event,
        );
        if (nextTranscript !== state.transcript) {
          setState({ transcript: nextTranscript });
        }
      }
    }

    (async () => {
      try {
        const res = await fetch(SESSION_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ config }),
          signal: controller.signal,
        });
        if (attemptId !== myAttempt) return;

        if (!res.ok) {
          throw new Error(
            `Failed to obtain a realtime session (${res.status}).`,
          );
        }

        const body = await res.json();
        if (attemptId !== myAttempt) return;

        const ephemeralKey = (body as { value?: string }).value;
        if (!ephemeralKey) {
          throw new Error("Realtime session response was missing a value.");
        }

        await call.negotiate(ephemeralKey);
        // Status only flips to "active" once the session.created event
        // arrives over the data channel — negotiate() resolving only means
        // the transport-level handshake succeeded, not that the
        // application session is ready.
      } catch (err) {
        if (attemptId !== myAttempt) return; // stale/superseded — ignore
        if (controller.signal.aborted) return; // expected cancellation
        fail(
          err instanceof Error
            ? err.message
            : "Failed to connect to the interview.",
        );
      }
    })();
  }

  function resumeAudio() {
    // Capture the attempt this call belongs to: if it's superseded by a
    // disconnect/reconnect before play() settles, a late completion must
    // not touch a newer attempt's (possibly still genuinely blocked) state.
    const myAttempt = attemptId;
    const audioElement = getAudioElement();
    audioElement?.play().then(
      () => {
        if (attemptId !== myAttempt) return;
        setState({ audioBlocked: false });
      },
      () => {
        // Still blocked; leave audioBlocked true.
      },
    );
  }

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      listener();
      return () => listeners.delete(listener);
    },
    connect,
    disconnect,
    resumeAudio,
  };
}
