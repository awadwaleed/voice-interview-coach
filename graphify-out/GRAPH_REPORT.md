# Graph Report - voice-interview-coach  (2026-09-23)

## Corpus Check
- Corpus is ~19,030 words - fits in a single context window. You may not need a graph.

## Summary
- 297 nodes · 501 edges · 18 communities (13 shown, 5 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 24 edges (avg confidence: 0.85)
- Token cost: 66,692 input · 0 output

## Community Hubs (Navigation)
- App Config, Layout & API Route Tests
- Package Dependencies & Tooling Config
- Interview UI Components & Shared Types
- WebRTC Realtime Call Transport
- Architecture & Product Documentation
- Feedback Generation Engine
- Interview Screen, Mic Capture & Finalization
- Realtime Interview Client Orchestration
- Realtime Client Test Mocks
- TypeScript Compiler Configuration
- Feedback API Route & Transcript Validation
- Transcript Event Reducer
- Interview Setup Flow (Docs)
- Microphone Permission Flow (Docs)
- Persistence & MVP Non-Goals (Docs)
- No-Coaching Interview Principle (Docs)
- PostCSS Configuration
- Interview Continuation Loop (Docs)

## God Nodes (most connected - your core abstractions)
1. `InterviewConfig` - 18 edges
2. `InterviewTurn` - 18 edges
3. `compilerOptions` - 16 edges
4. `vitest` - 12 edges
5. `createRealtimeInterviewClient()` - 12 edges
6. `MockPeerConnection` - 10 edges
7. `applyRealtimeEventToTranscript()` - 10 edges
8. `react` - 8 edges
9. `generateInterviewFeedback()` - 8 edges
10. `createRealtimeCall()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `POST()` --calls--> `generateInterviewFeedback()`  [EXTRACTED]
  app/api/feedback/route.ts → src/lib/feedback/generateFeedback.ts
- `POST()` --calls--> `validateInterviewConfig()`  [EXTRACTED]
  app/api/feedback/route.ts → src/lib/interview/config.ts
- `Next.js Bootstrapped Project` --conceptually_related_to--> `Technology Stack`  [INFERRED]
  README.md → docs/ARCHITECTURE.md
- `POST()` --calls--> `hasEvaluableContent()`  [EXTRACTED]
  app/api/feedback/route.ts → src/lib/feedback/validateTranscript.ts
- `POST()` --calls--> `validateTranscript()`  [EXTRACTED]
  app/api/feedback/route.ts → src/lib/feedback/validateTranscript.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Three Major Application Systems** — docs_architecture_interview_ui, docs_architecture_realtime_interview_engine, docs_architecture_feedback_engine [EXTRACTED 1.00]
- **End-to-End Interview Flow Pipeline** — docs_interview_flow_setup, docs_interview_flow_microphone_permission, docs_interview_flow_realtime_connection, docs_interview_flow_interview_begins, docs_interview_flow_candidate_response, docs_interview_flow_interview_continues, docs_interview_flow_interview_ends, docs_interview_flow_feedback_analysis, docs_interview_flow_feedback_results [EXTRACTED 1.00]
- **Live Interview vs Post-Interview Coaching Separation** — docs_product_product_principle, docs_interview_flow_no_coaching_principle, docs_architecture_feedback_separation_principle [INFERRED 0.85]

## Communities (18 total, 5 thin omitted)

### Community 0 - "App Config, Layout & API Route Tests"
Cohesion: 0.07
Nodes (26): createMock, makeJsonRequest(), makeRequest(), MockAPIError, VALID_CONFIG, VALID_FEEDBACK, VALID_TRANSCRIPT, jsonError() (+18 more)

### Community 1 - "Package Dependencies & Tooling Config"
Cohesion: 0.06
Nodes (34): eslintConfig, dependencies, next, openai, react, react-dom, devDependencies, eslint (+26 more)

### Community 2 - "Interview UI Components & Shared Types"
Cohesion: 0.12
Nodes (24): react, InterviewApp(), Stage, InterviewFeedbackScreen(), InterviewFeedbackScreenProps, InterviewScreenProps, DIFFICULTIES, INTERVIEW_TYPES (+16 more)

### Community 3 - "WebRTC Realtime Call Transport"
Cohesion: 0.10
Nodes (5): createRealtimeCall(), CreateRealtimeCallOptions, RealtimeCallHandle, MockDataChannel, MockPeerConnection

### Community 4 - "Architecture & Product Documentation"
Cohesion: 0.09
Nodes (23): Short-Lived Credential Security Principle, Feedback Engine, Live Interview / Feedback Separation Principle, High-Level Architecture (Three Systems), Interview Application Layer, Interview UI System, Next.js Server Responsibilities, Realtime Interview Engine (+15 more)

### Community 5 - "Feedback Generation Engine"
Cohesion: 0.16
Nodes (19): ANSWER_FEEDBACK_SCHEMA, buildFeedbackPrompt(), countMissingCandidateTurns(), DIFFICULTY_DESCRIPTIONS, FEEDBACK_JSON_SCHEMA, formatTranscript(), generateInterviewFeedback(), getEligibleAnswerTurnIds() (+11 more)

### Community 6 - "Interview Screen, Mic Capture & Finalization"
Cohesion: 0.16
Nodes (13): PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS, DIFFICULTY_LABELS, InterviewScreen(), SPEAKER_LABELS, TYPE_LABELS, MicrophoneStatus, stopAllTracks() (+5 more)

### Community 7 - "Realtime Interview Client Orchestration"
Cohesion: 0.20
Nodes (18): createIdleRealtimeClient(), IDLE_STATE, useRealtimeInterview(), UseRealtimeInterviewResult, createRealtimeInterviewClient(), connect(), applyTranscriptEvent(), fail() (+10 more)

### Community 8 - "Realtime Client Test Mocks"
Cohesion: 0.12
Nodes (3): CONFIG, MockDataChannel, MockPeerConnection

### Community 9 - "TypeScript Compiler Configuration"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 10 - "Feedback API Route & Transcript Validation"
Cohesion: 0.23
Nodes (11): jsonError(), POST(), hasEvaluableContent(), InvalidTranscriptError, isRecord(), SPEAKERS, TURN_STATUSES, validateTranscript() (+3 more)

### Community 11 - "Transcript Event Reducer"
Cohesion: 0.21
Nodes (7): applyRealtimeEventToTranscript(), insertOrdered(), isRecord(), roleToSpeaker(), TERMINAL_STATUSES, withTranscriptText(), withTurn()

### Community 12 - "Interview Setup Flow (Docs)"
Cohesion: 0.67
Nodes (3): Flow Step 1: Setup, Core User Flow, Interview Setup Feature

## Knowledge Gaps
- **101 isolated node(s):** `createMock`, `VALID_CONFIG`, `VALID_TRANSCRIPT`, `VALID_FEEDBACK`, `createMock` (+96 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 146 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `App Config, Layout & API Route Tests` to `Package Dependencies & Tooling Config`, `WebRTC Realtime Call Transport`, `Feedback Generation Engine`, `Interview Screen, Mic Capture & Finalization`, `Realtime Client Test Mocks`, `Feedback API Route & Transcript Validation`, `Transcript Event Reducer`?**
  _High betweenness centrality (0.216) - this node is a cross-community bridge._
- **Why does `react` connect `Interview UI Components & Shared Types` to `Package Dependencies & Tooling Config`, `Interview Screen, Mic Capture & Finalization`, `Realtime Interview Client Orchestration`?**
  _High betweenness centrality (0.060) - this node is a cross-community bridge._
- **Why does `InterviewConfig` connect `Interview UI Components & Shared Types` to `Realtime Client Test Mocks`, `Feedback Generation Engine`, `Interview Screen, Mic Capture & Finalization`, `Realtime Interview Client Orchestration`?**
  _High betweenness centrality (0.056) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `createRealtimeInterviewClient()` (e.g. with `connect()` and `disconnect()`) actually correct?**
  _`createRealtimeInterviewClient()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `createMock`, `VALID_CONFIG`, `VALID_TRANSCRIPT` to the rest of the system?**
  _101 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `App Config, Layout & API Route Tests` be split into smaller, more focused modules?**
  _Cohesion score 0.06906906906906907 - nodes in this community are weakly interconnected._
- **Should `Package Dependencies & Tooling Config` be split into smaller, more focused modules?**
  _Cohesion score 0.05714285714285714 - nodes in this community are weakly interconnected._