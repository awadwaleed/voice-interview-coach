# Voice Interview Coach

## Purpose

Voice Interview Coach is a browser-based application that conducts realistic spoken mock interviews using AI and provides structured feedback after the interview.

The initial focus is software engineering interview practice.

## Core User Flow

1. User configures an interview.
2. User starts the interview and grants microphone access.
3. An AI interviewer conducts a live spoken interview.
4. The user responds naturally using their microphone.
5. The interviewer asks questions and appropriate follow-up questions.
6. The user ends the interview or the interview reaches completion.
7. The application analyzes the completed interview.
8. The user receives structured feedback.

## MVP Features

### Interview Setup

The user can select:

- Target role
- Interview type
- Difficulty

Initial interview types:

- Behavioral
- Technical
- Mixed

### Live Interview

The application will:

- Capture microphone audio.
- Conduct a realtime spoken conversation.
- Display interview state.
- Maintain a transcript of the conversation.
- Allow the user to end the interview.

### Interview Feedback

After the interview, the application will provide:

- Overall feedback
- Strengths
- Areas for improvement
- Communication feedback
- Question-by-question feedback

Behavioral answers may also be evaluated for STAR structure.

## MVP Non-Goals

The first version will not include:

- User accounts
- Payments
- Subscriptions
- Resume parsing
- Job description parsing
- Company-specific interviews
- Leaderboards
- Avatars
- Emotion detection
- Social features

These can be considered after the core interview experience works reliably.

## Product Principle

The interview itself should feel like an interview, not a tutoring session.

The AI interviewer should not coach the user during the interview. Coaching and evaluation happen after the interview is complete.
