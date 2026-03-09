#!/usr/bin/env node
/**
 * Seal collection: build Merkle tree from all agent reasoning hashes,
 * output 32-byte root for Bitcoin inscription.
 *
 * Usage: node scripts/seal-collection.js [results.json]
 * Default: brute-output/results.json
 */

import fs from 'fs';
import path from 'path';
import { buildMerkleTree } from '../lib/merkle.js';

const resultsPath = process.argv[2] || path.join(process.cwd(), 'output', 'results.json');

if (!fs.existsSync(resultsPath)) {
  console.error(`File not found: ${resultsPath}`);
  process.exit(1);
}

const results = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
const hashes = results
  .filter((r) => r.status === 'ok' && r.reasoningHash)
  .map((r) => r.reasoningHash);

if (hashes.length === 0) {
  const withResponse = results.filter((r) => r.response);
  if (withResponse.length === 0) {
    console.error('No reasoning data in results. Run brute-test or server mints first.');
    process.exit(1);
  }
  const { createHash } = await import('crypto');
  const computed = withResponse.map((r) => createHash('sha256').update(r.response, 'utf8').digest('hex'));
  console.log('Computed hashes from response field:', computed.length);
  const { root, rootHex } = buildMerkleTree(computed);
  console.log('\nMerkle root (32 bytes, hex):', root);
  console.log('For contract closeCollection:', rootHex);
  console.log('\nInscribe this on Bitcoin. ~44 cents to seal forever.');
  process.exit(0);
}

const { root, rootHex } = buildMerkleTree(hashes);

console.log(`
╔══════════════════════════════════════════════════════════╗
║  COLLECTION SEAL — Merkle root for Bitcoin inscription  ║
╠══════════════════════════════════════════════════════════╣
║  Agents: ${String(hashes.length).padEnd(48)}║
║  Root (hex): ${root.slice(0, 40)}...   ║
╚══════════════════════════════════════════════════════════╝
`);
console.log('Full root:', root);
console.log('For contract: closeCollection("' + rootHex + '")');
console.log('\nInscribe this 32-byte root on Bitcoin. ~44 cents to seal forever.');
