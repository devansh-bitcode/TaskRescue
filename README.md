# TaskRescue — Life Saver V1.2
### Rescuing tasks before they become problems

TaskRescue is an AI-powered productivity PWA built for the Google AI Studio Hackathon. It goes beyond passive reminders — using Gemini AI, Google Calendar, and a smart priority system to proactively help users complete tasks before deadlines are missed.

---

## Features

- **P1 / P2 / P3 priority system** — Critical tasks get 4 staged alerts (9 AM, 1h 30m, 30m, 15m before deadline). Medium tasks get 2. Low-priority tasks get 1.
- **Voice task scheduling** — Speak a command ("Schedule a meeting at 5pm on 28 June") and Gemini parses it into a structured task automatically.
- **Google Calendar auto-sync** — P1 and P2 tasks are instantly added to Google Calendar as [TaskRescue] events on save.
- **Gemini AI coaching** — Ask questions about your productivity patterns and get personalized answers based on your real miss rate, streak, and task history.
- **Behavioral insights** — Tracks tasks saved, rescued, completion rate, streak, and missed deadlines broken down by P1 / P2 / P3.
- **Gemini behavioral insight card** — Auto-generates a personalized insight and suggestion based on your 30-day task history.
- **Calendar sync feed** — Live log of all calendar events created, with timestamps and Google Calendar links.
- **Audio alarms** — Custom audio notifications for high-priority deadlines.
- **PWA** — Installable on any device home screen, works offline, sends push notifications like a native app.

---

## Tech stack

- **Frontend** — Next.js (React) as a Progressive Web App
- **AI** — Gemini 2.0 Flash via Google AI Studio API
- **Voice** — Gemini Live API for real-time voice command parsing
- **Calendar** — Google Calendar API (auto-event creation on task save)
- **Database** — Firebase Firestore (tasks, users, behavioral logs)
- **Auth** — Firebase Authentication with Google OAuth
- **Notifications** — Firebase Cloud Messaging + Web Push API
- **Deployment** — Google AI Studio

---

## Google technologies used

| Technology | Usage |
|---|---|
| Google AI Studio | Build and deploy platform |
| Gemini 2.0 Flash | Voice parsing, coaching, behavioral insights |
| Google Calendar API | Auto-sync P1 and P2 tasks as calendar events |
| Firebase Firestore | Task and user data storage |
| Firebase Auth | Google OAuth sign-in |
| Firebase Cloud Messaging | Scheduled push notifications |

---

## Hackathon

Built for **Problem Statement 1 — The Last-Minute Life Saver** as part of the Google AI Studio Hackathon.

> The solution goes beyond traditional reminders by combining intelligent priority-based scheduling, live Google Calendar integration, voice-powered task creation, and Gemini AI behavioral coaching to help users make better decisions and complete tasks before deadlines are missed.
