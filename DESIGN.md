# DID — Technical Design

**Status:** Draft. Written 2026-09-05.
**Implements:** [`STRATEGY.md`](STRATEGY.md) Moves 1–4.
**Supersedes:** the "Design Direction" sketch in [`README.md`](README.md).
**Related:** [`ADR-0002`](../1m5/1m5-docs/architecture/ADR-0002-nostr-identities.md) (crypto decision).
**Drafts:** §2–§3 and §4 are also published as standalone, submission-ready drafts in
[`drafts/`](drafts/) — [`attestations.md`](drafts/attestations.md) and
[`social-recovery.md`](drafts/social-recovery.md). This document stays the source of truth;
keep the drafts in sync when these sections change.

Normative keywords (MUST, SHOULD, MAY) are used in the RFC 2119 sense.

---

## 0. Scope

This document specifies:

1. The **identity primitive** — one secp256k1 key, its encodings, and its signature scheme.
2. The **signed record format** — Nostr-compatible events, and the exact canonicalisation
   rules that make signatures reproducible across implementations.
3. **Attestations** — the `vouch` primitive, as a decentralised replacement for NIP-05.
4. **Guardians, rotation and recovery** — the wedge from `STRATEGY.md` Move 2.
5. **`did:nostr` compatibility** — the thin W3C view.
6. **Key domains and storage.**
7. **How this lands in existing RA code.**

### Explicitly out of scope

- **End-to-end message encryption.** The identity key is a *signing* anchor. The messaging
  envelope, key agreement, forward secrecy and session management belong to 1M5 and are
  specified in ADR-0002 §"End-to-End Encryption Direction". Keeping them out is deliberate:
  `STRATEGY.md` law 3 says the spec that gets implemented is the one a developer can hold in
  their head.
- **Verifiable Credentials, JSON-LD, DIDComm, presentation exchange.** Anti-goals.
- **Relay implementation.** RA writes no relay software.

---

## 1. Identity primitive

An identity is **one secp256k1 keypair**. There is no key ring, no master/subkey structure,
no certificate.

| Element        | Definition                                                                                                      |
|----------------|-----------------------------------------------------------------------------------------------------------------|
| Private key    | 32 bytes, uniformly random from a CSPRNG. MUST be a valid scalar (`1 <= d < n`); regenerate if not.             |
| Public key     | **x-only**, 32 bytes, per BIP-340. Derived as the x-coordinate of `d·G`.                                        |
| Signatures     | **BIP-340 Schnorr**, 64 bytes.                                                                                  |
| Canonical form | Lowercase hex of the 32-byte x-only public key. This is the identifier used internally and in all wire formats. |

### 1.1 Encodings

| Encoding                  | Use                                    | Notes                                          |
|---------------------------|----------------------------------------|------------------------------------------------|
| Lowercase hex (64 chars)  | Canonical. Storage, wire, `did:nostr`. | The only form used in signature preimages.     |
| `npub1…` (Bech32, NIP-19) | Human-facing display, copy, QR.        | Bech32, **not** Bech32m.                       |
| `nsec1…` (Bech32, NIP-19) | Private key export **only**.           | See §6.3 — gated behind explicit confirmation. |
| `did:nostr:<hex>`         | W3C interoperability.                  | §5.                                            |

Implementations MUST accept hex and `npub` on input and MUST normalise to hex internally.
Implementations MUST NOT display `nsec` incidentally — never in logs, never in a list view,
never in an error message.

### 1.2 Primitive sources

A hand-rolled secp256k1 is not acceptable. Use a reviewed implementation:

| Language   | Primitive                                                                                                                                                                                                                                                                     |
|------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| TypeScript | `@noble/secp256k1` (audited, zero-dep, has BIP-340) + `@scure/base` for Bech32.                                                                                                                                                                                               |
| Rust       | `secp256k1` crate with the `schnorrsig` feature, or `k256`.                                                                                                                                                                                                                   |
| Java       | `3rdparty/bitcoinj` already vendors `org.bitcoin.NativeSecp256k1` (libsecp256k1 JNI) and `org.bitcoinj.base.Bech32`. Verify the vendored libsecp256k1 build exposes BIP-340 Schnorr; if it does not, bundle a Schnorr-capable build rather than implementing BIP-340 by hand. |

