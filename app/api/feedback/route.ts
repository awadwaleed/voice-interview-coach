import { NextResponse } from "next/server";
import OpenAI from "openai";
import {
  InvalidInterviewConfigError,
  validateInterviewConfig,
} from "@/src/lib/interview/config";
import {
  InvalidTranscriptError,
  hasEvaluableContent,
  validateTranscript,
} from "@/src/lib/feedback/validateTranscript";
import {
  InvalidFeedbackResponseError,
  generateInterviewFeedback,
} from "@/src/lib/feedback/generateFeedback";

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

  const bodyRecord =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : undefined;

  let config;
  try {
    config = validateInterviewConfig(bodyRecord?.config);
  } catch (err) {
    if (err instanceof InvalidInterviewConfigError) {
      return jsonError(err.message, 400);
    }
    throw err;
  }

  let transcript;
  try {
    transcript = validateTranscript(bodyRecord?.transcript);
  } catch (err) {
    if (err instanceof InvalidTranscriptError) {
      return jsonError(err.message, 400);
    }
    throw err;
  }

  // The UI already gates this, but this endpoint must not trust that — a
  // direct request with only interviewer turns (or only pending/failed/
  // unavailable candidate turns) has nothing for the evaluator to assess.
  if (!hasEvaluableContent(transcript)) {
    return jsonError(
      "The transcript has no candidate answers to evaluate.",
      400,
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("OPENAI_API_KEY is not configured.");
    return jsonError("Feedback analysis is not available right now.", 500);
  }

  try {
    const feedback = await generateInterviewFeedback({ apiKey, config, transcript });
    return NextResponse.json(
      { feedback },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    if (err instanceof InvalidFeedbackResponseError) {
      console.error("Feedback model returned an invalid response.", {
        name: err.name,
      });
      return jsonError("Failed to generate feedback.", 502);
    }

    // Log only structured, non-sensitive diagnostics — never the raw error
    // object/message, which may embed upstream response text.
    const diagnostics =
      err instanceof OpenAI.APIError
        ? {
            status: err.status,
            code: err.code,
            type: err.type,
            requestID: err.requestID,
          }
        : { name: err instanceof Error ? err.name : typeof err };
    console.error("Failed to generate interview feedback.", diagnostics);
    return jsonError("Failed to generate feedback.", 502);
  }
}
