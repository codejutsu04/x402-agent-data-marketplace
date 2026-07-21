// Orchestrator: plan (LLM) -> budgeted purchase loop -> synthesize (LLM).
// The budget is a hard ceiling: the agent stops and defers to the human rather
// than exceed it. This is the consent/no-drain guarantee the bounty asks for.
import { createBuyer, type Purchase } from "./buyer.js";
import { planPurchases, synthesize } from "./llm.js";
import { createAttestor, type Attestation } from "./attest.js";
import { validateRequest } from "../core/catalog.js";

const TINYBARS_PER_HBAR = 1e8;

export interface SkippedBuy {
    product: string;
    params: Record<string, string>;
    reason: string;
}

export type AttestedPurchase = Purchase & { attestation?: Attestation };

export interface AgentReport {
    question: string;
    reasoning: string;
    budgetHbar: number;
    spentHbar: number;
    purchases: AttestedPurchase[];
    skipped: SkippedBuy[];
    stoppedForBudget: boolean;
    topicId?: string;
    answer: string;
}

export interface AgentOptions {
    budgetHbar?: number;
    log?: (msg: string) => void;
}

export const runAgent = async (
    question: string,
    opts: AgentOptions = {},
): Promise<AgentReport> => {
    const budgetHbar =
        opts.budgetHbar ?? Number(process.env.AGENT_BUDGET_HBAR ?? "0.1");
    const budgetAtomic = Math.round(budgetHbar * TINYBARS_PER_HBAR);
    const log = opts.log ?? (() => {});

    const buyer = createBuyer();
    const attestor = createAttestor();
    const catalog = await buyer.catalog();

    log(`planning for: "${question}" (budget ${budgetHbar} HBAR)`);
    const plan = await planPurchases(question, catalog);
    log(`plan: ${plan.reasoning}`);

    const purchases: AttestedPurchase[] = [];
    const skipped: SkippedBuy[] = [];
    let spentAtomic = 0;
    let stoppedForBudget = false;

    for (const item of plan.purchases) {
        const params = item.params ?? {};
        const invalid = validateRequest(catalog, item.product, params);
        if (invalid) {
            skipped.push({ product: item.product, params, reason: invalid.message });
            log(`skip ${item.product}: ${invalid.message}`);
            continue;
        }

        const priceAtomic = Number(await buyer.priceAtomic(item.product));
        if (spentAtomic + priceAtomic > budgetAtomic) {
            skipped.push({
                product: item.product,
                params,
                reason: `would exceed budget (need ${(priceAtomic / TINYBARS_PER_HBAR).toFixed(4)} HBAR, ${((budgetAtomic - spentAtomic) / TINYBARS_PER_HBAR).toFixed(4)} left)`,
            });
            stoppedForBudget = true;
            log(`BUDGET STOP before ${item.product} - deferring to human`);
            break; // stop rather than exceed
        }

        log(`buying ${item.product} ${JSON.stringify(params)} ...`);
        const purchase: AttestedPurchase = await buyer.buy(item.product, params);
        spentAtomic += priceAtomic;
        log(`  paid ${(priceAtomic / TINYBARS_PER_HBAR).toFixed(4)} HBAR, tx ${purchase.txId}`);

        if (attestor) {
            try {
                purchase.attestation = await attestor.submit({
                    product: purchase.product,
                    params: purchase.params,
                    amountAtomic: purchase.amountAtomic,
                    paymentTxId: purchase.txId,
                    payer: purchase.payer,
                    asOf: purchase.asOf,
                });
                log(`  attested to HCS topic ${purchase.attestation.topicId} #${purchase.attestation.sequenceNumber}`);
            } catch (err) {
                log(`  attestation failed (non-fatal): ${(err as Error).message}`);
            }
        }
        purchases.push(purchase);
    }

    attestor?.close();

    const answer = purchases.length
        ? await synthesize(
              question,
              purchases.map((p) => ({
                  product: p.product,
                  params: p.params,
                  data: p.data,
              })),
          )
        : "No data purchased (nothing within budget or plan was empty).";

    return {
        question,
        reasoning: plan.reasoning,
        budgetHbar,
        spentHbar: spentAtomic / TINYBARS_PER_HBAR,
        purchases,
        skipped,
        stoppedForBudget,
        topicId: attestor?.topicId,
        answer,
    };
};
