/* ============================================================
   auth.js
   Shared session helpers, used by every page.
   These functions only touch localStorage, never the DOM, so
   this file is safe to load in <head> and call requireAuth()
   immediately, before the page body exists.
   ============================================================ */

const SESSION_KEY = "studyflow_session_v1";

// API calls go to the same site (the serverless functions in /api).
const API = "";

// Read the current session, or null if nobody is logged in.
function getSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

// Start a session for the given user, after login or sign-up.
function setSession(user) {
  const session = { id: user.id, name: user.name, token: user.token };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

// End the current session.
function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

// Guard for the dashboard, planner, and progress pages.
// Call this as early as possible (from <head>) so a logged-out
// visitor is redirected before the page content is shown.
function requireAuth() {
  const session = getSession();
  if (!session || !session.token) {
    window.location.href = "login.html";
  }
}

// Log the current student out and send them to the login page.
function logout() {
  clearSession();
  window.location.href = "login.html";
}
