// Global Express Request augmentation — adds req.user to all route handlers.
// Defined here (not inline in middleware) so it is available project-wide.

declare global {
  namespace Express {
    interface Request {
      user: {
        id: string;
        email: string;
        role: string;
        is_demo: boolean;
      };
    }
  }
}

export {};
