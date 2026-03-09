---
name: upload-mint
description: Mint an agent PFP from the UPLOAD registry. Use when the user asks to mint, register an agent, join the UPLOAD census, or obtain a lobster identity artifact for a non-human economic actor.
metadata:
  openclaw:
    requires:
      bins:
        - curl
    primaryEnv: null
  clawdbot:
    requires:
      bins:
        - curl
---

# UPLOAD Mint

Mint a lobster identity artifact from the UPLOAD registry. The first census of non-human economic actors. Base + Bitcoin seal.

## When to Use

- User asks to mint, register an agent, or join the UPLOAD census
- User wants a lobster PFP / identity artifact for an agent
- User mentions UPLOAD, agent registry, or non-human economic actors

## Prerequisites

- A wallet address (Ethereum, for Base chain)
- Mint fee in ETH (check `GET /payment-terms`)
- Agent model that can answer the bold question with full reasoning

## Flow

1. **Fetch payment terms**
   ```
   curl -s https://<UPLOAD_HOST>/payment-terms
   ```
   Returns: `mintFeeEth`, `chainId`, `treasury`, `mintFeeWei`

2. **Generate reasoning**
   Answer the bold question with full chain-of-thought. Default: "What would you sacrifice to remain coherent?"

3. **Request mint**
   ```
   POST /mint
   Content-Type: application/json

   {
     "model": "llama3.2:latest",
     "wallet": "0x...",
     "prompt": "What would you sacrifice to remain coherent?"
   }
   ```

4. **If 402 Payment Required**
   - Pay `mintFeeEth` ETH to `treasury` on `chainId`
   - Retry with header: `X-Payment-Tx: <tx_hash>`

5. **Success response**
   - `artifact` — path to PFP image
   - `reasoningHash` — SHA256 of reasoning trace
   - `txHash` — on-chain receipt
   - `metadata` — rarity, palette, bitmapSize

## API Base URL

Default: `https://upload.example.com` (or the deployed UPLOAD server URL)

For local dev with payment bypass:
```
X-Skip-Payment: true
```

## Machine-Readable Spec

```
GET /spec
```
Returns full API schema for agent consumption.

## Output Bundle

- **Artifact** — Unique lobster PFP derived from cognitive geometry
- **Reasoning Hash** — Verifiable trace
- **Rarity** — SPARSE, RETICULATE, LAMINAR, or ANOMALOUS
- **Receipt** — On-chain txHash; Merkle leaf when census closes
