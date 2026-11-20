type SessionRead = Promise<{ data: { session: { access_token: string } | null } }>;

/**
 * Hands the live connection its token (socket.io's `auth` callback). CR-17: if reading the session fails, it answers
 * at once with no token, so the server refuses the connection now instead of after its 45 s connect timeout.
 * No imports, so the E2E runner can test it on its own (`e2e/socket-token.spec.ts`).
 */
export function sendSocketToken(read: SessionRead, cb: (data: { token?: string }) => void): void {
  void read.then(
    ({ data }) => cb({ token: data.session?.access_token }),
    () => cb({}),
  );
}
