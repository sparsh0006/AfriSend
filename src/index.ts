import "dotenv/config";
import { createBot } from "./bot/commands.js";
import { prisma }    from "./db/index.js";

async function main() {
  // Verify DB connection
  await prisma.$connect();
  console.log("✅ Database connected");

  const bot = createBot();
  console.log("✅ Bot initialized");

  // Graceful shutdown
  process.once("SIGINT",  () => { bot.stop("SIGINT");  prisma.$disconnect(); });
  process.once("SIGTERM", () => { bot.stop("SIGTERM"); prisma.$disconnect(); });

  await bot.launch();
  console.log("🤖 INJ Remit bot is running");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});