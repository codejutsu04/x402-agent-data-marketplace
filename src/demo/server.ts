// Demo server (buyer side). Serves a single-page UI and streams the agent's
// progress over SSE so you can watch plan -> pay -> unlock -> attest live.
// It holds the buyer key (like any client) and calls the resource server at
// SERVER_URL. Keep it separate from the resource server, which holds no key.
import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runAgent } from "../agent/agent.js";

const here = dirname(fileURLToPath(import.meta.url));
const app = new Hono();

app.get("/", async (c) => {
    const html = await readFile(join(here, "index.html"), "utf8");
    return c.html(html);
});

app.get("/api/run", (c) => {
    const question = c.req.query("question")?.trim() || "How is AAPL doing?";
    const budget = Number(c.req.query("budget") ?? "0.1");

    return streamSSE(c, async (stream) => {
        // Serialize SSE writes so events arrive in emit order.
        let chain: Promise<unknown> = Promise.resolve();
        const send = (event: string, data: unknown) => {
            chain = chain.then(() =>
                stream.writeSSE({ event, data: JSON.stringify(data) }),
            );
            return chain;
        };
        try {
            const report = await runAgent(question, {
                budgetHbar: Number.isFinite(budget) ? budget : 0.1,
                onEvent: (e) => void send(e.type, e),
            });
            await send("done", report);
        } catch (err) {
            await send("error", { message: (err as Error).message });
        }
        await chain;
    });
});

const port = Number(process.env.DEMO_PORT ?? "4022");
serve({ fetch: app.fetch, port });
console.log(`x402 agent demo UI on http://localhost:${port}`);
