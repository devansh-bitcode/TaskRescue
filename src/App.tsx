/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  motion, 
  AnimatePresence 
} from 'motion/react';
import { 
  Bell, 
  Calendar, 
  CheckCircle, 
  Clock, 
  AlertTriangle, 
  TrendingUp, 
  Plus, 
  Trash2, 
  Sparkles, 
  Flame, 
  Check, 
  X, 
  User, 
  LogOut, 
  Sliders, 
  Layers, 
  Info,
  Volume2,
  Sun,
  Moon,
  Mic,
  MicOff
} from 'lucide-react';
import { Task, TaskPriority, TaskCategory, ProductivityStats, NotificationStatus } from './types';
import { getTaskNotifications, playChimeSound, showSystemNotification } from './utils/notifications';
import { initAuthListener, signInWithGoogle, logoutUser } from './firebase';
import Markdown from 'react-markdown';

// Default tasks seed to make the app interactive on first load
const INITIAL_TASKS: Task[] = [
  {
    id: 'seed-1',
    name: 'CS101 Final Project Submission',
    deadline: new Date(Date.now() + 1.5 * 60 * 60 * 1000).toISOString(), // 1.5 hours from now (P1)
    priority: 'P1',
    category: 'Academic',
    status: 'pending',
  },
  {
    id: 'seed-2',
    name: 'Pitch Deck for Seed Round',
    deadline: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(), // 5 hours from now (P2)
    priority: 'P2',
    category: 'Work',
    status: 'pending',
  },
  {
    id: 'seed-3',
    name: 'Weekly Grocery Shopping',
    deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours from now (P3)
    priority: 'P3',
    category: 'Personal',
    status: 'pending',
  },
  {
    id: 'seed-4',
    name: 'Tax Declarations Q2',
    deadline: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago (missed on a Monday)
    priority: 'P1',
    category: 'Finance',
    status: 'missed',
  },
  {
    id: 'seed-5',
    name: 'Gym Cardio Session',
    deadline: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(), // 12 hours ago (completed)
    priority: 'P3',
    category: 'Others',
    status: 'completed',
    completedAt: new Date(Date.now() - 13 * 60 * 60 * 1000).toISOString(),
  }
];

