// On-chain purchase receipts via Hedera Consensus Service (HCS). After each x402
// payment, the agent submits a signed receipt message to a topic. The result is a
// tamper-evident, publicly-verifiable audit trail of everything the agent bought -
// genuine Hedera usage beyond the payment itself. Attestation is optional: if
// HCS_TOPIC_ID is unset, createAttestor() returns null and the agent still runs.
import {
    Client,
    PrivateKey,
    TopicMessageSubmitTransaction,
} from "@hiero-ledger/sdk";

export interface Receipt {
    product: string;
    params: Record<string, string>;
    amountAtomic: string;
    paymentTxId: string;
    payer: string;
    asOf: string;
}

export interface Attestation {
    topicId: string;
    sequenceNumber: string;
    attestTxId: string;
}

export interface Attestor {
    topicId: string;
    submit(receipt: Receipt): Promise<Attestation>;
    close(): void;
}

const required = (name: string): string => {
    const value = process.env[name];
    if (!value) throw new Error(`Missing required env var: ${name}`);
    return value;
};

export const createAttestor = (): Attestor | null => {
    const topicId = process.env.HCS_TOPIC_ID;
    if (!topicId) return null;

    const operatorId = required("HEDERA_CLIENT_ID");
    const operatorKey = required("HEDERA_CLIENT_KEY");
    const client = Client.forTestnet().setOperator(
        operatorId,
        PrivateKey.fromStringECDSA(operatorKey),
    );

    const submit = async (receipt: Receipt): Promise<Attestation> => {
        const message = JSON.stringify({
            kind: "x402-purchase-receipt",
            ...receipt,
        });
        const tx = await new TopicMessageSubmitTransaction({
            topicId,
            message,
        }).execute(client);
        const rcpt = await tx.getReceipt(client);
        return {
            topicId,
            sequenceNumber: rcpt.topicSequenceNumber?.toString() ?? "",
            attestTxId: tx.transactionId?.toString() ?? "",
        };
    };

    return { topicId, submit, close: () => client.close() };
};
