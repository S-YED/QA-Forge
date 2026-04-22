import {
  UserRole,
  ApiKeyProvider,
  TestRunStatus,
  TestRunMode,
  TestStepStatus,
  ActionType,
  SessionStatus,
  BugSeverity,
  BugStatus,
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

// ── MVP-2 additions ──────────────────────────────────────────────────────────

export interface TestSuite {
  id: string;
  project_id: string;
  parent_suite_id?: string | null;
  name: string;
  description?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TestCase {
  id: string;
  suite_id: string;
  title: string;
  description?: string | null;
  steps: TestCaseStep[];
  expected_result?: string | null;
  priority: 'critical' | 'high' | 'medium' | 'low';
  type: 'functional' | 'regression' | 'smoke' | 'edge_case' | 'accessibility' | 'negative';
  tags: string[];
  is_ai_generated: boolean;
  source: 'manual' | 'ai_generated' | 'recorded';
  created_at: string;
  updated_at: string;
}

/** A single step within a TestCase's `steps` JSONB array. */
export interface TestCaseStep {
  /** 1-indexed step number */
  step_number: number;
  /** Human-readable instruction, e.g. "Click the Login button" */
  instruction: string;
  /** Optional Playwright selector */
  selector?: string;
  /** Optional value for input actions */
  value?: string;
  /** Optional expected outcome */
  expected?: string;
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

export interface Bug {
  id: string;
  project_id: string;
  test_run_id?: string | null;
  title: string;
  description?: string | null;
  steps_to_reproduce?: string | null;
  expected_behavior?: string | null;
  actual_behavior?: string | null;
  severity: BugSeverity;
  status: BugStatus;
  screenshot_urls: string[];
  video_url?: string | null;
  console_logs: unknown[];
  network_errors: unknown[];
  environment?: string | null;
  browser?: string | null;
  assigned_to?: string | null;
  external_id?: string | null;
  external_url?: string | null;
  created_at: string;
  updated_at: string;
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
