const REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";
const EVENTS_CHANNEL_LABEL = "oai-events";

export interface CreateRealtimeCallOptions {
  micStream: MediaStream;
  getAudioElement: () => HTMLAudioElement | null;
  onEvent: (event: unknown) => void;
  onConnectionStateChange: (state: RTCPeerConnectionState) => void;
  onAudioBlocked: () => void;
}

export interface RealtimeCallHandle {
  negotiate: (ephemeralKey: string) => Promise<void>;
  disconnect: () => void;
  sendEvent: (event: unknown) => void;
}

/**
 * Low-level WebRTC transport for a single OpenAI Realtime call. No React,
 * no attempt/generation tracking — that lives in createRealtimeInterviewClient.
 *
 * The peer connection and its own AbortController are created synchronously,
 * before any `await`, so `disconnect()` can tear down a real, live connection
 * at any point during negotiate() — not just after it resolves.
 */
export function createRealtimeCall({
  micStream,
  getAudioElement,
  onEvent,
  onConnectionStateChange,
  onAudioBlocked,
}: CreateRealtimeCallOptions): RealtimeCallHandle {
  let closed = false;
  const abortController = new AbortController();
  const pc = new RTCPeerConnection();
  let dc: RTCDataChannel;
  // The specific element the remote stream was attached to, captured at
  // attach time. On unmount, React may already have nulled the ref this
  // call's getAudioElement() reads from before our cleanup runs — but the
  // actual DOM node this stream was attached to still needs pause()/
  // srcObject cleared directly, independent of whether the ref still
  // resolves to it.
  let attachedAudioElement: HTMLAudioElement | null = null;

  try {
    pc.ontrack = (event) => {
      if (closed) return;
      const audioElement = getAudioElement();
      if (!audioElement) return;
      attachedAudioElement = audioElement;
      audioElement.srcObject = event.streams[0] ?? null;
      audioElement.play().catch(() => {
        // Guard against a delayed play() rejection from a call that has
        // since been disconnected/superseded — it must not mark a newer
        // call as blocked.
        if (!closed) onAudioBlocked();
      });
    };

    pc.onconnectionstatechange = () => {
      if (closed) return;
      onConnectionStateChange(pc.connectionState);
    };

    const [audioTrack] = micStream.getAudioTracks();
    if (audioTrack) {
      pc.addTrack(audioTrack, micStream);
    }

    dc = pc.createDataChannel(EVENTS_CHANNEL_LABEL);
    dc.onmessage = (event) => {
      if (closed) return;
      try {
        onEvent(JSON.parse(event.data));
      } catch {
        // Ignore malformed/non-JSON messages.
      }
    };
  } catch (err) {
    abortController.abort();
    pc.close();
    throw err;
  }

  function disconnect() {
    if (closed) return;
    // Invalidate before tearing down so any synchronous re-entrant callback
    // triggered by close() itself already sees a closed transport.
    closed = true;
    abortController.abort();
    dc.onmessage = null;
    pc.ontrack = null;
    pc.onconnectionstatechange = null;
    dc.close();
    pc.close();

    if (attachedAudioElement) {
      attachedAudioElement.pause();
      attachedAudioElement.srcObject = null;
    }
  }

  async function negotiate(ephemeralKey: string) {
    if (closed) return;
    const offer = await pc.createOffer();
    if (closed) return;

    await pc.setLocalDescription(offer);
    if (closed) return;

    const response = await fetch(REALTIME_CALLS_URL, {
      method: "POST",
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${ephemeralKey}`,
        "Content-Type": "application/sdp",
      },
      signal: abortController.signal,
    });
    if (closed) return;

    if (!response.ok) {
      throw new Error(`Realtime connection failed (${response.status}).`);
    }

    const answerSdp = await response.text();
    if (closed) return;

    await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
  }

  function sendEvent(event: unknown) {
    if (closed || dc.readyState !== "open") return;
    dc.send(JSON.stringify(event));
  }

  return { negotiate, disconnect, sendEvent };
}
