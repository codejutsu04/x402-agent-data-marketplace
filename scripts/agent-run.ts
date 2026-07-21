// CLI: run the autonomous buyer agent against a question.
//   npm run agent -- "how is AAPL doing today?"
//   AGENT_BUDGET_HBAR=0.03 npm run agent -- "give me a full AAPL picture"
import "dotenv/config";
import { runAgent } from "../src/agent/agent.js";

const hashscan = (txId: string): string => {
    if (!txId) return "(no tx)";
    const [acct, ts] = txId.split("@");
    if (!ts) return txId;
    return `https://hashscan.io/testnet/transaction/${acct}-${ts.replace(".", "-")}`;
};

const question = process.argv.slice(2).join(" ").trim() ||
    process.env.AGENT_QUESTION ||
    "How is AAPL doing today?";

const report = await runAgent(question, {
    log: (m) => console.error(`[agent] ${m}`),
});

console.log("\n========== AGENT REPORT ==========");
console.log(`Q: ${report.question}`);
console.log(`Plan: ${report.reasoning}`);
console.log(
    `\nBudget: ${report.budgetHbar} HBAR | Spent: ${report.spentHbar.toFixed(4)} HBAR | ` +
        `${report.purchases.length} purchase(s)` +
        (report.stoppedForBudget ? " | STOPPED at budget cap" : ""),
);

if (report.purchases.length) {
    console.log("\nPurchases (on-chain):");
    for (const p of report.purchases) {
        console.log(
            `  - ${p.product} ${JSON.stringify(p.params)} = ` +
                `${(Number(p.amountAtomic) / 1e8).toFixed(4)} HBAR`,
        );
        console.log(`    ${hashscan(p.txId)}`);
    }
}

if (report.skipped.length) {
    console.log("\nSkipped:");
    for (const s of report.skipped) {
        console.log(`  - ${s.product} ${JSON.stringify(s.params)}: ${s.reason}`);
    }
}

console.log(`\nAnswer:\n${report.answer}`);
console.log("==================================\n");
