# Voice Interview Coach

A browser-based app that conducts realistic spoken mock interviews using the OpenAI Realtime API over WebRTC, then generates structured feedback after the interview ends.

See [docs/PRODUCT.md](docs/PRODUCT.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), and [docs/INTERVIEW_FLOW.md](docs/INTERVIEW_FLOW.md) for the product scope, architecture, and interview flow.

## Prerequisites

- Node.js 20+
- An [OpenAI API key](https://platform.openai.com/api-keys) from an account with:
  - Access to the Realtime API (model `gpt-realtime`)
  - Active billing / available credit — the Realtime API requires a paid account, and new/low-usage orgs may see low rate limits

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and fill in your API key:

   ```bash
   cp .env.example .env.local
   ```

   ```
   OPENAI_API_KEY=sk-...
   ```

   This key is read only on the server (`app/api/realtime/session`, `app/api/feedback`) and is never sent to the browser. `.env.local` is already covered by `.gitignore` — do not commit it or paste your key anywhere else.

3. Run the dev server:

   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000), grant microphone access when prompted, configure an interview, and click **Connect** to start.

## Testing your setup

- **End-to-end**: run through the app in the browser — configure an interview, connect, speak a few answers, end the interview, and confirm feedback is generated.
- **Automated checks**:

  ```bash
  npm test          # vitest unit/integration tests
  npx tsc --noEmit   # type checking
  npm run lint       # ESLint
  npm run build      # production build
  ```

## Troubleshooting

- **`Failed to obtain a realtime session (500)`**: `OPENAI_API_KEY` is missing or the dev server was started before it was set. Add/update it in `.env.local` and restart `npm run dev` (env vars are only read at server startup).
- **`Realtime connection failed (429)`**: OpenAI rate-limited or rejected the WebRTC call directly (this happens browser-side, after your server already issued a valid short-lived credential). Check your [usage/rate limits](https://platform.openai.com/settings/organization/limits) and billing status, then retry.
- **Microphone permission denied**: allow microphone access for `localhost:3000` in your browser's site settings and retry.

## Learn More

This project uses [Next.js](https://nextjs.org) (App Router), React, TypeScript, and Tailwind CSS. See the [Next.js documentation](https://nextjs.org/docs) for framework-level details.