---

## 2. Signed records

All RA identity records are **Nostr events**. This is what makes them verifiable by software
that has never heard of Resolving Architecture.

    {
      "id":         <32-byte sha256, lowercase hex>,
      "pubkey":     <32-byte x-only pubkey, lowercase hex>,
      "created_at": <unix seconds, integer>,
      "kind":       <integer>,
      "tags":       [[<string>, ...], ...],
      "content":    <string>,
      "sig":        <64-byte BIP-340 signature, lowercase hex>
    }

### 2.1 Canonical serialisation (normative)

Signature reproducibility across four languages depends entirely on getting this exact. The
preimage is the UTF-8 encoding of this JSON array, serialised with **no whitespace anywhere**:

    [0,<pubkey>,<created_at>,<kind>,<tags>,<content>]

String escaping MUST use **only** the following, and MUST NOT escape anything else
(in particular: no `\/`, no `\uXXXX` escaping of characters that do not require it):

| Character  | Escape |
|------------|--------|
| `"` (0x22) | `\"`   |
| `\` (0x5C) | `\\`   |
| LF (0x0A)  | `\n`   |
| CR (0x0D)  | `\r`   |
| TAB (0x09) | `\t`   |
| BS (0x08)  | `\b`   |
| FF (0x0C)  | `\f`   |

All other characters are emitted as literal UTF-8.

Then:

    id  = sha256(preimage_bytes)                  // 32 bytes, hex-encoded lowercase
    sig = schnorr_sign(id_bytes, private_key)     // BIP-340, over the 32 raw bytes, not the hex

### 2.2 Verification (normative)

A verifier MUST, in this order, and MUST reject on the first failure:

1. Check `pubkey` is 64 lowercase hex chars and a valid x-only point.
2. Recompute `id` from the canonical preimage and check it equals the stated `id`.
3. Verify the Schnorr signature over the 32 raw `id` bytes against `pubkey`.
4. Apply kind-specific validation (§3, §4).

Step 2 is not optional. An event whose `id` does not match its content is malformed even if
the signature verifies against the stated `id`.

### 2.3 Test vectors (normative)

Every implementation MUST pass a shared vector file, [`did-vectors/events.json`](did-vectors/),
containing at minimum: an event with non-ASCII content, one with embedded newlines and
quotes, one with empty `tags` and empty `content`, one with a 4-byte UTF-8 codepoint
(emoji), a known-good signature, and mutated events that MUST fail each of the four
verification steps.

The vectors are the interoperability contract. They are authored once and shipped in every
language port. A second implementer must be able to prove compatibility without contacting us.

The file distinguishes two classes of rejection: `rejected_by: "any"` (any BIP-340 / NIP-01
verifier rejects it) and `rejected_by: "did"` (a permissive generic Nostr verifier accepts
it, but a DID-compliant verifier MUST reject it — the lowercase-hex canonical rule, or a
kind-specific rule from the drafts). See [`vectors/README.md`](did-vectors/README.md).

---

## 3. Attestations — the `vouch` primitive

This replaces NIP-05. NIP-05 means *a DNS domain vouches for this key*, which places a
registrar and a certificate authority in the trust path. This means *people you already trust
vouch for this key*.

### 3.1 Event

**Kind `30100` — Identity Attestation** (addressable; PROVISIONAL, see §8).

Signed by the **attester**. Addressable on `d` = the subject's pubkey, so one attester holds
exactly one current attestation per subject, and re-issuing replaces it.

| Tag                               | Required  | Meaning                                    |
|-----------------------------------|-----------|--------------------------------------------|
| `["d", <subject-pubkey-hex>]`     | yes       | Addressable identifier. The subject.       |
| `["p", <subject-pubkey-hex>]`     | yes       | So relays and clients index it by subject. |
| `["claim", <attribute>, <value>]` | ≥1        | The attribute being attested. Repeatable.  |
| `["method", <method>]`            | yes       | How the attester verified. See §3.2.       |
| `["expiration", <unix-seconds>]`  | no        | After which the attestation is stale.      |

`content` SHOULD be empty. Free text in an attestation invites people to put claims there
where nothing can parse them.

### 3.2 Verification methods

The `method` tag records **how** the attester knows, which is the part that makes an
attestation worth anything:

| Method              | Meaning                                                              |
|---------------------|----------------------------------------------------------------------|
| `in-person`         | Key compared face to face (QR scan or fingerprint comparison).       |
| `qr`                | Scanned the subject's code, not necessarily in person.               |
| `existing-channel`  | Confirmed over a channel already trusted (an existing conversation). |
| `guardian`          | Issued as part of a recovery. See §4.                                |
| `asserted`          | The attester asserts it with no verification ceremony. Weakest.      |

A client MUST surface the method. "Three people vouch for this key" where all three used
`asserted` is materially different from three `in-person` attestations, and a UI that hides
the difference is lying to the user.

### 3.3 Attributes

`claim` attributes are open, but these are reserved with defined meaning:

| Attribute | Value                                                                               |
|-----------|-------------------------------------------------------------------------------------|
| `name`    | A human name the attester asserts this key uses.                                    |
| `same-as` | Another pubkey the attester asserts is the same person (for rotation continuity).   |
| `nip05`   | A NIP-05 identifier the attester confirms resolves to this key.                     |
| `not`     | An impersonation warning: this key is claiming to be the named identity and is not. |

The `not` attribute matters more than it looks. Anti-impersonation is the *felt daily pain*
that drives adoption (`STRATEGY.md` Move 3), and negative attestations are what make a trust
query useful in the moment someone is being scammed.

### 3.4 Revocation

An attester revokes by **replacing** the addressable event with one carrying
`["revoked", "<reason>"]` and no `claim` tags, or by issuing a NIP-09 deletion. Verifiers MUST
treat a missing attestation and a revoked attestation as distinct: the second is a signal.

### 3.5 Trust queries

Trust evaluation is a **client concern**, not a protocol concern, and this spec deliberately
does not define a scoring algorithm. What it defines is the input: a set of signed, typed,
method-tagged attestations. A client SHOULD be able to answer:

> "Of the identities I have attested, or that my attested identities have attested,
> how many vouch for this key, by what method, and has any of them issued a `not`?"

Depth SHOULD be limited (1–2 hops is enough to be useful and cheap). A client MUST NOT
present a numeric trust score as though it were an identity verification.

### 3.6 Relationship to NIP-85

NIP-85 "Trusted Assertions" occupies kinds **30382–30384** and addresses a different problem:
consuming third-party computed trust scores when local computation is too expensive. It is
complementary. This spec produces the raw signed attestations; a NIP-85 provider MAY consume
them. There is no collision and no need to duplicate it.

---

## 4. Guardians, rotation and recovery

The wedge. Nostr has no native recovery: NIP-26 delegation is deprecated, threshold schemes
remain experimental, and the several open proposals (`nostr-protocol/nips` #116, #103,
NIP-41 #829, #1452, …) have not converged.

The design goal is a scheme that **works socially with no new infrastructure** — no shard
custody, no server, no relay changes — and that hardens with threshold signatures later
without requiring them. Requiring them is what has kept every prior attempt experimental.

### 4.1 Guardian set

**Kind `30101` — Guardian Set** (addressable, `d` = `"guardians"`; PROVISIONAL).

Signed by the **root identity**. Declares who may authorise a rotation.

| Tag                            | Required | Meaning                                         |
|--------------------------------|----------|-------------------------------------------------|
| `["d", "guardians"]`           | yes      | Fixed. One current set per identity.            |
| `["p", <guardian-pubkey-hex>]` | ≥1       | A guardian. Repeatable.                         |
| `["threshold", <M>]`           | yes      | How many guardians must co-sign. `1 <= M <= N`. |

`content` MUST be empty or an encrypted blob (see §4.5). Guardians are named by pubkey,
so a guardian may be a friend, the user's own second device, or a service the user chose.

Publishing a guardian set is **public by default**, and that is a real cost — it exposes a
slice of the social graph. §4.5 addresses it.

### 4.2 Rotation

Rotation is a three-part exchange. The new key claims; guardians attest; verifiers count.

**Kind `30103` — Rotation Claim** (addressable, `d` = old pubkey; PROVISIONAL).
Signed by the **new key**.

| Tag                                        | Required | Meaning                                                                                |
|--------------------------------------------|----------|----------------------------------------------------------------------------------------|
| `["d", <old-pubkey-hex>]`                  | yes      | The identity being rotated from.                                                       |
| `["p", <old-pubkey-hex>]`                  | yes      | Indexing.                                                                              |
| `["reason", <lost\|compromised\|planned>]` | yes      | Why.                                                                                   |
| `["prev-sig", <sig-hex>]`                  | no       | BIP-340 signature by the **old** key over the 32 raw bytes of the new x-only pubkey, when the old key is still available. |

**Kind `30102` — Rotation Attestation** (addressable, `d` = old pubkey; PROVISIONAL).
Signed by a **guardian**, one per guardian.

| Tag                         | Required | Meaning                                                                       |
|-----------------------------|----------|-------------------------------------------------------------------------------|
| `["d", <old-pubkey-hex>]`   | yes      | Which rotation.                                                               |
| `["p", <old-pubkey-hex>]`   | yes      | The old identity.                                                             |
| `["new", <new-pubkey-hex>]` | yes      | The key this guardian is endorsing. All guardians MUST name the same new key. |
| `["method", <method>]`      | yes      | How the guardian confirmed the request was genuine (§3.2).                    |

### 4.3 Acceptance rule (normative)

A verifier MUST treat `new` as the successor to `old` only when **all** hold:

1. A valid Guardian Set (kind `30101`) signed by `old` exists, with threshold `M` and
   guardian set `G`.
2. At least `M` distinct guardians in `G` have published valid kind `30102` events with
   matching `d` = `old` and identical `new`.
3. Each such attestation is signed by that guardian's own key.
4. A kind `30103` Rotation Claim signed by `new` exists for `old`.
5. The Guardian Set used is the **most recent** one whose `created_at` is at or before the
   rotation claim's `created_at` **and** at least a **cool-down** period (default 7 days,
   configurable) earlier than it — `guardianset.created_at + cooldown <= claim.created_at`.
   An attacker who has compromised the old key MUST NOT be able to install a fresh guardian
   set and immediately self-approve; a set inside its cool-down is simply not yet in effect,
   and the previous eligible set (if any) governs. Because the reference point is the
   claim's `created_at`, which the new key controls, a verifier MUST also reject a Rotation
   Claim whose `created_at` is in the future (beyond a small clock-skew allowance).

If `prev-sig` is present and valid, the rotation is **self-authorised** and guardians are not
required — this is the ordinary planned-rotation case where the user still holds the old key.
An invalid `prev-sig` is ignored (the guardian path still applies), not a hard failure.

On acceptance, a client SHOULD migrate follows, contacts, and prior attestations to the new
key, and MUST display the identity as rotated rather than silently substituting it.

Test vectors covering every clause — and the negative cases (threshold not met, mismatched
`new`, duplicate guardian, endorser not in the set, guardian set inside cool-down,
compromised-key self-approval, superseded set) — are in
[`did-vectors/rotation.json`](did-vectors/), with a reference implementation of this rule in
[`did-vectors/acceptance.py`](did-vectors/acceptance.py).

### 4.4 Threat model (normative to state, honestly)

Social recovery has real attack surface. A scheme marketed as safer than it is will do more
damage than no scheme at all.

| Attack                                                         | Mitigation                                                                                             | Residual risk                                                                |
|----------------------------------------------------------------|--------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------|
| Guardian collusion (M guardians conspire to seize an identity) | Threshold `M`; user picks guardians; rotations are public and visible to the victim's followers        | **Not eliminated.** Inherent to social recovery. Users MUST be told plainly. |
| Attacker holds the old key and installs their own guardians    | Guardian-set cool-down (§4.3.5)                                                                        | Attacker who waits out the cool-down undetected succeeds.                    |
| Coercion of guardians                                          | None at protocol level                                                                                 | Real. A duress scheme is out of scope and probably unsolvable here.          |
| Guardian key itself compromised                                | Threshold `M > 1`; guardians rotate too                                                                | Correlated compromise defeats it.                                            |
| Social engineering of the recovery request                     | `method` tag forces guardians to record how they confirmed; clients SHOULD require an out-of-band step | Depends on guardian diligence.                                               |
| Guardian set reveals social graph                              | §4.5                                                                                                   | Partially mitigated.                                                         |

`M = 1` MUST be permitted (a second device as sole guardian is a legitimate and common case)
but a client MUST warn that a single guardian is a single point of seizure.

### 4.5 Private guardian sets (SHOULD)

Publishing guardians in `p` tags leaks the social graph. Implementations SHOULD support a
private variant: the guardian list encrypted to each guardian in `content`, with only a
commitment (a hash of the sorted guardian list plus a salt) in tags. Guardians can then
attest, and verifiers can check the commitment against the revealed set at recovery time,
without the set being public beforehand.

This is specified as SHOULD rather than MUST because the public form is simpler and shipping
the simple form first is worth more than shipping neither.

---

## 5. `did:nostr` compatibility

RA does **not** define a DID method (`STRATEGY.md` Move 1). It produces the
`did:nostr` view of a key it already holds, so RA identities are legible to W3C tooling.

The `did:nostr` method is a **community work in progress**, not ratified. Implementations
MUST re-verify these details against the current draft before release.

### 5.1 Identifier

    did:nostr:<64-char lowercase hex x-only pubkey>

Note this is **hex, not `npub`**.

### 5.2 Document

Produced offline from the public key alone (the draft's "minimal resolution"). The
verification method is a **Multikey**:

1. Convert x-only (32 bytes) to **compressed** secp256k1 (33 bytes) by prepending `0x02`.
2. Prepend the multicodec varint for secp256k1-compressed: `0xe7 0x01`.
3. Encode multibase base16-lower — prefix `f`, then lowercase hex.

So `publicKeyMultibase` = `f` + `e701` + `02` + `<x-only hex>`.

The document carries `type: "DIDNostr"`, a `verificationMethod` entry, and `authentication`
and `assertionMethod` referencing it. Optional `service` (relay endpoints), `profile`,
`follows`, and `alsoKnownAs` come from the draft's "enhanced resolution" against kinds 0, 3
and 10002 and are OPTIONAL for RA.

### 5.3 Scope limit

RA implements **document production** and offline resolution. RA does **not** implement the
HTTP `.well-known` resolution tier — it reintroduces a domain as a trust anchor, which is the
thing §3 exists to remove.

---

## 6. Keys and storage

### 6.1 Key domains (normative)

Keys MUST NOT be reused across domains. Bitcoin wallet keys MUST NOT become messaging
identities, even though both are secp256k1.

| Domain     | Purpose                                                      |
|------------|--------------------------------------------------------------|
| Identity   | The public identity, signatures, attestations. This spec.    |
| Encryption | Key agreement for E2EE. Out of scope; see ADR-0002.          |
| Wallet     | Bitcoin. Never an identity.                                  |
| Transport  | I2P/Tor peer identity. Already separate in 1M5.              |
| Device     | Per-device keys, device linking, guardianship by own device. |

If any two are ever derived from one seed, the derivation MUST use explicit domain separation
and MUST be documented. Default is independent generation.

### 6.2 Scoped identities (SHOULD)

A stable pubkey is a permanent correlator. Implementations SHOULD support multiple
independent identities per person (the existing `DID` model already allows this) and SHOULD
NOT encourage one key across all contexts. Attestations make correlation *worse* by
publishing a trust graph — this is a genuine cost of §3 and MUST be documented to users.

### 6.3 At rest (normative)

The Nostr identity path meets this: `did-java`'s `EncryptedSecret` (§7.3) and
`1m5-core-java`'s `IdentityService` (§7.4) seal the secret with Argon2id + AES-256-GCM.
Still open: `1m5-android` persists identity JSON in plaintext via `InfoVaultFileDB` (§7.5),
and the Android build should wrap the KDF output in the Android Keystore. (The legacy OpenPGP
`.skr` files still carry `// TODO: Encrypt file` — low priority, since no OpenPGP identities
exist.)

