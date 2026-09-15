# DID scripts

## `publish-drafts.cjs` — post the drafts to Nostr

Publishes `../drafts/attestations.md` and `../drafts/social-recovery.md` as NIP-23
long-form articles (kind `30023`), straight to a curated relay set. Written
because web clients (Coracle, …) hang or fail on 13–15 KB long-form — they fan
out to 20+ relays, block on all of them, and the strict ones reject on size.

```sh
NP="$(npm root -g):$(npm root -g)/nostr-tools/node_modules"

# sign via a NIP-46 bunker (nothing sent):
NODE_PATH="$NP" NOSTR_BUNKER='bunker://…' node scripts/publish-drafts.cjs --dry-run

# publish both:
NODE_PATH="$NP" NOSTR_BUNKER='bunker://…' node scripts/publish-drafts.cjs

# or with a raw key (run in your own terminal only):
NODE_PATH="$NP" NOSTR_NSEC=nsec1... node scripts/publish-drafts.cjs

# one doc, or override relays:
… node scripts/publish-drafts.cjs --only social-recovery --relay wss://relay.damus.io
```

- **Signing:** `NOSTR_BUNKER` (a NIP-46 `bunker://` URI) is preferred — the key
  stays in the signer. On first connect the signer prompts for approval; the
  client key is cached at `~/.config/ra-did/nip46-client.key` so later runs don't
  re-prompt. Fall back to `NOSTR_NSEC` (`nsec1…` or 64-hex) only in your own
  terminal.
- **Idempotent.** Kind 30023 is addressable on its `d` tag — re-running after a
  partial failure replaces the article. Slugs: `did-identity-attestations`,
  `did-social-recovery-key-rotation`.
- Prints each article's `naddr` + an `njump.me` link, then a per-relay
  `OK / FAIL / TIMEOUT` table. **One accepting relay is enough.**
- **Link rewriting for the Nostr version:** the two drafts point at each other by
  `nostr:naddr`; vector links go to `github.com/resolvingarchitecture/did-vectors`
  (override with `VECTORS_URL=`); `LICENSE` → the CC0 legalcode; `../DESIGN.md` /
  `../STRATEGY.md` references are dropped, since the spec is not public.

Default relays: `relay.damus.io`, `nos.lol`, `relay.primal.net`, `nostr.mom`,
`offchain.pub`, `relay.highlighter.com`, `purplerelay.com`.

Public domain (CC0).
