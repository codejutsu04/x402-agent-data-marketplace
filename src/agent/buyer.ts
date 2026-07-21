// Payment machinery for the buyer agent. This module is the ONLY place the private
// key is loaded. The LLM/planner never imports it - it only decides *what* to buy;
// this code executes the x402 402 -> pay -> 200 flow and returns the settlement.
import { wrapFetchWithPayment } from "@x402/fetch";
import {
    createClientHederaSigner,
    PrivateKey as HederaPrivateKey,
} from "@x402/hedera";
import { ExactHederaScheme } from "@x402/hedera/exact/client";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import type { DataProduct } from "../core/provider.js";

export interface Purchase {
    product: string;
    params: Record<string, string>;
    data: unknown;
    asOf: string;
    amountAtomic: string; // tinybars paid
    txId: string; // Hedera transaction id
    payer: string;
}

export interface Buyer {
    catalog(): Promise<DataProduct[]>;
    priceAtomic(productId: string): Promise<string>;
    buy(product: string, params: Record<string, string>): Promise<Purchase>;
    accountId: string;
    serverUrl: string;
}

const required = (name: string): string => {
    const value = process.env[name];
    if (!value) throw new Error(`Missing required env var: ${name}`);
    return value;
};

export const createBuyer = (): Buyer => {
    const accountId = required("HEDERA_CLIENT_ID");
    const privateKey = required("HEDERA_CLIENT_KEY");
    const network = process.env.HEDERA_NETWORK ?? "hedera:testnet";
    const serverUrl = process.env.SERVER_URL ?? "http://localhost:4021";

    // ECDSA matches Hedera Portal default accounts; swap to fromStringED25519 if needed.
    const signer = createClientHederaSigner(
        accountId,
        HederaPrivateKey.fromStringECDSA(privateKey),
        { network },
    );
    const client = new x402Client().register(
        "hedera:*",
        new ExactHederaScheme(signer),
    );
    const fetchWithPayment = wrapFetchWithPayment(fetch, client);
    const httpClient = new x402HTTPClient(client);

    let catalogCache: DataProduct[] | undefined;
    const catalog = async (): Promise<DataProduct[]> => {
        if (catalogCache) return catalogCache;
        const res = await fetch(`${serverUrl}/catalog`);
        if (!res.ok) throw new Error(`catalog fetch failed: HTTP ${res.status}`);
        const body = (await res.json()) as { products: DataProduct[] };
        catalogCache = body.products;
        return catalogCache;
    };

    const priceAtomic = async (productId: string): Promise<string> => {
        const product = (await catalog()).find((p) => p.id === productId);
        if (!product) throw new Error(`Unknown product: ${productId}`);
        return product.priceAtomic;
    };

    const buy = async (
        product: string,
        params: Record<string, string>,
    ): Promise<Purchase> => {
        const qs = new URLSearchParams(params).toString();
        const url = `${serverUrl}/data/${product}${qs ? `?${qs}` : ""}`;
        const res = await fetchWithPayment(url);
        if (!res.ok) {
            throw new Error(`buy ${product} failed: HTTP ${res.status}`);
        }
        const body = (await res.json()) as {
            data: unknown;
            asOf: string;
        };
        let txId = "";
        let payer = accountId;
        try {
            const settle = httpClient.getPaymentSettleResponse((name) =>
                res.headers.get(name),
            );
            if (settle) {
                txId = settle.transaction ?? "";
                payer = settle.payer ?? accountId;
            }
        } catch {
            // no settlement header (e.g. request wasn't paid) - leave txId empty
        }
        return {
            product,
            params,
            data: body.data,
            asOf: body.asOf,
            amountAtomic: await priceAtomic(product),
            txId,
            payer,
        };
    };

    return { catalog, priceAtomic, buy, accountId, serverUrl };
};
