# Strategy — Getting Decentralized Identity Adopted Globally

**Status:** Proposed. Written 2026-09-05.
**Scope:** How self-sovereign identity actually reaches ordinary people, and what a single
architect should do about it. This is a strategy document, not a specification.

Related: [`README.md`](README.md) (what the DID service does today),
[`DESIGN.md`](DESIGN.md) (empty — the technical spec follows from whatever is approved here),
and [`1m5-docs/architecture/ADR-0002-nostr-identities.md`](../1m5/1m5-docs/architecture/ADR-0002-nostr-identities.md)
(the crypto decision this strategy governs).

---

## The premise

ADR-0002 and the `README.md` design direction already answered *what cryptography to use*:
secp256k1, BIP-340 Schnorr, Nostr-compatible signed events. That was the easy question.

Neither document answers the hard one: **why would anyone outside Resolving Architecture
ever use this?**

That question deserves to govern the technical work rather than trail behind it. OpenPGP
had thirty years, impeccable cryptography, and near-zero adoption. W3C DIDs have had a
decade, an enormous standards apparatus, and essentially no consumer footprint. Both were
technically sound. Both lost. Repeating their engineering while hoping for a different
outcome is the failure mode this document exists to prevent.

---

## 1. Why identity keeps failing

### OpenPGP (1991–present)

PGP was not defeated by cryptanalysis. It was defeated by three design choices:

- **Identity was the product.** Nobody wakes up wanting an identity. They want to send a
  message, get paid, or prove they are who they said they were. PGP asked people to care
  about identity as an end in itself.
- **Key management was the user's job.** Keyrings, subkeys, expiry, revocation
  certificates, passphrases, `.asc` files. Every one of these is a place to fail, and
  failure was silent and permanent.
- **The web of trust demanded ceremony with no payoff.** Key signing parties asked people
  to do unpaid work today for a benefit that would materialise only if enough other people
  did the same unpaid work. That is a coordination problem disguised as a protocol.

And it was never a default. It was always bolt-on, always opt-in, always the thing you
configured *after* installing the thing you actually wanted.

### W3C Decentralized Identifiers (2016–present)

The DID working group did serious work, and `did-core` is a genuine achievement. It has
still not reached ordinary humans, for reasons that are strategic rather than technical:

- **Standards-first instead of product-first.** The specification was completed long before
  any consumer product needed it. Specs written ahead of demand get built to satisfy
  reviewers, not users.
- **Fragmentation marketed as choice.** There are well over a hundred registered DID
  methods. `did:web`, `did:key`, `did:ion`, `did:ethr` and the rest do not interoperate at
  the resolution layer in any practical sense. "Pick a method" is the same problem
  "pick a keyserver" was, with better branding.
- **Complexity at the wrong layer.** JSON-LD contexts, Verifiable Credentials, DIDComm,
  presentation exchange. Each is defensible alone. Together they are more surface area than
  a client developer will adopt on a weekend, and weekend adoption is how protocols spread.
- **Funded by pilots, not usage.** An ecosystem sustained by grants and government pilots
  optimises for the next pilot, not the next user.

And the outcome worth sitting with: **the largest deployments of W3C-adjacent digital
identity are now being built by states.** The EU Digital Identity Wallet under eIDAS 2.0 is
the flagship. Whatever its privacy engineering — and it does specify selective disclosure
and local storage — it is an identity system issued by an authority, and its acceptance by
banks, telecoms and large platforms is compulsory rather than chosen. The standard designed
to route around central authorities is being deployed *by* them. That is not a betrayal of
the technology; it is what happens when a technology has no independent adoption path and
the only actors with the patience to deploy it are the ones with statutory power.

### Nostr (2021–present)

Nostr is the first thing in this space that has moved. It is worth being precise about why,
because the reasons are strategic, not cryptographic:

- **The key *is* the identity.** No document, no registry, no resolution step, no method
  selection. A public key is self-certifying. This deletes an entire category of
  infrastructure that DIDs spent a decade building.
- **It shipped a carrier app first.** People joined for a social feed. They received an
  identity as a side effect, and most of them could not tell you what secp256k1 is.
