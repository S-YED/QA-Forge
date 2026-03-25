import { TestStepStatus, TestRunStatus } from './enums.js';
import { SessionAction } from './database.js';

// ── Test Execution Events ─────────────────────────────────────────────────────

export interface TestStepStartEvent {
  test_run_id: string;
  step_number: number;
  action: string;
}

export interface TestStepCompleteEvent {
  test_run_id: string;
  step_number: number;
  status: TestStepStatus;
  screenshot_url?: string;
  error_message?: string;
  duration_ms: number;
}

export interface TestScreenshotEvent {
  test_run_id: string;
  step_number: number;
  screenshot_base64: string;
}

export interface TestCompleteEvent {
  test_run_id: string;
  status: TestRunStatus;
  duration_ms: number;
}

// ── Recording Events ──────────────────────────────────────────────────────────

export interface RecordingActionEvent {
  session_id: string;
  action: Omit<SessionAction, 'id' | 'created_at'>;
}

export interface SessionFrameEvent {
  session_id: string;
  frame_base64: string;
  timestamp_ms: number;
}
