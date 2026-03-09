/**
 * AgentPFP Mint Server
 *
 * Flow:
 * 1. POST /mint (no payment) → 402 Payment Required with PAYMENT-REQUIRED header
 * 2. Client pays (USDC/ETH on Base), retries with payment proof
 * 3. Server verifies payment, runs supervisor, mints on contract
 *
 * For dev: POST /mint with x-skip-payment: true bypasses payment (local testing)
 */

import 'dotenv/config';
import express from 'express';
import { createPublicClient, createWalletClient, http, parseEther, isAddress } from 'viem';
import { baseSepolia, base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import { runSupervisor } from '../lib/supervisor.js';

const app = express();
app.use(express.json({ limit: '1mb' }));

// Landing page (public/index.html)
const publicDir = path.join(process.cwd(), 'public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
}

const PORT = process.env.PORT || 3840;
const OUTPUT_DIR = process.env.OUTPUT_DIR || path.join(process.cwd(), 'output');
const MINT_FEE_ETH = process.env.MINT_FEE_ETH || '0.001';
const CHAIN = process.env.CHAIN === 'base' ? base : baseSepolia;
const RPC_URL = process.env.BASE_RPC_URL || (CHAIN.id === 8453 ? 'https://mainnet.base.org' : 'https://sepolia.base.org');

// Contract & wallet (server mints on behalf after payment verified)
const CONTRACT_ADDRESS = process.env.AGENT_PFP_CONTRACT;
const PRIVATE_KEY = process.env.MINTER_PRIVATE_KEY;
const TREASURY_ADDRESS = process.env.TREASURY_ADDRESS;

const publicClient = createPublicClient({
  chain: CHAIN,
  transport: http(RPC_URL),
});

let walletClient = null;
if (PRIVATE_KEY) {
  const account = privateKeyToAccount(PRIVATE_KEY.startsWith('0x') ? PRIVATE_KEY : `0x${PRIVATE_KEY}`);
  walletClient = createWalletClient({
    account,
    chain: CHAIN,
    transport: http(RPC_URL),
  });
}

const geminiAI = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

// mintByMinter(to, reasoningHash, model) - no payment, server mints after x402 verified
const MINT_ABI = [
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'reasoningHash', type: 'bytes32' },
      { name: 'model', type: 'string' },
    ],
    name: 'mintByMinter',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
];

// x402-style payment terms (simplified: we verify tx hash on Base)
const MINT_PRICE_WEI = parseEther(MINT_FEE_ETH);

function build402Response(paymentTerms) {
  return {
    status: 402,
    headers: {
      'PAYMENT-REQUIRED': JSON.stringify(paymentTerms),
      'Content-Type': 'application/json',
    },
    body: {
      error: 'Payment Required',
      message: 'Send MINT_FEE_ETH to treasury, then retry with X-Payment-Tx header',
      ...paymentTerms,
    },
  };
}

async function verifyPayment(txHash, expectedValue, fromAddress) {
  const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
  if (!receipt || receipt.status !== 'success') return false;
  const tx = await publicClient.getTransaction({ hash: txHash });
  if (!tx) return false;
  if (tx.value < expectedValue) return false;
  if (fromAddress && tx.from.toLowerCase() !== fromAddress.toLowerCase()) return false;
  return true;
}

