/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type TaskPriority = 'P1' | 'P2' | 'P3';

export type TaskCategory = 'Academic' | 'Work' | 'Personal' | 'Finance' | 'Others';

export interface Task {
  id: string;
  name: string;
  deadline: string; // ISO String
  priority: TaskPriority;
  category: TaskCategory;
  status: 'pending' | 'completed' | 'missed';
  completedAt?: string; // ISO String
  googleCalendarEventId?: string | null;
}

export interface NotificationStatus {
  label: string;
  time: string; // ISO String
  fired: boolean;
  skipped?: boolean;
}

export interface ProductivityStats {
  completed: number;
  missed: number;
  onTimeRate: number;
  streak: number;
  missedByPriority: {
    P1: number;
    P2: number;
    P3: number;
  };
}
