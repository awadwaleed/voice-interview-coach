# Architecture

## Technology Stack

- Next.js
- React
- TypeScript
- Tailwind CSS
- OpenAI API
- OpenAI Realtime API
- WebRTC

## High-Level Architecture

The application is divided into three major systems:

1. Interview UI
2. Realtime interview engine
3. Post-interview feedback engine

## Browser

The browser is responsible for:

- Rendering the interview interface.
- Requesting microphone permission.
- Capturing microphone audio.
- Managing the WebRTC connection.
- Playing interviewer audio.
- Receiving realtime events.
- Displaying interview state.
- Maintaining the client-side transcript.

## Next.js Server

The server is responsible for trusted operations including:

- Communicating with OpenAI using the server API key.
- Creating short-lived credentials required for browser Realtime sessions.
- Handling post-interview feedback requests.
- Keeping private configuration and secrets off the client.

The permanent OPENAI_API_KEY must never be exposed to browser code.

## Realtime Interview Engine

The live interview will use the OpenAI Realtime API over WebRTC.

Responsibilities include:

- Connection lifecycle
- Microphone audio
- Interviewer audio
- Realtime events
- Turn detection
- Transcript events
- Disconnect and cleanup behavior

The realtime system should be isolated behind an application-level interface so UI components do not depend directly on WebRTC implementation details.

## Interview Application Layer

The interview layer manages application state such as:

- Interview configuration
- Interview status
- Current question
- Transcript
- Interview duration
- Start and end behavior

Possible interview states include:

- idle
- connecting
- active
- ending
- analyzing
- complete
- error

## Feedback Engine

Post-interview evaluation is separate from the live interviewer.

When an interview ends:

1. The completed transcript is collected.
2. The transcript and interview configuration are sent to the server.
3. A separate model evaluates the interview.
4. Structured feedback is returned.
5. The results are displayed by the feedback UI.

The live interviewer should conduct the interview.

The feedback system should evaluate the interview.

These are intentionally separate responsibilities.

## Persistence

The MVP will not initially require a database.

Interview state may remain in memory while developing the core experience.

Persistence can be introduced later for:

- Accounts
- Interview history
- Saved feedback
- Analytics
- User preferences

## Security

- OPENAI_API_KEY remains server-side.
- Browser code must never contain the permanent OpenAI API key.
- Environment secrets are stored in .env.local.
- .env.local is excluded from Git.
- Browser Realtime access should use short-lived credentials created by the server.
