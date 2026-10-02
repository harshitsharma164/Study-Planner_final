/* ============================================================
   api/[action].js — one Vercel serverless function that handles
   /api/signup, /api/login and /api/tasks using Postgres.
   Needs the DATABASE_URL environment variable (set by the Neon /
   Supabase integration in Vercel). Tables are created on first use.
   ============================================================ */
const crypto = require("node:crypto");
const { promisify } = require("node:util");
const { Pool } = require("pg");

const scrypt = promisify(crypto.scrypt);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
  max: 3,
});

// Create the tables once per function instance.
let ready;
const init = () => (ready ??= pool.query(`
  CREATE TABLE IF NOT EXISTS users (
    student_id    TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    salt          TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES users(student_id)
  );
  CREATE TABLE IF NOT EXISTS tasks (
    student_id TEXT NOT NULL REFERENCES users(student_id),
    id         TEXT NOT NULL,
    title      TEXT NOT NULL,
    subject    TEXT NOT NULL,
    date       TEXT,
    priority   TEXT NOT NULL,
    done       BOOLEAN NOT NULL DEFAULT false,
    created    BIGINT,
    pos        INTEGER NOT NULL,
    PRIMARY KEY (student_id, id)
  );
`).catch((e) => { ready = undefined; throw e; }));

const hash = async (password, salt) => (await scrypt(password, salt, 64)).toString("hex");

async function startSession(id, name) {
  const token = crypto.randomBytes(32).toString("hex");
  await pool.query("INSERT INTO sessions (token, student_id) VALUES ($1, $2)", [token, id]);
  return { id, name, token };
}

async function signup({ name, id, password }) {
  if (!name || !id || !password) return [400, { error: "Please fill in every field." }];
  const salt = crypto.randomBytes(16).toString("hex");
  const { rowCount } = await pool.query(
    "INSERT INTO users (student_id, name, password_hash, salt) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
    [id, name, await hash(password, salt), salt]
  );
  if (!rowCount) return [409, { error: "That student ID is already registered." }];
  return [200, await startSession(id, name)];
}

async function login({ id, password }) {
  const { rows } = id && password
    ? await pool.query("SELECT * FROM users WHERE student_id = $1", [id])
    : { rows: [] };
  const user = rows[0];
  const ok = user && crypto.timingSafeEqual(
    Buffer.from(await hash(password, user.salt), "hex"),
    Buffer.from(user.password_hash, "hex")
  );
  return ok
    ? [200, await startSession(user.student_id, user.name)]
    : [401, { error: "Student ID or password is incorrect." }];
}

async function getTasks(studentId) {
  const { rows } = await pool.query(
    `SELECT id, title, subject, COALESCE(date, '') AS date, priority, done, created
       FROM tasks WHERE student_id = $1 ORDER BY pos`, [studentId]);
  return [200, rows.map((t) => ({ ...t, created: t.created === null ? null : Number(t.created) }))];
}

// Replace the logged-in student's whole task list in one transaction.
async function saveTasks(studentId, list) {
  const valid = (t) => t && ["id", "title", "subject", "priority"].every((k) => typeof t[k] === "string" && t[k]);
  if (!Array.isArray(list) || !list.every(valid)) return [400, { error: "Bad request." }];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM tasks WHERE student_id = $1", [studentId]);
    await client.query(
      `INSERT INTO tasks (student_id, id, title, subject, date, priority, done, created, pos)
       SELECT $1::text, o->>'id', o->>'title', o->>'subject', NULLIF(o->>'date', ''), o->>'priority',
              COALESCE((o->>'done')::boolean, false), NULLIF(o->>'created', '')::bigint, n
         FROM jsonb_array_elements($2::jsonb) WITH ORDINALITY AS e(o, n)`,
      [studentId, JSON.stringify(list)]
    );
    await client.query("COMMIT");
    return [200, { ok: true }];
  } catch {
    await client.query("ROLLBACK").catch(() => {});
    return [400, { error: "Bad request." }];
  } finally {
    client.release();
  }
}

module.exports = async function handler(req, res) {
  try {
    await init();
    const action = req.query.action;
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    let result = [404, { error: "Not found." }];

    if (req.method === "POST" && action === "signup") result = await signup(body);
    else if (req.method === "POST" && action === "login") result = await login(body);
    else if (action === "tasks" && (req.method === "GET" || req.method === "PUT")) {
      const token = (req.headers.authorization || "").replace("Bearer ", "");
      const { rows } = await pool.query("SELECT student_id FROM sessions WHERE token = $1", [token]);
      if (!rows[0]) result = [401, { error: "Please log in again." }];
      else result = req.method === "GET" ? await getTasks(rows[0].student_id) : await saveTasks(rows[0].student_id, body);
    }

    res.status(result[0]).json(result[1]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error." });
  }
};
