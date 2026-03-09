import { createHash } from 'crypto';

/**
 * Build a Merkle tree from agent reasoning hashes (SHA256 hex strings).
 * Returns the 32-byte root for Bitcoin inscription.
 *
 * @param {string[]} leafHashes - Array of SHA256 hashes (hex, 64 chars each)
 * @returns {{ root: string, rootHex: string }}
 */
export function buildMerkleTree(leafHashes) {
  if (leafHashes.length === 0) {
    const empty = '0'.repeat(64);
    return { root: empty, rootHex: '0x' + empty };
  }

  const toBuffer = (hex) => Buffer.from((hex.startsWith('0x') ? hex.slice(2) : hex).padStart(64, '0').slice(-64), 'hex');
  const hashPair = (a, b) => {
    const [left, right] = [a, b].map(toBuffer).sort(Buffer.compare);
    return createHash('sha256').update(Buffer.concat([left, right])).digest('hex');
  };

  let layer = leafHashes.map((h) => (h.startsWith('0x') ? h.slice(2) : h).padStart(64, '0').slice(-64));

  while (layer.length > 1) {
    const next = [];
    for (let i = 0; i < layer.length; i += 2) {
      const left = layer[i];
      const right = i + 1 < layer.length ? layer[i + 1] : left;
      next.push(hashPair(left, right));
    }
    layer = next;
  }

  const root = layer[0];
  return { root, rootHex: '0x' + root };
}
