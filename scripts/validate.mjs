#!/usr/bin/env node
// Validate projects/*.json. No dependencies: CI runs only this file.
//
//   node scripts/validate.mjs
//   BASE_REF=origin/main PR_AUTHOR=alice node scripts/validate.mjs   # PR mode: ownership + changed files
//   CHAIN_CHECK=1 ...                                                # also ask the ErgoScan API (changed entries only)
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const DIR = join(ROOT, "projects");
const API = process.env.ERGOSCAN_API ?? "https://ergoscan.me/api/v1";

const CATEGORIES = new Set([
  "protocol", "foundation", "exchange", "mining-pool", "dex", "stablecoin", "lending",
  "bridge", "oracle", "nft", "dao", "launchpad", "privacy", "game", "wallet", "other",
]);
const KINDS = new Set(["contract", "wallet"]);
const PROJECT_KEYS = new Set(["$schema", "id", "name", "url", "repo", "category", "by", "maintainers", "note", "contracts"]);
const ENTRY_KEYS = new Set(["name", "kind", "match", "source", "note", "until"]);
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 .,'&()+/:#_-]*$/;
const BANNED = /\b(official|verified|airdrop|claim|giveaway|support|helpdesk|admin|free)\b/i;
const B58 = /^[1-9A-HJ-NP-Za-km-z]+$/;
const HEX32 = /^[0-9a-f]{64}$/;
const GH_USER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

const errors = [];
const warnings = [];
const err = (file, msg) => errors.push(`${file}: ${msg}`);
const warn = (file, msg) => warnings.push(`${file}: ${msg}`);

const maintainers = new Set(
  readFileSync(join(ROOT, "MAINTAINERS"), "utf8").split("\n").map((s) => s.trim()).filter((s) => s && !s.startsWith("#"))
);

function isHttps(v) {
  try {
    return new URL(v).protocol === "https:";
  } catch {
    return false;
  }
}

function checkName(file, where, v, max) {
  if (typeof v !== "string" || v.length < 2 || v.length > max) return err(file, `${where}: name must be 2-${max} chars`);
  if (!NAME_RE.test(v)) return err(file, `${where}: name "${v}" uses characters outside Latin letters, digits and . , ' & ( ) + / : # _ -`);
  if (/https?:|www\./i.test(v)) err(file, `${where}: no links in names`);
  if (BANNED.test(v)) err(file, `${where}: "${v}" uses a word we do not allow in names (official, verified, airdrop, claim, ...)`);
}

function matchKey(m) {
  if (m.address) return `address:${m.address}`;
  if (m.template) return `template:${m.template}`;
  if (m.token) return `token:${m.token}`;
  return null;
}

function checkEntry(file, i, e, by) {
  const where = `contracts[${i}]`;
  if (!e || typeof e !== "object" || Array.isArray(e)) return err(file, `${where}: must be an object`);
  for (const k of Object.keys(e)) if (!ENTRY_KEYS.has(k)) err(file, `${where}: unknown key "${k}"`);
  checkName(file, where, e.name, 80);
  if (!KINDS.has(e.kind)) err(file, `${where}: kind must be contract or wallet`);
  const m = e.match;
  if (!m || typeof m !== "object" || Array.isArray(m)) return err(file, `${where}: match must be an object`);
  const keys = Object.keys(m);
  if (keys.length !== 1 || !["address", "template", "token"].includes(keys[0])) {
    return err(file, `${where}: match needs exactly one of address, template, token`);
  }
  if (m.address !== undefined) {
    const a = m.address;
    if (typeof a !== "string" || !B58.test(a) || a.length < 40 || a.length > 6000) err(file, `${where}: address is not base58`);
    const p2pk = typeof a === "string" && a.length === 51 && a.startsWith("9");
    if (e.kind === "wallet" && !p2pk) err(file, `${where}: a wallet is a P2PK address (51 chars, starts with 9)`);
    if (e.kind === "contract" && p2pk) err(file, `${where}: a P2PK address is a wallet, not a contract`);
  }
  if (m.template !== undefined && !(typeof m.template === "string" && HEX32.test(m.template))) {
    err(file, `${where}: template is 64 lowercase hex chars (SHA-256 of the ErgoTree template, the explorer's ergoTreeTemplateHash)`);
  }
  if (m.token !== undefined && !(typeof m.token === "string" && HEX32.test(m.token))) {
    err(file, `${where}: token is a 64 lowercase hex token id`);
  }
  if (m.token !== undefined && e.kind !== "contract") err(file, `${where}: a token anchor names the contract that holds it`);
  const src = e.source;
  const okSource = isHttps(src) || (by === "ergoscan" && (src === "chain" || src === "protocol"));
  if (!okSource) err(file, `${where}: source must be an https link to the evidence (code, release, docs)`);
  if (e.note !== undefined && (typeof e.note !== "string" || e.note.length > 300 || /https?:|www\./i.test(e.note))) {
    err(file, `${where}: note is plain text up to 300 chars, no links (links go to source)`);
  }
  if (e.until !== undefined && !(Number.isInteger(e.until) && e.until > 0)) err(file, `${where}: until is a block height`);
}

