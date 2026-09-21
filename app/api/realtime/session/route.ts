import { NextResponse } from "next/server";
import OpenAI from "openai";
import {
  InvalidInterviewConfigError,
  buildInterviewerInstructions,
  validateInterviewConfig,
} from "@/src/lib/realtime/session";

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }

  let config;
  try {
    const configField =
      typeof body === "object" && body !== null
        ? (body as Record<string, unknown>).config
        : undefined;
    config = validateInterviewConfig(configField);
  } catch (err) {
    if (err instanceof InvalidInterviewConfigError) {
      return jsonError(err.message, 400);
    }
    throw err;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("OPENAI_API_KEY is not configured.");
    return jsonError("Realtime sessions are not available right now.", 500);
  }

  const client = new OpenAI({ apiKey });

  try {
    const clientSecret = await client.realtime.clientSecrets.create({
      session: {
        type: "realtime",
        model: "gpt-realtime",
        instructions: buildInterviewerInstructions(config),
        audio: {
          input: {
            transcription: { model: "gpt-4o-mini-transcribe" },
          },
        },
      },
    });

    return NextResponse.json(
      { value: clientSecret.value, expires_at: clientSecret.expires_at },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("Failed to create realtime client secret:", err);
    return jsonError("Failed to start a realtime session.", 502);
  }
}
