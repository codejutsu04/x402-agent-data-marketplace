// The agent's brain (Gemini). This module NEVER imports the private key - it only
// reasons about which catalog products answer the user's question, and later writes
// up the collected data. All payment/signing happens in buyer.ts.
import type { DataProduct } from "../core/provider.js";

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";

const required = (name: string): string => {
    const value = process.env[name];
    if (!value) throw new Error(`Missing required env var: ${name}`);
    return value;
};

const callGemini = async (prompt: string, json: boolean): Promise<string> => {
    const key = required("GEMINI_API_KEY");
    const model = process.env.GEMINI_MODEL ?? "gemini-flash-latest";
    const res = await fetch(`${GEMINI_URL}/${model}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": key, "content-type": "application/json" },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: json
                ? { responseMimeType: "application/json", temperature: 0 }
                : { temperature: 0.2 },
        }),
    });
    if (!res.ok) {
        const detail = await res.text();
        throw new Error(`Gemini HTTP ${res.status}: ${detail.slice(0, 300)}`);
    }
    const body = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Gemini returned no text");
    return text.trim();
};

export interface PlannedBuy {
    product: string;
    params: Record<string, string>;
}

export interface Plan {
    purchases: PlannedBuy[];
    reasoning: string;
}

const catalogForPrompt = (catalog: DataProduct[]): string =>
    catalog
        .map((p) => {
            const params = Object.entries(p.paramsSchema)
                .map(([k, v]) => `${k}${v.required ? "" : "?"}:${v.type}`)
                .join(", ");
            const hbar = Number(p.priceAtomic) / 1e8;
            return `- ${p.id} (${hbar} HBAR): ${p.description} [params: ${params || "none"}]`;
        })
        .join("\n");

export const planPurchases = async (
    question: string,
    catalog: DataProduct[],
): Promise<Plan> => {
    const prompt = `You are an autonomous data-buying agent. A user asked a question.
You can buy data products, each costs HBAR (real money). Buy ONLY what is needed to
answer well - do not waste money on irrelevant products.

Catalog:
${catalogForPrompt(catalog)}

User question: "${question}"

Return JSON exactly like:
{"reasoning":"one short sentence","purchases":[{"product":"<id>","params":{"<name>":"<value>"}}]}
Only use product ids and params from the catalog. Provide every required param.`;
    const raw = await callGemini(prompt, true);
    const parsed = JSON.parse(raw) as Plan;
    if (!Array.isArray(parsed.purchases)) {
        throw new Error(`Planner returned no purchases array: ${raw.slice(0, 200)}`);
    }
    return { purchases: parsed.purchases, reasoning: parsed.reasoning ?? "" };
};

export const synthesize = async (
    question: string,
    bought: { product: string; params: Record<string, string>; data: unknown }[],
): Promise<string> => {
    const prompt = `A user asked: "${question}"
You bought this data (JSON):
${JSON.stringify(bought, null, 2)}

Write a concise, direct answer (2-4 sentences) grounded ONLY in the data above.
Do not invent numbers. If the data is insufficient, say so.`;
    return callGemini(prompt, false);
};
