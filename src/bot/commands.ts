import { Telegraf, Context } from "telegraf";
import { message } from "telegraf/filters";
import {
  findUser, findUserByUsername, createUser, updateUsername,
  createTransfer, confirmTransfer, updateTransferStatus,
  getPendingForRecipient, getHistory, getTransferById,
  TransferStatus,
} from "../db/index.js";
import {
  generateWallet, getBalance, fundGas,
  sendRemittance, claimRemittance, cancelRemittance,
} from "../chain/index.js";
import { encryptKey, decryptKey } from "../crypto.js";

// ── Helpers ────────────────────────────────────────────────────────────────

const tgId       = (ctx: Context) => String(ctx.from!.id);
const tgUsername = (ctx: Context) => ctx.from?.username;

async function requireUser(ctx: Context) {
  const user = await findUser(tgId(ctx));
  if (!user) {
    await ctx.reply("You don't have a wallet yet. Send /start to create one.");
    return null;
  }
  return user;
}

// ── Bot ────────────────────────────────────────────────────────────────────

export function createBot() {
  const bot = new Telegraf(process.env.BOT_TOKEN!);

  // /start — auto-create wallet for new users
  bot.start(async (ctx) => {
    const existing = await findUser(tgId(ctx));
    const name     = ctx.from?.first_name ?? "there";

    if (existing) {
      return ctx.reply(
        `Welcome back, ${name}! 👋\n\n` +
        `💼 Wallet: \`${existing.address}\`\n\n` +
        `Commands:\n` +
        `/balance — check USDT balance\n` +
        `/send @username amount — send USDT\n` +
        `/pending — transfers to claim\n` +
        `/history — last 10 transactions\n` +
        `/wallet — show your wallet address`,
        { parse_mode: "Markdown" }
      );
    }

    // New user — generate a wallet on the spot
    await ctx.reply("Creating your wallet... ⏳");

    const { address, privateKey } = generateWallet();
    const encryptedKey = encryptKey(privateKey);

    await createUser(tgId(ctx), address, encryptedKey, tgUsername(ctx));

    // Drip gas money silently — don't block wallet creation if it fails
    fundGas(address).catch((e) => console.error("[fundGas error]", e.message));

    await ctx.reply(
      `Welcome, ${name}! 🎉 Your wallet is ready.\n\n` +
      `💼 Address: \`${address}\`\n\n` +
      `Fund your wallet with USDT on Injective EVM, then use /send to transfer.\n\n` +
      `⚠️ This is a custodial wallet — the bot manages your keys securely on your behalf.`,
      { parse_mode: "Markdown" }
    );
  });

  // /wallet — show wallet address
  bot.command("wallet", async (ctx) => {
    const user = await requireUser(ctx);
    if (!user) return;
    await ctx.reply(`💼 Your wallet address:\n\n\`${user.address}\``, {
      parse_mode: "Markdown",
    });
  });

  // /balance
  bot.command("balance", async (ctx) => {
    const user = await requireUser(ctx);
    if (!user) return;
    try {
      const balance = await getBalance(user.address);
      await ctx.reply(`💰 Balance: *${balance} USDT*\n\nWallet: \`${user.address}\``, {
        parse_mode: "Markdown",
      });
    } catch {
      await ctx.reply("Could not fetch balance. Please try again.");
    }
  });

  // /send @username amount
  bot.command("send", async (ctx) => {
    const user = await requireUser(ctx);
    if (!user) return;

    const parts = ctx.message.text.trim().split(/\s+/);
    if (parts.length < 3) {
      return ctx.reply("Usage: /send @username amount\n\nExample: /send @alice 20");
    }

    const recipientUsername = parts[1].replace("@", "");
    const amount            = parts[2];

    if (isNaN(Number(amount)) || Number(amount) <= 0) {
      return ctx.reply("Invalid amount. Use a positive number.\nExample: /send @alice 20");
    }

    const recipient = await findUserByUsername(recipientUsername);
    if (!recipient) {
      return ctx.reply(
        `@${recipientUsername} hasn't created a wallet yet.\n\nAsk them to message this bot and run /start.`
      );
    }
    if (recipient.telegramId === tgId(ctx)) {
      return ctx.reply("You can't send to yourself.");
    }

    // Check sender balance
    const balance = await getBalance(user.address);
    if (Number(balance) < Number(amount)) {
      return ctx.reply(
        `Insufficient balance.\n\n💰 Your balance: *${balance} USDT*\nRequested: *${amount} USDT*`,
        { parse_mode: "Markdown" }
      );
    }

    await ctx.reply(`Sending ${amount} USDT to @${recipientUsername}... ⏳`);

    try {
      const senderKey        = decryptKey(user.encryptedKey);
      const dbTransfer       = await createTransfer(user.id, recipient.id, amount);
      const { txHash, onChainId } = await sendRemittance(senderKey, recipient.address, amount);
      await confirmTransfer(dbTransfer.id, txHash, onChainId);

      // Notify recipient
      try {
        await ctx.telegram.sendMessage(
          recipient.telegramId,
          `💸 You received *${amount} USDT* from @${user.username ?? "someone"}!\n\n` +
          `Use /claim ${dbTransfer.id} to claim it.\n\n` +
          `Expires in 72 hours.`,
          { parse_mode: "Markdown" }
        );
      } catch {
        // Recipient may not have started the bot yet — not fatal
      }

      await ctx.reply(
        `✅ Sent *${amount} USDT* to @${recipientUsername}!\n\n` +
        `Tx: \`${txHash}\`\n` +
        `Transfer ID: #${dbTransfer.id}`,
        { parse_mode: "Markdown" }
      );
    } catch (err: any) {
      console.error("[send error]", err);
      await ctx.reply(`Transfer failed: ${err?.message ?? "Unknown error"}. Please try again.`);
    }
  });

  // /pending — transfers waiting to be claimed
  bot.command("pending", async (ctx) => {
    const user = await requireUser(ctx);
    if (!user) return;

    const pending = await getPendingForRecipient(user.id);
    if (!pending.length) {
      return ctx.reply("No pending transfers waiting for you.");
    }

    const lines = pending.map(
      (t: { id: number; amount: string; sender: { username: string | null } }) =>
        `#${t.id} — *${t.amount} USDT* from @${t.sender.username ?? "unknown"}\n` +
        `→ /claim ${t.id}`
    );
    await ctx.reply(`📥 *Pending transfers:*\n\n${lines.join("\n\n")}`, {
      parse_mode: "Markdown",
    });
  });

  // /claim <transferId>
  bot.command("claim", async (ctx) => {
    const user = await requireUser(ctx);
    if (!user) return;

    const parts      = ctx.message.text.trim().split(/\s+/);
    const transferId = Number(parts[1]);
    if (!transferId) return ctx.reply("Usage: /claim <transferId>\n\nFind your IDs with /pending");

    const transfer = await getTransferById(transferId);
    if (!transfer || transfer.recipientId !== user.id) {
      return ctx.reply("Transfer not found or not yours to claim.");
    }
    if (transfer.status !== TransferStatus.CONFIRMED || transfer.onChainId === null) {
      return ctx.reply("This transfer is not claimable right now.");
    }

    await ctx.reply("Claiming your USDT... ⏳");

    try {
      const recipientKey = decryptKey(user.encryptedKey);
      const txHash       = await claimRemittance(recipientKey, transfer.onChainId);
      await updateTransferStatus(transfer.id, TransferStatus.CLAIMED);

      try {
        await ctx.telegram.sendMessage(
          transfer.sender.telegramId,
          `✅ @${user.username ?? "Recipient"} claimed your *${transfer.amount} USDT* transfer.\n\nTx: \`${txHash}\``,
          { parse_mode: "Markdown" }
        );
      } catch {}

      await ctx.reply(
        `✅ *${transfer.amount} USDT* claimed and in your wallet!\n\nTx: \`${txHash}\``,
        { parse_mode: "Markdown" }
      );
    } catch (err: any) {
      await ctx.reply(`Claim failed: ${err?.message ?? "Unknown error"}. Please try again.`);
    }
  });

  // /cancel <transferId>
  bot.command("cancel", async (ctx) => {
    const user = await requireUser(ctx);
    if (!user) return;

    const parts      = ctx.message.text.trim().split(/\s+/);
    const transferId = Number(parts[1]);
    if (!transferId) return ctx.reply("Usage: /cancel <transferId>");

    const transfer = await getTransferById(transferId);
    if (!transfer || transfer.senderId !== user.id) {
      return ctx.reply("Transfer not found or not yours.");
    }
    if (transfer.status !== TransferStatus.CONFIRMED || transfer.onChainId === null) {
      return ctx.reply("Only confirmed unclaimed transfers can be cancelled.");
    }

    await ctx.reply("Cancelling transfer... ⏳");

    try {
      const senderKey = decryptKey(user.encryptedKey);
      const txHash    = await cancelRemittance(senderKey, transfer.onChainId);
      await updateTransferStatus(transfer.id, TransferStatus.CANCELLED);

      await ctx.reply(
        `↩️ Cancelled. *${transfer.amount} USDT* returned to your wallet.\n\nTx: \`${txHash}\``,
        { parse_mode: "Markdown" }
      );
    } catch (err: any) {
      // Contract reverts if 72h hasn't passed yet
      if (err?.message?.includes("NotExpiredYet")) {
        return ctx.reply("Transfer can only be cancelled after the 72-hour expiry window.");
      }
      await ctx.reply(`Cancel failed: ${err?.message ?? "Unknown error"}.`);
    }
  });

  // /history
  bot.command("history", async (ctx) => {
    const user = await requireUser(ctx);
    if (!user) return;

    const history = await getHistory(user.id);
    if (!history.length) return ctx.reply("No transactions yet.");

    const statusEmoji: Record<string, string> = {
      PENDING:   "⏳",
      CONFIRMED: "📬",
      CLAIMED:   "✅",
      CANCELLED: "↩️",
    };

    const lines = history.map((t: {
      id: number; amount: string; senderId: number; status: string;
      createdAt: Date;
      sender: { username: string | null; address: string };
      recipient: { username: string | null; address: string };
    }) => {
      const isSender = t.senderId === user.id;
      const dir      = isSender ? "↑ Sent" : "↓ Received";
      const other    = isSender ? t.recipient : t.sender;
      const handle   = other.username ? `@${other.username}` : other.address.slice(0, 8) + "…";
      const date     = t.createdAt.toISOString().slice(0, 10);
      const emoji    = statusEmoji[t.status] ?? "";
      return `${dir} *${t.amount} USDT* ${isSender ? "to" : "from"} ${handle} ${emoji} ${date}`;
    });

    await ctx.reply(`📋 *Last 10 transactions:*\n\n${lines.join("\n")}`, {
      parse_mode: "Markdown",
    });
  });

  // /help
  bot.help(async (ctx) => {
    await ctx.reply(
      `*INJ Remit — Available Commands*\n\n` +
      `💼 *Wallet*\n` +
      `/start — create your wallet\n` +
      `/wallet — show your wallet address\n` +
      `/balance — check USDT balance\n\n` +
      `💸 *Transfers*\n` +
      `/send @username amount — send USDT\n` +
      `/pending — transfers waiting to claim\n` +
      `/claim <id> — claim incoming USDT\n` +
      `/cancel <id> — cancel outgoing transfer\n\n` +
      `📋 *History*\n` +
      `/history — last 10 transactions\n\n` +
      `ℹ️ *Other*\n` +
      `/help — show this message`,
      { parse_mode: "Markdown" }
    );
  });

  // Catch-all
  bot.on(message("text"), async (ctx) => {
    await ctx.reply("Unknown command. Type /help to see all available commands.");
  });

  // Register commands with Telegram — this powers the "/" autocomplete menu
  bot.telegram.setMyCommands([
    { command: "start",   description: "Create your wallet" },
    { command: "wallet",  description: "Show your wallet address" },
    { command: "balance", description: "Check USDT balance" },
    { command: "send",    description: "Send USDT — usage: /send @username amount" },
    { command: "pending", description: "Transfers waiting to claim" },
    { command: "claim",   description: "Claim incoming USDT — usage: /claim <id>" },
    { command: "cancel",  description: "Cancel outgoing transfer — usage: /cancel <id>" },
    { command: "history", description: "Last 10 transactions" },
    { command: "help",    description: "Show all available commands" },
  ]);

  return bot;
}