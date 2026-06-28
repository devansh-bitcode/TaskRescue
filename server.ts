/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize dynamic Gemini SDK getter to ensure runtime key changes are picked up immediately (lazy initialization)
let cachedKey: string | undefined = undefined;
let cachedAi: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.trim() === '') {
    throw new Error('Gemini API key is not configured in Settings > Secrets.');
  }
  if (cachedKey !== apiKey || !cachedAi) {
    cachedKey = apiKey;
    cachedAi = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return cachedAi;
}

// Safely clean and parse JSON response from Gemini
function cleanAndParseJson(text: string): any {
  let cleaned = text.trim();
  
  // Try matching markdown code block first
  const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (jsonMatch) {
    cleaned = jsonMatch[1];
  } else {
    // Locate first '{' and last '}'
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }
  }
  
  return JSON.parse(cleaned.trim());
}

// Automatically fallback to gemini-3.1-flash-lite if gemini-3.5-flash fails
async function generateContentWithFallback(prompt: string, config?: any) {
  const aiClient = getAiClient();
  try {
    return await aiClient.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
      config,
    });
  } catch (error: any) {
    console.warn("Primary model 'gemini-3.5-flash' failed:", error.message || error);
    console.warn("Attempting fallback to 'gemini-3.1-flash-lite'...");
    try {
      return await aiClient.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: prompt,
        config,
      });
    } catch (fallbackError: any) {
      console.error("Fallback model 'gemini-3.1-flash-lite' also failed:", fallbackError);
      throw error; // Throw original error for better diagnostics
    }
  }
}

// API Routes

/**
 * Health check
 */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

/**
 * Generate a personalized behavioral insight from task history using Gemini 3.5 Flash
 */
app.post('/api/insights', async (req, res) => {
  try {
    const { tasks, stats } = req.body;

    if (!tasks || !Array.isArray(tasks)) {
      return res.status(400).json({ error: 'Tasks array is required' });
    }

    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'MY_GEMINI_API_KEY') {
      return res.json({
        insight: "Gemini API key is not configured yet. Complete the setup in Settings > Secrets to unlock personalized AI productivity insights!"
      });
    }

    // Prepare a clear, clean summary of tasks and stats for the model
    const taskSummary = tasks
      .slice(0, 50) // limit size to keep prompt compact and precise
      .map((t: any) => {
        const d = new Date(t.deadline);
        const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
        const timeOfDay = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        return `- Task: "${t.name}", Priority: ${t.priority}, Category: ${t.category}, Status: ${t.status}, Deadline: ${dayName} at ${timeOfDay}${t.completedAt ? `, Completed: ${new Date(t.completedAt).toLocaleString()}` : ''}`;
      })
      .join('\n');

    const statsSummary = stats
      ? `Stats over past 30 days: Completed on-time: ${stats.completed}, Missed: ${stats.missed}, On-time Rate: ${stats.onTimeRate}%, Current Streak: ${stats.streak} days. Missed breakdown by priority: P1 (Critical): ${stats.missedByPriority?.P1 || 0}, P2 (Medium): ${stats.missedByPriority?.P2 || 0}, P3 (Low): ${stats.missedByPriority?.P3 || 0}.`
      : '';

    const prompt = `
You are an expert productivity coach and cognitive behavioral therapist specialized in time-management and rescue planning.
Based on the following task log and statistics for a user, analyze their completion and failure patterns. 
Generate EXACTLY ONE highly specific, personalized, actionable behavioral insight sentence (max 25 words). 
Focus on identifying potential bottlenecks (e.g. specific days, times, priority levels, or categories they struggle with) and propose a clever, positive, concrete countermeasure.

User's Task Data:
${taskSummary || 'No tasks recorded yet.'}

${statsSummary}

Guidelines for the output:
- It MUST be exactly one sentence.
- Be supportive, specific, and clever.
- Do NOT use generic advice like "stay focused" or "manage your time better".
- Reference actual patterns visible in the data if any (e.g., missing P1 tasks on Monday mornings, delaying work category tasks, completing personal tasks fast).
- Keep it under 25 words.

Example format:
"You miss P1 tasks most on Monday mornings — try scheduling them on Friday evenings instead."
`;

    const response = await generateContentWithFallback(prompt);

    const insightText = response.text?.trim() || "Analyze your patterns by creating tasks and managing your deadlines!";
    res.json({ insight: insightText });
  } catch (error: any) {
    console.error('Error generating insights with Gemini:', error);
    res.status(500).json({ error: 'Failed to generate insight', details: error.message });
  }
});

/**
 * Check and verify the Gemini API key configuration status
 */
