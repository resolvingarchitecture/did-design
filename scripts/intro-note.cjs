// Post the intro note (kind 1) announcing the two DID drafts, linking both by
// naddr and mentioning people active in Nostr identity / web-of-trust.
//
//   NP="$(npm root -g):$(npm root -g)/nostr-tools/node_modules"
//   NODE_PATH="$NP" NOSTR_BUNKER='bunker://…' node did/scripts/intro-note.cjs [--dry-run]
//
// Signs via the same NIP-46 bunker as publish-drafts.cjs (cached client key).

const { readFileSync, writeFileSync, mkdirSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const { homedir } = require('node:os');
const { getPublicKey, generateSecretKey, finalizeEvent, nip19, SimplePool } = require('nostr-tools');
const { parseBunkerInput, BunkerSigner } = require('nostr-tools/nip46');

const DRY = process.argv.includes('--dry-run');
const AUTHOR_HEX = '52161a80b1d3c09f8fb02090dbc92a90866c7b9403ef468f3b2a5656f13c94ba'; // @1M5
const PUBLISH_TIMEOUT_MS = 12_000;
const CONNECT_TIMEOUT_MS = 120_000;

// note relays: dropped relay.highlighter.com (NIP-29 group relay, wants an `h` tag)
// and offchain.pub (WoT-gated). nos.lol / nostr.mom bounce notes with many mentions
// as spam ("not acceptable (8)") — keep only if you trim the mention list.
const RELAYS = [
  'wss://relay.damus.io', 'wss://relay.primal.net', 'wss://purplerelay.com',
  'wss://nos.lol', 'wss://nostr.mom',
];

const ARTICLES = {
  social: '30023:' + AUTHOR_HEX + ':did-social-recovery-key-rotation',
  attest: '30023:' + AUTHOR_HEX + ':did-identity-attestations',
};

// verified 2026-09-06 against each account's kind-0 profile
const MENTION = {
  vitor: 'npub1gcxzte5zlkncx26j68ez60fzkvtkm9e0vrwdcvsjakxf9mu9qewqlfnj5z',    // VitorPamplona / Amethyst
  mike: 'npub1acg6thl5psv62405rljzkj8spesceyfz2c32udakc2ak0dmvfeyse9p35c',     // Mike Dilger / Gossip
  fiatjaf: 'npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6',  // fiatjaf
  hodlbod: 'npub1jlrs53pkdfjnts29kveljul2sm0actt6n8dxrrzqcersttvcuv3qdjynqn',  // hodlbod / Coracle
  jeffg: 'npub1zuuajd7u3sx8xu92yav9jwxpr839cs0kc3q6t56vd5u9q033xmhsk6c2uc',    // jeffg / erskingardner
};

function naddr(a) {
  const [kind, pubkey, identifier] = a.split(':');
  return nip19.naddrEncode({ kind: Number(kind), pubkey, identifier, relays: RELAYS.slice(0, 3) });
}
const m = (k) => 'nostr:' + MENTION[k];

const CONTENT =
`Two draft NIPs for the identity gaps I keep hitting on Nostr — recovery and real verification. Both \`draft\`, CC0, with shared test vectors. Feedback welcome, especially on overlap with existing proposals.

1/ Social recovery & key rotation: you name M-of-N guardians (friends, or a second device) in a signed event; to rotate, the new key claims and the guardians co-sign old→new. No sharding, no custody, no relay changes — social by default, threshold sigs optional. Toward the #116 / NIP-41 thread.
nostr:${naddr(ARTICLES.social)}

2/ Identity attestations: a signed, method-tagged record where one key vouches for attributes of another — name, nip05, or a \`not\` impersonation flag. "N people you trust vouch for this key" instead of "a DNS domain does." Scoring stays a client concern; complements NIP-85.
nostr:${naddr(ARTICLES.attest)}

Vectors + reference impl: https://github.com/resolvingarchitecture/did-vectors

Curious what ${m('vitor')} ${m('mike')} ${m('fiatjaf')} ${m('hodlbod')} ${m('jeffg')} think.

#nips #nostr`;

async function getSigner() {
  const bunker = process.env.NOSTR_BUNKER;
  if (bunker) {
    const bp = await parseBunkerInput(bunker);
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
      onauth: (url) => console.log('\nAPPROVE IN YOUR SIGNER:\n  ' + url + '\n'),
    });
    try {
      await Promise.race([signer.connect(),
        new Promise((_, r) => setTimeout(() => r(new Error('connect timeout')), CONNECT_TIMEOUT_MS))]);
    } catch (e) { if (!/already connected/i.test(String(e.message || e))) throw e; }
    const pubkey = await signer.getPublicKey();
    return { pubkey, sign: (t) => signer.signEvent(t), close: () => signer.close() };
  }
  const nsecIn = process.env.NOSTR_NSEC;
  if (!nsecIn) { console.error('Set NOSTR_BUNKER or NOSTR_NSEC.'); process.exit(1); }
  const sk = nsecIn.startsWith('nsec') ? nip19.decode(nsecIn).data : Uint8Array.from(Buffer.from(nsecIn.trim(), 'hex'));
  return { pubkey: getPublicKey(sk), sign: (t) => finalizeEvent(t, sk), close: () => {} };
}

(async () => {
  const signer = await getSigner();
  if (signer.pubkey !== AUTHOR_HEX) {
    console.error(`refusing: signer is ${nip19.npubEncode(signer.pubkey)}, not @1M5`);
    signer.close();
    process.exit(1);
  }
  const tmpl = {
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    pubkey: signer.pubkey,
    tags: [
      ...Object.values(ARTICLES).map((a) => ['a', a]),
      ...Object.values(MENTION).map((np) => ['p', nip19.decode(np).data]),
      ['t', 'nips'], ['t', 'nostr'],
    ],
    content: CONTENT,
  };

  console.log('--- note ---\n' + CONTENT + '\n---\n');
  const ev = await signer.sign(tmpl);
  console.log(`kind 1   id ${ev.id}   ${ev.content.length} chars   ${ev.tags.length} tags`);
  console.log(`read  https://njump.me/${nip19.neventEncode({ id: ev.id, author: ev.pubkey, relays: RELAYS.slice(0, 3) })}`);

  if (DRY) { console.log('\n--dry-run: not published'); signer.close(); process.exit(0); }

  const pool = new SimplePool();
  const settled = await Promise.all(pool.publish(RELAYS, ev).map((p, j) => Promise.race([
    p.then(() => 'OK', (e) => 'FAIL ' + String(e && e.message ? e.message : e).slice(0, 80)),
    new Promise((r) => setTimeout(() => r('TIMEOUT'), PUBLISH_TIMEOUT_MS)),
  ]).then((s) => [RELAYS[j], s])));
  settled.forEach(([u, s]) => console.log(`  ${s.padEnd(14)} ${u}`));
  const ok = settled.filter(([, s]) => s === 'OK').length;
  pool.close(RELAYS);
  signer.close();
  console.log(`\n-> ${ok}/${RELAYS.length} accepted`);
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error('error:', e.message || e); process.exit(1); });