- **The specs are small.** A NIP is typically a page or two. A client developer implements
  one in an afternoon. Compare the time to implement `did-core` plus a method plus a
  resolver plus VC verification.
- **It has an economic rail.** Zaps gave the network a reason to exist for people who did
  not care about censorship in the abstract.

Nostr has orders of magnitude more real-world use than any W3C DID method has achieved.
It is also, honestly, still far from mainstream and still concentrated in one demographic.

---

## 2. Three laws of identity adoption

Everything below follows from these.

**1. Nobody adopts identity. They adopt a carrier app and get identity for free.**
Every identity system that reached scale rode something people already wanted. Facebook
Login rode Facebook. Google Sign-In rode Gmail. WeChat's identity rode messaging and
payments. Aadhaar rode access to benefits. `npub` rode Damus and Primal. There is no
counter-example of an identity system that won on its own merits as identity.

**2. The identity layer must be invisible at onboarding and visible only at recovery.**
The moment a new user is asked to understand a key, you have lost most of them. The one
moment they *must* understand something is when they have lost access and need it back —
and that is precisely the moment every self-custody system currently abandons them.

**3. Adoption follows the smallest implementable spec, not the most complete one.**
The spec that gets implemented is the one a developer can hold in their head. Completeness
is a tax paid by every future implementer. NIPs beat `did-core` on this axis by an order of
magnitude, and that difference explains most of the adoption gap.

---

## 3. Where Nostr is still broken

This is the opportunity, so it is worth being exact. As of September 2026:

**There is no recovery.** Lose the private key and you lose the identity, the social graph,
the follower list, and every attestation anyone ever made about you. There is no reset. For
ordinary people this single fact disqualifies self-custodied identity — not because they are
careless, but because a system with no recovery path is not a reasonable thing to ask a
human to depend on for life.

**There is no rotation.** Key compromise is terminal in the same way key loss is. NIP-26
delegated event signing was proposed as a partial answer and has been largely deprecated and
dropped by clients. Threshold and FROST-style schemes that shard a secret across devices are
promising but remain experimental. The NIPs repo has a graveyard of unmerged proposals —
issue #116 ("key rotation verified through root key attestation", now dormant since 2022),
#103, NIP-41 (#829), #1452, #2137/#2139 — none of which has converged. The practical state
of the art is: post a note from the old key pointing at the new one, and hope your followers
re-follow.

**Verification runs through DNS.** NIP-05, by far the most widely deployed identity
verification in Nostr, resolves a human-readable name via a `.well-known` file on a domain.
That means the trust anchor is a domain registrar and a certificate authority. It is
revocable, seizable, and compellable by exactly the authorities this technology exists to
route around. The most decentralized social protocol in production has a centralized
authority sitting in the middle of its identity layer, and almost nobody says so out loud.

**The web of trust is a follow graph.** Most Nostr trust scoring propagates through NIP-02
follow lists with PageRank-style ranking, sometimes with mutes and reports mixed in.
NIP-85 defines a way to consume third-party trust assertions, and there are independent
efforts at richer trust systems. But a follow is not an attestation: it is cheap, gameable,
and says nothing about *which attribute* of a person you are willing to stand behind.

**The public key is a permanent correlator.** Reusing one key across every context makes
activity correlation trivial. This is a real privacy cost that no amount of encryption fixes.

Read that list again with the first two laws in mind. Nostr solved distribution and
onboarding — the things that killed PGP and DIDs — and left unsolved precisely the thing
that becomes visible at the worst moment (law 2), and the thing whose absence forces users
back to central authorities.

**That gap is the entire opportunity.**

---

## 4. The strategy

> **Stop building an identity system. Build the missing organ of the one identity network
> that is actually growing, and make it impossible to route around.**

A single architect cannot win a standards war and cannot win a consumer app war. Both are
capital-and-headcount games. But one person *can* own one small, load-bearing, missing piece
of a network that already has users — and let other people's applications do the
distribution. That is the only shape of leverage available here, so the strategy is built
entirely around it.

### Move 1 — Adopt, don't invent

