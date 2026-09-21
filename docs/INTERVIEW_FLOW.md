# Interview Flow

## 1. Setup

User opens the application.

The setup screen asks for:

- Target role
- Interview type
- Difficulty

User selects configuration and presses:

Start Interview

## 2. Microphone Permission

The browser requests microphone permission.

If permission is denied:

- Display an understandable error.
- Explain that microphone access is required.
- Allow the user to retry.

If permission succeeds:

- Continue to connection setup.

## 3. Realtime Connection

The browser requests a short-lived Realtime credential from the Next.js server.

The browser then creates a WebRTC connection to the OpenAI Realtime API.

Application state:

connecting

Once the connection succeeds:

active

## 4. Interview Begins

The AI interviewer introduces the interview and asks the first question.

The interviewer should:

- Ask one question at a time.
- Wait for the candidate to answer.
- Ask reasonable follow-up questions.
- Avoid coaching during the interview.
- Maintain a realistic professional interview style.

## 5. Candidate Response

The candidate answers through the microphone.

The realtime system handles:

- Audio transmission
- Turn detection
- Interviewer response
- Transcript events

Both interviewer and candidate turns are stored in the interview transcript.

## 6. Interview Continues

The application repeats:

Interviewer question
↓
Candidate response
↓
Possible follow-up
↓
Next question

until:

- The interview reaches its planned conclusion, or
- The user presses End Interview.

## 7. Interview Ends

The application:

- Stops microphone capture.
- Closes the realtime connection.
- Finalizes the transcript.
- Changes state to analyzing.

## 8. Feedback Analysis

The completed transcript and interview configuration are sent to the server.

The feedback engine evaluates the interview.

Example categories:

- Communication
- Clarity
- Conciseness
- Answer relevance
- Specificity
- Behavioral answer structure
- Technical reasoning

## 9. Feedback Results

The user receives:

- Overall feedback
- Strengths
- Areas for improvement
- Question-by-question feedback
- Suggestions for future practice

Application state:

complete