- Private keys MUST be encrypted at rest with a key derived from a user secret via a memory-
  hard KDF (Argon2id preferred; scrypt or PBKDF2 with a high iteration count acceptable where
  Argon2 is unavailable), then sealed with an AEAD (ChaCha20-Poly1305 or AES-GCM).
- On Android the wrapping key SHOULD be held in the Android Keystore.
- Private keys MUST NOT be logged, MUST NOT appear in `toString`/`toMap`/`toJSON` output, and
  MUST NOT be written to crash reports.
- `nsec` export MUST require an explicit, separately confirmed user action with a warning that
  it exposes the entire identity.
- The existing `PIIClearable` contract MUST be honoured on every identity object.

### 6.4 OpenPGP

There is nothing to migrate. 1M5 has not been marketed or deployed, so no OpenPGP
identities exist in the field. The Nostr identity primitive (§1) is the only one; new
identities are Nostr from the start.

`did-java` keeps the OpenPGP keyring (`ra.did.openpgp`) as a self-contained subsystem for
encrypt / decrypt / sign / verify of any legacy OpenPGP material that turns up, but it is no
longer an identity path and no migration ceremony is specified. If a continuity claim is
ever needed between two keys the `same-as` attestation attribute (§3.3) covers it without an
OpenPGP-specific method.