**One secp256k1 key that is simultaneously an `npub` and a `did:nostr`.** One key, three
names: raw hex internally, `npub` for humans, `did:` for interoperability.

Critically: **do not register a Resolving Architecture DID method.** A `did:nostr` method
already exists as a community draft, using Schnorr over secp256k1 with Multikey encoding and
resolving DID documents from relay events, and there is at least one JavaScript resolver
implementation. It is a work in progress rather than a ratified standard, which makes it
something to *contribute to*, not compete with.

This move is mostly a subtraction, and that is the point. It deletes: a method
specification, a registration process, a resolver, and years of standards work. It also
settles the W3C question that ADR-0002 left open — the answer is a thin compatibility view
so that RA identities are legible to the DID world, and explicitly **not** a JSON-LD or
Verifiable Credentials stack.

### Move 2 — Solve recovery. This is the wedge.

Specify **guardian-based social recovery and key rotation as signed Nostr events**:

- A **guardian designation** event, signed by the root key, naming N guardians and a
  threshold M. Guardians are ordinary contacts — or a second device, or a service the user
  chooses — identified by their own public keys.
- A **rotation attestation**, in which M-of-N guardians co-sign a binding from the old
  public key to a new one, with a reason and a timestamp.
- Clients follow that chain. When the threshold is met, the social graph migrates: follows,
  contact entries, and prior attestations carry across to the new key.

This works as a purely social scheme with no new infrastructure — no shard custody, no
server, no relay changes. It hardens later with threshold signatures for people who want
that, but it must not *require* them, because requiring them is what has kept every previous
attempt experimental.

