#!/usr/bin/env node
// Fails if a production bundle contains anything that looks like a server-side secret.
// The Supabase anon key (a JWT with role "anon", or an sb_publishable_ key) is expected
// and allowed; service-role keys, secret keys and private keys are not.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const root = process.argv[2] ?? "build/client";
const TEXT = new Set([".js", ".mjs", ".css", ".html", ".json", ".txt", ".map", ".svg"]);

const patterns = [
  [/sb_secret_[A-Za-z0-9_-]{10,}/, "Supabase secret key"],
  [/SUPABASE_SERVICE_ROLE_KEY\s*[:=]/, "service role key assignment"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key"],
  [/\bsk_(live|test)_[A-Za-z0-9]{10,}/, "payment secret key"],
  [/mongodb(\+srv)?:\/\/[^\s"']+:[^\s"']+@/, "database URL with credentials"],
  [/postgres(ql)?:\/\/[^\s"']+:[^\s"']+@/, "database URL with credentials"],
];

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (TEXT.has(extname(p))) yield p;
  }
}

function jwtRole(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    return payload.role;
  } catch {
    return null;
  }
}

let findings = 0;
for (const file of files(root)) {
  const text = readFileSync(file, "utf8");
  for (const [re, label] of patterns) {
    if (re.test(text)) {
      console.error(`✗ ${label} in ${file}`);
      findings++;
    }
  }
  for (const [token] of text.matchAll(/eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g)) {
    const role = jwtRole(token);
    if (role && role !== "anon") {
      console.error(`✗ JWT with role "${role}" in ${file}`);
      findings++;
    }
  }
}

if (findings) {
  console.error(`\n${findings} potential secret(s) found in ${root}.`);
  process.exit(1);
}
console.log(`✓ No secrets found in ${root}.`);
