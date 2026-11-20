// CR-17: the live connection's token hand-off. No browser needed: socket.io waits for this callback before it even asks
// the server, so a callback that never comes leaves the run or recording page hanging until the server's 45 s timeout.
import { expect, test } from '@playwright/test';
import { sendSocketToken } from '../apps/web/lib/socket-token';

type Answer = { token?: string };
const answer = (read: Parameters<typeof sendSocketToken>[0]) =>
  Promise.race([
    new Promise<Answer>((resolve) => sendSocketToken(read, resolve)),
    new Promise<string>((resolve) => setTimeout(() => resolve('no answer within 2 s'), 2_000)),
  ]);

test('the live connection gets its token from the session', async () => {
  expect(await answer(Promise.resolve({ data: { session: { access_token: 'tok-123' } } }))).toEqual({ token: 'tok-123' });
});

test('signed out, the live connection is answered at once with no token', async () => {
  expect(await answer(Promise.resolve({ data: { session: null } }))).toEqual({ token: undefined });
});

test('a failed session read is answered at once with no token, so the server refuses now (CR-17)', async () => {
  expect(await answer(Promise.reject(new Error('session read failed')))).toEqual({});
});
