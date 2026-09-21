"use client";

import { useState, type FormEvent } from "react";
import type {
  InterviewConfig,
  InterviewDifficulty,
  InterviewType,
} from "@/src/types/interview";

interface InterviewSetupFormProps {
  onStart?: (config: InterviewConfig) => void;
}

const INTERVIEW_TYPES: { value: InterviewType; label: string }[] = [
  { value: "behavioral", label: "Behavioral" },
  { value: "technical", label: "Technical" },
  { value: "mixed", label: "Mixed" },
];

const DIFFICULTIES: { value: InterviewDifficulty; label: string }[] = [
  { value: "entry", label: "Entry Level" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

export default function InterviewSetupForm({
  onStart,
}: InterviewSetupFormProps) {
  const [config, setConfig] = useState<InterviewConfig>({
    role: "",
    type: "behavioral",
    difficulty: "entry",
  });

  const isValid = config.role.trim().length > 0;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    const trimmedConfig: InterviewConfig = { ...config, role: config.role.trim() };
    if (onStart) {
      onStart(trimmedConfig);
    } else {
      console.log("Interview config:", trimmedConfig);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-md rounded-2xl border border-black/10 bg-white p-8 shadow-sm dark:border-white/15 dark:bg-black"
    >
      <h1 className="text-xl font-semibold text-foreground">
        Set up your interview
      </h1>
      <p className="mt-1 text-sm text-foreground/60">
        Configure your mock interview before you begin.
      </p>

      <div className="mt-6 flex flex-col gap-6">
        <div>
          <label
            htmlFor="role"
            className="block text-sm font-medium text-foreground"
          >
            Target role
          </label>
          <input
            id="role"
            type="text"
            value={config.role}
            onChange={(e) =>
              setConfig((prev) => ({ ...prev, role: e.target.value }))
            }
            placeholder="e.g. Frontend Engineer"
            className="mt-2 w-full rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-foreground/40 dark:border-white/15"
          />
        </div>

        <fieldset>
          <legend className="block text-sm font-medium text-foreground">
            Interview type
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {INTERVIEW_TYPES.map((option) => (
              <label
                key={option.value}
                className={`cursor-pointer rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                  config.type === option.value
                    ? "border-foreground bg-foreground text-background"
                    : "border-black/10 text-foreground hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                }`}
              >
                <input
                  type="radio"
                  name="interview-type"
                  value={option.value}
                  checked={config.type === option.value}
                  onChange={() =>
                    setConfig((prev) => ({ ...prev, type: option.value }))
                  }
                  className="sr-only"
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="block text-sm font-medium text-foreground">
            Difficulty
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {DIFFICULTIES.map((option) => (
              <label
                key={option.value}
                className={`cursor-pointer rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                  config.difficulty === option.value
                    ? "border-foreground bg-foreground text-background"
                    : "border-black/10 text-foreground hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                }`}
              >
                <input
                  type="radio"
                  name="difficulty"
                  value={option.value}
                  checked={config.difficulty === option.value}
                  onChange={() =>
                    setConfig((prev) => ({ ...prev, difficulty: option.value }))
                  }
                  className="sr-only"
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>

        <button
          type="submit"
          disabled={!isValid}
          className="w-full rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          Start Interview
        </button>
      </div>
    </form>
  );
}