app.get('/api/gemini/status', async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  const isConfigured = !!apiKey && apiKey !== 'MY_GEMINI_API_KEY' && apiKey.trim() !== '';
  
  res.json({
    configured: isConfigured,
    message: isConfigured ? "Gemini API key is configured and active!" : "Gemini API key is missing. Please set GEMINI_API_KEY in Settings > Secrets."
  });
});

/**
 * Voice text to Task parser endpoint using Gemini
 */
app.post('/api/parse-voice-task', async (req, res) => {
  try {
    const { transcript, currentTime } = req.body;
    if (!transcript) {
      return res.status(400).json({ error: 'Transcript is required' });
    }

    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'MY_GEMINI_API_KEY') {
      return res.json({
        success: false,
        error: 'Gemini API key is not configured'
      });
    }

    const prompt = `
You are an intelligent natural language voice task parser.
The user spoke a command to schedule or record a task: "${transcript}"
The user's current local date and time is: ${currentTime || new Date().toISOString()} (this represents today).

Your job is to parse this spoken command into a structured JSON task object.
Generate a valid JSON object matching the following TypeScript interface strictly:
{
  "name": string, // Capitalized, concise task title (e.g., "Schedule Meeting", "Buy Groceries", "Finish Report")
  "deadlineDate": string, // Format YYYY-MM-DD. Derive this from the spoken command relative to the user's current date. For example, if today is Saturday 2026-06-27 and they say "this Sunday" or "on June 28", the date should be 2026-06-28. If they say "at 5pm" without a day, default to today's date.
  "deadlineTime": string, // Format HH:MM (24-hour clock). Derive the time from the command, e.g. "5pm" is "17:00", "9:30 AM" is "09:30", "noon" is "12:00". If no time is specified, default to "17:00" (5:00 PM).
  "priority": "P1" | "P2" | "P3", // P1 for critical/very urgent, P2 for medium/normal (default), P3 for low/backburner tasks.
  "category": "Academic" | "Work" | "Personal" | "Finance" | "Others" // Classify based on the description
}

Rules:
1. Return ONLY the raw JSON object. Do not wrap in markdown blocks, do not include code highlights, do not include any explanatory text.
2. Ensure the JSON is 100% valid.
3. Be intelligent about relative days: "tomorrow", "next Monday", "in 2 days". Calculate them relative to the current local date: ${currentTime}.
`;

    const response = await generateContentWithFallback(prompt, {
      responseMimeType: 'application/json',
    });

    const parsedText = response.text?.trim();
    if (!parsedText) {
      throw new Error('Empty response from Gemini');
    }

    // Try to parse JSON safely using cleanAndParseJson helper
    const parsedData = cleanAndParseJson(parsedText);
    res.json({
      success: true,
      task: parsedData
    });
  } catch (error: any) {
    console.error('Error parsing voice task with Gemini:', error);
    res.status(500).json({ error: 'Failed to parse voice task', details: error.message });
  }
});

/**
 * Find free slots from Google Calendar or simulate based on date
 */
app.post('/api/calendar/free-slots', async (req, res) => {
  try {
    const { dateStr, accessToken } = req.body;
    if (!dateStr) {
      return res.status(400).json({ error: 'dateStr is required' });
    }

    // Define working hours for free slots search: 9:00 AM to 6:00 PM (18:00)
    const workingHours = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
    const dateObj = new Date(dateStr);
    
    // Default response slots in case Google Calendar isn't connected or we simulate
    const defaultSlots = workingHours.map(hour => {
      const slotStart = new Date(dateObj);
      slotStart.setHours(hour, 0, 0, 0);
      return slotStart.toISOString();
    });

    if (!accessToken) {
      // Return default slots as candidate since there's no real calendar access token
      return res.json({ slots: defaultSlots, simulated: true });
    }

    // Fetch primary calendar events for this day
    const startOfDay = new Date(dateObj);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(dateObj);
    endOfDay.setHours(23, 59, 59, 999);

    const timeMin = startOfDay.toISOString();
    const timeMax = endOfDay.toISOString();

    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.warn('Failed to fetch events from Google Calendar, returning default slots');
      return res.json({ slots: defaultSlots, error: 'Failed to connect to Google Calendar API', simulated: true });
    }

    const data = await response.json();
    const events = data.items || [];

    // Filter slots that overlap with any event
    const freeSlots = defaultSlots.filter(slotIso => {
      const slotStart = new Date(slotIso).getTime();
      const slotEnd = slotStart + 60 * 60 * 1000; // 1 hour slot

      const isOverlapping = events.some((event: any) => {
        const evStartStr = event.start?.dateTime || event.start?.date;
        const evEndStr = event.end?.dateTime || event.end?.date;
        if (!evStartStr || !evEndStr) return false;

        const evStart = new Date(evStartStr).getTime();
        let evEnd = new Date(evEndStr).getTime();
        
        // If it's an all-day event
        if (event.start?.date && !event.start?.dateTime) {
          evEnd = evStart + 24 * 60 * 60 * 1000;
        }

        return (slotStart < evEnd) && (slotEnd > evStart);
      });

      return !isOverlapping;
    });

    res.json({ slots: freeSlots, simulated: false });
  } catch (error: any) {
    console.error('Error fetching free slots from calendar:', error);
    res.status(500).json({ error: 'Server error fetching free slots', details: error.message });
  }
});

