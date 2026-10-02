/* ============================================================
   login.js
   Handles the log-in / sign-up forms on login.html.
   Depends on the session helpers defined in auth.js, which is
   loaded before this file.
   ============================================================ */

// Already logged in? Skip straight to the dashboard.
if (getSession() && getSession().token) {
  window.location.href = "index.html";
}

const loginForm   = document.getElementById("loginForm");
const signupForm  = document.getElementById("signupForm");
const loginTab    = document.getElementById("showLogin");
const signupTab   = document.getElementById("showSignup");
const loginError  = document.getElementById("loginError");
const signupError = document.getElementById("signupError");

// ---- switching between the two forms ---------------------------

function showLoginForm() {
  signupForm.classList.add("hidden");
  loginForm.classList.remove("hidden");
  signupTab.classList.remove("active");
  loginTab.classList.add("active");
}

function showSignupForm() {
  loginForm.classList.add("hidden");
  signupForm.classList.remove("hidden");
  loginTab.classList.remove("active");
  signupTab.classList.add("active");
}

loginTab.addEventListener("click", showLoginForm);
signupTab.addEventListener("click", showSignupForm);

// ---- logging in with an existing account -----------------------

// Send credentials to the server's database; returns the user or shows an error.
async function sendAuth(endpoint, payload, errorEl) {
  try {
    const res = await fetch(API + "/api/" + endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      errorEl.textContent = data.error;
      return;
    }
    setSession(data);
    window.location.href = "index.html";
  } catch {
    errorEl.textContent = "Can't reach the server. Please try again.";
  }
}

loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  loginError.textContent = "";

  const id = document.getElementById("loginId").value.trim();
  const password = document.getElementById("loginPassword").value;

  sendAuth("login", { id, password }, loginError);
});

// ---- registering a new account -----------------------------------

signupForm.addEventListener("submit", (e) => {
  e.preventDefault();
  signupError.textContent = "";

  const name = document.getElementById("signupName").value.trim();
  const id = document.getElementById("signupId").value.trim();
  const password = document.getElementById("signupPassword").value;
  const confirm = document.getElementById("signupConfirm").value;

  if (!name || !id || !password) {
    signupError.textContent = "Please fill in every field.";
    return;
  }

  if (password !== confirm) {
    signupError.textContent = "Passwords don't match.";
    return;
  }

  sendAuth("signup", { name, id, password }, signupError);
});