---

## 7. Landing this in existing RA code

Ordered per `STRATEGY.md` §6 — TypeScript first, RA's own stack in Phase 3.

### 7.1 New: the reference library

`did-ts` (the reference, Phase 1), then `did-java` (Phase 2), then `did-rust` and
`did-python` (Phase 3, done). Each is small and dependency-light: keygen, encodings, canonical
serialisation, sign/verify, the four event kinds, the acceptance rule (§4.3), and the
`did:nostr` document. Each vendors the same `did-vectors/` (its own repo) and cross-verifies
against a third-party Nostr library for its language (nostr-tools / rust-nostr / pynostr).
`did-rust` and `did-python` share `did-ts`'s module layout module-for-module.

### 7.2 `ra-common` (Java and Rust)

- `PublicKey.signedAttributes` (`Map<String, List<Signature>>`) is **already** the attestation
  structure. It maps onto §3 directly and needs no model change: the map key is the attested
  attribute, each `Signature` carries the value (`valueSigned`), the attester
  (`signedByAddress` / `signedByFingerprint`), the algorithm and the date. The one field §3.1
  needs that `Signature` still lacks is `method` (§3.2); adding it is deferred to the
  `NostrKeyRing` work in §7.3, when there is a concrete consumer.
- ~~`ra.common.identity.Signature.toMap()` returns an empty map and `fromMap()` is a
  no-op.~~ **Fixed** (`ra-common-java` 1.3.0, 2026-09-07): all fields serialise; `signedDate`
  round-trips as epoch millis, read back tolerant of `Integer`/`Long`. Round-trip tests added
  (`SignatureRoundTripTest`) — the repo's first tests. Attestations now persist.