/**
 * Let the user ask custom productivity questions to Gemini
 */
app.post('/api/ask-gemini', async (req, res) => {
  try {
    const { question, tasks, stats } = req.body;

    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }

    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'MY_GEMINI_API_KEY') {
      return res.json({
        answer: "Gemini API key is not configured yet. Complete the setup in Settings > Secrets to ask custom productivity questions!"
      });
    }

    const taskSummary = (tasks || [])
      .slice(0, 50)
      .map((t: any) => {
        const d = new Date(t.deadline);
        const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
        const timeOfDay = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        return `- Task: "${t.name}", Priority: ${t.priority}, Category: ${t.category}, Status: ${t.status}, Deadline: ${dayName} at ${timeOfDay}${t.completedAt ? `, Completed: ${new Date(t.completedAt).toLocaleString()}` : ''}`;
      })
      .join('\n');

    const statsSummary = stats
      ? `Stats over past 30 days: Completed on-time: ${stats.completed}, Missed: ${stats.missed}, On-time Rate: ${stats.onTimeRate}%, Current Streak: ${stats.streak} days. Missed breakdown by priority: P1 (Critical): ${stats.missedByPriority?.P1 || 0}, P2 (Medium): ${stats.missedByPriority?.P2 || 0}, P3 (Low): ${stats.missedByPriority?.P3 || 0}.`
      : '';

    const prompt = `
You are an elite productivity strategist and time-management coach. 
The user is using TaskRescue to combat deadline fatigue and manage their tasks.
Below is the user's task history and stats, followed by a specific question they've asked.

User's Task Data:
${taskSummary || 'No tasks recorded yet.'}

${statsSummary}

User's Question:
"${question}"

Please provide a highly personalized, empathetic, actionable, and specific response to the user's question. Use the data context provided above to ground your insights, making sure your recommendations address their actual patterns (e.g. priority distribution, task completion, categories, or streak). Keep your answer clear, encouraging, structured (e.g. with bullet points), and concise (under 150 words).
`;

    const response = await generateContentWithFallback(prompt);

    const answerText = response.text?.trim() || "I'm having trouble analyzing your tasks right now. Try again in a moment!";
    res.json({ answer: answerText });
  } catch (error: any) {
    console.error('Error in ask-gemini route:', error);
    res.status(500).json({ error: 'Failed to answer question', details: error.message });
  }
});

/**
 * Handle real Google Calendar event creation if the user provides an access token.
 * Otherwise, the client falls back to client-side or simulator sync.
 */
app.post('/api/calendar/sync', async (req, res) => {
  try {
    const { task, accessToken } = req.body;

    if (!task) {
      return res.status(400).json({ error: 'Task details are required' });
    }

    if (!accessToken) {
      return res.status(400).json({ error: 'Google OAuth access token is required' });
    }

    const deadline = new Date(task.deadline);
    // Create a 1-hour block on Google Calendar for the task
    const startIso = deadline.toISOString();
    const endIso = new Date(deadline.getTime() + 60 * 60 * 1000).toISOString();

    const event = {
      summary: `[TaskRescue] ${task.name}`,
      description: `Task managed by TaskRescue App.\nPriority: ${task.priority}\nCategory: ${task.category}\nDeadline: ${deadline.toLocaleString()}`,
      start: {
        dateTime: startIso,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      },
      end: {
        dateTime: endIso,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: task.priority === 'P1' ? 90 : 60 },
          { method: 'popup', minutes: 15 },
        ],
      },
    };

    const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return res.status(response.status).json({
        error: 'Failed to create Google Calendar event',
        details: errorData,
      });
    }

    const createdEvent = await response.json();
    res.json({
      success: true,
      eventId: createdEvent.id,
      htmlLink: createdEvent.htmlLink,
    });
  } catch (error: any) {
    console.error('Error syncing with Google Calendar:', error);
    res.status(500).json({ error: 'Server error during calendar sync', details: error.message });
  }
});

// Vite Middleware & Static Assets Serving and server launch
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