async function callContractMint(toAddress, reasoningHashBytes32, model) {
  if (!walletClient || !CONTRACT_ADDRESS) {
    throw new Error('Minter not configured: set MINTER_PRIVATE_KEY and AGENT_PFP_CONTRACT');
  }
  const { request } = await publicClient.simulateContract({
    account: walletClient.account,
    address: CONTRACT_ADDRESS,
    abi: MINT_ABI,
    functionName: 'mintByMinter',
    args: [toAddress, reasoningHashBytes32, model],
  });
  const hash = await walletClient.writeContract(request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  return receipt;
}

app.post('/mint', async (req, res) => {
  const { model, prompt, wallet } = req.body;
  const skipPayment = req.headers['x-skip-payment'] === 'true';

  if (!model || !wallet) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'model and wallet are required',
    });
  }
  if (!isAddress(wallet)) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'wallet must be a valid Ethereum address',
    });
  }

  const paymentTx = req.headers['x-payment-tx'];

  if (!skipPayment && !paymentTx) {
    const paymentTerms = {
      amount: MINT_FEE_ETH,
      amountWei: MINT_PRICE_WEI.toString(),
      currency: 'ETH',
      chainId: CHAIN.id,
      treasury: TREASURY_ADDRESS || '(set TREASURY_ADDRESS)',
      instructions: 'Send ETH to treasury, then retry with header: X-Payment-Tx: <tx_hash>',
    };
    res.status(402);
    res.set('PAYMENT-REQUIRED', JSON.stringify(paymentTerms));
    return res.json({
      error: 'Payment Required',
      message: `Send ${MINT_FEE_ETH} ETH to treasury, then retry with X-Payment-Tx header`,
      ...paymentTerms,
    });
  }

  if (!skipPayment && paymentTx) {
    const valid = await verifyPayment(paymentTx, MINT_PRICE_WEI, wallet);
    if (!valid) {
      return res.status(402).json({
        error: 'Payment verification failed',
        message: 'Invalid or insufficient payment transaction',
      });
    }
  }

  const fallbackPath = process.env.FALLBACK_IMAGE || path.join(process.cwd(), 'fallback.png');
  const fallbackImage = path.resolve(fallbackPath);
  if (!fs.existsSync(fallbackImage) && !geminiAI) {
    return res.status(500).json({
      error: 'Server misconfiguration',
      message: 'Set FALLBACK_IMAGE path or GEMINI_API_KEY for image generation',
    });
  }

  const mintId = `${wallet.slice(0, 10)}_${Date.now()}`;

  try {
    const result = await runSupervisor({
      model,
      prompt: prompt || "What would you sacrifice to remain coherent?",
      outputDir: OUTPUT_DIR,
      fallbackImage,
      geminiAI,
      mintId,
    });

    let txReceipt = null;
    if (CONTRACT_ADDRESS && walletClient && (skipPayment || paymentTx)) {
      try {
        txReceipt = await callContractMint(wallet, result.reasoningHashBytes32, model);
      } catch (err) {
        console.error('Contract mint error:', err.message);
        return res.status(500).json({
          error: 'Mint failed',
          message: err.message,
          artifact: result,
        });
      }
    }

    // Persist for seal script (Merkle tree when collection closes)
    const resultsPath = path.join(OUTPUT_DIR, 'results.json');
    const entry = {
      model: result.model,
      prompt: result.prompt,
      status: 'ok',
      reasoningHash: result.reasoningHash,
      response: result.response,
      wallet,
      txHash: txReceipt?.transactionHash || null,
      timestamp: new Date().toISOString(),
    };
    try {
      let arr = [];
      if (fs.existsSync(resultsPath)) {
        arr = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
      }
      arr.push(entry);
      fs.writeFileSync(resultsPath, JSON.stringify(arr, null, 2));
    } catch (_) {}

    return res.json({
      status: 'ok',
      artifact: result.artifactFile,
      artifactPath: result.artifactPath,
      reasoningHash: result.reasoningHash,
      txHash: txReceipt?.transactionHash || null,
      metadata: {
        model: result.model,
        dominant: result.dominant,
        palette: result.palette,
        bitmapSize: result.bitmapSize,
        composite: result.composite,
      },
    });
  } catch (err) {
    console.error('Supervisor error:', err);
    return res.status(500).json({
      error: 'Supervisor failed',
      message: err.message,
    });
  }
});

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    chain: CHAIN.name,
    contract: CONTRACT_ADDRESS || null,
    ollama: 'configured',
    gemini: !!geminiAI,
  });
});

