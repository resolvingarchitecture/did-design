Identity Attestations
=====================

`draft` `optional`

This document defines **identity attestations**: signed, typed, method-tagged statements in
which one identity vouches for one or more attributes of another. It is a decentralized
alternative to [NIP-05](https://github.com/nostr-protocol/nips/blob/master/05.md)
verification. Instead of *a DNS domain vouches for this key*, an attestation says *this
person vouches for this key, and here is how they checked*.

Trust evaluation — how many attestations, weighted how, to what depth — is explicitly left
to clients. This document defines only the attestation record.

## Motivation

[NIP-05](https://github.com/nostr-protocol/nips/blob/master/05.md) is the most widely
deployed identity verification in Nostr. It resolves a human-readable name to a pubkey via a
`.well-known/nostr.json` file on a domain. The trust anchor is therefore a domain registrar
and a certificate authority: the binding can be revoked, seized, or compelled by parties
outside the protocol, and it lapses if the operator stops paying for the domain.

Follow lists ([NIP-02](https://github.com/nostr-protocol/nips/blob/master/02.md)) are
sometimes read as a trust signal, but a follow is cheap, easily automated, and says nothing
about *which* attribute of a person the follower stands behind, or whether they checked
anything at all.

What is missing is a first-class record for "I, holding this key, assert that key `X` has
attribute `Y`, and I verified it by method `Z`." With that record:

- Anti-impersonation becomes a query: *do people I trust vouch for this key, and has anyone
  flagged it as an impersonator?* That is a concrete, daily need on Nostr today.
- Verification becomes portable and independently checkable, with no infrastructure to seize.
- Key-rotation continuity (see [Social Recovery and Key Rotation](social-recovery.md)) is the
  same record with a `same-as` claim.

## Conventions

- Events are standard Nostr events
  ([NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md)); signatures are
  BIP-340 Schnorr over secp256k1 x-only public keys.
- All pubkeys in tag values are 64-character lowercase hex.
- Signature preimages follow NIP-01 exactly. Implementations MUST escape only `"`, `\`,
  `\n`, `\r`, `\t`, `\b`, and `\f` in the serialized `content` string and MUST NOT escape
  any other character — in particular no `\/`, and no `\u` escaping of characters that do
  not require it. NIP-01 already implies this; it is called out here because it is a
  frequent source of cross-implementation signature mismatch.

## Identity Attestation event

**Kind `30100`** — addressable
([NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md)). The kind number is
provisional; see [Kind numbers](#kind-numbers).

Signed by the **attester**. Addressable on the subject's pubkey, so each attester holds
exactly one current attestation per subject; re-issuing replaces it.

| tag                                   | required  | meaning                                                                                                                  |
|---------------------------------------|-----------|--------------------------------------------------------------------------------------------------------------------------|
| `["d", "<subject-pubkey>"]`           | yes       | Addressable identifier: the pubkey being vouched for.                                                                    |
| `["p", "<subject-pubkey>"]`           | yes       | Same value; lets relays and clients index by subject.                                                                    |
| `["claim", "<attribute>", "<value>"]` | ≥1        | An attested attribute. Repeatable.                                                                                       |
| `["method", "<method>"]`              | yes       | How the attester verified. See [Methods](#methods).                                                                      |
| `["expiration", "<unix-seconds>"]`    | no        | After this time the attestation is stale ([NIP-40](https://github.com/nostr-protocol/nips/blob/master/40.md) semantics). |

`content` SHOULD be empty. Free text invites unparseable claims; claims belong in `claim`
tags.

```jsonc
{
  "kind": 30100,
  "pubkey": "<attester-pubkey>",
  "created_at": 1757030400,
  "tags": [
    ["d", "<subject-pubkey>"],
    ["p", "<subject-pubkey>"],
    ["claim", "name", "alice"],
    ["claim", "nip05", "alice@example.com"],
    ["method", "in-person"]
  ],
  "content": "",
  "id": "...",
  "sig": "..."
}
```

### Methods

The `method` value records *how* the attester knows. A client MUST surface it: three
`asserted` attestations are not equivalent to three `in-person` ones, and a UI that hides
the difference misleads the user.

| method              | meaning                                                                                        |
|---------------------|------------------------------------------------------------------------------------------------|
| `in-person`         | Key compared face to face — QR scan or fingerprint comparison, in person.                      |
| `qr`                | Scanned the subject's code, not necessarily in person.                                         |
| `existing-channel`  | Confirmed over a channel already trusted (an existing conversation on another platform).       |
| `guardian`          | Issued as part of a key rotation — see [Social Recovery and Key Rotation](social-recovery.md). |
| `asserted`          | Asserted with no verification ceremony. Weakest.                                               |

Implementations MAY define additional methods. An unknown method MUST be treated as no
stronger than `asserted`.

### Claim attributes

`claim` attributes are open. These are reserved with defined meaning:

| attribute  | value                                                                                                                            |
|------------|----------------------------------------------------------------------------------------------------------------------------------|
| `name`     | A human name the attester asserts this key uses.                                                                                 |
| `same-as`  | Another pubkey the attester asserts belongs to the same person (rotation or multi-device continuity).                            |
| `nip05`    | A [NIP-05](https://github.com/nostr-protocol/nips/blob/master/05.md) identifier the attester has confirmed resolves to this key. |
| `not`      | An impersonation warning: this key claims to be the named identity (the value) and is not.                                       |

`not` is the negative case and is deliberately first-class. It is what makes a trust query
useful at the moment someone is being scammed.

### Revocation

An attester revokes by **replacing** the addressable event with one that carries
`["revoked", "<reason>"]` and no `claim` tags, or by issuing a
[NIP-09](https://github.com/nostr-protocol/nips/blob/master/09.md) deletion. Verifiers MUST
treat a *missing* attestation and a *revoked* attestation differently: a revocation is
itself a signal.

## Client behavior

### Trust queries

This document does not define a trust-scoring algorithm; that is a client concern. It
defines the input — a set of signed, typed, method-tagged attestations. A client SHOULD be
able to answer:

> Of the identities I have attested, or that my attested identities have attested, how many
> vouch for this key, by what method, and has any of them issued a `not`?

- Query depth SHOULD be limited; 1–2 hops is enough to be useful and cheap.
- A client MUST NOT present a numeric score as though it were identity verification.
- A client MUST surface the `method` distribution, not just a count.

### Passive capture

Attestations spread only if producing one is a byproduct of something the user was already
doing. A client SHOULD emit an attestation opportunistically — for example, after a QR
contact exchange, prompt "confirm this is really them?" and, on confirmation, publish a kind
`30100` with `method` `qr` or `in-person`. Requiring a dedicated attestation ceremony
repeats the failure of PGP key-signing parties.

## Security considerations

- **The attestation graph is public.** Publishing who vouches for whom exposes a slice of
  the social graph and makes cross-context correlation of a pubkey easier. Clients SHOULD
  support multiple unlinked identities per person and SHOULD NOT encourage one key across
  all contexts.
- **`asserted` is close to worthless on its own** and is trivially sybil-able. Weight by the
  trust of the attester, never by raw count.
- **Negative attestations can be weaponized.** A `not` from an untrusted key is noise. A
  client MUST apply the same trust weighting to `not` as to positive claims and SHOULD NOT
  surface unweighted `not` claims prominently.
- **Method is self-reported.** It records the attester's claim about their process, not a
  proof of it. Its value is that it lets a reader discount accordingly.

## Relationship to other NIPs

- **[NIP-05](https://github.com/nostr-protocol/nips/blob/master/05.md)** — this is the
  decentralized replacement. The two coexist: a `claim` of type `nip05` lets an attester
  confirm a NIP-05 binding without the reader trusting the domain directly.
- **[NIP-02](https://github.com/nostr-protocol/nips/blob/master/02.md)** — a follow is not
  an attestation; follow-list semantics are unchanged.
- **NIP-85 (Trusted Assertions, kinds 30382–30384)** — complementary. NIP-85 distributes
  *computed* trust scores; this document distributes the *raw* attestations a scorer
  consumes. The kind ranges do not overlap.
- **[NIP-39](https://github.com/nostr-protocol/nips/blob/master/39.md)** — external-identity
  claims are a different, self-asserted assertion and are unaffected.

## Relationship to existing proposals

Several open proposals touch this area. This draft is the more general primitive under them.

- **"Orange Check" / decentralized social verification**
  ([#1851](https://github.com/nostr-protocol/nips/issues/1851)) — same web-of-trust spirit,
  but a single binary "verified human" signal, anchored by an on-chain Bitcoin transaction
  to a Taproot address derived from the npub. An attestation with `["claim","name",…]` and
  `["method","in-person"]` carries the same meaning without requiring a transaction; "this
  is a real person" is one case of the general form.
- **"Trusted pubkey sets"**
  ([#1039](https://github.com/nostr-protocol/nips/issues/1039)) — flat lists of pubkeys a
  user trusts. An attestation is that idea made per-attribute and method-tagged, so a reader
  can see *what* was vouched for and *how* it was checked, not just *that* it was.
- **NIP-102 Subkey Attestation**
  ([#1450](https://github.com/nostr-protocol/nips/pull/1450)) — a key disavowing its own
  subkeys. That is a self-assertion about delegation; this is a third-party assertion about
  another identity. Different relationship, different purpose.

## Kind numbers

`30100` is **provisional**. It sits in a region of the addressable range (30000–39999) that
appeared unassigned at the time of writing and deliberately avoids NIP-85's 30382–30384. It
MUST be reconciled with the kinds registry before this document is finalized.
Implementations SHOULD keep it in a single constant.

## Test vectors

A shared vector file accompanies this document: valid attestations of each method, an
attestation with multiple `claim` tags, a `not` attestation, a revocation, and mutated
events that MUST fail validation. See [`did-vectors`](https://github.com/resolvingarchitecture/did-vectors) (`events.json` covers the event/signature layer; rotation-acceptance vectors are tracked separately).

## Provenance

Extracted from Resolving Architecture's DID technical design (`../DESIGN.md` §2–§3) for
standalone review. Author: Resolving Architecture — brian@resolvingarchitecture.io, on
Nostr `@1M5`
(`npub12gtp4q9360qflrasyzgdhjf2jzrxc7u5q0h5drem9ft9dufujjaq9kdwj8`).

## License

Public domain, via [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)
(full text: [`LICENSE`](LICENSE)). To the extent possible under law, the author has waived
all copyright and related rights in this document, so it can be adopted as a NIP or reused
in any implementation without restriction. The rest of the DID project is public domain too.
