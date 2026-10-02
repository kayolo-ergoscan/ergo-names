#!/usr/bin/env node
// Turn a "Suggest a name" issue into a project file change. Issue text is data only: never run.
// Reads the event from GITHUB_EVENT_PATH (or argv[2]), writes projects/<id>.json, prints a JSON summary.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const API = process.env.ERGOSCAN_API ?? "https://ergoscan.me/api/v1";
const B58 = /^[1-9A-HJ-NP-Za-km-z]{40,6000}$/;
const HEX32 = /^[0-9a-f]{64}$/;

const LABELS = {
  value: "Address, template hash or token id",
  name: "Proposed name",
  project: "Project and website",
  evidence: "Evidence link",
  who: "Who are you",
};

export function parseIssueForm(body) {
  const out = {};
  const parts = String(body ?? "").replace(/\r\n/g, "\n").split(/^### /m).slice(1);
  for (const part of parts) {
    const nl = part.indexOf("\n");
    const label = (nl < 0 ? part : part.slice(0, nl)).trim();
    const value = (nl < 0 ? "" : part.slice(nl + 1)).trim();
    out[label] = value === "_No response_" ? "" : value;
  }
  return out;
}

export function isNameRequest(body) {
  return String(body ?? "").includes(`### ${LABELS.value}`);
}

export function slugOf(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

export function splitProject(raw) {
  const m = String(raw).match(/https:\/\/\S+/);
  const url = m ? m[0].replace(/[),.;]+$/, "") : null;
  const name = String(raw).replace(/https?:\/\/\S+/g, "").replace(/[,;|]+\s*$/, "").replace(/\s+/g, " ").trim();
  return { name, url };
}

async function classify(value) {
  const v = value.trim();
  if (B58.test(v)) {
    const p2pk = v.length === 51 && v.startsWith("9");
    return { match: { address: v }, kind: p2pk ? "wallet" : "contract" };
  }
  const hex = v.toLowerCase();
  if (!HEX32.test(hex)) throw new Error("the first field must be a Base58 address or a 64-hex token id / template hash");
  const t = await fetch(`${API}/tokens/${hex}`);
  if (t.ok) {
    const tok = await t.json();
    if (String(tok.emissionAmount) !== "1") {
      throw new Error("this token is not an NFT (emission is not 1); name the contract address instead");
    }
    return { match: { token: hex }, kind: "contract" };
  }
  const b = await fetch(`${API}/boxes/byErgoTreeTemplateHash/${hex}?limit=1`);
  const j = b.ok ? await b.json() : null;
  const items = Array.isArray(j) ? j : j?.items;
  if (Array.isArray(items) && items.length) return { match: { template: hex }, kind: "contract" };
  throw new Error("this 64-hex value is neither a token on chain nor a template with boxes");
}

export async function draftEntry(issue) {
  const form = parseIssueForm(issue.body);
  const name = (form[LABELS.name] ?? "").trim();
  const evidence = (form[LABELS.evidence] ?? "").trim();
  const project = splitProject(form[LABELS.project] ?? "");
  if (!name) throw new Error("the proposed name is empty");
  if (!project.name) throw new Error("the project name is empty");
  if (!/^https:\/\/\S+$/.test(evidence)) throw new Error("the evidence must be one https link");
  const team = /^Part of the project team/i.test(form[LABELS.who] ?? "");
  const { match, kind } = await classify(form[LABELS.value] ?? "");
  const id = slugOf(project.name);
  if (id.length < 2) throw new Error("the project name needs Latin letters or digits");
  const file = join(ROOT, "projects", `${id}.json`);
  const entry = { name, kind, match, source: evidence };
  let created = false;
  let doc;
  if (existsSync(file)) {
    doc = JSON.parse(readFileSync(file, "utf8"));
  } else {
    created = true;
    doc = { $schema: "../schema/project.schema.json", id, name: project.name, category: "other", by: team ? "project" : "ergoscan", contracts: [] };
    if (project.url) doc.url = project.url;
  }
  const key = JSON.stringify(match);
  if (doc.contracts.some((e) => JSON.stringify(e.match) === key)) throw new Error(`this is already named in projects/${id}.json`);
  doc.contracts.push(entry);
  doc.contracts.sort((a, b) => a.name.localeCompare(b.name));
  writeFileSync(file, JSON.stringify(doc, null, 2) + "\n");
  return { ok: true, id, file: `projects/${id}.json`, created, team, entry };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const path = process.env.GITHUB_EVENT_PATH ?? process.argv[2];
  const event = JSON.parse(readFileSync(path, "utf8"));
  const issue = event.issue ?? event;
  if (!isNameRequest(issue.body)) {
    console.log(JSON.stringify({ ok: false, skip: true, error: "not a name request form" }));
    process.exit(0);
  }
  try {
    console.log(JSON.stringify(await draftEntry(issue)));
  } catch (e) {
    console.log(JSON.stringify({ ok: false, error: String(e.message ?? e) }));
  }
}
