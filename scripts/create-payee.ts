// One-off: create a funded testnet account to act as the seller (PAY_TO_ACCOUNT).
// The x402 buyer (HEDERA_CLIENT_ID) pays this account. Server holds no key.
import "dotenv/config";
import {
    Client,
    PrivateKey,
    AccountCreateTransaction,
    Hbar,
} from "@hiero-ledger/sdk";

const operatorId = process.env.HEDERA_CLIENT_ID!;
const operatorKey = process.env.HEDERA_CLIENT_KEY!;

const client = Client.forTestnet().setOperator(
    operatorId,
    PrivateKey.fromStringECDSA(operatorKey),
);

const newKey = PrivateKey.generateECDSA();

const tx = await new AccountCreateTransaction()
    .setKeyWithoutAlias(newKey.publicKey)
    .setInitialBalance(new Hbar(2))
    .execute(client);

const receipt = await tx.getReceipt(client);
const newAccountId = receipt.accountId!.toString();

console.log("SELLER_ACCOUNT_ID=" + newAccountId);
console.log("SELLER_PRIVATE_KEY=" + newKey.toStringRaw());
console.log("CREATE_TX_ID=" + tx.transactionId!.toString());

client.close();