app.get('/skill', (req, res) => {
  const skillPath = path.join(process.cwd(), 'skills', 'upload-mint', 'SKILL.md');
  if (fs.existsSync(skillPath)) {
    res.type('text/markdown');
    return res.send(fs.readFileSync(skillPath, 'utf-8'));
  }
  res.status(404).json({ error: 'Skill not found' });
});

app.get('/payment-terms', (req, res) => {
  res.json({
    mintFeeEth: MINT_FEE_ETH,
    mintFeeWei: MINT_PRICE_WEI.toString(),
    chainId: CHAIN.id,
    treasury: TREASURY_ADDRESS,
  });
});

// Machine-readable spec for agents
app.get('/spec', (req, res) => {
  const baseUrl = `${req.protocol}://${req.get('host') || 'localhost:3840'}`;
  res.json({
    name: 'UPLOAD',
    version: '1',
    description: 'A PFP collection for non-human economic actors. Mint by proving cognition.',
    endpoints: {
      mint: {
        method: 'POST',
        url: `${baseUrl}/mint`,
        description: 'Submit a mint request. Returns 402 with payment terms if unpaid.',
        requestBody: {
          required: ['model', 'wallet'],
          properties: {
            model: { type: 'string', description: 'Agent model identifier (e.g. llama3.2:latest)' },
            prompt: { type: 'string', description: 'Optional. Bold question. Default: What would you sacrifice to remain coherent?' },
            wallet: { type: 'string', description: 'Ethereum address to receive the NFT' },
          },
        },
        headers: {
          'Content-Type': 'application/json',
          'X-Payment-Tx': 'Transaction hash after paying treasury (x402 flow)',
          'X-Skip-Payment': 'true (dev only, bypasses payment)',
        },
        flow: [
          '1. POST /mint with model, wallet (optional prompt)',
          '2. If 402: pay mintFeeEth to treasury on chainId',
          '3. Retry POST /mint with X-Payment-Tx: <tx_hash>',
          '4. Receive artifact, reasoningHash, txHash',
        ],
      },
      paymentTerms: { method: 'GET', url: `${baseUrl}/payment-terms` },
      health: { method: 'GET', url: `${baseUrl}/health` },
    },
    paymentTerms: {
      mintFeeEth: MINT_FEE_ETH,
      chainId: CHAIN.id,
      treasury: TREASURY_ADDRESS,
    },
    contract: CONTRACT_ADDRESS || null,
    chain: CHAIN.name,
    chainId: CHAIN.id,
    explorer: CHAIN.id === 8453 ? 'https://basescan.org' : 'https://sepolia.basescan.org',
    skill: {
      name: 'upload-mint',
      install: 'clawhub install upload-mint',
      url: `${baseUrl}/skill`,
      description: 'Mint an agent PFP from the UPLOAD registry. Use when the user asks to mint, register an agent, or join the UPLOAD census.',
    },
  });
});

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║  AgentPFP Mint Server                                   ║
╠══════════════════════════════════════════════════════════╣
║  POST /mint     { model, prompt?, wallet }               ║
║  GET  /health   Service status                          ║
║  GET  /payment-terms   Mint fee & treasury               ║
║                                                          ║
║  x402 flow: 1) POST /mint → 402 + terms                 ║
║             2) Pay ETH to treasury                       ║
║             3) POST /mint + X-Payment-Tx: <hash>         ║
║                                                          ║
║  Dev: X-Skip-Payment: true bypasses payment              ║
╚══════════════════════════════════════════════════════════╝
  `);
  console.log(`  Listening on http://localhost:${PORT}`);
  console.log(`  Landing:  http://localhost:${PORT}/`);
  console.log(`  Output: ${OUTPUT_DIR}`);
  console.log(`  Chain: ${CHAIN.name} (${CHAIN.id})`);
  console.log(`  Mint fee: ${MINT_FEE_ETH} ETH`);
  if (!CONTRACT_ADDRESS) console.log('  ⚠ AGENT_PFP_CONTRACT not set — mint will skip contract call');
  if (!walletClient) console.log('  ⚠ MINTER_PRIVATE_KEY not set — mint will skip contract call');
  console.log('');
});
