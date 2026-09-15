// Publish the DID drafts as Nostr long-form articles (NIP-23, kind 30023),
// straight to a curated relay set. Bypasses flaky web clients (Coracle etc.).
//
//   NP="$(npm root -g):$(npm root -g)/nostr-tools/node_modules"
//   NODE_PATH="$NP" NOSTR_BUNKER='bunker://...' node did/scripts/publish-drafts.cjs [options]
//   # or, less safe (raw key in env — run in your own terminal only):
//   NODE_PATH="$NP" NOSTR_NSEC=nsec1... node did/scripts/publish-drafts.cjs [options]
//
// Options:
//   --dry-run            build + print the events, publish nothing
//   --only <slug>        just one doc: 'attestations' or 'social-recovery'
//   --relay wss://...    replace the default article relay set (repeatable)
//   VECTORS_URL=<url>    repo for the test-vector links
//                        (default: https://github.com/resolvingarchitecture/did-vectors)
//
// The spec (DESIGN.md / STRATEGY.md) is not public, so links to it are dropped
// from the published text; the drafts stand alone.
//
// Idempotent: kind 30023 is addressable on the `d` tag, so re-running after a
// partial failure just replaces the article on each relay.

const { readFileSync, writeFileSync, mkdirSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const { homedir } = require('node:os');
const {
  finalizeEvent, getPublicKey, generateSecretKey, nip19, SimplePool,
} = require('nostr-tools');
const { parseBunkerInput, BunkerSigner } = require('nostr-tools/nip46');

const DRAFTS = join(__dirname, '..', 'drafts');
const VECTORS_URL = process.env.VECTORS_URL || 'https://github.com/resolvingarchitecture/did-vectors';
const DRY = process.argv.includes('--dry-run');
const ONLY = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
const PUBLISH_TIMEOUT_MS = 12_000;
const CONNECT_TIMEOUT_MS = 120_000;
const EXPECT_HEX = '52161a80b1d3c09f8fb02090dbc92a90866c7b9403ef468f3b2a5656f13c94ba'; // @1M5

const relayArgs = process.argv.flatMap((a, i) => (a === '--relay' ? [process.argv[i + 1]] : []));
const RELAYS = relayArgs.length ? relayArgs : [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://nostr.mom',
  'wss://offchain.pub',
  'wss://relay.highlighter.com', // long-form's home relay
  'wss://purplerelay.com',
];

const DOCS = [
  {
    slug: 'attestations', file: 'attestations.md', d: 'did-identity-attestations',
    title: 'Identity Attestations: a decentralized replacement for NIP-05',
    summary:
      'A signed, method-tagged record in which one identity vouches for attributes of another — '
      + 'instead of a DNS domain vouching via NIP-05. Draft for a NIP; feedback wanted.',
    hashtags: ['nostr', 'nips', 'identity', 'nip05', 'weboftrust'],
  },
  {
    slug: 'social-recovery', file: 'social-recovery.md', d: 'did-social-recovery-key-rotation',
    title: 'Social Recovery and Key Rotation for Nostr',
    summary:
      'Guardian-based social recovery and key rotation as signed Nostr events: M-of-N guardians '
      + 'co-sign a move to a new key. No sharding, no custody, no relay changes. Draft toward the '
      + '#116 / NIP-41 discussion.',
    hashtags: ['nostr', 'nips', 'identity', 'keyrotation', 'recovery'],
  },
].filter((doc) => !ONLY || doc.slug === ONLY);

if (!DOCS.length) {
  console.error("--only: unknown slug. Use 'attestations' or 'social-recovery'.");
  process.exit(1);
}

// ---- signer: NIP-46 bunker (preferred) or raw nsec --------------------------
async function getSigner() {
  const bunker = process.env.NOSTR_BUNKER
    || (process.argv.includes('--bunker') ? process.argv[process.argv.indexOf('--bunker') + 1] : null);
  if (bunker) {
    const bp = await parseBunkerInput(bunker);
    if (!bp || !bp.relays?.length) throw new Error('could not parse NOSTR_BUNKER');
    // stable client key -> approve the connection once, not every run
    const keyPath = join(homedir(), '.config', 'ra-did', 'nip46-client.key');
    let clientSk;
    if (existsSync(keyPath)) {
      clientSk = Uint8Array.from(Buffer.from(readFileSync(keyPath, 'utf8').trim(), 'hex'));
    } else {
      clientSk = generateSecretKey();
      mkdirSync(join(homedir(), '.config', 'ra-did'), { recursive: true });
      writeFileSync(keyPath, Buffer.from(clientSk).toString('hex'), { mode: 0o600 });
    }
    const signer = BunkerSigner.fromBunker(clientSk, bp, {
      onauth: (url) => {
        console.log('\n' + '='.repeat(70));
        console.log('  APPROVE THIS CONNECTION IN YOUR SIGNER:');
        console.log('  ' + url);
        console.log('='.repeat(70) + '\n  (waiting…)\n');
      },
    });
    try {
      await Promise.race([
        signer.connect(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('bunker connect timed out')), CONNECT_TIMEOUT_MS)),
      ]);
    } catch (e) {
      const msg = String(e && e.message ? e.message : e);
      if (/already connected/i.test(msg)) console.log('  (signer: already connected — reusing session)');
      else throw e;
    }
    const pubkey = await Promise.race([
      signer.getPublicKey(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('get_public_key timed out')), CONNECT_TIMEOUT_MS)),
    ]);
    return {
      pubkey,
      sign: (tmpl) => signer.signEvent(tmpl),
      close: () => signer.close(),
      kind: 'bunker',
    };
  }

  const nsecIn = process.env.NOSTR_NSEC;
  if (!nsecIn) {
    console.error('Set NOSTR_BUNKER (bunker://…) or NOSTR_NSEC. Run in your own terminal.');
    process.exit(1);
  }
  let sk;
  try {
    sk = nsecIn.startsWith('nsec') ? nip19.decode(nsecIn).data : Uint8Array.from(Buffer.from(nsecIn.trim(), 'hex'));
    if (sk.length !== 32) throw new Error('key is not 32 bytes');
  } catch (e) {
    console.error('bad NOSTR_NSEC:', e.message);
    process.exit(1);
  }
  return {
    pubkey: getPublicKey(sk),
    sign: (tmpl) => finalizeEvent(tmpl, sk),
    close: () => {},
    kind: 'nsec',
  };
}