- ~~`Reputation` is an empty stub.~~ **Deleted** (`ra-common-java` 1.3.0). §3.5 puts trust
  scoring in the client; the class was unused everywhere. Recreate only against a concrete
  need, not as a placeholder.
- EC primitives (`secp256k1` / BIP-340): **not** in `ra-common`. `ra-common-java` is
  deliberately zero-runtime-dependency and BIP-340 cannot be added without a crypto library
  (BouncyCastle has no clean BIP-340 API; `libsecp256k1` is JNI). The signer/verifier lives in
  `did-java`'s `NostrKeyRing` (§7.3), which already depends on BouncyCastle, and in `did-rust`
  for the Rust side. `did-ts` shows the shape (`@noble/curves`).

### 7.3 `did-java`

Started 2026-09-07 (`did-java` 1.3.0, in-progress). The OpenPGP keyring subsystem moved to
its own package `ra.did.openpgp` (the PGP-typed `KeyRing` interface, `OpenPGPKeyRing`,
`YubiKeyRing`, and the encrypt/decrypt/sign/verify/generate DTOs); `ra.did` keeps the
service, hashing, symmetric AES, and the identity DTOs. New package `ra.did.nostr`:

- **BIP-340** via ACINQ `secp256k1-kmp` (JNI to Bitcoin Core libsecp256k1) — the reviewed
  build §1.2 asks for; `Bip340` is a thin wrapper, no Schnorr by hand. Android builds swap
  `secp256k1-kmp-jni-jvm` for `secp256k1-kmp-jni-android`.
