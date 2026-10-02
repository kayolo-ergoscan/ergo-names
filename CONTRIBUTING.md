# Contributing

## Who can submit

The team behind a project, or anyone who can point to public evidence. Team submissions are preferred.

## Steps

1. Fork this repository.
2. Add `projects/<id>.json`. The `id` is lowercase letters, digits and dashes, and equals the file name.
3. Set `"by": "project"` and list the GitHub users who may change the file later in `maintainers`.
4. Run `node scripts/validate.mjs` (Node 20+, no install).
5. Open a pull request. CI repeats the checks and asks ErgoScan whether each address, template or token exists on chain.

## Without a pull request

Open the [Suggest a name](../../issues/new?template=name-request.yml) form. A bot drafts the entry, runs the same
checks, and opens a pull request that closes your issue, or replies with what to fix. A maintainer still reviews it.
A 64-hex value is read as an NFT id when such a token exists (it must be an NFT), otherwise as a template hash.

## Rules for entries

- **Evidence.** Every contract has a `source`: an https link to public code, a release, or docs where this exact
  address, template or token appears. No evidence, no merge.
- **Match.** Use `token` when the contract holds a singleton NFT: the name follows the contract across upgrades.
  Use `template` for contracts created per user (orders, bonds, loans). Use `address` for a single fixed address.
- **Kind.** `wallet` is a P2PK address (51 chars, starts with `9`). Everything else is a `contract`.
- **Names.** Plain Latin text, up to 80 characters. Describe what the contract is: "Duckpools ERG lending pool".
  No links, no marketing, no "official", "verified", "airdrop", "claim", no names that imitate another project.
- **People.** We name projects, treasuries, exchanges and pools. We do not name the personal wallets of individuals.
- **One owner.** An address, template or token belongs to one project file. CI rejects duplicates.
- **Retired contracts.** Keep the entry and set `until` to the last block height it was in use. Do not delete history.

## Ownership

A file with `maintainers` can be changed only by those GitHub users or by a registry maintainer (see `MAINTAINERS`).
Files seeded by ErgoScan have no `maintainers`. A team that takes over such a file sets `"by": "project"`
and adds itself to `maintainers` in the same pull request.

## Review

Maintainers check the evidence against the chain before merging. For treasury or bank addresses we may ask for a
message signed by a key the project already uses on chain. A merge is the approval: ErgoScan loads only `main`.