(async () => {
  const signer = await getSigner();
  const pk = signer.pubkey;
  console.log(`signer: ${signer.kind}   author: ${nip19.npubEncode(pk)}`);
  if (pk !== EXPECT_HEX) {
    console.log(`  NOTE: this is not the expected @1M5 key (${EXPECT_HEX.slice(0, 12)}…). Continuing anyway.`);
  }

  const now = Math.floor(Date.now() / 1000);
  const naddr = Object.fromEntries(
    [
      ['attestations.md', 'did-identity-attestations'],
      ['social-recovery.md', 'did-social-recovery-key-rotation'],
    ].map(([file, id]) => [
      file,
      nip19.naddrEncode({ identifier: id, pubkey: pk, kind: 30023, relays: RELAYS.slice(0, 3) }),
    ]),
  );

  const rewrite = (md) => md
    .replace(/\]\(attestations\.md\)/g, `](nostr:${naddr['attestations.md']})`)
    .replace(/\]\(social-recovery\.md\)/g, `](nostr:${naddr['social-recovery.md']})`)
    .replace(/\]\(LICENSE\)/g, '](https://creativecommons.org/publicdomain/zero/1.0/legalcode)')
    .replace(/\]\(\.\.\/vectors\/acceptance\.py\)/g, `](${VECTORS_URL}/blob/master/acceptance.py)`)
    .replace(/\]\(\.\.\/vectors\/\)/g, `](${VECTORS_URL})`)
    .replace(/\(`\.\.\/DESIGN\.md`\s*(§[^)]*)\)/g, '($1)') // "(`../DESIGN.md` §4)" -> "(§4)"
    .replace(/`\.\.\/(DESIGN|STRATEGY)\.md`/g, 'the DID $1 document');

  const events = [];
  for (const doc of DOCS) {
    const raw = readFileSync(join(DRAFTS, doc.file), 'utf8');
    const content = `> Test vectors and reference code: ${VECTORS_URL}\n\n` + rewrite(raw);
    const tmpl = {
      kind: 30023, created_at: now, pubkey: pk,
      tags: [
        ['d', doc.d], ['title', doc.title], ['summary', doc.summary],
        ['published_at', String(now)], ...doc.hashtags.map((h) => ['t', h]),
      ],
      content,
    };
    const ev = await signer.sign(tmpl);
    events.push({ doc, ev });
    const na = naddr[doc.file];
    console.log(`\n=== ${doc.title} ===`);
    console.log(`  kind 30023   id ${ev.id}   ${ev.content.length} chars`);
    console.log(`  naddr  ${na}`);
    console.log(`  read   https://njump.me/${na}`);
  }

  if (DRY) {
    console.log('\n--dry-run: nothing published.');
    signer.close();
    process.exit(0);
  }

  const pool = new SimplePool();
  let anyFail = false;
  for (const { doc, ev } of events) {
    console.log(`\npublishing "${doc.title}" to ${RELAYS.length} relays…`);
    const settled = await Promise.all(
      pool.publish(RELAYS, ev).map((p, j) => Promise.race([
        p.then(() => 'OK', (e) => 'FAIL ' + String(e && e.message ? e.message : e).replace(/\s+/g, ' ').slice(0, 90)),
        new Promise((r) => setTimeout(() => r('TIMEOUT'), PUBLISH_TIMEOUT_MS)),
      ]).then((s) => [RELAYS[j], s])),
    );
    settled.forEach(([u, s]) => console.log(`  ${s.padEnd(14)} ${u}`));
    const ok = settled.filter(([, s]) => s === 'OK').length;
    if (!ok) anyFail = true;
    console.log(`  -> ${ok}/${RELAYS.length} accepted${ok ? '' : '   *** NOT PUBLISHED ***'}`);
  }
  pool.close(RELAYS);
  signer.close();
  console.log(
    '\nDone. One accepting relay is enough to propagate and to resolve in njump / Highlighter / Habla.\n'
    + 'Re-run any time to update (same `d` tag = replace).',
  );
  process.exit(anyFail ? 1 : 0);
})().catch((e) => {
  console.error('\nerror:', e.message || e);
  process.exit(1);
});