- **`NostrEvent`** — the §2 record: hand-rolled canonical serialisation (the seven escapes,
  not a JSON library), `id`, `sign`, and `verify` returning the failing step (1–4). Passes
  every `did-vectors/events.json` case — serialisation, `id`, **signature reproduction**
  (byte-for-byte, `aux_rand = 0`), and rejection at the stated step. `NostrKinds` holds the
  provisional kind numbers and step-4 validation in one place.
- **`NostrKeys`** — hex / `npub` / `nsec` / `did:nostr` (vendored `Bech32`). `nsec` export is
  isolated and never called internally.
- **`NostrIdentity`** — secret + x-only public; `PIIClearable`; a public-only variant.
- **`IdentityKeyRing`** — the narrower successor interface (keygen, sign, verify, encode),
  not PGP-typed. **`NostrKeyRing`** implements it. `OpenPGPKeyRing` still implements the fat
  `KeyRing`; `DIDService` caches key-ring impls by class name, so both run side by side.

- **`vouch` builders** — `NostrAttestations` (kind 30100: `attestation`, `revocation`,
  `parse`, `isExpired`) and `NostrRotation` (kinds 30101–30103 builders, `prevSig`, and
  `evaluate` — the §4.3 acceptance rule ported from `acceptance.py`). Passes all 19
  `did-vectors/rotation.json` scenarios. Builders return unsigned events; sign via
  `NostrKeyRing`.
