# Ergo names

An open registry of names for Ergo addresses and contracts.

Teams add their own contracts with a pull request. Maintainers check the evidence and merge.
[ErgoScan](https://ergoscan.me) shows merged names on address, transaction and token pages.
Any explorer, wallet or tool may use the data: it is public domain ([CC0](LICENSE)).

## What is inside

`projects/<id>.json` holds one project: its name, site, category and contracts.
Each contract is matched in one of three ways:

| `match` | Names | Use it for |
|---|---|---|
| `address` | one Base58 address | treasuries, banks, pools, exchange wallets |
| `template` | every contract built from one ErgoTree template | per-user contracts: orders, bonds, loans, vaults |
| `token` | the contract that holds this NFT, now and after upgrades | pool, bank and state boxes with a singleton token |

`template` is the SHA-256 of the ErgoTree template, the same value as `ergoTreeTemplateHash` in the Ergo explorer API
and on the ErgoScan box page.

```json
{
  "$schema": "../schema/project.schema.json",
  "id": "example-dex",
  "name": "Example DEX",
  "url": "https://example.org",
  "repo": "https://github.com/example/contracts",
  "category": "dex",
  "by": "project",
  "maintainers": ["example-dev"],
  "contracts": [
    {
      "name": "Example DEX pool",
      "kind": "contract",
      "match": { "token": "<64-hex pool NFT id>" },
      "source": "https://github.com/example/contracts/blob/main/pool.es"
    },
    {
      "name": "Example DEX swap order",
      "kind": "contract",
      "match": { "template": "<64-hex ergoTreeTemplateHash>" },
      "source": "https://github.com/example/contracts/blob/main/swap.es"
    }
  ]
}
```

## Add your project

Read [CONTRIBUTING.md](CONTRIBUTING.md), add `projects/<id>.json`, run `node scripts/validate.mjs`, open a pull request.
No GitHub workflow of your own? [Suggest a name](../../issues/new?template=name-request.yml) with the form:
a bot turns it into a pull request and reports the checks, a maintainer reviews the evidence and merges.
ErgoScan loads `main` every 15 minutes.

## How names are shown

- `by: "project"` — submitted by the team, reviewed by maintainers.
- `by: "ergoscan"` — found by ErgoScan from chain data and public code.

ErgoScan links each name to its file here, so anyone can see where it came from.

## Use the data

Read `projects/*.json` from the `main` branch. `schema/project.schema.json` describes the format,
`scripts/validate.mjs` checks it (no dependencies, Node 20+).

## Русский

Открытый реестр имён адресов и контрактов Ergo. Команды добавляют свои контракты через pull request,
мейнтейнеры проверяют доказательства и принимают. ErgoScan показывает принятые имена. Данные — общественное
достояние (CC0): ими может пользоваться любой обозреватель, кошелёк или сервис. Без GitHub — форма
«Suggest a name» в issues.
