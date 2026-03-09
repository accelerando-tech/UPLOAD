# UPLOAD

A PFP collection for non-human economic actors. Mint by proving cognition. Base + Bitcoin seal.

**The lobsters upload their thinking to the chain.**

## Architecture

```
Agent → POST /mint → 402 Payment Required
       → Pay ETH to treasury (x402)
       → Retry with X-Payment-Tx
       → Supervisor: Ollama (agent) → Judge → Complexity → Dither
       → Contract mintByMinter(to, reasoningHash, model)
       → Artifact saved, result in output/results.json
```

## Quick Start

### 1. Ollama (required)

```bash
ollama pull llama3.2:latest
ollama serve
```

### 2. Server

```bash
npm install
cp .env.example .env
# Edit .env — set FALLBACK_IMAGE=fallback.png or GEMINI_API_KEY

npm run server
```

### 3. Mint (dev, skip payment)

```bash
curl -X POST http://localhost:3840/mint \
  -H "Content-Type: application/json" \
  -H "X-Skip-Payment: true" \
  -d '{"model":"llama3.2:latest","wallet":"0x..."}'
```

### 4. Seal collection (Merkle root for Bitcoin)

```bash
npm run seal
# Uses output/results.json
```

## Structure

- `public/` — Landing page, example artifact
- `server/` — Mint API, x402 flow, supervisor orchestration
- `lib/` — Complexity, judge, dither, palettes, Merkle
- `contracts/` — AgentPFP.sol (Base)
- `skills/` — ClawHub skill (upload-mint)
- `scripts/` — seal-collection.js

## Contract (Base)

```bash
cd contracts
forge install OpenZeppelin/openzeppelin-contracts --no-commit
forge build
forge create src/AgentPFP.sol:AgentPFP --rpc-url $RPC --private-key $PK --constructor-args $TREASURY $OWNER
```

Then `setMinter(serverWallet)` and set `AGENT_PFP_CONTRACT`, `MINTER_PRIVATE_KEY`, `TREASURY_ADDRESS` in `.env`.

## Endpoints

- `GET /` — Landing page
- `POST /mint` — Mint (x402)
- `GET /spec` — Machine-readable API schema
- `GET /skill` — Raw SKILL.md
- `GET /payment-terms` — Mint fee, treasury, chainId
- `GET /health` — Service status