It aims squarely at an acknowledged open problem (the #116 / #103 / NIP-41 cluster) rather
than inventing a need.
And it converts the scariest property of self-custody into the warmest one:

> **Your friends are your recovery.**

That sentence is the whole pitch, and it is comprehensible to someone who has never heard
the word "cryptography."

### Move 3 — Replace NIP-05 with attestations. This is the mission.

NIP-05 currently means: *a domain vouches for this key*. The replacement is:
**N people you already trust vouch for this key.** No registrar, no certificate authority,
nothing to seize or compel.

This is the `vouch` operation that has been specified in this repository for a decade and
implemented in none of the three codebases that declare it. It is also, not coincidentally,
the primitive that Move 2 depends on — recovery attestations and identity attestations are
the same object with different semantics.

Two design requirements decide whether it spreads:

- **Trust must accrue passively.** PGP failed because it demanded a ceremony. An attestation
  should be a byproduct of something the user was already doing: you meet someone, you scan
  their code, the app asks "confirm this is really them?", and an attestation is emitted.
  Remnant already has the QR contact-exchange flow (`DCard`) this hangs off.
- **Trust must be queryable and immediately useful.** "Three people you trust vouch for this
  key" is an anti-impersonation and anti-scam feature. That is a *felt daily pain* on Nostr
  right now, which is what gives the attestation layer a reason to be adopted by people who
  do not care about self-sovereign identity as a philosophy.

The strategic point: the mission (no central authority in identity) and the product benefit
(you stop getting scammed by fake accounts) are the same feature. When those two align, you
do not have to persuade anyone of the ideology.

### Move 4 — Be the library, not the app

Ship **tiny, public-domain (CC0), zero-dependency reference implementations with test
vectors.** Whoever is easiest to adopt wins infrastructure. A protocol with a good spec and
no drop-in library gets read and ignored — and a library with a licence to comply with is
one more reason to reimplement instead of adopt.

**Ship TypeScript first.** This is a deliberate break from Resolving Architecture's
Java-first habit, and it should be made with eyes open: the Nostr client ecosystem is
overwhelmingly TypeScript, and adoption means meeting an ecosystem where it is rather than
where you are. Rust and Java follow, for RA's own stack.

The multi-language sibling pattern already used across this monorepo is exactly the right
vehicle — the value is one specification with several small faithful implementations, which
is what made the service-bus ports cheap.

### Move 5 — Ride the eIDAS wave with a counter-narrative

Timing is the one advantage available for free. Under eIDAS 2.0, every EU member state must
make a digital identity wallet available by **the end of December 2026**, and by late 2027
banks, telecoms and large online platforms must **accept** it. Other jurisdictions are
moving on age verification and digital ID on similar timelines.

The effect, regardless of one's view of the policy, is that "digital identity" becomes a
mainstream topic of conversation for hundreds of millions of people within roughly a year —
and a meaningful fraction of them will be uneasy about it. Historically this space has had
the opposite problem: a solution nobody was asking about.

So publish now, and be the credible technical alternative that is already shipping when the
wave breaks. The message writes itself:

> **They are building you an identity. You already have one — a key you hold, and people
> who vouch for you.**

Be careful to argue this on the merits rather than on alarm. The strongest version is not
"they are coming for you"; it is "here is a system with the same properties they promise —
selective disclosure, user control — that additionally cannot be revoked by whoever issued
it, because nobody issued it."

---

## 5. Anti-goals

For one person, what you refuse matters more than what you attempt. Each of these is a trap
that has consumed multi-year efforts:

- **No Resolving Architecture DID method.** Contribute to `did:nostr` instead. (Move 1.)
- **No JSON-LD, no Verifiable Credentials, no DIDComm.** This is where DID adoption went to
  die. A thin DID-document compatibility view is the entire W3C commitment.
- **No new relay network and no new protocol.** The whole strategy is to ride existing
  distribution. Bootstrapping a network is the thing a single architect cannot do.
- **No fork of Nostr and no attempt to replace it.** If Nostr wins, this strategy wins.
- **No standalone identity app as the primary bet.** Remnant is a carrier and a proof, not
  the distribution plan. (Per the §9 update, Remnant *is* the first live client — but
  `did-ts` stays the thing third parties adopt.)
- **No paywall, no token, no protocol monetisation.** Adoption is the objective. A revenue
  model attached to the protocol layer would poison the well and slow implementer uptake.
  Consulting and the product suite remain how the lights stay on.
- **No OpenPGP → Nostr migration.** 1M5 was never marketed or deployed, so no OpenPGP
  identities exist to migrate. New identities are Nostr from the start; `did-java` keeps the
  OpenPGP keyring only as a self-contained crypto subsystem, not an identity path.

---

## 6. Sequencing for one architect

Deliberately ordered cheapest-and-highest-leverage first, so that the effort produces
something useful even if it stalls at any phase.

**Phase 0 — Write the specs (weeks, not months).**
Two documents: social recovery and rotation; attestations as a NIP-05 replacement. Publish
as drafts, take them to the existing rotation threads (#116 is dormant — engage #829, #1452,
#1450 and the `nostr-protocol/nips` PR queue) and to the community group working on
`did:nostr`. Specs recruit implementers, cost only writing time, and are the one artifact
whose value does not depend on RA having capacity to build everything.

**Phase 1 — TypeScript reference library plus test vectors (1–2 months).**
Small, dependency-light, public domain (CC0). Test vectors matter as much as the code: they
are what let a second implementer prove compatibility without talking to you.

**Phase 2 — First live client (see the §9 update).**
One real client using guardian recovery makes the spec real and gives every subsequent
conversation a reference. This is the phase where the strategy either takes or does not, and
it is worth disproportionate effort here rather than more code. The client is `1m5-android`:
`did-java` refactored onto the same drafts and passing the same `did-vectors` as `did-ts`
(RA's second independent implementation), wired through `1m5-core`'s `IdentityService`
(replacing the placeholder), with the existing `DCard` QR flow as the attestation capture
point. Then Nostr becomes a 1M5 transport route alongside I2P and Tor.

**Phase 3 — Broaden.**
The `did-rust` and `did-python` ports (**done** — both green on `did-vectors`, cross-verified
against rust-nostr and pynostr; four independent implementations now exist) and
`1m5-core-rust`. A genuine non-RA client — still the goal, and the metric that counts in §7.
The NIP PR, once `did-ts` + `did-java` are both green on `did-vectors` and Remnant is shipping.

**Phase 4 — Narrative.**
The essays, the counter-positioning against the eIDAS rollout, and active recruitment of
implementers. Ongoing rather than a phase with an end.

---

## 7. What to measure

Adoption metrics, not vanity metrics:

- **Independent implementations of the spec** (by people who are not Brian).
- **Clients shipping it** — the single most important number.
- **Attestation events observable on public relays.**
- **Recoveries actually completed by real users.** This is the one that proves the thesis;
  everything else is a leading indicator of it.

Explicitly *not* the measures to steer by: Resolving Architecture GitHub stars, Remnant
daily actives, or the size of the `did-java` codebase. Those measure RA, and RA is not what
needs to grow for this strategy to succeed.

---

## 8. Honest risks

- **Nostr may plateau as a Bitcoiner subculture.** Mitigation: keep the signed events
  transport-agnostic, as ADR-0002 already requires and as 1M5's router already assumes. The
  primitives then outlive the network they launched on.
- **A large client may ship a competing recovery scheme.** This would be a *win* for the
  mission and a loss only for RA's authorship. The correct response is to contribute to
  theirs, not to compete. Strategy documents should say this out loud in advance, because in
  the moment it will not feel that way.
- **Social recovery has real attack surface.** Guardian collusion, coercion of guardians,
  social engineering of the threshold, and guardians who are themselves compromised. This
  must be threat-modeled honestly and never oversold. A recovery scheme that is marketed as
  safer than it is will do more damage than no recovery scheme at all.
- **Key correlation and metadata are not solved by any of this.** Attestations arguably make
  correlation *worse* by publishing a trust graph. Scoped and contextual identities need to
  be part of the design, not an afterthought.
- **Capacity is the binding constraint.** One person cannot carry two specifications, four
  language ports, a consumer application, and a consulting practice. The sequencing above is
  ruthless on purpose. Even with the §9 decision to make Remnant the first client, the
  `did-rust` port, `did-python`, and a non-RA client stay in Phase 3 — the critical path to
  the first proof is `did-ts` → `did-java` → `1m5-android`, nothing wider. (The `did-rust` and
  `did-python` ports were done once that path was clear — cheap because they are direct ports
  of `did-ts` against the shared vectors — but `1m5-core-rust` and a non-RA client remain
  Phase 3.)

---

## 9. The tension this creates

This strategy says the highest-leverage work available is **not** Remnant, and **not**
`did-java`. It is a specification and a TypeScript library for someone else's network.

That conflicts with two things currently written down:

- `1m5-android/TODO.md` defers identity modernization until the app shows revenue traction
  (roughly 1M sats/week). Under this strategy, the identity work stops waiting on Remnant —
  it moves ahead of it, and Remnant becomes a consumer of the result rather than the reason
  for it.
- Resolving Architecture's tooling and expertise are Java-and-Rust-first. Move 4 says the
  first implementation should be TypeScript, because that is where the client developers who
  would adopt it actually work.

Both are real costs. The case for paying them: `did-java` has existed since 2013 and `vouch`
has been a stub the entire time; three separate codebases now declare a web of trust that
none of them implement. Continuing to build identity infrastructure that only RA uses is the
path that has already been tested for over a decade. The alternative is to spend the next
few weeks writing two short documents that anyone in the world can implement, and find out
whether anyone does.

That is the decision this document is asking for.

### Update 2026-09-06 — decision

Made, with a modification. The spec-first / library-first thrust holds: `did-ts` is the
public, CC0, dependency-light offer, and it goes first. The drafts are published (on Nostr,
as long-form) and `did-vectors` — events, rotation-acceptance scenarios, a reference
implementation of the §4.3 rule — is a public repo.

What changed: **`1m5-android` is the first live client, not a third party.** The reason is
in §1 and confirmed by a September 2026 survey of the NIPs repo — key rotation is a
graveyard of dead threads (#116 dormant since 2022, NIP-41 / #1452 / #103 / #2137 all
unmerged, activity gone by 2024). Waiting for an outside client to adopt an unmerged NIP
before RA ships its own could mean waiting indefinitely. So RA ships the proof: `did-java`
refactored onto the same drafts and passing the same `did-vectors` as `did-ts` (two
independent implementations), then Remnant runs it, then Nostr becomes 1M5 transport route
#3 alongside I2P and Tor.

This does **not** make Remnant the distribution plan (§5 anti-goal stands). `did-ts` is what
third parties adopt; Remnant is what proves it works, and the reference to point people at.
A genuine non-RA client is still the goal — it is Phase 3 in `TODO.md`, and the number that
matters in §7 is still the *second* client. The `1m5-android/TODO.md` revenue-gate on
identity work is superseded: identity leads now.

---

## 10. Decision 2026-09-08 — `1m5-desktop-java` is not a Nostr client

**Question raised:** now that Nostr identity is landing in `1m5-android` via `did-java`,
should `1m5-desktop-java` be refactored into a full Nostr client?

**Decision: no.** A full Nostr client (feeds, relay curation, zaps, NIP-17 DMs, note
browsing) is rejected for the desktop app — now and as a long-term goal. Reasons, all
already in this document:

- **§5 anti-goals.** "No standalone identity app as the primary bet" and "no attempt to
  replace Nostr." The ecosystem has hundreds of clients; another one is not leverage. The
  leverage is the two missing organs (Move 2 recovery, Move 3 attestations) and `did-ts` as
  the drop-in library.
- **§8 capacity.** The critical path is deliberately narrow — `did-ts` → `did-java` →
  `1m5-android`. Desktop is not on it. Refactor cycles spent there are spent off the path
  where the strategy takes or does not.
- **§6 sequencing.** Desktop is Phase 3 "broaden" at the earliest.

**What desktop may become instead, in Phase 3+:** two narrow roles that serve Moves 2–3
directly, not a client —

1. **Recovery-guardian device.** The desktop is the natural "second device / trusted
   machine" in an M-of-N guardian set, co-signing rotation attestations.
2. **Attestation console.** Reviewing vouches, issuing them from the contact/QR flow,
   inspecting the trust graph — work that suits a large screen better than a phone.

Both are cheap because the plumbing (Nostr keys, event signing, rotation-chain following,
attestation verification) arrives through `did-java` inside `1m5-core`, which desktop
already consumes over the localhost JSON-RPC API (ADR-0003). Only the guardian and
attestation UI slices are desktop-specific.

**Trigger to revisit:** `did-ts` and `did-java` both green on `did-vectors`, and
`1m5-android` shipping guardian recovery to real users (Phase 2 complete). Until then,
desktop stays frozen on identity work.

---

## Appendix — external claims and their basis

Claims about the state of the Nostr and DID ecosystems were checked in September 2026 and
should be re-verified before anything here is published externally, since several concern
drafts and open discussions that move:

| Claim                                                                                        | Basis                                                                                                | Confidence          |
|----------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------|---------------------|
| `did:nostr` exists as a community draft with a JS resolver                                   | `nostrcg.github.io/did-nostr`, `melvincarvalho.github.io/did-nostr`, `block-core/nostr-did-resolver` | Draft, not ratified |
| NIP-26 delegated signing largely deprecated / dropped by clients                             | Widely reported in Nostr key-management writeups                                                     | High                |
| Key rotation still unsolved; #116 dormant, many rival unmerged proposals                     | `nostr-protocol/nips` #116 (2022), #103, #829, #1452, #2137/#2139, #1450                             | High                |
| FROST / threshold schemes experimental as of 2026                                            | Nostr key-management surveys                                                                         | Medium              |
| NIP-05 is DNS/`.well-known` based                                                            | NIP-05 itself                                                                                        | Certain             |
| NIP-85 "Trusted Assertions" exists                                                           | `nostr-protocol/nips`                                                                                | High                |
| Nostr WoT is mostly NIP-02 follow-graph + PageRank                                           | Nostr WoT tooling and writeups                                                                       | High                |
| Over 100 registered W3C DID methods                                                          | W3C DID Spec Registries                                                                              | High                |
| EUDI wallets required of member states by end of 2026; acceptance obligations from late 2027 | eIDAS 2.0 regulation summaries                                                                       | High                |

No user or key-count statistics for Nostr are cited anywhere in this document, deliberately —
the public numbers vary by an order of magnitude depending on what is being counted, and the
argument does not need them.
