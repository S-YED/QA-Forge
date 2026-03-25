export enum TestRunStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  PASSED = 'passed',
  FAILED = 'failed',
  ERROR = 'error',
  SKIPPED = 'skipped',
}

export enum TestRunMode {
  AI_DRIVEN = 'ai_driven',
  MANUAL_RECORDING = 'manual_recording',
  REPLAY = 'replay',
}

export enum TestStepStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  PASSED = 'passed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

export enum ActionType {
  CLICK = 'click',
  DBLCLICK = 'dblclick',
  TYPE = 'type',
  KEYPRESS = 'keypress',
  NAVIGATE = 'navigate',
  SCROLL = 'scroll',
  HOVER = 'hover',
  SELECT = 'select',
  DRAG = 'drag',
  SCREENSHOT = 'screenshot',
  ASSERT = 'assert',
}

export enum ApiKeyProvider {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  GEMINI = 'gemini',
}

export enum UserRole {
  ADMIN = 'admin',
  TESTER = 'tester',
  VIEWER = 'viewer',
}

export enum SessionStatus {
  RECORDING = 'recording',
  COMPLETED = 'completed',
  ERROR = 'error',
}

export enum BugSeverity {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}

export enum BugStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
  WONT_FIX = 'wont_fix',
}
