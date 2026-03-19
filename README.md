# AfriSend 🌍

> Zero-fee P2P USDT remittance on Injective — built for Africa, accessible to everyone.

AfriSend is a Telegram bot that lets anyone send USDT across borders instantly and for free. No app download, no wallet setup, no seed phrases, no gas fees. Just Telegram.

Built on Injective EVM for the [Injective Africa Builderthon](https://x.com/injectiveafr).

---

## The Problem

Africa has some of the highest remittance costs in the world — 8–15% fees and 1–3 day delays through Western Union or MoneyGram. For someone sending $50 home, that's up to $7 gone in fees before it even arrives.

AfriSend eliminates this entirely.

---

## Why Injective?

Three things that no other chain gives for free:

- **Zero gas fees** — sending $20 with a $5 gas fee is a 25% tax. On Injective it costs nothing. This is the single reason micro-remittances are viable here and nowhere else.
- **~1 second finality** — the recipient gets a Telegram notification the moment funds confirm on-chain. On Ethereum you'd wait 30 seconds minimum.
- **Native USDT (MultiVM Token Standard)** — no bridges, no wrapped tokens. USDT is a first-class asset on Injective across both EVM and Cosmos modules.

---

## How It Works

```
1. /start        → bot generates a secure wallet for you automatically
2. fund wallet   → send USDT to your wallet address (/wallet)
3. /send @bob 20 → 20 USDT locked in escrow, @bob notified instantly
4. /claim <id>   → @bob claims, funds arrive in wallet
5. /cancel <id>  → sender gets full refund if unclaimed after 72h
```

The escrow contract acts as a neutral layer between sender and recipient — funds are never permanently gone until the recipient actively claims them. This is what makes `/cancel` and refunds possible.

---

## Bot Commands

| Command | Description |
|---|---|
| `/start` | Create your wallet automatically |
| `/wallet` | Show your wallet address |
| `/balance` | Check your USDT balance |
| `/send @username amount` | Send USDT to anyone on Telegram |
| `/pending` | View transfers waiting for you to claim |
| `/claim <id>` | Claim incoming USDT |
| `/cancel <id>` | Cancel outgoing transfer (after 72h expiry) |
| `/history` | Last 10 transactions |
| `/help` | Show all commands |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart contract | Solidity — escrow with send / claim / cancel |
| Blockchain | Injective EVM (Chain ID 1439) |
| Bot framework | Node.js + Telegraf.js |
| Chain interaction | ethers.js |
| Database | Prisma + PostgreSQL |
| Key security | AES-256-GCM encryption |

---

## Security

AfriSend is custodial — the bot manages wallets on behalf of users. Private keys are:
- Generated fresh per user on `/start`
- Encrypted with AES-256-GCM using a master `ENCRYPTION_SECRET`
- Stored encrypted in the database — never in plaintext
- Decrypted only in-memory at signing time, never logged or persisted

The `ENCRYPTION_SECRET` is the single master password. Without it the encrypted blobs in the database are useless.

---

## Smart Contract

The `RemittanceEscrow` contract handles all on-chain logic:

- `send(address recipient, uint256 amount)` — locks USDT in escrow
- `claim(uint256 id)` — recipient withdraws their USDT
- `cancel(uint256 id)` — sender cancels after 72h expiry, gets refund
- No admin keys, no upgrade functions, no owner — fully trustless

**Deployed on Injective EVM Testnet:**
- Contract: `0xF19A74AaB361D4209854379a69223d4CaC8eD2D2`
- Explorer: [testnet.blockscout.injective.network](https://testnet.blockscout.injective.network)

---

## Project Structure

```
afrisend/
├── contracts/
│   └── RemittanceEscrow.sol   # Solidity escrow contract
├── prisma/
│   └── schema.prisma          # Database schema
├── src/
│   ├── bot/
│   │   └── commands.ts        # All Telegram bot commands
│   ├── chain/
│   │   └── index.ts           # ethers.js — wallet, send, claim, cancel
│   ├── db/
│   │   └── index.ts           # Prisma queries
│   ├── crypto.ts              # AES-256-GCM key encryption
│   └── index.ts               # Entry point
├── .env.example
├── package.json
└── tsconfig.json
```

---

## Setup & Running

### 1. Clone and install

```bash
git clone https://github.com/sparsh0006/afrisend.git
cd afrisend
npm install
```

### 2. Deploy the contract

1. Open [remix.ethereum.org](https://remix.ethereum.org)
2. Paste `contracts/RemittanceEscrow.sol`
3. Compile with Solidity `0.8.20`
4. Add Injective EVM testnet to MetaMask:
   - RPC: `https://k8s.testnet.json-rpc.injective.network/`
   - Chain ID: `1439`
   - Explorer: `testnet.blockscout.injective.network`
5. Deploy with USDT address as constructor argument
6. Copy the deployed contract address

### 3. Configure environment

```bash
cp .env.example .env
```

Generate your encryption secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Fill in all values in `.env`.

### 4. Set up database

```bash
npm run db:push
```

### 5. Run

```bash
npm run dev     # development
npm run build   # build for production
npm start       # production
```

---

## Environment Variables

| Variable | Description |
|---|---|
| `BOT_TOKEN` | Telegram bot token from @BotFather |
| `ENCRYPTION_SECRET` | 32-byte hex secret for AES-256-GCM key encryption |
| `DATABASE_URL` | PostgreSQL connection string |
| `RPC_URL` | Injective EVM JSON-RPC endpoint |
| `CONTRACT_ADDRESS` | Deployed escrow contract address |
| `USDT_ADDRESS` | USDT contract on Injective EVM |
| `CHAIN_ID` | `1439` for Injective EVM testnet |
| `GAS_WALLET_KEY` | Private key of wallet that drips INJ to new users |

---

## Testnet Resources

- Injective testnet faucet (INJ): [testnet.faucet.injective.network](https://testnet.faucet.injective.network)
- USDT testnet faucet: [faucet.circle.com](https://faucet.circle.com)
- Explorer: [testnet.blockscout.injective.network](https://testnet.blockscout.injective.network)
- RPC: `https://k8s.testnet.json-rpc.injective.network/`
- Chain ID: `1439`

---

## Built For

[Injective Africa Builderthon](https://x.com/injectiveafr) — a virtual builder showcase spotlighting Africa's growing Web3 ecosystem.

---

## License

MIT