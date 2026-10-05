Social Recovery and Key Rotation
================================

`draft` `optional`

This document defines **guardian-based social recovery and key rotation** for Nostr
identities. An identity's holder designates a set of guardians and a threshold `M` in a
signed event. To move to a new key — because the old one was lost or compromised, or on a
planned schedule — the new key publishes a claim and `M` of the guardians co-sign a binding
from the old pubkey to the new one. Verifiers follow that chain and migrate the identity.

The scheme works **purely socially**: no secret sharding, no custody service, no relay
changes, no new infrastructure. It composes with threshold signatures for holders who want
them, but does not require them — requiring them is what has kept every prior attempt
experimental.

This addresses the long-running Nostr key-rotation discussion —
[nostr-protocol/nips#116](https://github.com/nostr-protocol/nips/issues/116) (dormant
since 2022), [#103](https://github.com/nostr-protocol/nips/issues/103), the NIP-41 proposal
([#829](https://github.com/nostr-protocol/nips/pull/829)), and others — none of which has
converged. See [Relationship to existing proposals](#relationship-to-existing-proposals).

## Motivation

Nostr today has no recovery and no rotation:

- **Loss is terminal.** Lose the private key and you lose the identity, the follow graph,
  and every attestation anyone ever made about you. There is no reset.
- **Compromise is terminal in the same way.**
  [NIP-26](https://github.com/nostr-protocol/nips/blob/master/26.md) delegated signing was
  the partial answer and has been largely dropped by clients. Threshold / FROST schemes
  remain experimental.
- The practical state of the art is: post a note from the old key pointing at a new one, and
  hope your followers re-follow.

For anyone not prepared to treat a lost phone as a lost identity — which is to say, for most
people — this single gap disqualifies self-custodied identity. Closing it with no new
infrastructure is the goal here.

The framing that falls out of the design: **your guardians are your recovery.** That is
comprehensible to someone who has never heard the word "cryptography", which is the point.

## Conventions

- Events are standard Nostr events
  ([NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md)); signatures are
  BIP-340 Schnorr over secp256k1 x-only pubkeys; pubkeys in tag values are 64-character
  lowercase hex.
- This document reuses the `method` vocabulary and the attestation model from
  [Identity Attestations](attestations.md). A rotation attestation is an identity
  attestation with rotation-specific tags.

## Events

Three addressable event kinds. All kind numbers are **provisional**; see
[Kind numbers](#kind-numbers).

### Guardian Set — kind `30101`

Signed by the **root identity**. Declares who may authorize a rotation of this identity.

| tag                          | required  | meaning                                                |
|------------------------------|-----------|--------------------------------------------------------|
| `["d", "guardians"]`         | yes       | Fixed literal. One current guardian set per identity.  |
| `["p", "<guardian-pubkey>"]` | ≥1        | A guardian. Repeatable.                                |
| `["threshold", "<M>"]`       | yes       | Guardians required to co-sign a rotation. `1 ≤ M ≤ N`. |

`content` MUST be empty, or an encrypted blob for the private variant — see
[Private guardian sets](#private-guardian-sets).

A guardian is any pubkey: a friend, the holder's own second device, or a service the holder
chose. `M = 1` MUST be permitted — a second device as sole guardian is a common, legitimate
case — but a client MUST warn that a single guardian is a single point of seizure.

### Rotation Claim — kind `30103`

Signed by the **new key**. Announces the intent to succeed an old identity.

| tag                                          | required  | meaning                                                                                   |
|----------------------------------------------|-----------|-------------------------------------------------------------------------------------------|
| `["d", "<old-pubkey>"]`                      | yes       | The identity being rotated from.                                                          |
| `["p", "<old-pubkey>"]`                      | yes       | Indexing.                                                                                 |
| `["reason", "<lost\|compromised\|planned>"]` | yes       | Why the rotation is happening.                                                            |
| `["prev-sig", "<sig>"]`                      | no        | BIP-340 signature by the **old** key over the 32 raw bytes of the new x-only pubkey, when the old key is still held. |

### Rotation Attestation — kind `30102`

Signed by a **guardian**; one event per guardian.

| tag                       | required  | meaning                                                                                                       |
|---------------------------|-----------|---------------------------------------------------------------------------------------------------------------|
| `["d", "<old-pubkey>"]`   | yes       | Which rotation.                                                                                               |
| `["p", "<old-pubkey>"]`   | yes       | The old identity.                                                                                             |
| `["new", "<new-pubkey>"]` | yes       | The key this guardian endorses. Every guardian MUST name the same new key.                                    |
| `["method", "<method>"]`  | yes       | How the guardian confirmed the request was genuine. Vocabulary from [Identity Attestations](attestations.md). |

## Acceptance rule

A verifier MUST treat `new` as the successor to `old` only when **all** of the following
hold:

1. A valid Guardian Set (kind `30101`) signed by `old` exists, with threshold `M` and
   guardian set `G` (where `|G| = N`).
2. At least `M` distinct members of `G` have published valid kind `30102` events with
   `d == old` and an identical `new`.
3. Each such event is signed by that guardian's own key.
4. A kind `30103` Rotation Claim signed by `new` exists with `d == old`.
5. The Guardian Set relied on is the **most recent** one whose `created_at` is at or before
   the Rotation Claim's `created_at` **and** at least a cool-down earlier —
   `guardianset.created_at + cooldown <= claim.created_at`. A holder of a compromised old
   key MUST NOT be able to install a fresh guardian set and immediately self-approve: a set
   inside its cool-down is not yet in effect, and the previous eligible set (if any)
   governs.

**Self-authorized rotation.** If the Rotation Claim carries a valid `prev-sig` — a BIP-340
signature by the old key over the 32 raw bytes of the new x-only pubkey — the rotation is
authorized by that signature alone and guardians are not required. This is the ordinary
planned-rotation case. An invalid `prev-sig` is ignored, not a hard failure.

**Cool-down.** The cool-down defaults to **7 days** and is measured against the Rotation
Claim's `created_at`. Because the new key controls that timestamp, a verifier MUST reject a
Rotation Claim dated in the future (beyond a small clock-skew allowance). The right default
is an open question — see below.

**On acceptance**, a client SHOULD migrate follows, contact entries, and prior attestations
from `old` to `new`, and MUST display the identity as *rotated* rather than silently
substituting the key.

## Client behavior

- **Designating guardians** — the client SHOULD explain, in plain language, that these
  people can collectively move the identity, and SHOULD encourage a threshold `M ≥ 2` with
  guardians who do not all know one another.
- **Acting as a guardian** — before publishing a kind `30102`, a client SHOULD require the
  guardian to confirm the request through an out-of-band channel and SHOULD record that
  channel in `method`. A recovery request arriving only over Nostr is not sufficient
  confirmation.
- **Observing a rotation** — a client SHOULD notify the identity's followers that a rotation
  occurred, so a fraudulent one is visible to the victim's network.

## Private guardian sets

Publishing guardians in `p` tags leaks part of the social graph. Implementations SHOULD
support a private variant: the guardian list and threshold are encrypted to each guardian
and carried in `content`, and the only public tag is a commitment —
`["commit", "<hash of the sorted guardian list plus a salt>"]`. Guardians can still publish
rotation attestations; at recovery time the revealed set is checked against the commitment.

This is a SHOULD, not a MUST: the public form is simpler, and shipping it first is worth
more than shipping neither.

## Security considerations

Social recovery has real attack surface. A scheme presented as safer than it is does more
harm than no scheme.

| attack                                                                | mitigation                                                          | residual risk                                                                        |
|-----------------------------------------------------------------------|---------------------------------------------------------------------|--------------------------------------------------------------------------------------|
| Guardian collusion (`M` guardians conspire to seize the identity)     | Threshold `M`; the holder picks the guardians; rotations are public | **Not eliminated** — inherent to social recovery. Holders MUST be told this plainly. |
| Attacker holds the stolen old key and installs their own guardian set | Guardian-set cool-down (clause 5)                                   | An attacker who waits out the cool-down undetected succeeds.                         |
| Coercion of guardians                                                 | None at the protocol layer                                          | Real; a duress scheme is out of scope.                                               |
| A guardian's own key is compromised                                   | Threshold `M > 1`; guardians rotate too                             | Correlated compromise defeats it.                                                    |
| Social engineering of the recovery request                            | `method` tag; clients SHOULD require an out-of-band step            | Depends on guardian diligence.                                                       |
| Guardian set reveals the social graph                                 | Private guardian sets                                               | Partially mitigated.                                                                 |

Clients MUST NOT describe a recovered identity as cryptographically equivalent to the
original: absent a `prev-sig`, the successor is endorsed by a social threshold, not by the
original key.

## Relationship to existing proposals

Key rotation has a long history in the NIPs repo; none of these has converged, and this
draft is deliberately narrow where they are broad.

- **NIP-41 / "simple account migration"**
  ([#829](https://github.com/nostr-protocol/nips/pull/829)) — a pre-whitelisted successor
  key plus a delay before clients switch. This draft's *self-authorized rotation*
  (`prev-sig`) is essentially the same mechanism. The guardian path adds the case NIP-41
  structurally cannot cover: recovery when the old key is **lost**, not merely retired.
- **"Key Migration and Revocation"**
  ([#1452](https://github.com/nostr-protocol/nips/pull/1452)) — overlaps on revocation and
  on a user remembering an associated key for a contact. Here the Guardian Set is a
  structured, signed form of "an associated key", and `["reason","compromised"]` on the
  Rotation Claim is the revocation signal.
- **NIP-102 Subkey Attestation**
  ([#1450](https://github.com/nostr-protocol/nips/pull/1450)), and the deprecated NIP-26 —
  separate a cold identity key from hot signing keys. That is delegation, not succession:
  the identity key never changes. Complementary and out of scope here.
- **"Stateless key rotation"**
  ([#103](https://github.com/nostr-protocol/nips/issues/103)) — a hidden, pre-committed
  chain of successor keys derived from one seed. Strong while the seed survives; offers
  nothing once the seed is lost. Guardians are the social alternative to holding that seed.

## Open questions
https://github.com/resolvingarchitecture/decentralized-identification-java.git
- Should the Guardian Set default to the private form?
- Is 7 days the right cool-down default? It trades recovery latency against seizure
  resistance.
- Is a duress / decoy recovery path achievable at this layer, or honestly out of reach?

## Kind numbers

`30101`, `30102`, and `30103` are **provisional**, chosen in a region of the addressable
range that appeared unassigned and clear of NIP-85 (30382–30384). They MUST be reconciled
with the kinds registry before this document is finalized.

## Test vectors

[`rotation.json`](https://github.com/resolvingarchitecture/did-vectors/blob/master/rotation.json) carries 19 acceptance-rule scenarios — a complete
successful rotation, a self-authorized rotation via `prev-sig`, and negatives that MUST be
rejected: threshold not met, guardians naming different `new` keys, the same guardian
counted twice, an endorser not in the set, a guardian set inside its cool-down, a
compromised key installing its own guardians and self-approving, and a superseded guardian
set. [`acceptance.py`](https://github.com/resolvingarchitecture/did-vectors/blob/master/acceptance.py) is a reference implementation of
the rule. Event- and signature-level vectors are in
[`events.json`](https://github.com/resolvingarchitecture/did-vectors/blob/master/events.json).

## Provenance

Extracted from Resolving Architecture's DID technical design (`../DESIGN.md` §4) for
standalone review and for the Nostr key-rotation discussion. Author: Resolving Architecture
— brian@resolvingarchitecture.io, on Nostr `@1M5`
(`npub12gtp4q9360qflrasyzgdhjf2jzrxc7u5q0h5drem9ft9dufujjaq9kdwj8`).

## License

Public domain, via [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)
(full text: [`LICENSE`](LICENSE)). To the extent possible under law, the author has waived
all copyright and related rights in this document, so it can be adopted as a NIP or reused
in any implementation without restriction. The rest of the DID project is public domain too.
