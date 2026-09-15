# DID — Decentralized Identification

Self-sovereign identity and key management for Resolving Architecture systems:
a self-owned identifier, key generation and lifecycle, encryption, signing and
verification, and a [web of trust](https://en.wikipedia.org/wiki/Web_of_trust)
built from signed attestations — with
[W3C DID](https://www.w3.org/TR/did-core/) interoperability as the guideline.

This directory is the umbrella for the DID work. It holds four implementations of
[`DESIGN.md`](DESIGN.md), each passing the
[`did-vectors`](https://github.com/resolvingarchitecture/did-vectors) conformance
suite:

- [`did-ts`](did-ts/) — `0.1.0`, pre-release; the **reference** library.
  TypeScript, dependency-light (`@noble` + `@scure` only, no hand-rolled crypto),
  CC0. Meant to be read and copied.
- [`did-java`](did-java/) — `1.3.0`; runs as the identity and key-management
  layer for [1M5](https://1m5.io). Nostr identity layer in `ra.did.nostr`
  (ACINQ `secp256k1-kmp`); legacy OpenPGP keyring kept as a self-contained crypto
  subsystem. Depends on [`ra-common`](../common/) and plugs into the
  [service bus](../service-bus/) as a `BaseService`.
- [`did-rust`](did-rust/) — `0.1.0`, pre-release; port of `did-ts`. Crate
  `did-nostr`, `secp256k1` (libsecp256k1) + `bech32` + `sha2`, CC0.
  Cross-verified against rust-nostr.
- [`did-python`](did-python/) — `0.1.0`, pre-release; port of `did-ts`.
  Package `did-nostr`, `coincurve` + `bech32`, CC0. Cross-verified against
  `pynostr`.

`did-rust` and `did-python` cover keys/encodings, canonical serialisation, signed
records with four-step verification, attestations (`vouch`), guardian recovery
and rotation, and the `did:nostr` view — the same surface as `did-ts`. They do
not (yet) carry `did-java`'s service-bus wiring or at-rest sealing. Each
subproject also carries its own `README.md`.

Where this is going: [`STRATEGY.md`](STRATEGY.md) (the adoption strategy),
[`DESIGN.md`](DESIGN.md) (the technical specification), and [`TODO.md`](TODO.md)
(the phased work plan).

## What it does

The DID service manages identities and the keys behind them, exposed as bus
operations rather than a public API:

| Area         | Operations                                                             |
|--------------|------------------------------------------------------------------------|
| Identities   | save, get, delete, verify, authenticate, get node DID                  |
| Keys         | generate key ring collections, get public key, reload                  |
| Encryption   | encrypt / decrypt (asymmetric), encrypt / decrypt (symmetric, AES)     |
| Signatures   | sign, verify signature                                                 |
| Hashing      | hash, verify hash (SHA-1 in test mode, SHA-256 planned for production) |
| Web of trust | vouch — one identity signs attributes of another                       |
| Contacts     | add, get, list, delete                                                 |
| Hardware     | YubiKey key ring support                                               |

Keys are persisted locally through `ra-common`'s InfoVault file DB. Only public
keys ever leave the service; private keys are never exported.

## Direction — Nostr-compatible primitives

The identity layer is **`secp256k1` / BIP-340 Schnorr**: one 32-byte secret, an
x-only public key, hex / `npub` / `nsec` / `did:nostr` encodings,
Nostr-compatible signed records, attestations (`vouch`), guardian-based recovery
and rotation, and secrets sealed at rest. OpenPGP key rings are no longer an
identity path — kept in `did-java` only as a self-contained crypto subsystem.
**There is no OpenPGP migration**: 1M5 was never marketed or deployed, so there
are no OpenPGP identities to carry forward.

Written up in:

- **[`STRATEGY.md`](STRATEGY.md)** — why identity adoption keeps failing (OpenPGP,
  W3C DIDs) and the plan: ride Nostr rather than bootstrap a network, own the gap
  it still has (key recovery and attestation), ship a specification and a small
  library before a product.
- **[`DESIGN.md`](DESIGN.md)** — the technical specification: `secp256k1` /
  BIP-340 Schnorr identities, Nostr-compatible signed records, attestations as a
  decentralized replacement for NIP-05, guardian-based recovery and rotation, a
  `did:nostr` compatibility view, and how it lands in the existing code.

Two points worth stating plainly:

- **No RA DID method.** A `did:nostr` method already exists as a community draft.
  RA contributes to that rather than registering another one.
- **Relays are a distribution option, not the architecture.** Signed records are
  transport-agnostic and travel over any 1M5 route; publishing them to public
  Nostr relays is one opt-in choice among several.

The "What it does" table above still lists the OpenPGP keyring operations, which
remain available in `did-java` for legacy material.

## Principles

The service is built to uphold the
[Self-Sovereign Identity Bill of Rights](https://github.com/WebOfTrustInfo/self-sovereign-identity/blob/master/self-sovereign-identity-bill-of-rights.md):
one unified identity the holder alone controls, portable and interoperable
across systems, with disclosure minimized to the least information a transaction
needs and every use requiring the holder's consent. See the `did-java` README
for how each right maps to an implementation choice.

## License

**Public domain**, via [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)
— see [`LICENSE`](LICENSE). Everything in this directory is dedicated to the public domain:
the specs (`DESIGN.md`, `STRATEGY.md`, `drafts/`), the test vectors (`did-vectors`, its own repo), and the
implementations (`did-ts`, `did-java`, `did-rust`, `did-python`). The point is that a
spec meant to be adopted as a NIP, and reference code meant to be copied, should carry
nothing to attribute or comply with.

(`did-java` began under the 1M5 project's GPLv3 framing and was later relicensed MIT; it is
now dedicated to the public domain along with the rest of the DID work.)
