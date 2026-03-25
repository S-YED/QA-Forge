import {
  UserRole,
  ApiKeyProvider,
  TestRunStatus,
  TestRunMode,
  TestStepStatus,
  ActionType,
  SessionStatus,
} from './enums.js';

export interface Profile {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface ApiKey {
  id: string;
  user_id: string;
  provider: ApiKeyProvider;
  encrypted_key: string;
  key_hint?: string;
  is_valid: boolean;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  base_url?: string;
  created_at: string;
  updated_at: string;
}

export interface TestRun {
  id: string;
  test_case_id?: string;
  project_id: string;
  user_id: string;
  status: TestRunStatus;
  mode: TestRunMode;
  browser?: string;
  environment?: string;
  duration_ms?: number;
  error_message?: string;
  video_url?: string;
  nl_input?: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
}

export interface TestStep {
  id: string;
  test_run_id: string;
  step_number: number;
  action: string;
  selector?: string;
  value?: string;
  status: TestStepStatus;
  screenshot_url?: string;
  error_message?: string;
  duration_ms?: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface RecordedSession {
  id: string;
  project_id: string;
  user_id: string;
  name: string;
  description?: string;
  base_url: string;
  browser?: string;
  status: SessionStatus;
  video_url?: string;
  duration_ms?: number;
  started_at: string;
  completed_at?: string;
  created_at: string;
}

export interface SessionAction {
  id: string;
  session_id: string;
  action_number: number;
  action_type: ActionType;
  selector?: string;
  xpath?: string;
  coordinates?: { x: number; y: number };
  value?: string;
  url?: string;
  timestamp_ms: number;
  metadata: Record<string, unknown>;
  created_at: string;
}
