import { ApiKeyProvider, TestRunMode } from './enums.js';
import { Profile, ApiKey } from './database.js';

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

// ── Test Runs ─────────────────────────────────────────────────────────────────

export interface CreateTestRunRequest {
  project_id: string;
  mode: TestRunMode;
  nl_input?: string;
  base_url?: string;
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