function checkProject(file, p) {
  if (!p || typeof p !== "object" || Array.isArray(p)) return err(file, "must be a JSON object");
  for (const k of Object.keys(p)) if (!PROJECT_KEYS.has(k)) err(file, `unknown key "${k}"`);
  const id = file.replace(/\.json$/, "");
  if (p.id !== id) err(file, `id must equal the file name (${id})`);
  if (typeof p.id !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.id) || p.id.length > 40) err(file, "id is lowercase a-z0-9 and dashes");
  checkName(file, "name", p.name, 64);
  if (!CATEGORIES.has(p.category)) err(file, `category must be one of: ${[...CATEGORIES].join(", ")}`);
  if (p.by !== "ergoscan" && p.by !== "project") err(file, 'by is "project" (the team submits) or "ergoscan" (our research)');
  for (const k of ["url", "repo"]) if (p[k] !== undefined && !isHttps(p[k])) err(file, `${k} must be an https link`);
  if (p.maintainers !== undefined) {
    if (!Array.isArray(p.maintainers) || p.maintainers.some((u) => typeof u !== "string" || !GH_USER.test(u))) {
      err(file, "maintainers is a list of GitHub usernames");
    }
  }
  if (p.note !== undefined && (typeof p.note !== "string" || p.note.length > 300 || /https?:|www\./i.test(p.note))) {
    err(file, "note is plain text up to 300 chars, no links");
  }
  if (!Array.isArray(p.contracts) || !p.contracts.length || p.contracts.length > 500) {
    return err(file, "contracts is a list of 1-500 entries");
  }
  const names = new Set();
  p.contracts.forEach((e, i) => {
    checkEntry(file, i, e, p.by);
    if (e && typeof e.name === "string") {
      if (names.has(e.name)) err(file, `contracts[${i}]: duplicate name "${e.name}" in this project`);
      names.add(e.name);
    }
  });
}

function git(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

const files = readdirSync(DIR).filter((f) => f.endsWith(".json")).sort();
const projects = new Map();
for (const f of files) {
  let p;
  try {
    p = JSON.parse(readFileSync(join(DIR, f), "utf8"));
  } catch (e) {
    err(f, `not valid JSON (${e.message})`);
    continue;
  }
  checkProject(f, p);
  projects.set(f, p);
}

const owner = new Map();
for (const [f, p] of projects) {
  for (const e of Array.isArray(p.contracts) ? p.contracts : []) {
    const k = e && e.match ? matchKey(e.match) : null;
    if (!k) continue;
    const prev = owner.get(k);
    if (prev) err(f, `${k.slice(0, 40)}... is already named in ${prev}`);
    else owner.set(k, f);
  }
}

const BASE = process.env.BASE_REF;
const AUTHOR = process.env.PR_AUTHOR;
const changed = new Set();
if (BASE) {
  const diff = git(["diff", "--name-status", `${BASE}...HEAD`, "--", "projects/"]).trim();
  for (const line of diff ? diff.split("\n") : []) {
    const [status, ...paths] = line.split("\t");
    const path = paths[paths.length - 1];
    const f = path.replace(/^projects\//, "");
    changed.add(f);
    if (maintainers.has(AUTHOR)) continue;
    if (status.startsWith("D")) err(f, "only registry maintainers delete a project file");
    let before = null;
    try {
      before = JSON.parse(git(["show", `${BASE}:${paths[0]}`]));
    } catch {
      before = null;
    }
    const owners = Array.isArray(before?.maintainers) ? before.maintainers : [];
    if (owners.length && !owners.includes(AUTHOR)) {
      err(f, `this file belongs to ${owners.join(", ")}; ask them or a registry maintainer`);
    }
    const now = projects.get(f);
    if (now && now.by !== "project") err(f, 'a team submission sets by to "project"');
  }
}

if (process.env.CHAIN_CHECK === "1") {
  for (const f of changed) {
    const p = projects.get(f);
    for (const [i, e] of (p?.contracts ?? []).entries()) {
      const m = e?.match ?? {};
      try {
        if (m.address) {
          const r = await fetch(`${API}/addresses/${m.address}`);
          if (r.status === 400) err(f, `contracts[${i}]: ErgoScan says this is not a valid address`);
          else if (r.ok && !(await r.json()).firstTs) warn(f, `contracts[${i}]: address has no transactions yet`);
        } else if (m.token) {
          const r = await fetch(`${API}/tokens/${m.token}`);
          if (r.status === 404) err(f, `contracts[${i}]: token id not found on chain`);
        } else if (m.template) {
          const r = await fetch(`${API}/boxes/byErgoTreeTemplateHash/${m.template}?limit=1`);
          const j = r.ok ? await r.json() : null;
          const items = Array.isArray(j) ? j : j?.items;
          if (r.ok && Array.isArray(items) && !items.length) warn(f, `contracts[${i}]: no boxes with this template yet`);
        }
      } catch (e2) {
        warn(f, `contracts[${i}]: chain check skipped (${String(e2).slice(0, 80)})`);
      }
    }
  }
}

for (const w of warnings) console.log(`warning ${w}`);
for (const e of errors) console.log(`error   ${e}`);
const total = [...projects.values()].reduce((s, p) => s + (Array.isArray(p.contracts) ? p.contracts.length : 0), 0);
console.log(`${files.length} projects, ${total} entries, ${errors.length} errors, ${warnings.length} warnings`);
process.exit(errors.length ? 1 : 0);
