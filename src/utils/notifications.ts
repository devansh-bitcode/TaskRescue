/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Task, NotificationStatus } from '../types';

/**
 * Calculates the list of notifications for a task, and determines their status (fired, pending, or skipped).
 */
export function getTaskNotifications(task: Task, now: Date = new Date()): NotificationStatus[] {
  const deadlineDate = new Date(task.deadline);
  const deadlineTime = deadlineDate.getTime();
  const alerts: NotificationStatus[] = [];

  if (task.priority === 'P1') {
    // 1. Start of deadline day at 9:00 AM
    const dayStart9AM = new Date(deadlineDate);
    dayStart9AM.setHours(9, 0, 0, 0);

    // Edge case: if deadline is before 10:30 AM on that day, skip the 9 AM alert
    const cutoffTime = new Date(deadlineDate);
    cutoffTime.setHours(10, 30, 0, 0);

    const isSkipped = deadlineTime < cutoffTime.getTime();

    alerts.push({
      label: '9:00 AM (Day of)',
      time: dayStart9AM.toISOString(),
      fired: !isSkipped && now.getTime() >= dayStart9AM.getTime(),
      skipped: isSkipped,
    });

    // 2. 1 hour 30 minutes before (90 minutes)
    const alert1h30m = new Date(deadlineTime - 90 * 60 * 1000);
    alerts.push({
      label: '1h 30m before',
      time: alert1h30m.toISOString(),
      fired: now.getTime() >= alert1h30m.getTime(),
    });

    // 3. 30 minutes before
    const alert30m = new Date(deadlineTime - 30 * 60 * 1000);
    alerts.push({
      label: '30m before',
      time: alert30m.toISOString(),
      fired: now.getTime() >= alert30m.getTime(),
    });

    // 4. 15 minutes before
    const alert15m = new Date(deadlineTime - 15 * 60 * 1000);
    alerts.push({
      label: '15m before',
      time: alert15m.toISOString(),
      fired: now.getTime() >= alert15m.getTime(),
    });
  } else if (task.priority === 'P2') {
    // 1. 1 hour before
    const alert1h = new Date(deadlineTime - 60 * 60 * 1000);
    alerts.push({
      label: '1h before',
      time: alert1h.toISOString(),
      fired: now.getTime() >= alert1h.getTime(),
    });

    // 2. 15 minutes before
    const alert15m = new Date(deadlineTime - 15 * 60 * 1000);
    alerts.push({
      label: '15m before',
      time: alert15m.toISOString(),
      fired: now.getTime() >= alert15m.getTime(),
    });
  } else if (task.priority === 'P3') {
    // 1. 30 minutes before
    const alert30m = new Date(deadlineTime - 30 * 60 * 1000);
    alerts.push({
      label: '30m before',
      time: alert30m.toISOString(),
      fired: now.getTime() >= alert30m.getTime(),
    });
  }

  return alerts;
}

/**
 * Triggers a beautiful custom audio alert chime using Web Audio API
 */
export function playChimeSound() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();

    // Create a beautiful warm synthesizer chime
    const playTone = (freq: number, start: number, duration: number, type: OscillatorType = 'sine') => {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, start);

      gainNode.gain.setValueAtTime(0, start);
      gainNode.gain.linearRampToValueAtTime(0.12, start + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, start + duration);

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc.start(start);
      osc.stop(start + duration);
    };

    const now = ctx.currentTime;
    // Play a lovely uplifting arpeggio (C major 7th)
    playTone(261.63, now, 1.2, 'sine'); // C4
    playTone(329.63, now + 0.1, 1.1, 'sine'); // E4
    playTone(392.00, now + 0.2, 1.0, 'sine'); // G4
    playTone(493.88, now + 0.3, 0.9, 'triangle'); // B4
    playTone(523.25, now + 0.45, 0.8, 'sine'); // C5
  } catch (e) {
    console.error('Failed to play sound chime:', e);
  }
}

/**
 * Request Notification permissions and trigger standard system notification
 */
export async function showSystemNotification(title: string, body: string) {
  if (!('Notification' in window)) return;

  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/favicon.ico' });
  } else if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      new Notification(title, { body, icon: '/favicon.ico' });
    }
  }
}
