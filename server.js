"use strict";
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const {
JsonRpcProvider,
Contract,
parseUnits,
formatUnits
} = require("ethers");
const app = express();
app.use(cors());
app.use(express.json());
const PORT = process.env.PORT || 3000;
const ZEROX_API_KEY = process.env.ZEROX_API_KEY || "";
const RPC_URLS = {
base: process.env.BASE_RPC_URL || "",
arbitrum: process.env.ARBITRUM_RPC_URL || "",
optimism: process.env.OPTIMISM_RPC_URL || "",
polygon: process.env.POLYGON_RPC_URL || "",
ethereum: process.env.ETHEREUM_RPC_URL || "",
bnb: process.env.BNB_RPC_URL || ""
};
const VERSION = "3.2.1";
/*
=========================================================
DIRECT VENUE CONFIGURATION
Aerodrome Base deployment:
Router:
0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43
PoolFactory:
0x420DD381b31aEf6683db6B902084cB0FFECe40Da
This layer is READ ONLY.
It does not approve tokens, sign transactions,
move funds, or affect the paper account.
=========================================================
*/
const AERODROME_BASE = {
router:
"0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43",
factory:
"0x420DD381b31aEf6683db6B902084cB0FFECe40Da"
};
const AERODROME_ROUTER_ABI = [
"function defaultFactory() view returns (address)",
"function getAmountsOut(uint256 amountIn, tuple(address from,address to,bool stable,address factory)[] routes) view returns (uint256[] amounts)"
];
/*
=========================================================
UNISWAP V3 BASE - READ ONLY
Official Base deployment used by Engine 3.2.0:
View-only Quoter: 0x222ca98f00ed15b1fae10b61c277703a194cf5d2
V3 Factory: 0x33128a8fC17869897dcE68Ed026d694621f6FDfD
This layer is read only. It does not approve tokens, sign,
broadcast, execute swaps, or affect paper capital.
=========================================================
*/
const UNISWAP_V3_BASE = {
quoter: "0x222ca98f00ed15b1fae10b61c277703a194cf5d2",
factory: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
feeTiers: [100, 500, 3000, 10000]
};
const UNISWAP_V3_QUOTER_ABI = [
"function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96) params) view returns (uint256 amountOut,];
const UNISWAP_V3_FACTORY_ABI = [
"function getPool(address tokenA,address tokenB,uint24 fee) view returns (address pool)"
];
/*
=========================================================
ARBIFLOW ENGINE 3.2.1
PHASE:
Live market discovery + paper simulation.
THIS BUILD DOES:
- Live 0x indicative pricing
- Six selectable networks
- Round-trip routes
- Triangular routes
- Fast discovery
- Near-pass watchlist
- Adaptive position sizing
- Gas estimation
- Risk score
- Quality score
- Fresh confirmation
- Paper simulation
- Paper history
- Six private RPC connections
- RPC reachability testing
- RPC chain-ID validation
- Latest-block verification
- Read-only Aerodrome direct venue quoting on Base
- Stable and volatile Aerodrome route comparison
- Read-only Uniswap V3 direct venue quoting on Base
- Uniswap V3 fee-tier comparison
- Aerodrome and Uniswap remain isolated from the main scanner until direct venue tests pass
THIS BUILD DOES NOT:
- Hold private keys
- Connect MetaMask yet
- Broadcast blockchain transactions
- Claim paper passes are live executable trades
- Claim 0x liquidity sources are independent venue arbitrage
- Broadcast or execute Aerodrome transactions
- Broadcast or execute Uniswap transactions
=========================================================
*/
const SETTINGS = {
defaultCapital: 500,
discoveryProbeUsd: 25,
maxTradeCapitalPercent: 0.50,
minimumPaperPassUsd: 0.02,
minimumPaperPassRoiPercent: 0.01,
watchlistNetFloorUsd: -0.50,
quoteFreshnessMs: 15000,
requestDelayMs: 160,
retryDelayMs: 1800,
maxRetries: 2,
gasSafetyMultiplier: 1.15,
slippageBps: 50,
autoPaperTrading: false,
maxAutoRiskScore: 55,
maxAutoTradesPerCycle: 1,
optimizationPercents: [
0.025,
0.05,
0.075,
0.10,
0.15,
0.20,
0.30,
0.40,
0.50
],
optimizationFixedSizes: [
10,
25,
50,
75,
100,
150,
250,
500,
750,
1000
]
};
/*
=========================================================
NETWORK CONFIGURATION
=========================================================
*/
const NETWORKS = {
base: {
key: "base",
name: "Base",
chainId: 8453,
gasSymbol: "ETH",
wrappedNative: "WETH",
tokens: {
USDC: {
symbol: "USDC",
address:
"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
decimals: 6,
stable: true
},
WETH: {
symbol: "WETH",
address:
"0x4200000000000000000000000000000000000006",
decimals: 18
},
DAI: {
symbol: "DAI",
address:
"0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
decimals: 18,
stable: true
}
}
},
arbitrum: {
key: "arbitrum",
name: "Arbitrum",
chainId: 42161,
gasSymbol: "ETH",
wrappedNative: "WETH",
tokens: {
USDC: {
symbol: "USDC",
address:
"0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
decimals: 6,
stable: true
},
USDT: {
symbol: "USDT",
address:
"0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
decimals: 6,
stable: true
},
WETH: {
symbol: "WETH",
address:
"0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
decimals: 18
},
ARB: {
symbol: "ARB",
address:
"0x912CE59144191C1204E64559FE8253a0e49E6548",
decimals: 18
}
}
},
optimism: {
key: "optimism",
name: "Optimism",
chainId: 10,
gasSymbol: "ETH",
wrappedNative: "WETH",
tokens: {
USDC: {
symbol: "USDC",
address:
"0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
decimals: 6,
stable: true
},
USDT: {
symbol: "USDT",
address:
"0x94b008aA00579c1307B0EF2c499aD98a8cE58e58",
decimals: 6,
stable: true
},
WETH: {
symbol: "WETH",
address:
"0x4200000000000000000000000000000000000006",
decimals: 18
},
OP: {
symbol: "OP",
address:
"0x4200000000000000000000000000000000000042",
decimals: 18
}
}
},
polygon: {
key: "polygon",
name: "Polygon",
chainId: 137,
gasSymbol: "POL",
wrappedNative: "WPOL",
tokens: {
USDC: {
symbol: "USDC",
address:
"0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
decimals: 6,
stable: true
},
USDT: {
symbol: "USDT",
address:
"0xc2132D05D31c914a87C6611C10748AaCBaF9A6b",
decimals: 6,
stable: true
},
WPOL: {
symbol: "WPOL",
address:
"0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
decimals: 18
}
}
},
ethereum: {
key: "ethereum",
name: "Ethereum",
chainId: 1,
gasSymbol: "ETH",
wrappedNative: "WETH",
tokens: {
USDC: {
symbol: "USDC",
address:
"0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
decimals: 6,
stable: true
},
USDT: {
symbol: "USDT",
address:
"0xdAC17F958D2ee523a2206206994597C13D831ec7",
decimals: 6,
stable: true
},
WETH: {
symbol: "WETH",
address:
"0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
decimals: 18
},
DAI: {
symbol: "DAI",
address:
"0x6B175474E89094C44Da98b954EedeAC495271d0F",
decimals: 18,
stable: true
}
}
},
bnb: {
key: "bnb",
name: "BNB Chain",
chainId: 56,
gasSymbol: "BNB",
wrappedNative: "WBNB",
tokens: {
USDC: {
symbol: "USDC",
address:
"0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
decimals: 18,
stable: true
},
USDT: {
symbol: "USDT",
address:
"0x55d398326f99059fF775485246999027B3197955",
decimals: 18,
stable: true
},
WBNB: {
symbol: "WBNB",
address:
"0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
decimals: 18
}
}
}
};
/*
=========================================================
ACCOUNT
=========================================================
*/
const account = {
startingBalance: SETTINGS.defaultCapital,
balance: SETTINGS.defaultCapital,
realizedPnL: 0,
simulatedTrades: 0
};
/*
=========================================================
SCANNER STATE
=========================================================
*/
const state = {
startedAt: new Date().toISOString(),
running: false,
cycle: 0,
scanPhase: "IDLE",
progressPercent: 0,
currentNetwork: null,
currentRoute: null,
routesGenerated: 0,
routesScreened: 0,
testsPlanned: 0,
testsAttempted: 0,
testsCompleted: 0,
positiveGrossDetected: 0,
watchlistFound: 0,
candidatesFound: 0,
optimizedFound: 0,
confirmedFound: 0,
paperPassFound: 0,
rateLimited: false,
lastScanStarted: null,
lastScanCompleted: null,
lastSuccessfulQuote: null,
lastError: null,
discovery: [],
watchlist: [],
candidates: [],
optimized: [],
confirmed: [],
paperPass: [],
rejected: [],
paperExecuted: [],
history: [],
errors: []
};
let selectedNetworks = [
"base",
"arbitrum",
"optimism",
"polygon",
"ethereum",
"bnb"
];
/*
=========================================================
UTILITIES
=========================================================
*/
function now() {
return new Date().toISOString();
}
function sleep(ms) {
return new Promise(resolve =>
setTimeout(resolve, ms)
);
}
function round(value, decimals = 6) {
const number = Number(value);
if (!Number.isFinite(number)) {
return 0;
}
const factor =
10 ** decimals;
return (
Math.round(number * factor) /
factor
);
}
function clamp(
value,
minimum,
maximum
) {
return Math.max(
minimum,
Math.min(maximum, value)
);
}
function unique(values) {
return [
...new Set(values)
];
}
function getNetwork(key) {
return NETWORKS[key] || null;
}
function getSelectedNetworks() {
return selectedNetworks
.map(getNetwork)
.filter(Boolean);
}
function tokenToBaseUnits(
amount,
decimals
) {
const numeric =
Number(amount);
if (
!Number.isFinite(numeric) ||
numeric <= 0
) {
throw new Error(
"Invalid token amount."
);
}
/*
Avoid floating-point multiplication
against very large 18-decimal values.
*/
let text =
numeric.toFixed(decimals);
let [
whole,
fraction = ""
] = text.split(".");
fraction =
fraction.padEnd(
decimals,
"0"
);
const combined =
`${whole}${fraction}`
.replace(/^0+/, "") ||
"0";
return BigInt(
combined
).toString();
}
function baseUnitsToToken(
rawAmount,
decimals
) {
const raw =
BigInt(
rawAmount || "0"
);
const divisor =
10n **
BigInt(decimals);
const whole =
raw / divisor;
const remainder =
raw % divisor;
let fraction =
remainder
.toString()
.padStart(
decimals,
"0"
)
.replace(
/0+$/,
""
);
if (!fraction) {
return Number(
whole.toString()
);
}
return Number(
`${whole.toString()}.${fraction}`
);
}
function resetScan() {
state.progressPercent = 0;
state.currentNetwork = null;
state.currentRoute = null;
state.routesGenerated = 0;
state.routesScreened = 0;
state.testsPlanned = 0;
state.testsAttempted = 0;
state.testsCompleted = 0;
state.positiveGrossDetected = 0;
state.watchlistFound = 0;
state.candidatesFound = 0;
state.optimizedFound = 0;
state.confirmedFound = 0;
state.paperPassFound = 0;
state.lastError = null;
state.discovery = [];
state.watchlist = [];
state.candidates = [];
state.optimized = [];
state.confirmed = [];
state.paperPass = [];
state.rejected = [];
state.errors = [];
}
/*
=========================================================
RPC HEALTH
=========================================================
*/
function rpcConfigured(networkKey) {
return Boolean(
RPC_URLS[networkKey]
);
}
async function rpcRequest(
networkKey,
method,
params = []
) {
const url =
RPC_URLS[networkKey];
if (!url) {
throw new Error(
`${networkKey} RPC URL is not configured.`
);
}
const response =
await fetch(
url,
{
method: "POST",
headers: {
"Content-Type":
"application/json"
},
body:
JSON.stringify({
jsonrpc: "2.0",
id: 1,
method,
params
})
}
);
const body =
await response.text();
let data = {};
try {
data =
body
? JSON.parse(body)
: {};
} catch {
throw new Error(
`RPC returned invalid JSON (HTTP ${response.status}).`
);
}
if (!response.ok) {
throw new Error(
data?.error?.message ||
`RPC HTTP ${response.status}`
);
}
if (data.error) {
throw new Error(
data.error.message ||
"RPC request failed."
);
}
return data.result;
}
async function testRpcNetwork(
network
) {
const configured =
rpcConfigured(
network.key
);
if (!configured) {
return {
key: network.key,
name: network.name,
chainId: network.chainId,
configured: false,
reachable: false,
chainIdMatches: false,
latestBlock: null,
latencyMs: null,
error:
"RPC URL is not configured."
};
}
const started =
Date.now();
try {
const [
chainIdHex,
blockHex
] =
await Promise.all([
rpcRequest(
network.key,
"eth_chainId"
),
rpcRequest(
network.key,
"eth_blockNumber"
)
]);
const reportedChainId =
Number.parseInt(
chainIdHex,
16
);
const latestBlock =
Number.parseInt(
blockHex,
16
);
return {
key: network.key,
name: network.name,
chainId: network.chainId,
configured: true,
reachable: true,
reportedChainId,
chainIdMatches:
reportedChainId ===
network.chainId,
latestBlock:
Number.isFinite(
latestBlock
)
? latestBlock
: null,
latencyMs:
Date.now() -
started,
error: null
};
} catch (error) {
return {
key: network.key,
name: network.name,
chainId: network.chainId,
configured: true,
reachable: false,
chainIdMatches: false,
latestBlock: null,
latencyMs:
Date.now() -
started,
error:
error.message
};
}
}
async function rpcHealthSummary() {
const results =
await Promise.all(
Object
.values(
NETWORKS
)
.map(
testRpcNetwork
)
);
const configuredCount =
results.filter(
item =>
item.configured
).length;
const reachableCount =
results.filter(
item =>
item.reachable &&
item.chainIdMatches
).length;
return {
configuredCount,
reachableCount,
allConfigured:
configuredCount ===
results.length,
allReachable:
reachableCount ===
results.length,
networks:
results
};
}
/*
=========================================================
AERODROME DIRECT VENUE QUOTING - BASE ONLY
=========================================================
*/
function getBaseProvider() {
if (!RPC_URLS.base) {
throw new Error(
"BASE_RPC_URL is not configured."
);
}
return new JsonRpcProvider(
RPC_URLS.base,
NETWORKS.base.chainId,
{
staticNetwork: true
}
);
}
async function aerodromeQuoteOne({
sellToken,
buyToken,
sellAmount,
stable
}) {
const network =
NETWORKS.base;
const sell =
network.tokens[sellToken];
const buy =
network.tokens[buyToken];
if (!sell || !buy) {
throw new Error(
`Unsupported Base token pair: ${sellToken}/${buyToken}.`
);
}
if (sellToken === buyToken) {
throw new Error(
"Sell token and buy token must be different."
);
}
const numericAmount =
Number(sellAmount);
if (
!Number.isFinite(numericAmount) ||
numericAmount <= 0
) {
throw new Error(
"Sell amount must be greater than zero."
);
}
const provider =
getBaseProvider();
const router =
new Contract(
AERODROME_BASE.router,
AERODROME_ROUTER_ABI,
provider
);
const amountIn =
parseUnits(
String(sellAmount),
sell.decimals
);
const routes = [
{
from:
sell.address,
to:
buy.address,
stable:
Boolean(stable),
factory:
AERODROME_BASE.factory
}
];
const amounts =
await router.getAmountsOut(
amountIn,
routes
);
const rawOutput =
amounts?.[1] ?? 0n;
const buyAmount =
Number(
formatUnits(
rawOutput,
buy.decimals
)
);
if (
!Number.isFinite(buyAmount) ||
buyAmount <= 0
) {
throw new Error(
`No ${stable ? "stable" : "volatile"} Aerodrome liquidity returned for ${sellToken}/${buyToken}.`
);
}
return {
provider:
"Aerodrome",
liquidityModel:
"DIRECT_VENUE",
network:
network.name,
networkKey:
network.key,
chainId:
network.chainId,
router:
AERODROME_BASE.router,
factory:
AERODROME_BASE.factory,
poolType:
stable
? "STABLE"
: "VOLATILE",
sellToken,
buyToken,
sellAmount:
numericAmount,
buyAmount:
round(
buyAmount,
12
),
rawBuyAmount:
rawOutput.toString(),
quoteTimestamp:
Date.now(),
readOnly:
true
};
}
async function aerodromeBestQuote({
sellToken,
buyToken,
sellAmount
}) {
const attempts =
await Promise.allSettled([
aerodromeQuoteOne({
sellToken,
buyToken,
sellAmount,
stable: false
}),
aerodromeQuoteOne({
sellToken,
buyToken,
sellAmount,
stable: true
})
]);
const successful =
attempts
.filter(
item =>
item.status ===
"fulfilled"
)
.map(
item =>
item.value
);
const failures =
attempts
.filter(
item =>
item.status ===
"rejected"
)
.map(
item =>
item.reason?.message ||
"Aerodrome quote failed."
);
if (
successful.length === 0
) {
throw new Error(
failures.join(" | ") ||
"No Aerodrome quote was available."
);
}
successful.sort(
(a, b) =>
b.buyAmount -
a.buyAmount
);
return {
best:
successful[0],
alternatives:
successful,
failures
};
}
async function aerodromeHealth() {
const network =
NETWORKS.base;
if (!RPC_URLS.base) {
return {
configured: false,
reachable: false,
contractReadable: false,
network:
network.name,
chainId:
network.chainId,
router:
AERODROME_BASE.router,
factory:
AERODROME_BASE.factory,
error:
"BASE_RPC_URL is not configured."
};
}
const started =
Date.now();
try {
const provider =
getBaseProvider();
const actualNetwork =
await provider.getNetwork();
const router =
new Contract(
AERODROME_BASE.router,
AERODROME_ROUTER_ABI,
provider
);
const defaultFactory =
await router.defaultFactory();
const chainId =
Number(
actualNetwork.chainId
);
return {
configured: true,
reachable: true,
contractReadable: true,
network:
network.name,
expectedChainId:
network.chainId,
reportedChainId:
chainId,
chainIdMatches:
chainId ===
network.chainId,
venue:
"Aerodrome",
router:
AERODROME_BASE.router,
configuredFactory:
AERODROME_BASE.factory,
routerDefaultFactory:
defaultFactory,
factoryMatches:
String(defaultFactory)
.toLowerCase() ===
AERODROME_BASE.factory
.toLowerCase(),
latencyMs:
Date.now() -
started,
readOnly:
true,
error:
null
};
} catch (error) {
return {
configured: true,
reachable: false,
contractReadable: false,
network:
network.name,
chainId:
network.chainId,
venue:
"Aerodrome",
router:
AERODROME_BASE.router,
factory:
AERODROME_BASE.factory,
latencyMs:
Date.now() -
started,
readOnly:
true,
error:
error.message
};
}
}
/*
=========================================================
UNISWAP V3 DIRECT VENUE QUOTING - BASE ONLY
=========================================================
*/
async function uniswapV3QuoteOne({
sellToken,
buyToken,
sellAmount,
fee
}) {
const network = NETWORKS.base;
const sell = network.tokens[sellToken];
const buy = network.tokens[buyToken];
if (!sell || !buy) {
throw new Error(
`Unsupported Base token pair: ${sellToken}/${buyToken}.`
);
}
if (sellToken === buyToken) {
throw new Error(
"Sell token and buy token must be different."
);
}
const numericAmount = Number(sellAmount);
if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
throw new Error(
"Sell amount must be greater than zero."
);
}
if (!UNISWAP_V3_BASE.feeTiers.includes(Number(fee))) {
throw new Error(`Unsupported Uniswap V3 fee tier: ${fee}.`);
}
const provider = getBaseProvider();
const factory = new Contract(
UNISWAP_V3_BASE.factory,
UNISWAP_V3_FACTORY_ABI,
provider
);
const pool = await factory.getPool(
sell.address,
buy.address,
Number(fee)
);
if (
!pool ||
String(pool).toLowerCase() ===
"0x0000000000000000000000000000000000000000"
) {
throw new Error(
`No Uniswap V3 ${fee} fee-tier pool for ${sellToken}/${buyToken}.`
);
}
const quoter = new Contract(
UNISWAP_V3_BASE.quoter,
UNISWAP_V3_QUOTER_ABI,
provider
);
const amountIn = parseUnits(
String(sellAmount),
sell.decimals
);
const quoteResult = await quoter.quoteExactInputSingle({
tokenIn: sell.address,
tokenOut: buy.address,
amountIn,
fee: Number(fee),
sqrtPriceLimitX96: 0
});
const rawOutput = quoteResult.amountOut ?? quoteResult[0];
const sqrtPriceX96After = quoteResult.sqrtPriceX96After ?? quoteResult[1];
const initializedTicksCrossed = quoteResult.initializedTicksCrossed ?? quoteResult[2];
const gasEstimate = quoteResult.gasEstimate ?? quoteResult[3];
const buyAmount = Number(
formatUnits(rawOutput, buy.decimals)
);
if (!Number.isFinite(buyAmount) || buyAmount <= 0) {
throw new Error(
`Uniswap V3 returned an invalid ${fee} fee-tier quote.`
);
}
return {
provider: "Uniswap V3",
liquidityModel: "DIRECT_VENUE",
network: network.name,
networkKey: network.key,
chainId: network.chainId,
quoter: UNISWAP_V3_BASE.quoter,
factory: UNISWAP_V3_BASE.factory,
pool,
feeTier: Number(fee),
feePercent: Number(fee) / 10000,
sellToken,
buyToken,
sellAmount: numericAmount,
buyAmount: round(buyAmount, 12),
rawBuyAmount: rawOutput.toString(),
sqrtPriceX96After: sqrtPriceX96After?.toString?.() ?? null,
initializedTicksCrossed: initializedTicksCrossed?.toString?.() ?? null,
quoteGasEstimate: gasEstimate?.toString?.() ?? null,
quoteTimestamp: Date.now(),
readOnly: true
};
}
async function uniswapV3BestQuote({
sellToken,
buyToken,
sellAmount
}) {
const attempts = await Promise.allSettled(
UNISWAP_V3_BASE.feeTiers.map(fee =>
uniswapV3QuoteOne({
sellToken,
buyToken,
sellAmount,
fee
})
)
);
const successful = attempts
.filter(item => item.status === "fulfilled")
.map(item => item.value);
const failures = attempts
.filter(item => item.status === "rejected")
.map(item => item.reason?.message || "Uniswap V3 quote failed.");
if (successful.length === 0) {
throw new Error(
failures.join(" | ") || "No Uniswap V3 quote was available."
);
}
successful.sort((a, b) => b.buyAmount - a.buyAmount);
return {
best: successful[0],
alternatives: successful,
failures
};
}
async function uniswapV3Health() {
const network = NETWORKS.base;
if (!RPC_URLS.base) {
return {
configured: false,
reachable: false,
contractReadable: false,
network: network.name,
chainId: network.chainId,
venue: "Uniswap V3",
quoter: UNISWAP_V3_BASE.quoter,
factory: UNISWAP_V3_BASE.factory,
error: "BASE_RPC_URL is not configured."
};
}
const started = Date.now();
try {
const provider = getBaseProvider();
const actualNetwork = await provider.getNetwork();
const quoterCode = await provider.getCode(UNISWAP_V3_BASE.quoter);
const factoryCode = await provider.getCode(UNISWAP_V3_BASE.factory);
const chainId = Number(actualNetwork.chainId);
const quoterReadable = quoterCode && quoterCode !== "0x";
const factoryReadable = factoryCode && factoryCode !== "0x";
return {
configured: true,
reachable: true,
contractReadable: Boolean(quoterReadable && factoryReadable),
network: network.name,
expectedChainId: network.chainId,
reportedChainId: chainId,
chainIdMatches: chainId === network.chainId,
venue: "Uniswap V3",
quoter: UNISWAP_V3_BASE.quoter,
factory: UNISWAP_V3_BASE.factory,
quoterReadable: Boolean(quoterReadable),
factoryReadable: Boolean(factoryReadable),
feeTiers: UNISWAP_V3_BASE.feeTiers,
latencyMs: Date.now() - started,
readOnly: true,
error: null
};
} catch (error) {
return {
configured: true,
reachable: false,
contractReadable: false,
network: network.name,
chainId: network.chainId,
venue: "Uniswap V3",
quoter: UNISWAP_V3_BASE.quoter,
factory: UNISWAP_V3_BASE.factory,
latencyMs: Date.now() - started,
readOnly: true,
error: error.message
};
}
}
/*
=========================================================
NETWORK SUMMARY
=========================================================
*/
function networkSummary(
network
) {
return {
key:
network.key,
name:
network.name,
chainId:
network.chainId,
gasSymbol:
network.gasSymbol,
wrappedNative:
network.wrappedNative,
rpcConfigured:
rpcConfigured(
network.key
),
selected:
selectedNetworks.includes(
network.key
),
tokens:
Object.keys(
network.tokens
)
};
}
/*
=========================================================
0x PRICE PROVIDER
=========================================================
*/
async function zeroXPrice({
network,
sellToken,
buyToken,
sellAmount
}) {
if (!ZEROX_API_KEY) {
throw new Error(
"ZEROX_API_KEY is not configured."
);
}
const sell =
network.tokens[
sellToken
];
const buy =
network.tokens[
buyToken
];
if (!sell || !buy) {
throw new Error(
`Unsupported ${sellToken}/${buyToken} pair on ${network.name}.`
);
}
const sellAmountBase =
tokenToBaseUnits(
sellAmount,
sell.decimals
);
const params =
new URLSearchParams({
chainId:
String(
network.chainId
),
sellToken:
sell.address,
buyToken:
buy.address,
sellAmount:
sellAmountBase,
slippageBps:
String(
SETTINGS.slippageBps
)
});
const url =
"https://api.0x.org" +
"/swap/allowance-holder/price?" +
params.toString();
let finalError = null;
for (
let attempt = 0;
attempt <=
SETTINGS.maxRetries;
attempt += 1
) {
try {
const response =
await fetch(
url,
{
method: "GET",
headers: {
"0x-api-key":
ZEROX_API_KEY,
"0x-version":
"v2",
"Content-Type":
"application/json"
}
}
);
if (
response.status === 429
) {
state.rateLimited =
true;
await sleep(
SETTINGS.retryDelayMs *
(attempt + 1)
);
continue;
}
const body =
await response.text();
let data = {};
try {
data =
body
? JSON.parse(body)
: {};
} catch {
data = {};
}
if (!response.ok) {
const message =
data.reason ||
data.message ||
data.validationErrors?.[0]
?.reason ||
`0x HTTP ${response.status}`;
throw new Error(
message
);
}
if (
data.liquidityAvailable ===
false
) {
throw new Error(
"No liquidity available."
);
}
if (!data.buyAmount) {
throw new Error(
"0x returned no buyAmount."
);
}
const buyAmount =
baseUnitsToToken(
data.buyAmount,
buy.decimals
);
let networkFeeNative =
0;
if (
data.totalNetworkFee
) {
networkFeeNative =
Number(
data.totalNetworkFee
) / 1e18;
} else {
const gas =
Number(
data.gas || 0
);
const gasPrice =
Number(
data.gasPrice || 0
);
if (
gas > 0 &&
gasPrice > 0
) {
networkFeeNative =
(
gas *
gasPrice
) /
1e18;
}
}
state.rateLimited =
false;
state.lastSuccessfulQuote =
{
at: now(),
network:
network.name,
chainId:
network.chainId,
sellToken,
buyToken,
sellAmount:
round(
sellAmount,
8
),
buyAmount:
round(
buyAmount,
8
)
};
return {
provider:
"0x Swap API",
liquidityModel:
"AGGREGATED",
network:
network.name,
networkKey:
network.key,
chainId:
network.chainId,
sellToken,
buyToken,
sellAmount:
Number(
sellAmount
),
buyAmount,
networkFeeNative,
gasSymbol:
network.gasSymbol,
quoteTimestamp:
Date.now()
};
} catch (error) {
finalError =
error;
if (
attempt <
SETTINGS.maxRetries
) {
await sleep(
SETTINGS.retryDelayMs *
(attempt + 1)
);
}
}
}
throw (
finalError ||
new Error(
"0x price request failed."
)
);
}
/*
=========================================================
NATIVE GAS TOKEN USD VALUE
=========================================================
*/
const nativePriceCache =
new Map();
async function getNativeUsd(
network
) {
const cached =
nativePriceCache.get(
network.key
);
if (
cached &&
Date.now() -
cached.timestamp <
120000
) {
return cached.price;
}
const wrapped =
network.wrappedNative;
if (
!network.tokens[wrapped] ||
!network.tokens.USDC
) {
return 0;
}
try {
const quote =
await zeroXPrice({
network,
sellToken:
wrapped,
buyToken:
"USDC",
sellAmount:
1
});
const price =
quote.buyAmount;
nativePriceCache.set(
network.key,
{
price,
timestamp:
Date.now()
}
);
return price;
} catch {
return 0;
}
}
async function quoteGasUsd(
network,
quote
) {
if (
!quote.networkFeeNative
) {
return 0;
}
const nativeUsd =
await getNativeUsd(
network
);
if (!nativeUsd) {
return 0;
}
return (
quote.networkFeeNative *
nativeUsd *
SETTINGS.gasSafetyMultiplier
);
}
/*
=========================================================
ROUTE GENERATION
=========================================================
*/
function generateRoutes(
network
) {
const symbols =
Object.keys(
network.tokens
);
const routes = [];
if (
!symbols.includes(
"USDC"
)
) {
return routes;
}
/*
ROUND TRIPS
USDC -> TOKEN -> USDC
*/
for (
const token of symbols
) {
if (
token === "USDC"
) {
continue;
}
routes.push({
id:
`${network.key}-rt-${token}`,
type:
"ROUND_TRIP",
networkKey:
network.key,
label:
`USDC ® ${token} ® USDC`,
legs: [
[
"USDC",
token
],
[
token,
"USDC"
]
]
});
}
/*
TRIANGLES
USDC -> A -> B -> USDC
*/
const middleTokens =
symbols.filter(
symbol =>
symbol !==
"USDC"
);
for (
let a = 0;
a <
middleTokens.length;
a += 1
) {
for (
let b = 0;
b <
middleTokens.length;
b += 1
) {
if (a === b) {
continue;
}
const tokenA =
middleTokens[a];
const tokenB =
middleTokens[b];
routes.push({
id:
`${network.key}-tri-${tokenA}-${tokenB}`,
type:
"TRIANGULAR",
networkKey:
network.key,
label:
`USDC ® ${tokenA} ® ${tokenB} ® USDC`,
legs: [
[
"USDC",
tokenA
],
[
tokenA,
tokenB
],
[
tokenB,
"USDC"
]
]
});
}
}
return routes;
}
/*
=========================================================
ROUTE QUOTE
=========================================================
*/
async function quoteRoute({
network,
route,
tradeSize
}) {
let currentAmount =
Number(
tradeSize
);
let totalGasUsd = 0;
const legs = [];
for (
let index = 0;
index <
route.legs.length;
index += 1
) {
const [
sellToken,
buyToken
] =
route.legs[index];
await sleep(
SETTINGS.requestDelayMs
);
const quote =
await zeroXPrice({
network,
sellToken,
buyToken,
sellAmount:
currentAmount
});
const gasUsd =
await quoteGasUsd(
network,
quote
);
totalGasUsd +=
gasUsd;
legs.push({
leg:
index + 1,
provider:
quote.provider,
liquidityModel:
quote.liquidityModel,
sellToken,
buyToken,
sellAmount:
round(
currentAmount,
8
),
buyAmount:
round(
quote.buyAmount,
8
),
estimatedGasUsd:
round(
gasUsd,
6
)
});
currentAmount =
quote.buyAmount;
}
const finalValue =
Number(
currentAmount
);
const gross =
finalValue -
Number(
tradeSize
);
const estimatedNet =
gross -
totalGasUsd;
const roiPercent =
tradeSize > 0
? (
estimatedNet /
tradeSize
) *
100
: 0;
return {
routeId:
route.id,
network:
network.name,
networkKey:
network.key,
chainId:
network.chainId,
gasSymbol:
network.gasSymbol,
routeType:
route.type,
route:
route.label,
tradeSize:
round(
tradeSize,
6
),
startingValue:
round(
tradeSize,
6
),
finalValue:
round(
finalValue,
6
),
gross:
round(
gross,
6
),
estimatedGasUsd:
round(
totalGasUsd,
6
),
estimatedNet:
round(
estimatedNet,
6
),
roiPercent:
round(
roiPercent,
6
),
legs,
quoteTimestamp:
Date.now(),
quoteTime:
now()
};
}
/*
=========================================================
RISK
=========================================================
*/
function calculateRisk(
result
) {
let score = 10;
if (
result.routeType ===
"TRIANGULAR"
) {
score += 15;
}
if (
result.legs.length >= 3
) {
score += 10;
}
if (
result.tradeSize >=
500
) {
score += 10;
}
if (
result.tradeSize >=
1000
) {
score += 10;
}
if (
result.estimatedGasUsd >
Math.max(
0.25,
Math.abs(
result.estimatedNet
)
)
) {
score += 15;
}
if (
result.roiPercent < 0
) {
score += 10;
}
score =
clamp(
score,
0,
100
);
let level =
"LOW";
if (score >= 65) {
level =
"HIGH";
} else if (
score >= 40
) {
level =
"MEDIUM";
}
return {
score,
level
};
}
/*
=========================================================
QUALITY SCORE
=========================================================
*/
function calculateQuality(
result
) {
let score = 40;
if (
result.gross > 0
) {
score += 10;
}
if (
result.estimatedNet > 0
) {
score += 20;
}
if (
result.roiPercent >=
0.05
) {
score += 10;
}
if (
result.roiPercent >=
0.10
) {
score += 10;
}
if (
result.estimatedNet <
0
) {
score -= 25;
}
if (
result.routeType ===
"TRIANGULAR"
) {
score -= 5;
}
return clamp(
score,
0,
100
);
}
/*
=========================================================
STATUS CLASSIFICATION
=========================================================
*/
function classify(
result
) {
if (
result.estimatedNet >=
SETTINGS.minimumPaperPassUsd &&
result.roiPercent >=
SETTINGS.minimumPaperPassRoiPercent
) {
return "CANDIDATE";
}
if (
result.estimatedNet >=
SETTINGS.watchlistNetFloorUsd
) {
return "WATCHLIST";
}
return "REJECTED";
}
function enrichResult(
result
) {
const risk =
calculateRisk(
result
);
const quality =
calculateQuality(
result
);
return {
...result,
riskScore:
risk.score,
riskLevel:
risk.level,
qualityScore:
quality,
status:
classify(
result
)
};
}
/*
=========================================================
POSITION SIZE GENERATION
=========================================================
*/
function generateTradeSizes() {
const capital =
account.balance;
const maximum =
capital *
SETTINGS.maxTradeCapitalPercent;
const percentageSizes =
SETTINGS.optimizationPercents
.map(
percent =>
round(
capital *
percent,
2
)
);
const fixedSizes =
SETTINGS
.optimizationFixedSizes
.filter(
size =>
size <=
maximum
);
return unique([
...percentageSizes,
...fixedSizes
])
.filter(
size =>
size > 0 &&
size <= maximum
)
.sort(
(a, b) =>
a - b
);
}
/*
=========================================================
DISCOVERY PROBE
=========================================================
*/
async function discoveryProbe({
network,
route
}) {
const maximum =
account.balance *
SETTINGS.maxTradeCapitalPercent;
const probeSize =
Math.min(
SETTINGS.discoveryProbeUsd,
maximum
);
if (
probeSize <= 0
) {
return null;
}
state.testsPlanned += 1;
state.testsAttempted += 1;
try {
const raw =
await quoteRoute({
network,
route,
tradeSize:
probeSize
});
const result =
enrichResult(
raw
);
state.testsCompleted += 1;
state.routesScreened += 1;
state.discovery.push(
result
);
if (
result.gross > 0
) {
state.positiveGrossDetected += 1;
}
return result;
} catch (error) {
state.testsCompleted += 1;
state.routesScreened += 1;
state.errors.push({
at: now(),
network:
network.name,
route:
route.label,
phase:
"DISCOVERY",
message:
error.message
});
return null;
}
}
/*
=========================================================
ADAPTIVE OPTIMIZATION
=========================================================
*/
async function optimizeRoute({
network,
route
}) {
const sizes =
generateTradeSizes();
const results = [];
for (
const tradeSize of sizes
) {
state.testsPlanned += 1;
state.testsAttempted += 1;
try {
const raw =
await quoteRoute({
network,
route,
tradeSize
});
const result =
enrichResult(
raw
);
state.testsCompleted += 1;
results.push(
result
);
} catch (error) {
state.testsCompleted += 1;
state.errors.push({
at: now(),
network:
network.name,
route:
route.label,
tradeSize,
phase:
"OPTIMIZATION",
message:
error.message
});
}
}
results.sort(
(a, b) =>
b.estimatedNet -
a.estimatedNet
);
return {
best:
results[0] ||
null,
tests:
results
};
}
/*
=========================================================
FRESH CONFIRMATION
=========================================================
*/
async function confirmOpportunity(
opportunity
) {
const network =
getNetwork(
opportunity.networkKey
);
if (!network) {
return null;
}
const route =
generateRoutes(
network
).find(
item =>
item.id ===
opportunity.routeId
);
if (!route) {
return null;
}
try {
const raw =
await quoteRoute({
network,
route,
tradeSize:
opportunity.tradeSize
});
const fresh =
enrichResult(
raw
);
const ageMs =
Date.now() -
fresh.quoteTimestamp;
const passes =
fresh.estimatedNet >=
SETTINGS.minimumPaperPassUsd &&
fresh.roiPercent >=
SETTINGS.minimumPaperPassRoiPercent &&
ageMs <=
SETTINGS.quoteFreshnessMs;
return {
...fresh,
confirmationAgeMs:
ageMs,
confirmedAt:
now(),
status:
passes
? "PAPER_PASS"
: "CONFIRMATION_REJECTED"
};
} catch (error) {
state.errors.push({
at: now(),
network:
opportunity.network,
route:
opportunity.route,
phase:
"CONFIRMATION",
message:
error.message
});
return null;
}
}
/*
=========================================================
PAPER SIMULATION
=========================================================
*/
async function simulatePaperTrade(
opportunity,
executionMode = "MANUAL"
) {
const confirmed =
await confirmOpportunity(
opportunity
);
if (
!confirmed ||
confirmed.status !==
"PAPER_PASS"
) {
return {
success: false,
message:
"The opportunity no longer passes fresh confirmation."
};
}
const pnl =
confirmed.estimatedNet;
account.balance =
round(
account.balance +
pnl,
6
);
account.realizedPnL =
round(
account.balance -
account.startingBalance,
6
);
account.simulatedTrades += 1;
const trade = {
id:
`paper-${Date.now()}-${Math.random()
.toString(16)
.slice(2)}`,
mode:
"PAPER",
executionMode,
executedAt:
now(),
network:
confirmed.network,
networkKey:
confirmed.networkKey,
chainId:
confirmed.chainId,
route:
confirmed.route,
routeType:
confirmed.routeType,
tradeSize:
confirmed.tradeSize,
startingValue:
confirmed.startingValue,
finalValue:
confirmed.finalValue,
gross:
confirmed.gross,
gasUsd:
confirmed.estimatedGasUsd,
netProfit:
confirmed.estimatedNet,
roiPercent:
confirmed.roiPercent,
riskScore:
confirmed.riskScore,
riskLevel:
confirmed.riskLevel,
qualityScore:
confirmed.qualityScore,
status:
"SIMULATED_SUCCESS",
balanceAfter:
account.balance
};
state.paperExecuted.push(
trade
);
state.history.unshift(
trade
);
return {
success: true,
trade,
account: {
...account
}
};
}
/*
=========================================================
MAIN SCAN
=========================================================
*/
async function runScanCycle() {
if (state.running) {
return {
started: false,
message:
"A scan is already running."
};
}
state.running =
true;
state.cycle += 1;
state.scanPhase =
"PREPARING";
state.lastScanStarted =
now();
resetScan();
try {
const networks =
getSelectedNetworks();
if (
networks.length === 0
) {
throw new Error(
"No networks selected."
);
}
const routePlan = [];
for (
const network of networks
) {
const routes =
generateRoutes(
network
);
for (
const route of routes
) {
routePlan.push({
network,
route
});
}
}
state.routesGenerated =
routePlan.length;
/*
PHASE 1
FAST DISCOVERY
*/
state.scanPhase =
"DISCOVERING";
const promisingMap =
new Map();
for (
let index = 0;
index <
routePlan.length;
index += 1
) {
const item =
routePlan[index];
state.currentNetwork =
item.network.name;
state.currentRoute =
item.route.label;
state.progressPercent =
round(
(
index /
Math.max(
routePlan.length,
1
)
) *
45,
2
);
const probe =
await discoveryProbe(
item
);
if (!probe) {
continue;
}
if (
probe.status ===
"CANDIDATE"
) {
state.candidates.push(
probe
);
state.candidatesFound += 1;
promisingMap.set(
item.route.id,
item
);
} else if (
probe.status ===
"WATCHLIST"
) {
state.watchlist.push(
probe
);
state.watchlistFound += 1;
promisingMap.set(
item.route.id,
item
);
} else {
state.rejected.push(
probe
);
}
}
/*
PHASE 2
OPTIMIZATION
Only optimize routes that survived
discovery. This avoids wasting API
requests on clearly weak routes.
*/
state.scanPhase =
"OPTIMIZING";
const promising =
Array.from(
promisingMap.values()
);
const optimizedCandidates =
[];
for (
let index = 0;
index <
promising.length;
index += 1
) {
const item =
promising[index];
state.currentNetwork =
item.network.name;
state.currentRoute =
item.route.label;
state.progressPercent =
round(
45 +
(
index /
Math.max(
promising.length,
1
)
) *
35,
2
);
const optimization =
await optimizeRoute(
item
);
if (
!optimization.best
) {
continue;
}
const best =
optimization.best;
state.optimized.push({
...best,
optimizationTests:
optimization.tests
});
state.optimizedFound += 1;
if (
best.status ===
"CANDIDATE"
) {
optimizedCandidates.push(
best
);
} else if (
best.status ===
"WATCHLIST"
) {
state.watchlist.push(
best
);
}
}
/*
PHASE 3
FRESH CONFIRMATION
*/
state.scanPhase =
"CONFIRMING";
optimizedCandidates.sort(
(a, b) =>
b.estimatedNet -
a.estimatedNet
);
for (
let index = 0;
index <
optimizedCandidates.length;
index += 1
) {
const candidate =
optimizedCandidates[index];
state.currentNetwork =
candidate.network;
state.currentRoute =
candidate.route;
state.progressPercent =
round(
80 +
(
index /
Math.max(
optimizedCandidates.length,
1
)
) *
20,
2
);
const confirmed =
await confirmOpportunity(
candidate
);
if (!confirmed) {
continue;
}
state.confirmed.push(
confirmed
);
state.confirmedFound += 1;
if (
confirmed.status ===
"PAPER_PASS"
) {
state.paperPass.push(
confirmed
);
state.paperPassFound += 1;
}
}
/*
OPTIONAL AUTO PAPER
Disabled by default.
*/
if (
SETTINGS.autoPaperTrading &&
state.paperPass.length > 0
) {
const eligible =
[...state.paperPass]
.filter(
opportunity =>
opportunity.riskScore <=
SETTINGS.maxAutoRiskScore
)
.sort(
(a, b) =>
b.estimatedNet -
a.estimatedNet
)
.slice(
0,
SETTINGS
.maxAutoTradesPerCycle
);
for (
const opportunity of eligible
) {
await simulatePaperTrade(
opportunity,
"AUTO"
);
}
}
state.progressPercent =
100;
state.scanPhase =
"COMPLETE";
state.lastScanCompleted =
now();
return {
started: true,
completed: true,
routesGenerated:
state.routesGenerated,
routesScreened:
state.routesScreened,
watchlist:
state.watchlistFound,
candidates:
state.candidatesFound,
optimized:
state.optimizedFound,
confirmed:
state.confirmedFound,
paperPass:
state.paperPassFound
};
} catch (error) {
state.scanPhase =
"ERROR";
state.lastError =
error.message;
state.errors.push({
at: now(),
phase:
"SCAN",
message:
error.message
});
return {
started: true,
completed: false,
error:
error.message
};
} finally {
state.running =
false;
state.currentNetwork =
null;
state.currentRoute =
null;
}
}
/*
=========================================================
ROOT
=========================================================
*/
app.get(
"/",
(req, res) => {
res.json({
engine:
"ArbiFlow Opportunity Engine",
version:
VERSION,
online:
true,
mode:
"paper-trading",
provider:
"0x Swap API",
liquidityModel:
"aggregated",
liveExecutionEnabled:
false,
message:
"ArbiFlow Engine 3.2.0 is online."
});
}
);
/*
=========================================================
HEALTH
=========================================================
*/
app.get(
"/api/health",
async (req, res) => {
const rpc =
await rpcHealthSummary();
const providerConfigured =
Boolean(
ZEROX_API_KEY
);
res.json({
ok:
providerConfigured &&
rpc.allConfigured &&
rpc.allReachable,
engine:
"ArbiFlow Opportunity Engine",
version:
VERSION,
providerConfigured,
rpcConfigured:
rpc.allConfigured,
rpcReachable:
rpc.allReachable,
rpcConfiguredCount:
rpc.configuredCount,
rpcReachableCount:
rpc.reachableCount,
rpcNetworks:
rpc.networks,
time:
now()
});
}
);
/*
=========================================================
RPC STATUS
=========================================================
*/
app.get(
"/api/rpc/status",
async (req, res) => {
const rpc =
await rpcHealthSummary();
res.json({
engine:
"ArbiFlow Opportunity Engine",
version:
VERSION,
allConfigured:
rpc.allConfigured,
allReachable:
rpc.allReachable,
configuredCount:
rpc.configuredCount,
reachableCount:
rpc.reachableCount,
networks:
rpc.networks,
time:
now()
});
}
);
/*
=========================================================
DIRECT VENUE STATUS - AERODROME BASE
=========================================================
*/
app.get(
"/api/venues/base/aerodrome/status",
async (req, res) => {
const health =
await aerodromeHealth();
res
.status(
health.contractReadable
? 200
: 503
)
.json({
engine:
"ArbiFlow Opportunity Engine",
version:
VERSION,
liveExecutionEnabled:
false,
venue:
health,
time:
now()
});
}
);
/*
=========================================================
DIRECT VENUE QUOTE - AERODROME BASE
Examples:
?SellToken=USDC&buyToken=WETH&amount=25
?sellToken=WETH&buyToken=USDC&amount=0.01
This endpoint is read only.
It does not execute a swap.
=========================================================
*/
app.get(
"/api/venues/base/aerodrome/quote",
async (req, res) => {
try {
const sellToken =
String(
req.query.sellToken ||
"USDC"
)
.trim()
.toUpperCase();
const buyToken =
String(
req.query.buyToken ||
"WETH"
)
.trim()
.toUpperCase();
const amount =
req.query.amount ??
"25";
const result =
await aerodromeBestQuote({
sellToken,
buyToken,
sellAmount:
amount
});
return res.json({
success:
true,
engine:
"ArbiFlow Opportunity Engine",
version:
VERSION,
mode:
"READ_ONLY_QUOTE",
liveExecutionEnabled:
false,
affectsPaperBalance:
false,
venue:
"Aerodrome",
network:
"Base",
bestQuote:
result.best,
routeResults:
result.alternatives,
routeErrors:
result.failures,
time:
now()
});
} catch (error) {
return res
.status(400)
.json({
success:
false,
engine:
"ArbiFlow Opportunity Engine",
version:
VERSION,
mode:
"READ_ONLY_QUOTE",
liveExecutionEnabled:
false,
affectsPaperBalance:
false,
venue:
"Aerodrome",
network:
"Base",
error:
error.message,
time:
now()
});
}
}
);
/*
=========================================================
DIRECT VENUE STATUS - UNISWAP V3 BASE
=========================================================
*/
app.get(
"/api/venues/base/uniswap-v3/status",
async (req, res) => {
const health = await uniswapV3Health();
res
.status(health.contractReadable ? 200 : 503)
.json({
engine: "ArbiFlow Opportunity Engine",
version: VERSION,
liveExecutionEnabled: false,
venue: health,
time: now()
});
}
);
/*
=========================================================
DIRECT VENUE QUOTE - UNISWAP V3 BASE
Examples:
?sellToken=USDC&buyToken=WETH&amount=25
?sellToken=WETH&buyToken=USDC&amount=0.01
This endpoint is read only.
It does not execute a swap.
=========================================================
*/
app.get(
"/api/venues/base/uniswap-v3/quote",
async (req, res) => {
try {
const sellToken = String(
req.query.sellToken || "USDC"
)
.trim()
.toUpperCase();
const buyToken = String(
req.query.buyToken || "WETH"
)
.trim()
.toUpperCase();
const amount = req.query.amount ?? "25";
const result = await uniswapV3BestQuote({
sellToken,
buyToken,
sellAmount: amount
});
return res.json({
success: true,
engine: "ArbiFlow Opportunity Engine",
version: VERSION,
mode: "READ_ONLY_QUOTE",
liveExecutionEnabled: false,
affectsPaperBalance: false,
venue: "Uniswap V3",
network: "Base",
bestQuote: result.best,
routeResults: result.alternatives,
routeErrors: result.failures,
time: now()
});
} catch (error) {
return res.status(400).json({
success: false,
engine: "ArbiFlow Opportunity Engine",
version: VERSION,
mode: "READ_ONLY_QUOTE",
liveExecutionEnabled: false,
affectsPaperBalance: false,
venue: "Uniswap V3",
network: "Base",
error: error.message,
time: now()
});
}
}
);
/*
=========================================================
STATUS
=========================================================
*/
app.get(
"/api/status",
(req, res) => {
res.json({
engine:
"ArbiFlow Opportunity Engine",
version:
VERSION,
online:
true,
provider:
"0x Swap API",
liquidityModel:
"aggregated",
liveProviderConfigured:
Boolean(
ZEROX_API_KEY
),
liveExecutionEnabled:
false,
running:
state.running,
cycle:
state.cycle,
scanPhase:
state.scanPhase,
progressPercent:
state.progressPercent,
currentNetwork:
state.currentNetwork,
currentRoute:
state.currentRoute,
rateLimited:
state.rateLimited,
lastScanStarted:
state.lastScanStarted,
lastScanCompleted:
state.lastScanCompleted,
lastSuccessfulQuote:
state.lastSuccessfulQuote,
lastError:
state.lastError,
selectedNetworks,
networks:
Object
.values(
NETWORKS
)
.map(
networkSummary
)
});
}
);
/*
=========================================================
NETWORK SELECTION
=========================================================
*/
app.get(
"/api/networks",
(req, res) => {
res.json({
selectedNetworks,
networks:
Object
.values(
NETWORKS
)
.map(
networkSummary
)
});
}
);
app.post(
"/api/networks",
(req, res) => {
if (state.running) {
return res
.status(409)
.json({
success: false,
message:
"Wait for the current scan to finish before changing networks."
});
}
const requested =
Array.isArray(
req.body.networks
)
? req.body.networks
: [];
const valid =
unique(
requested.filter(
key =>
Boolean(
NETWORKS[key]
)
)
);
if (
valid.length === 0
) {
return res
.status(400)
.json({
success: false,
message:
"Select at least one supported network."
});
}
selectedNetworks =
valid;
return res.json({
success: true,
selectedNetworks,
networks:
Object
.values(
NETWORKS
)
.map(
networkSummary
)
});
}
);
/*
=========================================================
PAPER ACCOUNT
=========================================================
*/
app.get(
"/api/account",
(req, res) => {
res.json({
mode:
"PAPER",
startingBalance:
account.startingBalance,
balance:
account.balance,
realizedPnL:
account.realizedPnL,
simulatedTrades:
account.simulatedTrades
});
}
);
app.post(
"/api/account/capital",
(req, res) => {
if (state.running) {
return res
.status(409)
.json({
success: false,
message:
"Wait for the current scan to finish before changing paper capital."
});
}
const capital =
Number(
req.body.capital
);
if (
!Number.isFinite(
capital
) ||
capital <= 0
) {
return res
.status(400)
.json({
success: false,
message:
"Capital must be greater than zero."
});
}
account.startingBalance =
round(
capital,
2
);
account.balance =
round(
capital,
2
);
account.realizedPnL =
0;
account.simulatedTrades =
0;
state.paperExecuted =
[];
state.history =
[];
return res.json({
success: true,
account: {
...account
}
});
}
);
/*
=========================================================
SCAN START
=========================================================
*/
app.post(
"/api/scan/start",
(req, res) => {
if (state.running) {
return res
.status(409)
.json({
success: false,
message:
"A scan is already running."
});
}
res.json({
success: true,
message:
"ArbiFlow Engine 3.2.0 scan started.",
selectedNetworks
});
runScanCycle()
.catch(
error => {
state.lastError =
error.message;
state.scanPhase =
"ERROR";
state.running =
false;
}
);
}
);
/*
=========================================================
OPPORTUNITIES
=========================================================
*/
app.get(
"/api/opportunities",
(req, res) => {
const topDiscovery =
[...state.discovery]
.sort(
(a, b) =>
b.estimatedNet -
a.estimatedNet
)
.slice(
0,
100
);
res.json({
engine:
"ArbiFlow Opportunity Engine",
version:
VERSION,
mode:
"PAPER",
liveExecutionEnabled:
false,
/*
Must stay zero until we add:
- firm executable quote
- taker wallet
- transaction simulation
- allowance validation
- min-profit protection
- live transaction workflow
*/
executableOpportunities:
0,
account: {
startingBalance:
account.startingBalance,
balance:
account.balance,
realizedPnL:
account.realizedPnL,
simulatedTrades:
account.simulatedTrades
},
scanner: {
running:
state.running,
cycle:
state.cycle,
scanPhase:
state.scanPhase,
progressPercent:
state.progressPercent,
currentNetwork:
state.currentNetwork,
currentRoute:
state.currentRoute,
selectedNetworks
},
funnel: {
routesGenerated:
state.routesGenerated,
routesScreened:
state.routesScreened,
testsPlanned:
state.testsPlanned,
testsAttempted:
state.testsAttempted,
testsCompleted:
state.testsCompleted,
positiveGrossDetected:
state.positiveGrossDetected,
watchlistFound:
state.watchlistFound,
candidatesFound:
state.candidatesFound,
optimizedFound:
state.optimizedFound,
confirmedFound:
state.confirmedFound,
paperPassFound:
state.paperPassFound
},
paperPass:
state.paperPass,
confirmed:
state.confirmed,
optimized:
state.optimized,
candidates:
state.candidates,
watchlist:
state.watchlist,
topDiscovery,
rejected:
state.rejected
.sort(
(a, b) =>
b.estimatedNet -
a.estimatedNet
)
.slice(
0,
100
),
paperExecuted:
state.paperExecuted,
errors:
state.errors
.slice(-25)
});
}
);
/*
=========================================================
PAPER SIMULATE
=========================================================
*/
app.post(
"/api/paper/execute",
async (
req,
res
) => {
const index =
Number(
req.body.index
);
if (
!Number.isInteger(
index
) ||
index < 0 ||
index >=
state.paperPass.length
) {
return res
.status(400)
.json({
success: false,
message:
"Invalid PAPER PASS opportunity."
});
}
const opportunity =
state.paperPass[
index
];
const result =
await simulatePaperTrade(
opportunity,
"MANUAL"
);
if (
!result.success
) {
return res
.status(409)
.json(
result
);
}
return res.json(
result
);
}
);
/*
=========================================================
HISTORY
=========================================================
*/
app.get(
"/api/history",
(req, res) => {
res.json({
mode:
"PAPER",
count:
state.history.length,
history:
state.history
});
}
);
/*
=========================================================
SETTINGS
=========================================================
*/
app.get(
"/api/settings",
(req, res) => {
res.json({
engineVersion:
VERSION,
paperOnly:
true,
liveExecutionEnabled:
false,
provider:
"0x Swap API",
liquidityModel:
"aggregated",
minimumPaperPassUsd:
SETTINGS.minimumPaperPassUsd,
minimumPaperPassRoiPercent:
SETTINGS.minimumPaperPassRoiPercent,
watchlistNetFloorUsd:
SETTINGS.watchlistNetFloorUsd,
maxTradeCapitalPercent:
SETTINGS.maxTradeCapitalPercent,
quoteFreshnessMs:
SETTINGS.quoteFreshnessMs,
slippageBps:
SETTINGS.slippageBps,
gasSafetyMultiplier:
SETTINGS.gasSafetyMultiplier,
autoPaperTrading:
SETTINGS.autoPaperTrading
});
}
);
/*
=========================================================
SERVER
=========================================================
*/
app.listen(
PORT,
() => {
console.log(
`ArbiFlow Engine ${VERSION} listening on port ${PORT}`
);
}
);