- **`DIDService` wired** — `DIDService` holds a `NostrKeyRing` and an in-memory map of
  `NostrIdentity` by pubkey. Bus operations: `GENERATE_NOSTR_IDENTITY` (generate or import
  a secret; optional `passphrase` seals it at rest; returns the secret once so the caller
  keeps its own copy), `LOAD_NOSTR_IDENTITY`, `DELETE_NOSTR_IDENTITY`, `VOUCH` / `ATTEST`,
  `DESIGNATE_GUARDIANS`, `CLAIM_ROTATION`, `ATTEST_ROTATION`, `VERIFY_ROTATION`. Requests
  reference signers by pubkey; no secret key ever crosses the bus except at
  generate/import/load. `VouchRequest` (OpenPGP-shaped, `DID` signer/signee) replaced by
  `AttestRequest` and friends in `ra.did.nostr`.

- **Encrypted at rest (§6.3)** — `EncryptedSecret` seals the 32-byte secret with Argon2id
  (BouncyCastle; OWASP-minimum params, stored with the ciphertext) + AES-256-GCM. The
  passphrase is never stored. `NostrIdentityStore` writes one `<pubkey>.json` per identity
  under `<serviceDir>/NOSTR/` (public key in the clear, secret sealed) — direct file I/O,
  not `InfoVaultFileDB` (whose JSON-in-body round-trip corrupts nested JSON). `NostrKeyRing`
  gained `setStore` / `persist` / `loadIdentity` / `deletePersisted`. Android Keystore
  wrapping of the KDF output is still a `SHOULD` for the Android build.

- **The remaining bus operations** (done) — `EXPORT_NPUB` / `RESOLVE_DID_DOCUMENT`
  (stateless: pure encodings and the `did:nostr` doc from `NostrDidDocument`, §5.2),
  `EXPORT_NSEC` (refuses without a caller-asserted `confirmed` flag, logs the export, §6.3),
  `GET_ATTESTATIONS` (verifies then aggregates a caller-supplied bag of kind-30100 events into
  the §3.5 summary — counts by method, names, whether any `not` — no scoring, no store).
- **Known defects** (done) — `loadKeyRingImplementations()` now reads `ra.did.KeyRings` and
  `DIDService.start` merges `ra-did.config` (`BaseService` only loads `ra-common.config`); a
  `KeyRing` impl that will not load (e.g. `YubiKeyRing` where `usb4java` was excluded
  downstream) is caught and skipped, with an `OpenPGPKeyRing` fallback. `verifyIdentity` now
  reports `verified = nonNull(did)` and attaches the DID. `GET_NODE_DID`, `REVOKE_IDENTITY`
  and `GET_PUBLIC_KEY` have handlers.
- Surefire pinned (3.2.5) — the inherited 2.12.4 predates the JUnit Platform, so this
  module's tests never ran; `DIDServiceTest` now runs and passes.

`did-java` core for the Nostr identity layer is complete. **122 tests green.**

### 7.4 `1m5-core-java` / `1m5-core-rust`

