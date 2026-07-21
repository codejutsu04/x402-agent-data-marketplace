// One-off: create a Hedera Consensus Service topic for on-chain purchase receipts.
// Each x402 purchase the agent makes is logged as a message on this topic, giving
// a tamper-evident, publicly-verifiable audit trail (viewable on HashScan).
import "dotenv/config";
import {
    Client,
    PrivateKey,
    TopicCreateTransaction,
} from "@hiero-ledger/sdk";

const operatorId = process.env.HEDERA_CLIENT_ID!;
const operatorKey = process.env.HEDERA_CLIENT_KEY!;
const key = PrivateKey.fromStringECDSA(operatorKey);

const client = Client.forTestnet().setOperator(operatorId, key);

const tx = await new TopicCreateTransaction()
    .setTopicMemo("x402 agent purchase receipts")
    .setSubmitKey(key.publicKey)
    .execute(client);

const receipt = await tx.getReceipt(client);

console.log("HCS_TOPIC_ID=" + receipt.topicId!.toString());
console.log("CREATE_TX_ID=" + tx.transactionId!.toString());

client.close();
