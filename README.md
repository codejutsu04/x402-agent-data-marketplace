# Autonomous Agent Data Marketplace on Hedera (x402)

An AI agent that **buys data per-request** over the [x402](https://www.x402.org/) payment
standard, settling real micropayments on **Hedera** - within a hard spend budget, and
logging every purchase on-chain. Built for the [Hedera x402 Bounty](https://hedera.com/x402-bounty/).

> **The idea:** you ask the agent a question. It reads a seller's catalog, decides which
> paid data products it actually needs, pays for each one autonomously (HBAR, per request),
> stops the moment it hits its budget, and returns an answer plus a full spend receipt -
> every payment verifiable on HashScan.

## Why it matters

Agents increasingly need to buy things - data, compute, other agents' output - without a
human clicking "approve" on every sub-cent charge. Cards can't do sub-cent fees; x402 can.
This shows the pattern end-to-end on Hedera, with the guardrails that make it safe:
the agent never holds the private key, and it cannot exceed its budget.

## Status

- [x] Real x402 payment settling on Hedera testnet - [HashScan proof](./PROOF.md)
- [x] Pay-gated data server (Hono + `@x402/hono` + `@x402/hedera`), facilitator = blocky402
- [x] Delegated signer: private key never enters the agent/LLM context
- [x] AI buyer agent (Gemini) that chooses products from the catalog
- [x] Hard spend-budget policy with human-in-the-loop at the cap
- [x] On-chain purchase receipts via Hedera Consensus Service (HCS)
- [x] Web UI: live 402 -> pay -> unlock with a running spend meter

## Architecture

```
        You: "analyze AAPL"
              |
   +----------v-----------+        402 Payment Required
   |   AI Buyer Agent      |  ------------------------->  +------------------+
   |   (Gemini brain)      |                              |  Data Server     |
   |   - reads /catalog    |  <-------------------------  |  (Hono, x402)    |
   |   - picks products    |        200 + data            |  holds NO key    |
   |   - enforces budget   |                              +--------+---------+
   +----------+-----------+                                        |
              | sign (key isolated, never in LLM)                  | verify + settle
   +----------v-----------+                              +---------v---------+
   |  Delegated Signer     |  --- signed payment --->    |  blocky402        |
   |  (reads key from .env) |                             |  facilitator      |
   +----------------------+                               |  (pays gas)       |
                                                          +---------+---------+
                                                                    | settle
                                                          +---------v---------+
                                                          |  Hedera testnet   |
                                                          |  HBAR transfer +  |
                                                          |  HCS receipt      |
                                                          +-------------------+
```

- `src/core/provider.ts` - the `DataProvider` contract; `src/providers/mock/` is the reference.
- `src/server/` - Hono app: validation -> `paymentMiddleware` -> handler.
- `scripts/x402-sign.ts` - standalone signer; key stays out of the agent.
- `scripts/e2e-pay.ts` - live client running the full 402 -> pay -> 200 flow.

## Setup

Requires Node.js >= 20.

```bash
npm install
cp .env.example .env      # fill in testnet creds + an LLM key
npm test                  # offline contract/unit tests
npm run dev               # resource server on http://localhost:4021
npm run e2e               # real paid request through blocky402 on testnet
```

First-time on-chain setup (creates a seller account + an HCS receipt topic, prints
ids to paste into `.env`):

```bash
npx tsx scripts/create-payee.ts   # -> PAY_TO_ACCOUNT
npx tsx scripts/create-topic.ts   # -> HCS_TOPIC_ID
```

### Run the agent

```bash
npm run dev                                   # terminal 1: resource server
npm run agent -- "how is AAPL doing?"         # terminal 2: CLI agent
AGENT_BUDGET_HBAR=0.02 npm run agent -- "..."  # tighter budget -> watch it stop at the cap
```

### Demo UI (for the video)

```bash
npm run dev     # terminal 1: resource server (:4021)
npm run demo    # terminal 2: demo UI     (:4022)
# open http://localhost:4022 - type a question, watch plan -> pay -> unlock live
```

## Catalog

| product | params | price |
|---|---|---|
| `spot-price` | `symbol` | 0.01 HBAR |
| `quote` | `symbol` | 0.02 HBAR |
| `ohlc` | `symbol`, `date` | 0.05 HBAR |

## Safety model

- The resource server holds **no** Hedera key; the blocky402 facilitator is the fee-payer.
- The private key lives only in `.env`, read by the signer process - **never** the agent/LLM.
- The agent runs under a **hard spend budget**; at the cap it stops and defers to the human.

## Credits

Built on Hedera's officially-referenced x402 starter
([matevszm/x402-hedera-example](https://github.com/matevszm/x402-hedera-example)),
extended into an autonomous, budgeted, on-chain-attested agent marketplace.

## License

MIT - see [LICENSE](./LICENSE).