**`1m5-core-java` done** (2026-09-07). `IdentityService` no longer has a JCA/SHA-256
placeholder: it derives the node's identity through `did-java`'s `NostrKeyRing` (real x-only
BIP-340) and seals the secret with `EncryptedSecret` (§6.3) via a `NostrIdentityStore` under
`<serviceDir>/identity/`, keyed by a `1m5.pass` passphrase (config key or env var).
`node.pub` holds the public key as a pointer; a legacy plaintext `node.sec` is read and, when
`1m5.pass` is available, upgraded to a sealed file in place. Without a passphrase the node
still gets a real identity but the secret is written unencrypted with a warning. `pom.xml`
adds `resolvingarchitecture:did:1.3.0` (usb4java excluded) and pins `common:1.3.0`.
`GET_NODE_IDENTITY` returns hex / `npub` / `did` / `encryptedAtRest` / `hasSecret`;
`signAsNode(NostrEvent)` signs with the node key.

`1m5-core-rust` still to do: it reads `/dev/urandom` and uses hex of half the secret as a
fake pubkey — move to real x-only derivation (`did-rust`, Phase 3) and seal `node.sec`.

### 7.5 `1m5-android` (Remnant)

Per `STRATEGY.md` §9 this is deliberately last. When it happens:

- The existing `DCard` QR exchange is the natural **attestation capture point** — after a
  scan, offer "confirm this is really them" and emit a kind `30100` with `method=qr` or
  `in-person` (§3.2). This is how trust accrues passively instead of by ceremony.
- The `DID` model already separates `identityPublicKey` from `encryptionPublicKey`, which
  matches §6.1.
- Plaintext key storage (§6.3) MUST be fixed as part of this work, not after it.

---

## 8. Provisional kind numbers

| Kind    | Record               | Class       |
|---------|----------------------|-------------|
| `30100` | Identity Attestation | Addressable |
| `30101` | Guardian Set         | Addressable |
| `30102` | Rotation Attestation | Addressable |
| `30103` | Rotation Claim       | Addressable |

**These numbers are PROVISIONAL.** They sit in a region of the addressable range
(30079–30165) that appeared unassigned when this document was written, and they avoid
NIP-85's 30382–30384. They MUST be re-checked against the live NIPs kind registry and
assigned through the NIP process before any public release. Implementations SHOULD hold them
in a single constants module so reassignment is a one-line change.

Addressable (30000–39999) was chosen over replaceable (10000–19999) for all four because
every record here is naturally keyed by a second parameter — the subject or the rotated-from
key — and because it makes revocation-by-replacement (§3.4) fall out for free.

---

## 9. Open questions

- Should the Guardian Set default to private (§4.5) rather than public? Simplicity argues
  public first; the social-graph leak argues private. Not settled.
- Is the 7-day guardian-set cool-down (§4.3.5) the right default? It trades recovery latency
  against seizure resistance and wants real-world feedback.
- Should RA define a duress/decoy path, or is it honestly out of reach at this layer?
- How should a client display an identity with attestations that conflict (`name` vs `not`)?
- Does the `did:nostr` draft settle in a shape compatible with §5.2, and should RA contribute
  the offline-resolution profile back to it?

---

## 10. Verification

- Every implementation passes [`did-vectors/events.json`](did-vectors/) (§2.3) and
  [`did-vectors/rotation.json`](did-vectors/) — 19 acceptance-rule scenarios covering each clause of
  §4.3 and the negative cases (threshold not met, mismatched `new`, duplicate guardian,
  endorser not in the set, guardian set inside the cool-down, compromised-key self-approval,
  superseded set). [`did-vectors/acceptance.py`](did-vectors/acceptance.py) is the reference
  implementation of the rule; [`did-vectors/validate.py`](did-vectors/validate.py) checks both files
  against nostr-tools, rust-nostr, and an independent Python implementation.
- Cross-implementation check: an event signed by `did-ts` verifies in `did-rust`,
  `did-python` and `did-java`, and vice versa. Currently established transitively — all four
  reproduce and verify the same `did-vectors` `events.json` signatures byte-for-byte; a direct
  pairwise round-trip test is still worth adding.
- Ecosystem check: an event produced by RA validates in an unmodified third-party Nostr
  library, and the `did:nostr` document resolves in the existing JS resolver.
- Security review of §4 and §6.3 before either is enabled by default.
