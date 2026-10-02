#!/usr/bin/env python3
"""One-off: seed projects/*.json from the ErgoScan web address book (apps/web/src/lib/address-book)."""
import json
import re
import sys
from pathlib import Path

BOOK = Path(sys.argv[1] if len(sys.argv) > 1 else "/root/ergoscan/apps/web/src/lib/address-book")
OUT = Path(__file__).resolve().parent.parent / "projects"
# http-only pool sites: https checked 2 Oct 2026, the rest have no https and lose the link.
HTTPS_OK = {"http://getblok.io": "https://getblok.io"}


def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def kind_of(address):
    return "wallet" if len(address) == 51 and address.startswith("9") else "contract"


def clean(text):
    return text.replace("\u2013", "-").replace("\u2014", "-").replace("\u2192", "->") if text else text


def entry(name, address, source, note=None):
    e = {"name": clean(name), "kind": kind_of(address), "match": {"address": address}, "source": source}
    if note:
        e["note"] = clean(note)[:300]
    return e


def suffix_duplicates(rows):
    seen = {}
    for r in rows:
        seen[r["name"]] = seen.get(r["name"], 0) + 1
    for r in rows:
        if seen[r["name"]] > 1:
            r["name"] = f"{r['name']} {r['match']['address'][-6:]}"


def write(project):
    project["contracts"].sort(key=lambda e: e["name"])
    project = {"$schema": "../schema/project.schema.json", **project}
    (OUT / f"{project['id']}.json").write_text(json.dumps(project, indent=2, ensure_ascii=False) + "\n")


OUT.mkdir(exist_ok=True)
protocol = json.loads((BOOK / "protocol.json").read_text())
exchanges = json.loads((BOOK / "exchanges.json").read_text())
pools = json.loads((BOOK / "pools.json").read_text())
overrides = json.loads((BOOK / "overrides.json").read_text())["entries"]

write({
    "id": "ergo-protocol", "name": "Ergo protocol", "url": "https://ergoplatform.org",
    "repo": "https://github.com/ergoplatform/ergo", "category": "protocol", "by": "ergoscan",
    "contracts": [entry(e["name"], e["address"], "protocol", e.get("note")) for e in protocol["entries"]],
})

for v in exchanges["venues"]:
    rows = []
    for e in v.get("entries", []):
        source = "https://ergo.watch" if e.get("source") == "ergowatch" else "chain"
        notes = ["Dead venue" if v.get("status") == "dead" else None, "Inferred" if e.get("confidence") == "inferred" else None, e.get("note")]
        rows.append(entry(f"{v['name']} {e.get('role') or 'main'}", e["address"], source, " · ".join(x for x in notes if x) or None))
    suffix_duplicates(rows)
    write({"id": slug(v["name"]), "name": v["name"], "url": v["url"], "category": "exchange", "by": "ergoscan", "contracts": rows})

for v in pools["venues"]:
    rows = []
    for e in v.get("entries", []):
        role = "payout wallet" if e.get("role") == "payout" else "miner reward"
        rows.append(entry(f"{v['name']} {role}", e["address"], "chain", e.get("note")))
    suffix_duplicates(rows)
    p = {"id": slug(v["name"]), "name": v["name"], "category": "mining-pool", "by": "ergoscan", "contracts": rows}
    url = (v.get("url") or "").rstrip("/")
    url = HTTPS_OK.get(url, url)
    if url.startswith("https://"):
        p["url"] = url
    write(p)

groups = {
    "sigmausd": {"name": "SigmaUSD", "url": "https://sigmausd.io", "repo": "https://github.com/anon-real/sigma-usd", "category": "stablecoin"},
    "ergo-foundation": {"name": "Ergo Foundation", "url": "https://ergoplatform.org", "category": "foundation"},
    "rosen-bridge": {"name": "Rosen Bridge", "url": "https://rosen.tech", "repo": "https://github.com/rosen-bridge", "category": "bridge"},
    "ergo-auction-house": {"name": "Ergo Auction House", "repo": "https://github.com/anon-real/ErgoAuctionHouse", "category": "nft"},
    "oracle-pools": {"name": "Oracle pools", "repo": "https://github.com/ergoplatform/oracle-core", "category": "oracle"},
}
bucket = {k: [] for k in groups}
for e in overrides:
    n = e["name"]
    if e.get("kind") == "miner":
        continue
    if n.startswith("SigmaUSD"):
        key = "sigmausd"
    elif n.startswith("EF "):
        key = "ergo-foundation"
    elif n.startswith("Rosen"):
        key = "rosen-bridge"
    elif n == "Auction House":
        key = "ergo-auction-house"
    elif "Oracle" in n or n.startswith("MORACLE"):
        key = "oracle-pools"
    else:
        print("unplaced", n, file=sys.stderr)
        continue
    src = e.get("source") or "chain"
    bucket[key].append(entry(n, e["address"], src if src.startswith("https://") or src in ("chain", "protocol") else "chain", e.get("note")))
for key, meta in groups.items():
    write({"id": key, **meta, "by": "ergoscan", "contracts": bucket[key]})

print(f"wrote {len(list(OUT.glob('*.json')))} project files", file=sys.stderr)
