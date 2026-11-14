// Shared helpers for the demo shop. State lives in this browser's localStorage only.
const DEMO_USER = { email: 'demo@qaforge.dev', password: 'Demo1234!' };

const session = {
  get user() { return localStorage.getItem('demo-user'); },
  login(email) { localStorage.setItem('demo-user', email); },
  logout() { localStorage.removeItem('demo-user'); },
};

const $ = (id) => document.querySelector(`[data-testid="${id}"]`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function renderNav() {
  const nav = document.querySelector('header nav');
  if (!nav) return;
  const user = session.user;
  nav.innerHTML = user
    ? `<a href="/dashboard" data-testid="nav-dashboard">Dashboard</a> <a href="/items" data-testid="nav-items">Items</a> <a href="/checkout" data-testid="nav-checkout">Checkout</a> <a href="#" data-testid="nav-logout">Log out</a>`
    : `<a href="/items" data-testid="nav-items">Items</a> <a href="/checkout" data-testid="nav-checkout">Checkout</a> <a href="/login" data-testid="nav-login">Log in</a> <a href="/register" data-testid="nav-register">Register</a>`;
  const out = $('nav-logout');
  if (out) out.addEventListener('click', (e) => { e.preventDefault(); session.logout(); location.href = '/login'; });
}
document.addEventListener('DOMContentLoaded', renderNav);
