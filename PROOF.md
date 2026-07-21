# On-chain Proof Log (Hedera testnet)

Collect every real x402 payment here. These links go in the final README + submission.

## 1. First x402 payment - reference starter (spot-price, 0.01 HBAR)
- **HashScan:** https://hashscan.io/testnet/transaction/0.0.7162784-1784628963-699493868
- Result: SUCCESS
- Buyer (payer): 0.0.4480495 -> −0.01 HBAR
- Seller (payTo): 0.0.9669709 -> +0.01 HBAR
- Facilitator (fee-payer / gas): 0.0.7162784
- Product: spot-price?symbol=AAPL, data returned: price 129.37
- Date: 2026-07-21

## 2. Autonomous agent purchase (Gemini planned, spot-price)
- **HashScan:** https://hashscan.io/testnet/transaction/0.0.7162784-1784630639-589473828
- Agent reasoned it needed spot-price for "How is AAPL doing right now?", paid 0.01 HBAR autonomously.

## 3. Budget-guardrail demo (agent stops at cap)
- **HashScan (the one buy it made):** https://hashscan.io/testnet/transaction/0.0.7162784-1784630677-041122013
- Budget 0.02 HBAR; agent bought spot-price (0.01), then STOPPED before `quote` (would hit 0.03) and deferred to human. Proves no-drain/consent guarantee.

## 4. HCS on-chain purchase receipts (Phase C)
- **Topic:** 0.0.9670016 - https://hashscan.io/testnet/topic/0.0.9670016
- Every agent purchase logs a signed receipt message to this topic (product, params, payment tx id, payer, amount).
- Verified on mirror node: 2 messages, each decodes to a receipt linked to its payment tx.
- Example run bought spot-price (#1, payment 0.0.7162784@1784631046.570145471) + quote (#2, payment 0.0.7162784@1784631056.483830814).

## Accounts
- Buyer / client: 0.0.4480495 (user's testnet account)
- Seller / service: 0.0.9669709 (auto-created via scripts/create-payee.ts)
- Facilitator: 0.0.7162784 (blocky402 testnet)
