import { ApiKeyProvider, TestRunMode, BugSeverity, BugStatus } from './enums.js';
import { Profile, ApiKey, TestCaseStep } from './database.js';

// ── Auth ──────────────────────────────────────────────────────────────────────

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  full_name?: string;
}

export interface AuthResponse {
  user: Profile;
  access_token: string;
}

// ── Projects ──────────────────────────────────────────────────────────────────

export interface CreateProjectRequest {
  name: string;
  description?: string;
  base_url?: string;
}

export type UpdateProjectRequest = Partial<CreateProjectRequest>;

// ── API Keys ──────────────────────────────────────────────────────────────────

export interface CreateApiKeyRequest {
  provider: ApiKeyProvider;
  key: string;
}

export type ApiKeyResponse = Omit<ApiKey, 'encrypted_key'>;

// ── Test Suites (MVP-2) ──────────────────────────────────────────────────────

export interface CreateTestSuiteRequest {
  project_id: string;
  parent_suite_id?: string | null;
  name: string;
  description?: string;
}

export interface UpdateTestSuiteRequest {
  name?: string;
  description?: string | null;
  parent_suite_id?: string | null;
}

// ── Test Cases (MVP-2) ───────────────────────────────────────────────────────

export interface CreateTestCaseRequest {
  suite_id: string;
  title: string;
  description?: string;
  steps: TestCaseStep[];
  expected_result?: string;
  priority?: 'critical' | 'high' | 'medium' | 'low';
  type?: 'functional' | 'regression' | 'smoke' | 'edge_case' | 'accessibility' | 'negative';
  tags?: string[];
}

export interface UpdateTestCaseRequest {
  title?: string;
  description?: string | null;
  steps?: TestCaseStep[];
  expected_result?: string | null;
  priority?: 'critical' | 'high' | 'medium' | 'low';
  type?: 'functional' | 'regression' | 'smoke' | 'edge_case' | 'accessibility' | 'negative';
  tags?: string[];
}

// ── Test Runs (MVP-2) ────────────────────────────────────────────────────────

export interface CreateTestRunRequest {
  project_id: string;
  mode: TestRunMode;
  test_case_id?: string;
  nl_input?: string;
  base_url?: string;
  browser?: 'chromium' | 'firefox' | 'webkit';
}

// ── AI Generation (MVP-2) ────────────────────────────────────────────────────

export interface AIGenerateRequest {
  project_id: string;
  /** Natural language description of the feature/flow to generate tests for */
  prompt: string;
  /** Target suite where generated cases will be placed (optional — creates new suite if omitted) */
  suite_id?: string;
  /** Suite name if creating a new suite */
  suite_name?: string;
  /** The AI provider to use. If omitted, auto-select from user's valid keys. */
  provider?: ApiKeyProvider;
}

export interface AIGenerateResponse {
  suite_id: string;
  test_cases: Array<{
    id: string;
    title: string;
    steps: TestCaseStep[];
  }>;
  provider_used: ApiKeyProvider;
  generation_time_ms: number;
}

// ── Bugs (MVP-2) ─────────────────────────────────────────────────────────────

export interface CreateBugRequest {
  project_id: string;
  test_run_id?: string;
  title: string;
  description?: string;
  steps_to_reproduce?: string;
  expected_behavior?: string;
  actual_behavior?: string;
  severity?: BugSeverity;
  screenshot_urls?: string[];
  environment?: string;
  browser?: string;
}

export interface UpdateBugRequest {
  title?: string;
  description?: string | null;
  severity?: BugSeverity;
  status?: BugStatus;
  assigned_to?: string | null;
}

// ── Generic ───────────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  count: number;
  page: number;
  per_page: number;
}

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
}
