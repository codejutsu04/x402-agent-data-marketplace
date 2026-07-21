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

export type AgentEvent =
    | { type: "plan"; reasoning: string; budgetHbar: number }
    | {
          type: "buy_start";
          product: string;
          params: Record<string, string>;
          priceHbar: number;
      }
    | {
          type: "paid";
          product: string;
          amountHbar: number;
          txId: string;
          spentHbar: number;
          budgetHbar: number;
      }
    | {
          type: "attested";
          product: string;
          topicId: string;
          sequenceNumber: string;
      }
    | { type: "skip"; product: string; reason: string; budgetStop: boolean }
    | { type: "answer"; text: string };

export interface AgentOptions {
    budgetHbar?: number;
    log?: (msg: string) => void;
    onEvent?: (event: AgentEvent) => void;
}

export const runAgent = async (
    question: string,
    opts: AgentOptions = {},
): Promise<AgentReport> => {
    const budgetHbar =
        opts.budgetHbar ?? Number(process.env.AGENT_BUDGET_HBAR ?? "0.1");
    const budgetAtomic = Math.round(budgetHbar * TINYBARS_PER_HBAR);
    const log = opts.log ?? (() => {});
    const emit = opts.onEvent ?? (() => {});

    const buyer = createBuyer();
    const attestor = createAttestor();
    const catalog = await buyer.catalog();

    log(`planning for: "${question}" (budget ${budgetHbar} HBAR)`);
    const plan = await planPurchases(question, catalog);
    log(`plan: ${plan.reasoning}`);
    emit({ type: "plan", reasoning: plan.reasoning, budgetHbar });

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
            emit({ type: "skip", product: item.product, reason: invalid.message, budgetStop: false });
            continue;
        }

        const priceAtomic = Number(await buyer.priceAtomic(item.product));
        if (spentAtomic + priceAtomic > budgetAtomic) {
            const reason = `would exceed budget (need ${(priceAtomic / TINYBARS_PER_HBAR).toFixed(4)} HBAR, ${((budgetAtomic - spentAtomic) / TINYBARS_PER_HBAR).toFixed(4)} left)`;
            skipped.push({ product: item.product, params, reason });
            stoppedForBudget = true;
            log(`BUDGET STOP before ${item.product} - deferring to human`);
            emit({ type: "skip", product: item.product, reason, budgetStop: true });
            break; // stop rather than exceed
        }

        emit({
            type: "buy_start",
            product: item.product,
            params,
            priceHbar: priceAtomic / TINYBARS_PER_HBAR,
        });
        log(`buying ${item.product} ${JSON.stringify(params)} ...`);
        const purchase: AttestedPurchase = await buyer.buy(item.product, params);
        spentAtomic += priceAtomic;
        log(`  paid ${(priceAtomic / TINYBARS_PER_HBAR).toFixed(4)} HBAR, tx ${purchase.txId}`);
        emit({
            type: "paid",
            product: purchase.product,
            amountHbar: priceAtomic / TINYBARS_PER_HBAR,
            txId: purchase.txId,
            spentHbar: spentAtomic / TINYBARS_PER_HBAR,
            budgetHbar,
        });

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
                emit({
                    type: "attested",
                    product: purchase.product,
                    topicId: purchase.attestation.topicId,
                    sequenceNumber: purchase.attestation.sequenceNumber,
                });
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
    emit({ type: "answer", text: answer });

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
