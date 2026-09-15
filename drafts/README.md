# DID drafts

Standalone, citable extracts of [`../DESIGN.md`](../DESIGN.md), prepared for external
review.

`DESIGN.md` is the canonical technical specification and remains the source of truth. These
documents pull the parts that are useful to the wider Nostr ecosystem out into
self-contained, NIP-shaped drafts that can be read and implemented without the RA-specific
context that surrounds them there (the `did:nostr` view, `ra-common` wiring, the OpenPGP
migration).

| Draft                                      | Covers                                                                                | `DESIGN.md`  | Venue                                                                                  |
|--------------------------------------------|---------------------------------------------------------------------------------------|--------------|----------------------------------------------------------------------------------------|
| [`attestations.md`](attestations.md)       | Identity attestations — the `vouch` primitive, a decentralized replacement for NIP-05 | §2–§3        | `did:nostr` community group; NIPs PR (cf. #1851, #1039, #1450)                         |
| [`social-recovery.md`](social-recovery.md) | Guardian-based social recovery and key rotation                                       | §4           | NIPs PR + the rotation threads (#829, #1452, #1450; #116 is dormant)                   |

Both drafts share a substrate: an identity is one secp256k1 x-only key with BIP-340 Schnorr
signatures (`../DESIGN.md` §1), and every record is a standard Nostr event
([NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md)). The social-recovery
draft depends on the attestation draft.

**Kind numbers 30100–30103 are PROVISIONAL** (`../DESIGN.md` §8) and must be reconciled with
the [kinds registry](https://github.com/nostr-protocol/nips#event-kinds) before either draft
is finalized.

Status: both `draft`, not yet submitted. Before submitting, re-verify the ecosystem claims
in [`../STRATEGY.md`](../STRATEGY.md) Appendix — several concern drafts and open discussions
that move.

## License

These drafts are dedicated to the **public domain** via
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) — full text in
[`LICENSE`](LICENSE) — so they can be adopted as NIPs (which are public domain) or reused in
any implementation without restriction. The rest of the DID project is public domain too
(see [`../LICENSE`](../LICENSE)); this directory keeps its own copy of the dedication so the
drafts carry it wherever they are copied.