export default function App() {
  // Core state
  const [tasks, setTasks] = useState<Task[]>(() => {
    const saved = localStorage.getItem('taskrescue_tasks');
    return saved ? JSON.parse(saved) : INITIAL_TASKS;
  });

  const [activeTab, setActiveTab] = useState<'inbox' | 'add' | 'insights' | 'calendar'>('inbox');
  
  // Form state
  const [taskName, setTaskName] = useState('');
  const [taskPriority, setTaskPriority] = useState<TaskPriority>('P1');
  const [taskCategory, setTaskCategory] = useState<TaskCategory>('Academic');
  const [taskDeadlineDate, setTaskDeadlineDate] = useState('');
  const [taskDeadlineTime, setTaskDeadlineTime] = useState('');
  
  // Gemini Insight state
  const [insight, setInsight] = useState<string>('Generating productivity coaching insights from your task history...');
  const [isGeneratingInsight, setIsGeneratingInsight] = useState(false);
  const [userQuestion, setUserQuestion] = useState('');
  const [geminiAnswer, setGeminiAnswer] = useState<string | null>(null);
  const [isAsking, setIsAsking] = useState(false);
  const [isGeminiConfigured, setIsGeminiConfigured] = useState<boolean | null>(null);

  // Scheduling Conflict & Rescheduling states
  const [conflictState, setConflictState] = useState<{
    newTask: Task;
    overlappingTask: Task;
    alternativeSlots: string[];
    isLoadingSlots: boolean;
  } | null>(null);

  // Voice Scheduling states
  const [isListening, setIsListening] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<string>('');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [isParsingVoice, setIsParsingVoice] = useState(false);
  const [isVoiceWidgetOpen, setIsVoiceWidgetOpen] = useState(false);
  const [voiceTextInput, setVoiceTextInput] = useState<string>('');
  const [isCheckingServer, setIsCheckingServer] = useState(false);
  const [serverCheckResult, setServerCheckResult] = useState<{ success: boolean; message: string } | null>(null);

  // Authentication & Google Calendar state
  const [googleUser, setGoogleUser] = useState<{ name: string; email: string; photoURL?: string } | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [gcalToken, setGcalToken] = useState<string | null>(null);
  const [syncHistory, setSyncHistory] = useState<{ id: string; name: string; time: string; status: 'synced' | 'simulated' }[]>(() => {
    const saved = localStorage.getItem('taskrescue_sync_history');
    return saved ? JSON.parse(saved) : [];
  });
  const [isSyncing, setIsSyncing] = useState(false);

  // Task operation confirmation
  const [taskToConfirm, setTaskToConfirm] = useState<Task | null>(null);
  const [confirmAction, setConfirmAction] = useState<'complete' | 'delete' | null>(null);

  // Tick for timers
  const [currentTime, setCurrentTime] = useState(new Date());

  // Dark mode state and effect
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('taskrescue_dark_mode');
    return saved === 'true';
  });

  useEffect(() => {
    localStorage.setItem('taskrescue_dark_mode', String(darkMode));
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Save to local storage on change
  useEffect(() => {
    localStorage.setItem('taskrescue_tasks', JSON.stringify(tasks));
  }, [tasks]);

  useEffect(() => {
    localStorage.setItem('taskrescue_sync_history', JSON.stringify(syncHistory));
  }, [syncHistory]);

  // Initialize Firebase Auth listener
  useEffect(() => {
    const unsubscribe = initAuthListener(
      (user, token) => {
        const userObj = {
          name: user.displayName || user.email || 'Google User',
          email: user.email || '',
          photoURL: user.photoURL || undefined
        };
        setGoogleUser(userObj);
        setGcalToken(token);
      },
      () => {
        setGoogleUser(null);
        setGcalToken(null);
      }
    );
    return () => unsubscribe();
  }, []);

  // Check Gemini API Configuration Status
  useEffect(() => {
    const checkGeminiStatus = async () => {
      try {
        const res = await fetch('/api/gemini/status');
        if (res.ok) {
          const data = await res.json();
          setIsGeminiConfigured(data.configured);
        }
      } catch (err) {
        console.error('Error checking Gemini API status:', err);
        setIsGeminiConfigured(false);
      }
    };
    checkGeminiStatus();
  }, [activeTab]);

  // Handle active countdown updates
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      setCurrentTime(now);

      // Check for deadlines that have passed and mark them as missed if they were pending
      setTasks(prevTasks => {
        let changed = false;
        const updated = prevTasks.map(t => {
          if (t.status === 'pending' && new Date(t.deadline).getTime() < now.getTime()) {
            changed = true;
            return { ...t, status: 'missed' as const };
          }
          return t;
        });
        return changed ? updated : prevTasks;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Sync / Notification engine checker
  useEffect(() => {
    // Check if any scheduled notification is firing right now
    tasks.forEach(t => {
      if (t.status === 'pending') {
        const notifications = getTaskNotifications(t, currentTime);
        notifications.forEach(n => {
          if (n.fired && !n.skipped) {
            // Check if this alert has already been fired and recorded in session to avoid spamming
            const sessionAlertKey = `alert_fired_${t.id}_${n.label}`;
            if (!sessionStorage.getItem(sessionAlertKey)) {
              sessionStorage.setItem(sessionAlertKey, 'true');
              
              // Fire Web Audio chime and Browser Notification
              playChimeSound();
              showSystemNotification(
                `🚨 Task Rescue Alert: ${t.name}`,
                `Your ${t.priority} task is due soon (${n.label}). Act now!`
              );
            }
          }
        });
      }
    });
  }, [currentTime, tasks]);

  // Generate Gemini Insights
  const generateInsight = async (forceTasks?: Task[]) => {
    setIsGeneratingInsight(true);
    try {
      const targetTasks = forceTasks || tasks;
      const stats = computeStats(targetTasks);

      const response = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks: targetTasks, stats }),
      });

      if (!response.ok) {
        throw new Error('API server returned error');
      }

      const data = await response.json();
      setInsight(data.insight);
    } catch (err) {
      console.error('Failed to load Gemini coaching insight:', err);
      setInsight("Create more tasks and log completed deadlines to analyze your weekly productivity behavior patterns!");
    } finally {
      setIsGeneratingInsight(false);
    }
  };

  // Generate initial insight on load
  useEffect(() => {
    generateInsight();
  }, []);

  // Custom Q&A with Gemini
  const handleAskGemini = async (customQuestion?: string) => {
    const questionToAsk = (customQuestion || userQuestion).trim();
    if (!questionToAsk) return;

    setIsAsking(true);
    setGeminiAnswer(null);
    try {
      const stats = computeStats(tasks);
      const response = await fetch('/api/ask-gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: questionToAsk, tasks, stats }),
      });

      if (!response.ok) {
        throw new Error('API server returned error');
      }

      const data = await response.json();
      setGeminiAnswer(data.answer);
    } catch (err: any) {
      console.error('Failed to ask Gemini:', err);
      setGeminiAnswer("Sorry, I am unable to answer your question at the moment. Please verify your Gemini API key in settings.");
    } finally {
      setIsAsking(false);
    }
  };

  // Fetch free slots from backend and filter with local pending tasks
  const fetchAlternativeSlots = async (dateStr: string) => {
    try {
      const response = await fetch('/api/calendar/free-slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dateStr,
          accessToken: gcalToken || undefined
        }),
      });
      if (response.ok) {
        const data = await response.json();
        let slots: string[] = data.slots || [];
        
        // Filter out slots that overlap with local pending tasks
        slots = slots.filter(slotIso => {
          const slotStart = new Date(slotIso).getTime();
          const slotEnd = slotStart + 60 * 60 * 1000;
          return !tasks.some(t => {
            if (t.status !== 'pending') return false;
            const tStart = new Date(t.deadline).getTime();
            const tEnd = tStart + 60 * 60 * 1000;
            return (slotStart < tEnd) && (slotEnd > tStart);
          });
        });

        return slots;
      }
    } catch (err) {
      console.error('Error fetching free slots:', err);
    }
    
    // Fallback slot generator if API fails
    const workingHours = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
    const dateObj = new Date(dateStr);
    const fallbackSlots = workingHours.map(hour => {
      const slotStart = new Date(dateObj);
      slotStart.setHours(hour, 0, 0, 0);
      return slotStart.toISOString();
    }).filter(slotIso => {
      const slotStart = new Date(slotIso).getTime();
      const slotEnd = slotStart + 60 * 60 * 1000;
      return !tasks.some(t => {
        if (t.status !== 'pending') return false;
        const tStart = new Date(t.deadline).getTime();
        const tEnd = tStart + 60 * 60 * 1000;
        return (slotStart < tEnd) && (slotEnd > tStart);
      });
    });

    return fallbackSlots;
  };

  const handleSaveConflictTaskAnyway = async () => {
    if (!conflictState) return;
    const { newTask } = conflictState;
    const updatedTasks = [newTask, ...tasks];
    setTasks(updatedTasks);
    
    setTaskName('');
    setTaskDeadlineDate('');
    setTaskDeadlineTime('');
    setConflictState(null);

    if (newTask.priority === 'P1' || newTask.priority === 'P2') {
      await handleCalendarSync(newTask);
    }

    generateInsight(updatedTasks);
    setActiveTab('inbox');
  };

  const handleRescheduleConflictTask = async (selectedSlotIso: string) => {
    if (!conflictState) return;
    const { newTask } = conflictState;
    const rescheduledTask = {
      ...newTask,
      deadline: selectedSlotIso
    };

    const updatedTasks = [rescheduledTask, ...tasks];
    setTasks(updatedTasks);
    
    setTaskName('');
    setTaskDeadlineDate('');
    setTaskDeadlineTime('');
    setConflictState(null);

    if (rescheduledTask.priority === 'P1' || rescheduledTask.priority === 'P2') {
      await handleCalendarSync(rescheduledTask);
    }

    generateInsight(updatedTasks);
    setActiveTab('inbox');
  };

  const handleCancelConflict = () => {
    setConflictState(null);
  };

  // Compute Productivity Metrics
  const computeStats = (taskList: Task[]): ProductivityStats => {
    const last30Days = taskList; // Simplified history for seed + user data
    const completed = last30Days.filter(t => t.status === 'completed').length;
    const missed = last30Days.filter(t => t.status === 'missed').length;
    const total = completed + missed;
    const onTimeRate = total > 0 ? Math.round((completed / total) * 100) : 100;

    // Calculate missed breakdown by priority
    const missedByPriority = {
      P1: last30Days.filter(t => t.status === 'missed' && t.priority === 'P1').length,
      P2: last30Days.filter(t => t.status === 'missed' && t.priority === 'P2').length,
      P3: last30Days.filter(t => t.status === 'missed' && t.priority === 'P3').length,
    };

    // Streak calculation (Consecutive days where no tasks were missed)
    let streak = 0;
    const dailyStatus: { [dateStr: string]: { completed: number; missed: number } } = {};
    
    // Sort all completed/missed by date
    taskList.forEach(t => {
      const dateStr = new Date(t.deadline).toDateString();
      if (!dailyStatus[dateStr]) {
        dailyStatus[dateStr] = { completed: 0, missed: 0 };
      }
      if (t.status === 'completed') dailyStatus[dateStr].completed++;
      if (t.status === 'missed') dailyStatus[dateStr].missed++;
    });

    const sortedDates = Object.keys(dailyStatus).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    
    for (const d of sortedDates) {
      if (dailyStatus[d].completed > 0 && dailyStatus[d].missed === 0) {
        streak++;
      } else if (dailyStatus[d].missed > 0) {
        break; // streak broken
      }
    }

    return { completed, missed, onTimeRate, streak, missedByPriority };
  };

  // Voice Scheduling via browser SpeechRecognition and server-side Gemini parsing
  const handleVoiceScheduling = async (transcriptText: string) => {
    if (!transcriptText.trim()) return;
    setIsParsingVoice(true);
    setVoiceStatus('Gemini is parsing your voice request...');
    setVoiceError(null);

    try {
      const res = await fetch('/api/parse-voice-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: transcriptText,
          currentTime: new Date().toISOString()
        }),
      });

      if (!res.ok) throw new Error('API server returned error');

      const data = await res.json();
      if (!data.success) {
        if (data.error === 'Gemini API key is not configured') {
          throw new Error('Gemini API key is not configured yet. Complete the setup in Settings > Secrets.');
        }
        throw new Error(data.error || 'Failed to parse task with Gemini');
      }

      const parsedTask = data.task;
      if (!parsedTask || !parsedTask.name) {
        throw new Error('Could not identify a valid task description from speech. Try saying e.g. "schedule a meeting on 28 june at 5pm"');
      }

      // Construct full ISO deadline string
      const deadlineISO = new Date(`${parsedTask.deadlineDate}T${parsedTask.deadlineTime}`).toISOString();

      // Formulate new Task object
      const newTask: Task = {
        id: `task-${Date.now()}`,
        name: parsedTask.name,
        deadline: deadlineISO,
        priority: parsedTask.priority || 'P2',
        category: parsedTask.category || 'Others',
        status: 'pending',
      };

      // Overlap checks (each task is a 1-hour duration window)
      const newStart = new Date(deadlineISO).getTime();
      const newEnd = newStart + 60 * 60 * 1000;

      const overlappingTask = tasks.find(t => {
        if (t.status !== 'pending') return false;
        const tStart = new Date(t.deadline).getTime();
        const tEnd = tStart + 60 * 60 * 1000;
        return (newStart < tEnd) && (newEnd > tStart);
      });

      if (overlappingTask) {
        // Overlap detected! Set conflictState and route to add tab
        setConflictState({
          newTask,
          overlappingTask,
          alternativeSlots: [],
          isLoadingSlots: true,
        });

        setActiveTab('add');
        setVoiceStatus('Conflict detected! Alternate slots found below.');

        // Fetch alternative slots
        const slots = await fetchAlternativeSlots(parsedTask.deadlineDate);
        setConflictState(prev => prev ? {
          ...prev,
          alternativeSlots: slots,
          isLoadingSlots: false,
        } : null);

        return;
      }

      // No overlap - save task!
      const updatedTasks = [newTask, ...tasks];
      setTasks(updatedTasks);
      setVoiceStatus(`Successfully scheduled "${parsedTask.name}"!`);
      showSystemNotification("Task Scheduled!", `"${parsedTask.name}" has been created for ${parsedTask.deadlineDate} at ${parsedTask.deadlineTime}.`);

      // GCal sync if P1/P2
      if (newTask.priority === 'P1' || newTask.priority === 'P2') {
        try {
          await handleCalendarSync(newTask);
        } catch (syncErr) {
          console.error("GCal sync error:", syncErr);
        }
      }

      generateInsight(updatedTasks);
    } catch (err: any) {
      console.error('Failed to schedule voice task:', err);
      setVoiceError(err.message || 'An error occurred during voice scheduling.');
      setVoiceStatus('');
    } finally {
      setIsParsingVoice(false);
    }
  };

  const startVoiceListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceError("Speech recognition is not supported in this browser. Please use Google Chrome or Safari.");
      return;
    }

    setVoiceError(null);
    setVoiceStatus('Listening...');
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setVoiceStatus('Listening... Speak your command now!');
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setVoiceStatus(`Analyzing: "${transcript}"`);
      handleVoiceScheduling(transcript);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'not-allowed') {
        setVoiceError("Microphone permission denied. Enable microphone access in browser settings.");
      } else {
        setVoiceError(`Could not capture speech: ${event.error}`);
      }
      setIsListening(false);
      setVoiceStatus('');
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    try {
      recognition.start();
    } catch (startErr) {
      console.error("Error starting speech recognition:", startErr);
    }
  };

  const checkApiServerConnection = async () => {
    setIsCheckingServer(true);
    setServerCheckResult(null);
    try {
      const res = await fetch('/api/gemini/status');
      if (res.ok) {
        const data = await res.json();
        setIsGeminiConfigured(data.configured);
        setServerCheckResult({
          success: data.configured,
          message: data.configured 
            ? "API Server fully active & Gemini Key is verified!" 
            : "API Server is active, but your GEMINI_API_KEY is missing. Check Settings > Secrets."
        });
      } else {
        throw new Error(`Server returned status ${res.status}`);
      }
    } catch (err: any) {
      console.error("API Server check error:", err);
      setServerCheckResult({
        success: false,
        message: `Failed to connect to API server: ${err.message || 'Unknown error'}`
      });
    } finally {
      setIsCheckingServer(false);
    }
  };

  const stats = computeStats(tasks);

  // Form submission handler
  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskName.trim() || !taskDeadlineDate || !taskDeadlineTime) return;

    const deadlineISO = new Date(`${taskDeadlineDate}T${taskDeadlineTime}`).toISOString();
    
    const newTask: Task = {
      id: `task-${Date.now()}`,
      name: taskName,
      deadline: deadlineISO,
      priority: taskPriority,
      category: taskCategory,
      status: 'pending',
    };

    // Overlap calculation: each task spans a 1-hour slot
    const newStart = new Date(deadlineISO).getTime();
    const newEnd = newStart + 60 * 60 * 1000;

    const overlappingTask = tasks.find(t => {
      if (t.status !== 'pending') return false;
      const tStart = new Date(t.deadline).getTime();
      const tEnd = tStart + 60 * 60 * 1000;
      return (newStart < tEnd) && (newEnd > tStart);
    });

    if (overlappingTask) {
      // Overlap detected! Initiate conflict resolution.
      setConflictState({
        newTask,
        overlappingTask,
        alternativeSlots: [],
        isLoadingSlots: true,
      });

      // Switch to add tab visual focus if not already focused
      setActiveTab('add');

      // Fetch alternatives asynchronously
      const slots = await fetchAlternativeSlots(taskDeadlineDate);
      setConflictState(prev => prev ? {
        ...prev,
        alternativeSlots: slots,
        isLoadingSlots: false,
      } : null);

      return; // Stop standard execution
    }

    const updatedTasks = [newTask, ...tasks];
    setTasks(updatedTasks);
    
    // Reset form
    setTaskName('');
    setTaskDeadlineDate('');
    setTaskDeadlineTime('');

    // Trigger auto-sync with calendar for P1 / P2 tasks
    if (newTask.priority === 'P1' || newTask.priority === 'P2') {
      await handleCalendarSync(newTask);
    }

    // Refresh Gemini coaching insights
    generateInsight(updatedTasks);

    // Switch view back to inbox
    setActiveTab('inbox');
  };

  // Google Calendar Integration flow
  const handleConnectGCal = async () => {
    setIsSyncing(true);
    try {
      const authResult = await signInWithGoogle();
      if (authResult) {
        const userObj = {
          name: authResult.user.displayName || authResult.user.email || 'Google User',
          email: authResult.user.email || '',
          photoURL: authResult.user.photoURL || undefined
        };
        setGoogleUser(userObj);
        setGcalToken(authResult.accessToken);
        
        // Play soft chime on successful connection
        playChimeSound();
        showSystemNotification("Calendar Connected!", `TaskRescue is now synced with ${userObj.email}`);
      }
    } catch (error: any) {
      console.error('Failed to connect Google Calendar:', error);
      alert(`Connection failed: ${error.message || error}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // Google Authentication Gate Logic
  const handleGoogleLogin = async () => {
    setIsLoggingIn(true);
    try {
      const authResult = await signInWithGoogle();
      if (authResult) {
        const userObj = {
          name: authResult.user.displayName || authResult.user.email || 'Google User',
          email: authResult.user.email || '',
          photoURL: authResult.user.photoURL || undefined
        };
        setGoogleUser(userObj);
        setGcalToken(authResult.accessToken);
        
        // Play soft chime on successful login
        playChimeSound();
        showSystemNotification("Welcome!", `Signed in successfully as ${userObj.name}`);
      }
    } catch (error: any) {
      console.error('Google login failed:', error);
      alert(`Login failed: ${error.message || error}`);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleDisconnectGCal = async () => {
    try {
      await logoutUser();
      setGoogleUser(null);
      setGcalToken(null);
    } catch (error: any) {
      console.error('Logout failed:', error);
    }
  };

  const handleCalendarSync = async (task: Task) => {
    setIsSyncing(true);
    const logId = `sync-${Date.now()}`;
    
    // If we have a Google token, try to make a real api request to our Express backend
    if (gcalToken) {
      try {
        const response = await fetch('/api/calendar/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task, accessToken: gcalToken }),
        });

        if (response.ok) {
          const data = await response.json();
          setSyncHistory(prev => [
            { id: logId, name: task.name, time: new Date().toLocaleString(), status: 'synced' },
            ...prev
          ]);
          setTasks(prev => prev.map(t => t.id === task.id ? { ...t, googleCalendarEventId: data.eventId } : t));
          setIsSyncing(false);
          return;
        }
      } catch (err) {
        console.error('Real calendar sync failed, falling back to beautiful simulation:', err);
      }
    }

    // Standard simulation mode (with clear visual indicators)
    setTimeout(() => {
      setSyncHistory(prev => [
        { id: logId, name: task.name, time: new Date().toLocaleString(), status: 'simulated' },
        ...prev
      ]);
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, googleCalendarEventId: `simulated-${Date.now()}` } : t));
      setIsSyncing(false);
    }, 1000);
  };

  // Mark task completed/deleted with confirmation
  const handleMarkComplete = (task: Task) => {
    setTaskToConfirm(task);
    setConfirmAction('complete');
  };

  const handleDeleteTask = (task: Task) => {
    setTaskToConfirm(task);
    setConfirmAction('delete');
  };

  const executeConfirmedAction = () => {
    if (!taskToConfirm || !confirmAction) return;

    let updatedList = [...tasks];

    if (confirmAction === 'complete') {
      updatedList = tasks.map(t => {
        if (t.id === taskToConfirm.id) {
          return {
            ...t,
            status: 'completed' as const,
            completedAt: new Date().toISOString(),
          };
        }
        return t;
      });
      playChimeSound(); // reward sound on success!
    } else if (confirmAction === 'delete') {
      updatedList = tasks.filter(t => t.id !== taskToConfirm.id);
    }

    setTasks(updatedList);
    setTaskToConfirm(null);
    setConfirmAction(null);

    // Refresh Gemini feedback
    generateInsight(updatedList);
  };

  // Helper: Format countdown timers
  const getCountdownString = (deadlineStr: string) => {
    const diff = new Date(deadlineStr).getTime() - currentTime.getTime();
    if (diff <= 0) return 'Passed';

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((diff % (1000 * 60)) / 1000);

    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days}d ${hours % 24}h remaining`;
    }

    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Sorted tasks selector (P1 -> P2 -> P3)
  const sortedTasks = [...tasks].sort((a, b) => {
    // Sort by status first: pending tasks first
    if (a.status === 'pending' && b.status !== 'pending') return -1;
    if (a.status !== 'pending' && b.status === 'pending') return 1;

    // Sort by priority (P1 -> P2 -> P3)
    const priorityWeight = { P1: 3, P2: 2, P3: 1 };
    const weightA = priorityWeight[a.priority] || 0;
    const weightB = priorityWeight[b.priority] || 0;
    if (weightA !== weightB) return weightB - weightA;

    // Sort by deadline
    return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
  })  // Render notification guide dynamically based on selection
  const getPriorityHint = (priority: TaskPriority) => {
    switch (priority) {
      case 'P1':
        return {
          count: 4,
          schedule: [
            '🌅 Start of Day (9:00 AM) — Skipped if deadline is before 10:30 AM to prevent duplicate notifications',
            '⏰ 1 Hour 30 Minutes remaining',
            '⏰ 30 Minutes remaining',
            '🚨 15 Minutes remaining (Critical warning)'
          ],
          color: 'from-red-50 to-red-100 dark:from-red-950/40 dark:to-red-900/30 text-red-800 dark:text-red-300 border-red-200 dark:border-red-900/50'
        };
      case 'P2':
        return {
          count: 2,
          schedule: [
            '⏰ 1 Hour remaining',
            '🚨 15 Minutes remaining (Critical warning)'
          ],
          color: 'from-amber-50 to-amber-100 dark:from-amber-950/40 dark:to-amber-900/30 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-900/50'
        };
      case 'P3':
        return {
          count: 1,
          schedule: [
            '⏰ 30 Minutes remaining'
          ],
          color: 'from-blue-50 to-blue-100 dark:from-blue-950/40 dark:to-blue-900/30 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-900/50'
        };
    }
  };

  const priorityHint = getPriorityHint(taskPriority);

  if (!googleUser) {
    return (
      <div id="login-root" className={`min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans selection:bg-indigo-500/10 selection:text-indigo-700 flex flex-col items-center justify-center p-4 relative overflow-hidden antialiased transition-colors duration-300 ${darkMode ? 'dark' : ''}`}>
        {/* Abstract Background Accents */}
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden z-0">
          <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-500/5 blur-[120px]" />
          <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-violet-500/5 blur-[120px]" />
        </div>

        {/* Floating Dark Mode Toggle on Login Page */}
        <div className="absolute top-4 right-4 z-20">
          <button
            id="btn-login-dark-mode-toggle"
            onClick={() => setDarkMode(!darkMode)}
            className="p-2.5 rounded-xl bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 transition-all duration-200 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800"
            title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {darkMode ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />}
          </button>
        </div>

        {/* Brand Container */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md text-center mb-8 z-10"
        >
          <div className="inline-flex items-center gap-3 bg-white dark:bg-slate-900 px-5 py-2.5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 mb-4 transition-colors duration-300">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-md shadow-indigo-500/20">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
              </svg>
            </div>
            <div className="text-left">
              <h1 className="text-2xl font-black tracking-tight text-slate-800 dark:text-slate-100 leading-none">Task<span className="text-indigo-600">Rescue</span></h1>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider mt-1">Rescuing tasks before they become problems</p>
            </div>
          </div>
        </motion.div>

        {/* Main Login Card */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-xl dark:shadow-none shadow-slate-200/50 p-8 z-10 relative transition-colors duration-300"
        >
          {/* Rescue Pulse Ring */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 bg-indigo-50 dark:bg-indigo-950/80 rounded-full border-4 border-white dark:border-slate-900 flex items-center justify-center shadow-md">
            <span className="relative flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-4 w-4 bg-indigo-600"></span>
            </span>
          </div>

          <div className="text-center mt-4 mb-8">
            <h2 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight font-sans">Sign In Required</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">Connect your Google Account to initialize task tracking, calendar automated rescue scheduling, and AI coaching insights.</p>
          </div>

          {/* Sign In Button */}
          <button
            id="btn-google-login-gate"
            onClick={handleGoogleLogin}
            disabled={isLoggingIn}
            className={`w-full flex items-center justify-center gap-3 py-3.5 px-4 rounded-2xl font-bold text-sm text-white transition-all duration-300 shadow-md ${
              isLoggingIn 
                ? 'bg-slate-400 cursor-not-allowed' 
                : 'bg-indigo-600 hover:bg-indigo-750 shadow-indigo-600/10 hover:shadow-indigo-600/20 active:scale-[0.98]'
            }`}
          >
            {isLoggingIn ? (
              <div className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span>Authorizing Account...</span>
              </div>
            ) : (
              <>
                {/* Official Multi-colored Google G Icon */}
                <svg className="w-4 h-4 bg-white rounded-full p-0.5 shadow-sm" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                <span>Continue with Google</span>
              </>
            )}
          </button>

          {/* Terms info */}
          <p className="text-[10px] text-slate-400 dark:text-slate-500 text-center mt-6 leading-relaxed">
            By signing in, you authorize TaskRescue to check deadlines, dispatch local chime notifications, and simulate Google Calendar Event creations.
          </p>
        </motion.div>

        {/* Core Value Props */}
        <div className="w-full max-w-md grid grid-cols-2 gap-3 mt-6 z-10">
          <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border border-slate-100 dark:border-slate-800 rounded-2xl p-3 shadow-sm flex items-start gap-2.5 transition-colors duration-300">
            <span className="text-base">🔔</span>
            <div>
              <h4 className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Preventative Alerts</h4>
              <p className="text-[9px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">Multi-stage proactive alarms so you never miss deadlines.</p>
            </div>
          </div>
          <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border border-slate-100 dark:border-slate-800 rounded-2xl p-3 shadow-sm flex items-start gap-2.5 transition-colors duration-300">
            <span className="text-base">📅</span>
            <div>
              <h4 className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Calendar Sync</h4>
              <p className="text-[9px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">Auto-adds urgent tasks instantly to Google Calendar.</p>
            </div>
          </div>
          <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border border-slate-100 dark:border-slate-800 rounded-2xl p-3 shadow-sm flex items-start gap-2.5 transition-colors duration-300">
            <span className="text-base">🔮</span>
            <div>
              <h4 className="text-[11px] font-bold text-slate-700 dark:text-slate-300">AI Coaching</h4>
              <p className="text-[9px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">Gemini analyzes your completion behavior patterns.</p>
            </div>
          </div>
          <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border border-slate-100 dark:border-slate-800 rounded-2xl p-3 shadow-sm flex items-start gap-2.5 transition-colors duration-300">
            <span className="text-base">🔊</span>
            <div>
              <h4 className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Audio Alarms</h4>
              <p className="text-[9px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">Custom audio notifications rescue attention.</p>
            </div>
          </div>
        </div>

        {/* Bottom Small Copyright */}
        <div className="text-[10px] text-slate-400 dark:text-slate-500 font-medium mt-12 z-10">
          TaskRescue Life Saver © 2026. Fully Offline-first persistent state.
        </div>
      </div>
    );
  }

  return (
    <div id="app-root" className={`min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans selection:bg-indigo-500/10 selection:text-indigo-700 flex flex-col antialiased transition-colors duration-300 ${darkMode ? 'dark' : ''}`}>
      {/* Top Premium Brand Header */}
      <nav id="app-header" className="h-16 bg-white border-b border-slate-200 dark:bg-slate-900 dark:border-slate-800 px-8 flex items-center justify-between shrink-0 sticky top-0 z-40 shadow-sm transition-colors duration-300">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-sm">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
            </svg>
          </div>
          <div className="flex flex-col">
            <span className="text-xl font-bold tracking-tight text-slate-800 dark:text-slate-100 leading-none">Task<span className="text-indigo-600">Rescue</span></span>
            <span className="text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider mt-0.5">Life Saver v1.2</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Direct Push Notifications Tester */}
          <button 
            id="btn-tester"
            onClick={() => {
              playChimeSound();
              showSystemNotification("TaskRescue Active!", "Notification channel and custom high-fidelity audio chime are fully operational.");
            }}
            className="hidden sm:flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-all duration-200"
            title="Test dynamic alarm and native system notifications instantly"
          >
            <Volume2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span>Test Alerts</span>
          </button>

          {/* Dark Mode Toggle Button */}
          <button
            id="btn-dark-mode-toggle"
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-all duration-200"
            title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-600" />}
          </button>

          {/* Streak Counter Badge */}
          <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950/40 px-3 py-1.5 rounded-full border border-amber-100 dark:border-amber-900/40 shadow-sm">
            <span className="text-sm">🔥</span>
            <span className="text-xs font-bold text-amber-700 dark:text-amber-400">{stats.streak} DAY STREAK</span>
          </div>

          {/* Google Account Indicator */}
          {googleUser ? (
            <div className="flex items-center gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm rounded-full py-1 pl-3 pr-1.5">
              <div className="hidden md:block text-right">
                <p className="text-[11px] font-bold text-slate-700 dark:text-slate-300 leading-none">{googleUser.name}</p>
                <p className="text-[9px] text-slate-400 dark:text-slate-500 leading-none mt-1">{googleUser.email}</p>
              </div>
              <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-xs shadow-inner overflow-hidden">
                {googleUser.photoURL ? (
                  <img referrerPolicy="no-referrer" src={googleUser.photoURL} alt={googleUser.name} className="w-full h-full object-cover" />
                ) : (
                  googleUser.name.charAt(0)
                )}
              </div>
              <button 
                id="btn-logout"
                onClick={handleDisconnectGCal} 
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 transition-all"
                title="Log Out of TaskRescue"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button 
              id="btn-connect"
              onClick={handleConnectGCal}
              className="flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold rounded-lg bg-slate-900 hover:bg-slate-850 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white shadow-sm transition-all duration-200 cursor-pointer"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Connect Google Calendar</span>
              <span className="sm:hidden">Connect</span>
            </button>
          )}
        </div>
      </nav>

      {/* Main Container */}
      <main id="app-main" className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Navigation & Core Interactive Forms/Lists (7 cols) */}
        <div id="column-left" className="lg:col-span-7 flex flex-col gap-6">
          
          {/* Navigation Control Hub */}
          <div className="bg-slate-200/50 border border-slate-200 dark:bg-slate-900/50 dark:border-slate-800 p-1.5 rounded-2xl flex items-center justify-between gap-1.5 shadow-inner transition-colors duration-300">
            <button
              id="tab-inbox"
              onClick={() => setActiveTab('inbox')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition-all duration-200 ${
                activeTab === 'inbox' 
                  ? 'bg-indigo-600 dark:bg-indigo-500 text-white shadow-md shadow-indigo-500/10' 
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-white/60 dark:hover:bg-slate-800/60'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Inbox</span>
              {tasks.filter(t => t.status === 'pending').length > 0 && (
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full transition-colors duration-300 ${
                  activeTab === 'inbox' ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400' : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                }`}>
                  {tasks.filter(t => t.status === 'pending').length}
                </span>
              )}
            </button>
            <button
              id="tab-add"
              onClick={() => setActiveTab('add')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition-all duration-200 ${
                activeTab === 'add' 
                  ? 'bg-indigo-600 dark:bg-indigo-500 text-white shadow-md shadow-indigo-500/10' 
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-white/60 dark:hover:bg-slate-800/60'
              }`}
            >
              <Plus className="w-4 h-4" />
              <span>New Rescue</span>
            </button>
            <button
              id="tab-insights"
              onClick={() => setActiveTab('insights')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition-all duration-200 ${
                activeTab === 'insights' 
                  ? 'bg-indigo-600 dark:bg-indigo-500 text-white shadow-md shadow-indigo-500/10' 
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-white/60 dark:hover:bg-slate-800/60'
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              <span>Insights</span>
            </button>
            <button
              id="tab-calendar"
              onClick={() => setActiveTab('calendar')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition-all duration-200 ${
                activeTab === 'calendar' 
                  ? 'bg-indigo-600 dark:bg-indigo-500 text-white shadow-md shadow-indigo-500/10' 
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-white/60 dark:hover:bg-slate-800/60'
              }`}
            >
              <Calendar className="w-4 h-4" />
              <span>Sync Feed</span>
            </button>
          </div>

          {/* Tab Content Display Area */}
          <div className="flex-1 min-h-0">
            <AnimatePresence mode="wait">
              
              {/* Task Inbox View */}
              {activeTab === 'inbox' && (
                <motion.div
                  key="inbox"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.15 }}
                  className="space-y-4"
                >
                  <div className="flex items-center justify-between px-1">
                    <h2 className="font-bold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-widest">Active Task Inbox</h2>
                    <span className="text-xs font-medium text-slate-400 dark:text-slate-500">
                      {tasks.filter(t => t.status === 'pending').length} Active Trackers
                    </span>
                  </div>

                  {sortedTasks.length === 0 ? (
                    <div className="bg-white border border-dashed border-slate-200 dark:bg-slate-900 dark:border-slate-800 rounded-2xl p-12 text-center shadow-sm transition-colors duration-300">
                      <Bell className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                      <p className="text-sm font-bold text-slate-700 dark:text-slate-300">No active tasks being tracked.</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">Add an academic, work, or personal task with a critical priority to trigger instant notification rescue.</p>
                      <button
                        onClick={() => setActiveTab('add')}
                        className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-red-500 hover:bg-red-600 text-white transition-all shadow-sm cursor-pointer"
                      >
                        <Plus className="w-4 h-4" /> Add Task Now
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {sortedTasks.map(t => {
                        const countStatus = getTaskNotifications(t, currentTime);
                        const firedCount = countStatus.filter(c => c.fired && !c.skipped).length;
                        const pendingCount = countStatus.filter(c => !c.fired && !c.skipped).length;

                        // Dynamic borders & glow effects depending on status & priority
                        let priorityBorder = 'border-slate-200 bg-white shadow-sm';
                        let badgeColor = 'bg-slate-100 text-slate-600';
                        let countdownGlow = 'text-slate-500';

                        if (t.status === 'pending') {
                          if (t.priority === 'P1') {
                            priorityBorder = 'border-slate-200 dark:border-slate-800 border-l-4 border-l-red-500 bg-white dark:bg-slate-900 shadow-sm';
                            badgeColor = 'text-[10px] font-bold px-2 py-0.5 bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 rounded';
                            countdownGlow = 'text-red-500 font-semibold animate-pulse';
                          } else if (t.priority === 'P2') {
                            priorityBorder = 'border-slate-200 dark:border-slate-800 border-l-4 border-l-amber-500 bg-white dark:bg-slate-900 shadow-sm';
                            badgeColor = 'text-[10px] font-bold px-2 py-0.5 bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 rounded';
                            countdownGlow = 'text-amber-600 font-semibold';
                          } else {
                            priorityBorder = 'border-slate-200 dark:border-slate-800 border-l-4 border-l-blue-500 bg-white dark:bg-slate-900 shadow-sm';
                            badgeColor = 'text-[10px] font-bold px-2 py-0.5 bg-blue-100 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded';
                            countdownGlow = 'text-slate-500 font-medium';
                          }
                        } else if (t.status === 'completed') {
                          priorityBorder = 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 opacity-75';
                          badgeColor = 'text-[10px] font-bold px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 rounded';
                          countdownGlow = 'text-slate-400 line-through';
                        } else if (t.status === 'missed') {
                          priorityBorder = 'border-slate-200 dark:border-slate-800 border-l-4 border-l-red-500 bg-red-50/40 dark:bg-red-950/10 opacity-90 shadow-sm';
                          badgeColor = 'text-[10px] font-bold px-2 py-0.5 bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 rounded';
                          countdownGlow = 'text-red-600 font-bold';
                        }

                        return (
                          <motion.div
                            id={`task-card-${t.id}`}
                            key={t.id}
                            layoutId={t.id}
                            className={`p-4 rounded-xl border ${priorityBorder} transition-all duration-250 relative group overflow-hidden`}
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 relative z-10">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {/* Category Badge */}
                                  <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                                    {t.category}
                                  </span>
                                  {/* Priority Badge */}
                                  <span className={badgeColor}>
                                    {t.priority}
                                  </span>
                                  {/* Google Calendar Link Badge */}
                                  {t.googleCalendarEventId && (
                                    <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/50 flex items-center gap-1" title="Synchronized to Google Calendar">
                                      <Calendar className="w-3 h-3" />
                                      <span>Google Calendar</span>
                                    </span>
                                  )}
                                </div>
                                
                                <h3 className={`text-sm font-bold mt-2 text-slate-800 dark:text-slate-100 truncate ${t.status === 'completed' ? 'line-through text-slate-400 dark:text-slate-500' : ''}`}>
                                  {t.name}
                                </h3>

                                <div className="flex items-center gap-4 mt-2.5 text-xs text-slate-500 dark:text-slate-400">
                                  {/* Countdown / Status text */}
                                  <div className="flex items-center gap-1">
                                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                                    <span className={countdownGlow}>
                                      {t.status === 'completed' 
                                        ? `Completed ${new Date(t.completedAt!).toLocaleDateString()}` 
                                        : t.status === 'missed' 
                                          ? 'Missed Deadline' 
                                          : getCountdownString(t.deadline)}
                                    </span>
                                  </div>

                                  {/* Notification dots tracker */}
                                  {t.status === 'pending' && (
                                    <div className="flex items-center gap-1.5" title={`${firedCount} of ${firedCount + pendingCount} alert notifications fired`}>
                                      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Alerts:</span>
                                      <div className="flex items-center gap-1">
                                        {countStatus.map((c, idx) => {
                                          if (c.skipped) return null;
                                          return (
                                            <div 
                                              key={idx} 
                                              className={`w-1.5 h-1.5 rounded-full ${
                                                c.fired 
                                                  ? 'bg-red-500 shadow-sm shadow-red-500/30' 
                                                  : 'bg-slate-200 dark:bg-slate-850 border border-slate-300 dark:border-slate-700'
                                              }`}
                                              title={`${c.label}: ${c.fired ? 'Fired' : 'Pending'}`}
                                            />
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Task Card Action Buttons */}
                              <div className="flex items-center gap-2 self-end sm:self-center">
                                {t.status === 'pending' && (
                                  <button
                                    id={`btn-complete-${t.id}`}
                                    onClick={() => handleMarkComplete(t)}
                                    className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-500 hover:text-white border border-emerald-100 dark:border-emerald-900/50 text-emerald-600 dark:text-emerald-400 transition-all cursor-pointer shadow-sm"
                                    title="Mark complete"
                                  >
                                    <Check className="w-4 h-4" />
                                  </button>
                                )}
                                <button
                                  id={`btn-delete-${t.id}`}
                                  onClick={() => handleDeleteTask(t)}
                                  className="p-2 rounded-lg bg-red-50 dark:bg-red-950/30 hover:bg-red-500 hover:text-white border border-red-100 dark:border-red-900/50 text-red-600 dark:text-red-400 transition-all cursor-pointer shadow-sm"
                                  title="Delete task tracker"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                </motion.div>
              )}

              {/* Add/Edit Task Form View */}
              {activeTab === 'add' && (
                <motion.div
                  key="add"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.15 }}
                  className="bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 rounded-2xl p-6 space-y-5 shadow-sm transition-colors duration-300"
                >
                  {conflictState ? (
                    <div className="space-y-6">
                      <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-400">
                        <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <h3 className="text-sm font-bold">Scheduling Conflict Detected!</h3>
                          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                            Your new task <strong className="text-slate-900 dark:text-white font-bold">"{conflictState.newTask.name}"</strong> overlaps with an existing task <strong className="text-slate-900 dark:text-white font-bold">"{conflictState.overlappingTask.name}"</strong> already scheduled on <strong>{new Date(conflictState.overlappingTask.deadline).toLocaleDateString()}</strong> at <strong>{new Date(conflictState.overlappingTask.deadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong>.
                          </p>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          <Calendar className="w-4 h-4 text-indigo-500" />
                          <span>Google Calendar Free Slots for {new Date(conflictState.newTask.deadline).toLocaleDateString()}</span>
                        </div>
                        
                        {conflictState.isLoadingSlots ? (
                          <div className="flex items-center gap-3 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400">
                            <span className="w-2 h-2 bg-indigo-600 rounded-full animate-ping" />
                            <span className="animate-pulse">Checking your calendar and looking for alternative free hours...</span>
                          </div>
                        ) : conflictState.alternativeSlots.length > 0 ? (
                          <div className="space-y-2">
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              We found these open 1-hour slots on this day. Select one to automatically reschedule and save:
                            </p>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                              {conflictState.alternativeSlots.map((slotIso) => {
                                const timeStr = new Date(slotIso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                return (
                                  <button
                                    id={`btn-conflict-slot-${timeStr.replace(/\s+/g, '-').toLowerCase()}`}
                                    key={slotIso}
                                    type="button"
                                    onClick={() => handleRescheduleConflictTask(slotIso)}
                                    className="px-3 py-2 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-600 hover:text-white dark:hover:bg-indigo-600 border border-indigo-100 dark:border-indigo-900/40 hover:border-indigo-600 dark:hover:border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold text-xs rounded-xl transition-all cursor-pointer text-center"
                                  >
                                    {timeStr}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs text-slate-500 dark:text-slate-400 py-2">
                            No other free hours found in normal working range (9 AM - 6 PM) for this day.
                          </div>
                        )}
                      </div>

                      <div className="pt-4 border-t border-slate-100 dark:border-slate-800/60 flex flex-col sm:flex-row gap-3">
                        <button
                          id="btn-conflict-save-anyway"
                          type="button"
                          onClick={handleSaveConflictTaskAnyway}
                          className="flex-1 py-3 px-4 bg-slate-100 dark:bg-slate-850 hover:bg-slate-200 dark:hover:bg-slate-750 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer text-center"
                        >
                          Schedule Anyway
                        </button>
                        <button
                          id="btn-conflict-cancel"
                          type="button"
                          onClick={handleCancelConflict}
                          className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer text-center"
                        >
                          Cancel & Adjust Manually
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 mb-4">
                        <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path>
                        </svg>
                        <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">New Urgent Rescue</h2>
                      </div>

                      <form onSubmit={handleAddTask} className="space-y-4">
                        {/* Task Title */}
                        <div>
                          <label className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase block mb-1.5">Task Description / Title</label>
                          <input
                            id="input-task-name"
                            type="text"
                            placeholder="e.g. Finish Tax Return"
                            value={taskName}
                            onChange={e => setTaskName(e.target.value)}
                            className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-colors duration-300"
                            required
                          />
                        </div>

                        {/* Deadline Grid */}
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase block mb-1.5">Deadline Date</label>
                            <input
                              id="input-task-date"
                              type="date"
                              value={taskDeadlineDate}
                              onChange={e => setTaskDeadlineDate(e.target.value)}
                              className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-colors duration-300"
                              required
                            />
                          </div>
                          <div>
                            <label className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase block mb-1.5">Deadline Time</label>
                            <input
                              id="input-task-time"
                              type="time"
                              value={taskDeadlineTime}
                              onChange={e => setTaskDeadlineTime(e.target.value)}
                              className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-colors duration-300"
                              required
                            />
                          </div>
                        </div>

                        {/* Category Selector */}
                        <div>
                          <label className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase block mb-2">Task Category</label>
                          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                            {(['Academic', 'Work', 'Personal', 'Finance', 'Others'] as TaskCategory[]).map(cat => (
                              <button
                                id={`btn-category-${cat}`}
                                key={cat}
                                type="button"
                                onClick={() => setTaskCategory(cat)}
                                className={`py-2 px-1.5 text-xs font-bold rounded-lg border text-center transition-all ${
                                  taskCategory === cat
                                    ? 'bg-red-500 border-red-500 text-white shadow-md shadow-red-500/10'
                                    : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-slate-100 hover:border-slate-300 dark:hover:border-slate-750'
                                }`}
                              >
                                {cat}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Priority Selector */}
                        <div>
                          <label className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase block mb-2">Set Priority Level</label>
                          <div className="grid grid-cols-3 gap-3">
                            {(['P1', 'P2', 'P3'] as TaskPriority[]).map(prio => {
                              let labelText = '';
                              let colorActive = '';
                              if (prio === 'P1') {
                                labelText = 'P1';
                                colorActive = 'border-2 border-red-500 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400';
                              } else if (prio === 'P2') {
                                labelText = 'P2';
                                colorActive = 'border-2 border-amber-500 bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400';
                              } else {
                                labelText = 'P3';
                                colorActive = 'border-2 border-blue-500 bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400';
                              }

                              return (
                                <button
                                  id={`btn-priority-${prio}`}
                                  key={prio}
                                  type="button"
                                  onClick={() => setTaskPriority(prio)}
                                  className={`py-3 rounded-xl border text-xs font-bold transition-all text-center ${
                                    taskPriority === prio
                                      ? colorActive
                                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 hover:border-slate-300 dark:hover:border-slate-700 text-slate-600 dark:text-slate-400'
                                  }`}
                                >
                                  {labelText}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Notification Schedule Hint Visual Box */}
                        <div className={`p-4 rounded-xl border bg-gradient-to-br ${priorityHint?.color} transition-all duration-300 space-y-2 shadow-sm`}>
                          <div className="flex items-center gap-2 text-xs font-bold">
                            <Bell className="w-4 h-4 text-red-500" />
                            <span>Rescue Plan: {priorityHint?.count} Scheduled Alerts</span>
                          </div>
                          <ul className="text-xs space-y-1.5 pl-5 list-disc leading-relaxed font-semibold">
                            {priorityHint?.schedule.map((item, idx) => (
                              <li key={idx}>{item}</li>
                            ))}
                          </ul>
                          {(taskPriority === 'P1' || taskPriority === 'P2') && (
                            <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-800/60 flex items-center gap-1.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                              <Calendar className="w-3.5 h-3.5 text-blue-500" />
                              <span>Google Calendar Sync automatic on Save</span>
                            </div>
                          )}
                        </div>

                        <button
                          id="btn-save-task"
                          type="submit"
                          className="w-full bg-slate-900 dark:bg-indigo-600 text-white py-3 rounded-xl font-bold text-sm mt-6 hover:bg-slate-850 dark:hover:bg-indigo-500 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                        >
                          <Plus className="w-4 h-4" /> SYNC TO CALENDAR & SAVE
                        </button>
                      </form>
                    </>
                  )}
                </motion.div>
              )}

              {/* Insights View */}
              {activeTab === 'insights' && (
                <motion.div
                  key="insights"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.15 }}
                  className="space-y-6"
                >
                  <div className="flex items-center justify-between px-1">
                    <h2 className="font-bold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-widest">Behavioral Analytics</h2>
                    <span className="text-xs font-medium text-slate-400 dark:text-slate-500">Last 30 Days</span>
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm text-center transition-colors duration-300">
                      <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase">Tasks Saved</p>
                      <p className="text-3xl font-black text-slate-800 dark:text-slate-100 mt-1">{tasks.length}</p>
                    </div>
                    <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm text-center transition-colors duration-300">
                      <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase">Tasks Rescued</p>
                      <p className="text-3xl font-black text-emerald-600 mt-1">{stats.completed}</p>
                    </div>
                    <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm text-center transition-colors duration-300">
                      <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase">Completion Rate</p>
                      <p className="text-3xl font-black text-slate-800 dark:text-slate-100 mt-1">{stats.onTimeRate}%</p>
                      <div className="w-full bg-slate-100 dark:bg-slate-800 h-1 rounded-full mt-3">
                        <div className="bg-emerald-500 h-1 rounded-full" style={{ width: `${stats.onTimeRate}%` }}></div>
                      </div>
                    </div>
                    <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm text-center transition-colors duration-300">
                      <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase">Streak</p>
                      <div className="flex items-center justify-center gap-1.5 mt-1 text-amber-650">
                        <Flame className="w-5 h-5 fill-amber-50 dark:fill-amber-950/20" />
                        <p className="text-3xl font-black">{stats.streak} Days</p>
                      </div>
                    </div>
                  </div>

                  {/* Missed deadlines bar chart bento-style */}
                  <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 transition-colors duration-300">
                    <div>
                      <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Missed Deadlines by Priority</h3>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Tracking fails which need rescue planning.</p>
                    </div>

                    {/* Handcrafted, beautiful interactive SVG Bar Chart */}
                    <div className="pt-2">
                      <svg viewBox="0 0 400 160" className="w-full h-auto overflow-visible select-none">
                        {/* Grid lines */}
                        <line x1="50" y1="20" x2="380" y2="20" className="stroke-slate-100 dark:stroke-slate-800/40" strokeWidth="1.5" strokeDasharray="3" />
                        <line x1="50" y1="60" x2="380" y2="60" className="stroke-slate-100 dark:stroke-slate-800/40" strokeWidth="1.5" strokeDasharray="3" />
                        <line x1="50" y1="100" x2="380" y2="100" className="stroke-slate-100 dark:stroke-slate-800/40" strokeWidth="1.5" strokeDasharray="3" />
                        <line x1="50" y1="130" x2="380" y2="130" className="stroke-slate-200 dark:stroke-slate-800" strokeWidth="1.5" />

                        {/* Y-Axis scale numbers */}
                        <text x="35" y="24" className="text-[10px] font-bold font-mono text-right fill-slate-400 dark:fill-slate-500" textAnchor="end">Max</text>
                        <text x="35" y="75" className="text-[10px] font-bold font-mono text-right fill-slate-400 dark:fill-slate-500" textAnchor="end">Mid</text>
                        <text x="35" y="134" className="text-[10px] font-bold font-mono text-right fill-slate-400 dark:fill-slate-500" textAnchor="end">0</text>

                        {/* Bars rendering logic */}
                        {(() => {
                          const maxVal = Math.max(stats.missedByPriority.P1, stats.missedByPriority.P2, stats.missedByPriority.P3, 1);
                          const getBarHeight = (val: number) => {
                            return (val / maxVal) * 100;
                          };

                          const p1H = getBarHeight(stats.missedByPriority.P1);
                          const p2H = getBarHeight(stats.missedByPriority.P2);
                          const p3H = getBarHeight(stats.missedByPriority.P3);

                          return (
                            <>
                              {/* P1 Bar (Red) */}
                              <g className="cursor-pointer group">
                                <rect 
                                  x="90" 
                                  y={130 - p1H} 
                                  width="40" 
                                  height={p1H} 
                                  rx="4" 
                                  fill="url(#rose-grad)" 
                                  className="transition-all duration-300 hover:opacity-90"
                                />
                                <text x="110" y="148" className="text-[10px] font-bold fill-slate-600 dark:fill-slate-400" textAnchor="middle">P1</text>
                                <text x="110" y={120 - p1H} className="text-[10px] font-bold font-mono fill-red-500 dark:fill-red-400" textAnchor="middle">
                                  {stats.missedByPriority.P1}
                                </text>
                              </g>

                              {/* P2 Bar (Amber) */}
                              <g className="cursor-pointer group">
                                <rect 
                                  x="180" 
                                  y={130 - p2H} 
                                  width="40" 
                                  height={p2H} 
                                  rx="4" 
                                  fill="url(#amber-grad)" 
                                  className="transition-all duration-300 hover:opacity-90"
                                />
                                <text x="200" y="148" className="text-[10px] font-bold fill-slate-600 dark:fill-slate-400" textAnchor="middle">P2</text>
                                <text x="200" y={120 - p2H} className="text-[10px] font-bold font-mono fill-amber-600 dark:fill-amber-450" textAnchor="middle">
                                  {stats.missedByPriority.P2}
                                </text>
                              </g>

                              {/* P3 Bar (Blue) */}
                              <g className="cursor-pointer group">
                                <rect 
                                  x="270" 
                                  y={130 - p3H} 
                                  width="40" 
                                  height={p3H} 
                                  rx="4" 
                                  fill="url(#blue-grad)" 
                                  className="transition-all duration-300 hover:opacity-90"
                                />
                                <text x="290" y="148" className="text-[10px] font-bold fill-slate-600 dark:fill-slate-400" textAnchor="middle">P3</text>
                                <text x="290" y={120 - p3H} className="text-[10px] font-bold font-mono fill-blue-600 dark:fill-blue-400" textAnchor="middle">
                                  {stats.missedByPriority.P3}
                                </text>
                              </g>

                              {/* Gradients declarations */}
                              <defs>
                                <linearGradient id="rose-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                                  <stop offset="0%" stopColor="#ef4444" stopOpacity="0.8" />
                                  <stop offset="100%" stopColor="#fee2e2" stopOpacity="0.1" />
                                </linearGradient>
                                <linearGradient id="amber-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                                  <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.8" />
                                  <stop offset="100%" stopColor="#fef3c7" stopOpacity="0.1" />
                                </linearGradient>
                                <linearGradient id="blue-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                                  <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.8" />
                                  <stop offset="100%" stopColor="#dbeafe" stopOpacity="0.1" />
                                </linearGradient>
                              </defs>
                            </>
                          );
                        })()}
                      </svg>
                    </div>
                  </div>

                  {/* Gemini coaching insights line box */}
                  <div className="relative overflow-hidden rounded-2xl bg-slate-900 text-white p-6 shadow-xl space-y-4">
                    <div className="relative z-10">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 bg-gradient-to-tr from-purple-400 to-blue-400 rounded-full animate-pulse" />
                          <span className="text-xs font-bold tracking-widest uppercase text-slate-400">Gemini AI Behavioral Insight</span>
                        </div>
                        <button
                          id="btn-regenerate-insight"
                          onClick={() => generateInsight()}
                          className="text-xs text-purple-400 hover:text-purple-300 hover:underline flex items-center gap-1 font-semibold cursor-pointer disabled:opacity-50"
                          disabled={isGeneratingInsight}
                        >
                          {isGeneratingInsight ? 'Analyzing...' : 'Regenerate'}
                        </button>
                      </div>
                      <p className={`text-lg leading-relaxed font-medium text-slate-100 italic mt-4 ${isGeneratingInsight ? 'opacity-50' : ''}`}>
                        "{insight}"
                      </p>
                      <div className="mt-6 flex gap-4">
                        <div className="px-4 py-2 bg-white/10 rounded-lg">
                          <span className="text-[10px] text-slate-400 block font-semibold">Miss Rate (P1)</span>
                          <span className="text-lg font-bold">
                            {stats.completed + stats.missed > 0 
                              ? `${Math.round((stats.missedByPriority.P1 / (stats.completed + stats.missed || 1)) * 100)}%` 
                              : '0%'}
                          </span>
                        </div>
                        <div className="px-4 py-2 bg-white/10 rounded-lg">
                          <span className="text-[10px] text-slate-400 block font-semibold">Focus Factor</span>
                          <span className="text-lg font-bold">{stats.onTimeRate > 80 ? 'High' : 'Moderate'}</span>
                        </div>
                      </div>
                    </div>
                    {/* Decorative AI Pattern */}
                    <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 blur-3xl rounded-full" />
                  </div>

                  {/* Ask Gemini Q&A Box */}
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-2xl shadow-sm space-y-4 transition-colors duration-300">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-indigo-500" />
                        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Ask Gemini Coaching Assistant</h3>
                      </div>
                      
                      {/* Live verification status indicator badge */}
                      {isGeminiConfigured === true && (
                        <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/40 text-[10px] font-bold">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          <span>Gemini Active</span>
                        </div>
                      )}
                      {isGeminiConfigured === false && (
                        <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-900/40 text-[10px] font-bold">
                          <AlertTriangle className="w-3 h-3 text-amber-500" />
                          <span>Key Missing</span>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Have specific questions about your work patterns or deadlines? Ask Gemini for tailored behavioral suggestions.
                    </p>

                    {/* Warning alert if the API key is not configured */}
                    {isGeminiConfigured === false && (
                      <div className="bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 p-4 rounded-xl text-xs flex items-start gap-2.5 animate-fadeIn">
                        <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-500 shrink-0" />
                        <div className="space-y-1">
                          <p className="font-bold">Gemini API Key is not set up!</p>
                          <p className="leading-relaxed text-slate-600 dark:text-slate-355">To ask custom coaching questions and unlock AI-powered insights, please configure your <strong>GEMINI_API_KEY</strong> in the <strong>Settings &gt; Secrets</strong> menu.</p>
                        </div>
                      </div>
                    )}

                    {/* Quick Suggestions Buttons */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-2">
                      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider shrink-0">Suggestions:</span>
                      <div className="flex flex-wrap gap-2">
                        {[
                          "How could I increase my productivity?",
                          "Why do I miss deadlines?",
                          "What should I do to meet more deadlines?"
                        ].map((q) => (
                          <button
                            id={`btn-preset-question-${q.replace(/\s+/g, '-').replace(/\?/g, '').toLowerCase()}`}
                            key={q}
                            type="button"
                            onClick={() => {
                              setUserQuestion(q);
                              handleAskGemini(q);
                            }}
                            disabled={isAsking}
                            className="text-xs bg-slate-50 dark:bg-slate-950 hover:bg-indigo-50 dark:hover:bg-indigo-950 text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 border border-slate-200 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-900/60 rounded-xl px-3 py-1.5 font-medium transition-all text-left cursor-pointer"
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Chat Input form */}
                    <form 
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleAskGemini();
                      }}
                      className="flex gap-2 pt-2"
                    >
                      <input
                        id="input-ask-gemini-custom"
                        type="text"
                        value={userQuestion}
                        onChange={(e) => setUserQuestion(e.target.value)}
                        placeholder="Type a custom productivity question (e.g., 'How to focus on P1 tasks?')..."
                        disabled={isAsking}
                        className="flex-1 px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-650 focus:outline-none focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-500 transition-colors duration-300"
                      />
                      <button
                        id="btn-submit-gemini-question"
                        type="submit"
                        disabled={isAsking || !userQuestion.trim()}
                        className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 font-bold text-sm text-white rounded-xl shadow-md shadow-indigo-600/10 cursor-pointer hover:shadow-indigo-600/20 active:scale-[0.98] transition-all"
                      >
                        {isAsking ? 'Thinking...' : 'Ask'}
                      </button>
                    </form>

                    {/* Gemini Answer Output Panel */}
                    <AnimatePresence mode="wait">
                      {(isAsking || geminiAnswer) && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          transition={{ duration: 0.2 }}
                          className="mt-4 p-5 rounded-2xl bg-slate-50 dark:bg-slate-950/85 border border-indigo-100/50 dark:border-indigo-950/50"
                        >
                          {isAsking ? (
                            <div className="flex items-center gap-3 py-3">
                              <span className="w-2.5 h-2.5 bg-indigo-600 rounded-full animate-ping" />
                              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 animate-pulse">Gemini is analyzing your deadline behaviors and drafting recommendations...</span>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">Coaching Response</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setGeminiAnswer(null);
                                    setUserQuestion('');
                                  }}
                                  className="text-xs text-slate-400 hover:text-slate-650 dark:hover:text-slate-200 cursor-pointer"
                                >
                                  Clear
                                </button>
                              </div>
                              <div className="text-sm leading-relaxed text-slate-700 dark:text-slate-300 font-sans prose dark:prose-invert max-w-none prose-p:leading-relaxed prose-li:my-1">
                                <Markdown>{geminiAnswer}</Markdown>
                              </div>
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              )}

              {/* Calendar Feed Tab */}
              {activeTab === 'calendar' && (
                <motion.div
                  key="calendar"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.15 }}
                  className="space-y-4"
                >
                  <div className="flex items-center justify-between px-1">
                    <h2 className="font-bold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-widest">Calendar Sync Feed</h2>
                    <span className="text-xs font-medium text-slate-400 dark:text-slate-500">Live logs</span>
                  </div>

                  <div className="bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 p-6 rounded-2xl shadow-sm space-y-4 transition-colors duration-300">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Synchronization Status</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Automated calendar logging for high-priority P1 & P2 tasks.</p>
                      </div>

                      {!googleUser ? (
                        <button
                          id="btn-calendar-connect-view"
                          onClick={handleConnectGCal}
                          className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-slate-900 hover:bg-slate-850 text-white cursor-pointer transition-all"
                        >
                          Connect Google Calendar
                        </button>
                      ) : (
                        <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 px-3 py-1 rounded-full font-bold">
                          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
                          <span>Active Connection</span>
                        </div>
                      )}
                    </div>

                    {/* Sync History List */}
                    <div className="space-y-2 pt-2">
                      <p className="text-[11px] font-bold uppercase text-slate-400 dark:text-slate-500 tracking-wider">Synced Event Logs</p>
                      
                      {syncHistory.length === 0 ? (
                        <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center text-slate-500 dark:text-slate-400 text-xs font-semibold transition-colors duration-300">
                          No synced events logged. Save a P1 or P2 task to view automated integration.
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                          {syncHistory.map(log => (
                            <div key={log.id} className="bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-850 p-3 rounded-lg flex items-center justify-between gap-3 transition-colors duration-300">
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{log.name}</p>
                                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold font-mono mt-1">{log.time}</p>
                              </div>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 ${
                                log.status === 'synced' 
                                  ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/40' 
                                  : 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/40'
                              }`}>
                                <CheckCircle className="w-3 h-3" />
                                {log.status === 'synced' ? 'Google Calendar' : 'Simulated Event'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}

            </AnimatePresence>
          </div>

        </div>

        {/* Right Column: Key Features & Active Streaks Info Panel (5 cols) */}
        <div id="column-right" className="lg:col-span-5 flex flex-col gap-6">
          
          {/* Streak & Productivity Score Bento Box */}
          <div className="bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 p-5 rounded-2xl shadow-sm space-y-4 transition-colors duration-300">
            <div className="flex items-start justify-between relative z-10">
              <div>
                <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase">Tasks Rescued</p>
                <p className="text-3xl font-black text-slate-800 dark:text-slate-100 mt-1">{stats.completed}</p>
                <p className="text-[11px] text-emerald-600 font-bold mt-2">+2 completed today</p>
              </div>
              <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-100 dark:border-amber-900/40 p-2.5 rounded-xl text-amber-500 dark:text-amber-400">
                <Flame className="w-6 h-6 fill-amber-50 dark:fill-amber-950/10" />
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between text-xs font-bold">
              <span className="text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[10px]">On-Time Rate</span>
              <span className="text-emerald-600 font-black">{stats.onTimeRate}%</span>
            </div>
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[10px]">Missed (30d)</span>
              <span className="text-red-500 font-black">{stats.missed}</span>
            </div>
          </div>

          {/* Priority Alarm Schedule Guide Box */}
          <div className="bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 p-6 rounded-2xl shadow-sm space-y-4 transition-colors duration-300">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-red-500" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Rescue Alert Standards</h3>
            </div>
            
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
              TaskRescue establishes non-passive, priority-driven alerts designed to prevent you from overlooking crucial deliverables.
            </p>

            <div className="space-y-3 pt-1">
              <div className="p-3.5 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-100 dark:border-slate-800 space-y-1 transition-colors duration-300">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-red-600">P1 — Critical Level</span>
                  <span className="bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 text-[10px] px-2 py-0.5 rounded-md">4 Alerts</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed mt-1 font-medium">
                  Start of day at 9:00 AM (skipped if before 10:30 AM), 1h 30m before, 30m before, and 15m before. Auto-synced to Google Calendar on save.
                </p>
              </div>

              <div className="p-3.5 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-100 dark:border-slate-800 space-y-1 transition-colors duration-300">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-amber-600">P2 — Medium Level</span>
                  <span className="bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 text-[10px] px-2 py-0.5 rounded-md">2 Alerts</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed mt-1 font-medium">
                  1 hour before and 15 minutes before the deadline. Auto-synced to Google Calendar on save.
                </p>
              </div>

              <div className="p-3.5 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-100 dark:border-slate-800 space-y-1 transition-colors duration-300">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-blue-600">P3 — Low Level</span>
                  <span className="bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 text-[10px] px-2 py-0.5 rounded-md">1 Alert</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed mt-1 font-medium">
                  30 minutes before the deadline. Kept localized within the browser.
                </p>
              </div>
            </div>
          </div>

        </div>

      </main>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {taskToConfirm && (
          <div id="modal-confirm-overlay" className="fixed inset-0 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              id="modal-confirm"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-2xl max-w-sm w-full space-y-5 shadow-2xl text-slate-900 dark:text-slate-100 transition-colors duration-300"
            >
              <div className="flex items-start gap-3">
                <div className="p-2 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 rounded-lg border border-red-100 dark:border-red-900/50">
                  <AlertTriangle className="w-5 h-5 animate-bounce" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    {confirmAction === 'complete' ? 'Confirm Completion' : 'Delete Task Tracker'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed font-semibold">
                    Are you sure you want to {confirmAction === 'complete' ? 'mark this task as complete?' : 'delete this task and stop alert notifications?'}
                  </p>
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-100 dark:border-slate-800 transition-colors duration-300">
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{taskToConfirm.name}</p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 font-bold font-mono">Deadline: {new Date(taskToConfirm.deadline).toLocaleString()}</p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  id="btn-confirm-cancel"
                  onClick={() => {
                    setTaskToConfirm(null);
                    setConfirmAction(null);
                  }}
                  className="flex-1 py-2 px-3 text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg border border-slate-200 dark:border-slate-700 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  id="btn-confirm-proceed"
                  onClick={executeConfirmedAction}
                  className={`flex-1 py-2 px-3 text-xs font-bold text-white rounded-lg transition-all cursor-pointer ${
                    confirmAction === 'complete' 
                      ? 'bg-emerald-500 hover:bg-emerald-600 shadow-sm' 
                      : 'bg-red-500 hover:bg-red-600 shadow-sm'
                  }`}
                >
                  {confirmAction === 'complete' ? 'Yes, Complete' : 'Yes, Delete'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Floating Voice Assistant Widget */}
      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3">
        {/* Expanded Panel */}
        <AnimatePresence>
          {isVoiceWidgetOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-5 space-y-4 text-slate-900 dark:text-slate-100 transition-colors duration-300 mr-2"
            >
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <Mic className="w-4 h-4 text-red-500 animate-pulse" />
                  <h3 className="text-xs font-bold text-slate-800 dark:text-slate-100">Voice Assistant Task Scheduler</h3>
                </div>
                <span className="text-[9px] bg-indigo-500 text-white font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider">AI Voice</span>
              </div>

              {/* API Status checker box */}
              <div className="p-3 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-slate-100 dark:border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${isGeminiConfigured === true ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                    <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400">Gemini Key Status</span>
                  </div>
                  <button
                    id="btn-voice-check-api"
                    type="button"
                    onClick={checkApiServerConnection}
                    disabled={isCheckingServer}
                    className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer flex items-center gap-1"
                  >
                    {isCheckingServer ? "Checking..." : "Verify Connection"}
                  </button>
                </div>
                {serverCheckResult && (
                  <p className={`text-[10px] font-semibold leading-relaxed ${serverCheckResult.success ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                    {serverCheckResult.message}
                  </p>
                )}
                {isGeminiConfigured === false && !serverCheckResult && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold leading-relaxed">
                    Key missing. Set your GEMINI_API_KEY in Settings &gt; Secrets to parse voice scheduling.
                  </p>
                )}
                {isGeminiConfigured === true && !serverCheckResult && (
                  <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold leading-relaxed">
                    Gemini API Key is active and verified!
                  </p>
                )}
              </div>

              {/* Instruction Prompt */}
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
                Hold or click the record button below and speak. For example, say:
                <span className="block mt-1 p-2 bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 rounded-lg text-[11px] font-mono leading-relaxed font-bold border border-indigo-100/50 dark:border-indigo-950/50">
                  "Schedule a meeting at 5pm on 28 june"
                </span>
              </p>

              {/* Status and Action box */}
              <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-950/60 p-3 rounded-xl border border-slate-100 dark:border-slate-800/80">
                <button
                  id="btn-voice-record-floating"
                  type="button"
                  onClick={startVoiceListening}
                  disabled={isListening || isParsingVoice}
                  className={`flex items-center justify-center w-12 h-12 rounded-full transition-all duration-300 shadow-md cursor-pointer shrink-0 ${
                    isListening 
                      ? 'bg-red-500 text-white animate-pulse shadow-red-500/20' 
                      : isParsingVoice
                        ? 'bg-indigo-500 text-white animate-pulse'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white hover:scale-105 shadow-indigo-600/10'
                  }`}
                  title="Click to speak task"
                >
                  {isListening ? (
                    <span className="relative flex h-5 w-5 justify-center items-center">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                      <Mic className="relative w-5 h-5 text-white" />
                    </span>
                  ) : isParsingVoice ? (
                    <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <Mic className="w-5 h-5" />
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  {isListening ? (
                    <p className="text-xs font-bold text-red-500 animate-pulse">Listening... speak now.</p>
                  ) : isParsingVoice ? (
                    <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 animate-pulse">{voiceStatus}</p>
                  ) : voiceStatus ? (
                    <div className="space-y-0.5">
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">Status</p>
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-300 line-clamp-2">{voiceStatus}</p>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-normal font-semibold">
                      Ready to schedule. Click the red button and start speaking!
                    </p>
                  )}

                  {voiceError && (
                    <p className="text-[10px] font-bold text-red-500 mt-1 leading-snug">{voiceError}</p>
                  )}
                </div>
              </div>

              {/* Text fallback input */}
              <div className="border-t border-slate-150 dark:border-slate-800/80 pt-3 space-y-2">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Or type your request</span>
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!voiceTextInput.trim()) return;
                    handleVoiceScheduling(voiceTextInput);
                    setVoiceTextInput('');
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    value={voiceTextInput}
                    onChange={(e) => setVoiceTextInput(e.target.value)}
                    placeholder="e.g. Schedule meeting on Monday at 3pm"
                    disabled={isParsingVoice}
                    className="flex-1 px-3 py-1.5 bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-450 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                  <button
                    type="submit"
                    disabled={isParsingVoice || !voiceTextInput.trim()}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 font-bold text-xs text-white rounded-lg cursor-pointer shrink-0 transition-colors"
                  >
                    Send
                  </button>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Floating Toggle Button */}
        <button
          id="btn-voice-widget-toggle"
          type="button"
          onClick={() => setIsVoiceWidgetOpen(!isVoiceWidgetOpen)}
          className={`flex items-center justify-center w-14 h-14 rounded-full shadow-2xl cursor-pointer hover:scale-105 active:scale-95 transition-all duration-300 ${
            isVoiceWidgetOpen 
              ? 'bg-slate-900 dark:bg-indigo-600 text-white' 
              : 'bg-red-500 text-white shadow-red-500/20'
          }`}
          title={isVoiceWidgetOpen ? "Close Voice Assistant" : "Open Voice Assistant"}
        >
          {isVoiceWidgetOpen ? (
            <MicOff className="w-6 h-6" />
          ) : (
            <Mic className="w-6 h-6 animate-pulse" />
          )}
        </button>
      </div>

      {/* Standard Footer */}
      <footer id="app-footer" className="mt-auto border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-6 px-6 text-center text-xs text-slate-500 dark:text-slate-400 transition-colors duration-300">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <p className="font-semibold">TaskRescue Life Saver © 2026. All rights reserved.</p>
          <div className="flex items-center justify-center gap-4 text-[10px] font-bold font-mono text-slate-400 dark:text-slate-500">
            <span>PLATFORM: Google AI Studio</span>
            <span>API: Gemini 3.5 Flash</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
