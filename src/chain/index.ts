import { ethers } from "ethers";

const ABI = [
  "function send(address recipient, uint256 amount) returns (uint256)",
  "function claim(uint256 id)",
  "function cancel(uint256 id)",
  "function nextId() view returns (uint256)",
  "function getTransfer(uint256 id) view returns (tuple(address sender, address recipient, uint256 amount, uint64 expiry, bool claimed, bool cancelled))",
  "event Sent(uint256 indexed id, address indexed sender, address indexed recipient, uint256 amount, uint64 expiry)",
];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
];

export const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);

export const toUsdt   = (amount: string) => ethers.parseUnits(amount, 6);
export const fromUsdt = (amount: bigint)  => ethers.formatUnits(amount, 6);

export function walletFromKey(privateKey: string) {
  return new ethers.Wallet(privateKey, provider);
}

// Generate a fresh wallet — called on /start for new users
export function generateWallet() {
  const wallet = ethers.Wallet.createRandom();
  return { address: wallet.address, privateKey: wallet.privateKey };
}

export async function getBalance(address: string): Promise<string> {
  const usdt = new ethers.Contract(process.env.USDT_ADDRESS!, ERC20_ABI, provider);
  const raw  = await usdt.balanceOf(address);
  return fromUsdt(raw);
}

const GAS_OVERRIDE = { gasLimit: 300_000 };

// Drip tiny INJ to new wallets so they can pay gas
export async function fundGas(recipientAddress: string): Promise<void> {
  const gasWallet = new ethers.Wallet(process.env.GAS_WALLET_KEY!, provider);
  const tx = await gasWallet.sendTransaction({
    to:       recipientAddress,
    value:    ethers.parseEther("0.1"), // 0.1 INJ — covers ~1000s of txs
    gasLimit: 21_000,
  });
  await tx.wait();
  console.log(`[chain] funded gas for ${recipientAddress}: ${tx.hash}`);
}
export async function sendRemittance(
  senderPrivateKey: string,
  recipientAddress: string,
  amount: string
): Promise<{ txHash: string; onChainId: number }> {
  const wallet = walletFromKey(senderPrivateKey);
  const usdt   = new ethers.Contract(process.env.USDT_ADDRESS!, ERC20_ABI, wallet);
  const escrow = new ethers.Contract(process.env.CONTRACT_ADDRESS!, ABI, wallet);
  const parsed = toUsdt(amount);

  console.log(`[chain] approving ${amount} USDT from ${wallet.address}`);
  const approveTx = await usdt.approve(process.env.CONTRACT_ADDRESS!, parsed, GAS_OVERRIDE);
  await approveTx.wait();
  console.log(`[chain] approve confirmed: ${approveTx.hash}`);

  console.log(`[chain] sending to escrow → ${recipientAddress}`);
  const tx      = await escrow.send(recipientAddress, parsed, GAS_OVERRIDE);
  const receipt = await tx.wait();
  console.log(`[chain] send confirmed: ${receipt.hash}`);

  const iface     = new ethers.Interface(ABI);
  let   onChainId = -1;

  // Try parsing the Sent event from logs
  for (const log of receipt.logs) {
    try {
      // Injective returns topics as readonly array — cast explicitly
      const parsed = iface.parseLog({
        topics: [...log.topics],
        data:   log.data,
      });
      if (parsed?.name === "Sent") {
        onChainId = Number(parsed.args.id);
        console.log(`[chain] parsed onChainId from event: ${onChainId}`);
        break;
      }
    } catch { /* skip non-matching logs */ }
  }

  // Fallback — read nextId from contract (last id = nextId - 1)
  if (onChainId === -1) {
    console.warn("[chain] event parse failed, falling back to nextId query");
    const escrowRead = new ethers.Contract(process.env.CONTRACT_ADDRESS!, ABI, provider);
    const nextId = await escrowRead.nextId();
    onChainId = Number(nextId) - 1;
    console.log(`[chain] fallback onChainId: ${onChainId}`);
  }

  if (onChainId === -1) throw new Error("Could not determine on-chain transfer ID");

  return { txHash: receipt.hash, onChainId };
}

// Bot signs claim on behalf of recipient
export async function claimRemittance(
  recipientPrivateKey: string,
  onChainId: number
): Promise<string> {
  const wallet  = walletFromKey(recipientPrivateKey);
  const escrow  = new ethers.Contract(process.env.CONTRACT_ADDRESS!, ABI, wallet);
  const tx      = await escrow.claim(onChainId, GAS_OVERRIDE);
  const receipt = await tx.wait();
  return receipt.hash;
}

// Bot signs cancel on behalf of sender
export async function cancelRemittance(
  senderPrivateKey: string,
  onChainId: number
): Promise<string> {
  const wallet  = walletFromKey(senderPrivateKey);
  const escrow  = new ethers.Contract(process.env.CONTRACT_ADDRESS!, ABI, wallet);
  const tx      = await escrow.cancel(onChainId, GAS_OVERRIDE);
  const receipt = await tx.wait();
  return receipt.hash;
}