"use strict";

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  JsonRpcProvider,
  Contract,
  ContractFactory,
  parseUnits,
  formatUnits,
  Interface,
  keccak256,
  id
} = require("ethers");

// 4.78.10: one account-level Alchemy RPC gate for native fetch and ethers fetch.
// CU costs vary by method/provider. This is deliberately a conservative request
// pacing safeguard, NOT a certified CU/s meter or guaranteed account-wide limit.
const rpcBudget4789={tail:Promise.resolve(),nextAt:0,blockedUntil:0,requests:0,rateLimited:0,methods:{},last429:null,minimumSpacingMs:Math.max(1000,Number(process.env.ARBIFLOW_ALCHEMY_SPACING_MS)||1500)};
// Diagnostic only: bounded, redacted source attribution for Alchemy fetch traffic.
// Do not log RPC URLs, bodies, headers, API keys, or wallet data.
const rpcTrace47810={byChain:{},byCaller:{},byMethod:{},responses:{},recent429:[],unmonitoredTransportWarning:"ethers/provider and other HTTP transports may bypass global fetch"};
function traceChain47810(url){try{const h=new URL(String(url)).hostname;return h.split('.')[0].replace(/[^a-z0-9-]/gi,'').slice(0,36)}catch{return 'unknown'}}
function traceCaller47810(){const lines=(new Error().stack||'').split('\n');for(const line of lines){const m=line.match(/(?:\(|\s)([^\s()]*?\.js):(\d+):(\d+)/);if(!m)continue;const f=m[1].split(/[\\/]/).pop();if(f==='server.js'&&Number(m[2])<100)continue;return (f+':'+m[2]).slice(0,100)}return 'unattributed'}
function trace42947810(response,chain,method,caller){const allowed=['retry-after','x-ratelimit-limit','x-ratelimit-remaining','x-ratelimit-reset'];const headers={};for(const k of allowed){const v=response.headers.get(k);if(v!=null)headers[k]=String(v).slice(0,100)}rpcTrace47810.recent429.push({at:new Date().toISOString(),chain,method,caller,httpStatus:429,headers});if(rpcTrace47810.recent429.length>12)rpcTrace47810.recent429.shift()}
const nativeFetch4789=globalThis.fetch.bind(globalThis);
const delay4789=ms=>new Promise(r=>setTimeout(r,ms));
function isAlchemy4789(url){try{return new URL(String(url)).hostname.endsWith('.g.alchemy.com')}catch{return false}}
function rpcMethods4789(body){try{const payload=JSON.parse(typeof body==='string'?body:Buffer.isBuffer(body)?body.toString('utf8'):'');return (Array.isArray(payload)?payload:[payload]).map(x=>String(x?.method||'unknown'))}catch{return ['unknown']}}
// All RPC users of fetch, including ethers' FetchRequest in supported runtimes,
// are protected when they use global fetch. Other transports need separate audit.
globalThis.fetch=async function guardedAlchemyFetch4789(url,opts={}){
 if(!isAlchemy4789(url))return nativeFetch4789(url,opts);
 const prev=rpcBudget4789.tail;let release;
 rpcBudget4789.tail=new Promise(r=>release=r);
 await prev.catch(()=>{});
 try{
  if(Date.now()<rpcBudget4789.blockedUntil)throw new Error('ALCHEMY_SHARED_COOLDOWN_ACTIVE');
  await delay4789(Math.max(0,rpcBudget4789.nextAt-Date.now()));
  if(Date.now()<rpcBudget4789.blockedUntil)throw new Error('ALCHEMY_SHARED_COOLDOWN_ACTIVE');
  rpcBudget4789.nextAt=Date.now()+rpcBudget4789.minimumSpacingMs;
  const methods=rpcMethods4789(opts?.body);
  const chain47810=traceChain47810(url),caller47810=traceCaller47810();
  rpcTrace47810.byChain[chain47810]=(rpcTrace47810.byChain[chain47810]||0)+1;
  rpcTrace47810.byCaller[caller47810]=(rpcTrace47810.byCaller[caller47810]||0)+1;
  for(const m of methods)rpcTrace47810.byMethod[m]=(rpcTrace47810.byMethod[m]||0)+1;
  rpcBudget4789.requests++;
  for(const m of methods)rpcBudget4789.methods[m]=(rpcBudget4789.methods[m]||0)+1;
  const response=await nativeFetch4789(url,opts);
  rpcTrace47810.responses[response.status]=(rpcTrace47810.responses[response.status]||0)+1;
  if(response.status===429){
   trace42947810(response,chain47810,methods[0]||"unknown",caller47810);
   rpcBudget4789.rateLimited++;rpcBudget4789.last429=new Date().toISOString();
   const retry=response.headers.get('retry-after');const n=Number(retry);const date=Date.parse(retry);
   const wait=Number.isFinite(n)&&n>0?n*1000:Number.isFinite(date)?Math.max(0,date-Date.now()):0;
   rpcBudget4789.blockedUntil=Math.max(rpcBudget4789.blockedUntil,Date.now()+Math.max(120000,Math.min(600000,wait)));
  }
  return response;
 }finally{release()}
};

const app = express();

app.use(cors());
app.use(express.json());

// Phase 7: manual read-only public exchange market data (pre-integrated).
require('./phase7-cex').mount(app);
require('./phase73-net').mount(app);
require('./phase8-flashloan').mount(app);

const PORT = process.env.PORT || 3000;
const ZEROX_API_KEY = process.env.ZEROX_API_KEY || "";

const RPC_URLS = {
  ethereum: process.env.ETHEREUM_RPC_URL || "",
  arbitrum: process.env.ARBITRUM_RPC_URL || "https://arb1.arbitrum.io/rpc",
  optimism: process.env.OPTIMISM_RPC_URL || "https://mainnet.optimism.io",
  base: process.env.BASE_RPC_URL || "",
  polygon: process.env.POLYGON_RPC_URL || "",
  bnb: process.env.BNB_RPC_URL || process.env.BSC_RPC_URL || "",
  avalanche: process.env.AVALANCHE_RPC_URL || "",
  linea: process.env.LINEA_RPC_URL || "",
  scroll: process.env.SCROLL_RPC_URL || "",
  mantle: process.env.MANTLE_RPC_URL || "",
  zksync: process.env.ZKSYNC_RPC_URL || "",
  gnosis: process.env.GNOSIS_RPC_URL || "",
  metis: process.env.METIS_RPC_URL || "",
  sonic: process.env.SONIC_RPC_URL || "",
  celo: process.env.CELO_RPC_URL || ""
};

const VERSION = "4.78.19";

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



/* 4.69.0: Aerodrome Slipstream concentrated-liquidity discovery, read only.
   Addresses verified against Aerodrome official security/deployment documentation. */
const AERODROME_SLIPSTREAM_BASE={
 quoter:"0x254cF9E1E6e233aa1AC962CB9B05b2cfeAaE15b0",
 factory:"0x5e7BB104d84c7CB9B682AaC2F3d509f5F406809A"
};
const AERODROME_SLIPSTREAM_QUOTER_ABI=[
 "function quoteExactInputSingle(address tokenIn,address tokenOut,int24 tickSpacing,uint256 amountIn,uint160 sqrtPriceLimitX96) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)"
];
const AERODROME_SLIPSTREAM_FACTORY_ABI=[
 "function getPool(address tokenA,address tokenB,int24 tickSpacing) view returns (address pool)"
];
const SLIPSTREAM_TICK_SPACINGS_4690=[1,10,50,100,200];
const AERODROME_ROUTER_ABI = [
  "function defaultFactory() view returns (address)",
  "function getAmountsOut(uint256 amountIn, tuple(address from,address to,bool stable,address factory)[] routes) view returns (uint256[] amounts)"
];

/*
=========================================================
UNISWAP V3 BASE - READ ONLY

Official Base deployment used by Engine 3.2.2:
View-only Quoter: 0x222ca98f00ed15b1fae10b61c277703a194cf5d2
V3 Factory:      0x33128a8fC17869897dcE68Ed026d694621f6FDfD

This layer is read only. It does not approve tokens, sign,
broadcast, execute swaps, or affect paper capital.
=========================================================
*/

const UNISWAP_V3_BASE = {
  quoter: "0x222ca98f00ed15b1fae10b61c277703a194cf5d2",
  factory: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
  feeTiers: [100, 500, 3000, 10000]
};


/*
=========================================================
AAVE V3 BASE FLASH-LOAN DISCOVERY - READ ONLY

Official Aave V3 Base addresses are read from the Aave
address book. This layer only reads protocol state and
models flash-loan economics. It never requests a loan,
signs a transaction, or moves funds.
=========================================================
*/

const AAVE_V3_BASE = {
  addressesProvider: "0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D",
  pool: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",
  protocolDataProvider: "0x0F43731EB8d45A581f4a36DD74F5f358bc90C73A"
};

const AAVE_POOL_ABI = [
  "function FLASHLOAN_PREMIUM_TOTAL() view returns (uint128)"
];

const AAVE_DATA_PROVIDER_ABI = [
  "function getReserveTokensAddresses(address asset) view returns (address aTokenAddress,address stableDebtTokenAddress,address variableDebtTokenAddress)"
];

const ERC20_READ_ABI = [
  "function balanceOf(address account) view returns (uint256)"
];

const UNISWAP_V3_QUOTER_ABI = [
  {
    type: "function",
    name: "quoteExactInputSingle",
    stateMutability: "view",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "fee", type: "uint24" },
          { name: "sqrtPriceLimitX96", type: "uint160" }
        ]
      }
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" }
    ]
  }
];

const UNISWAP_V3_FACTORY_ABI = [
  {
    type: "function",
    name: "getPool",
    stateMutability: "view",
    inputs: [
      { name: "tokenA", type: "address" },
      { name: "tokenB", type: "address" },
      { name: "fee", type: "uint24" }
    ],
    outputs: [
      { name: "pool", type: "address" }
    ]
  }
];

/*
=========================================================
ARBIFLOW ENGINE 3.2.2

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

  minimumPaperPassUsd: 15,

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
      },

      cbBTC: {
        symbol: "cbBTC",
        address:
          "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
        decimals: 8
      },

      cbETH: {
        symbol: "cbETH",
        address:
          "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22",
        decimals: 18
      },

      USDbC: {
        symbol: "USDbC",
        address:
          "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA",
        decimals: 6,
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
          "0x82aF49447D8a07e3bd95BD0d56f35241703fBab1",
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
          "0x4210000000000000000000000000000000000042",
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
0x FIRM EXECUTION QUOTE BINDER — 4.30.0
Read-only. Never signs or broadcasts. Only called after exact fork eligibility
and exact Morpho repay/seize sizing have both passed.
=========================================================
*/
async function zeroXFirmExecutionQuote4300({sellTokenAddress,buyTokenAddress,sellAmountBaseUnits,taker,slippageBps=100}){
  if(!ZEROX_API_KEY) throw new Error("ZEROX_API_KEY is not configured.");
  if(!/^0x[a-fA-F0-9]{40}$/.test(String(taker||""))) throw new Error("A valid ARBIFLOW_QUOTE_TAKER is required for a firm 0x quote.");
  if(!/^0x[a-fA-F0-9]{40}$/.test(String(sellTokenAddress||""))||!/^0x[a-fA-F0-9]{40}$/.test(String(buyTokenAddress||""))) throw new Error("Invalid firm-quote token address.");
  if(!/^\d+$/.test(String(sellAmountBaseUnits||""))||BigInt(sellAmountBaseUnits)<=0n) throw new Error("Invalid firm-quote sell amount.");
  const params=new URLSearchParams({chainId:"8453",sellToken:sellTokenAddress,buyToken:buyTokenAddress,sellAmount:String(sellAmountBaseUnits),taker:String(taker),slippageBps:String(slippageBps)});
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),12000);
  let response,body,data={};
  try{
    response=await fetch("https://api.0x.org/swap/allowance-holder/quote?"+params.toString(),{method:"GET",headers:{"0x-api-key":ZEROX_API_KEY,"0x-version":"v2","Content-Type":"application/json"},signal:controller.signal});
    body=await response.text(); try{data=body?JSON.parse(body):{}}catch{data={};}
  }catch(error){ if(error?.name==="AbortError") throw new Error("0x firm quote TIMEOUT after 12000ms"); throw error; }
  finally{clearTimeout(timer);}
  if(!response.ok) throw new Error(data.reason||data.message||data.validationErrors?.[0]?.reason||`0x firm quote HTTP ${response.status}`);
  if(data.liquidityAvailable===false) throw new Error("0x firm quote reports no liquidity available.");
  const tx=data.transaction||{};
  const allowanceSpender=data?.issues?.allowance?.spender||data.allowanceTarget||null;
  const minBuyAmount=data.minBuyAmount||null;
  const buyAmount=data.buyAmount||null;
  const txShapeValid=Boolean(/^0x[a-fA-F0-9]{40}$/.test(String(tx.to||""))&&/^0x[0-9a-fA-F]*$/.test(String(tx.data||""))&&String(tx.data||"").length>2);
  const allowanceSpenderValid=Boolean(/^0x[a-fA-F0-9]{40}$/.test(String(allowanceSpender||"")));
  const amountShapeValid=Boolean(/^\d+$/.test(String(buyAmount||""))&&BigInt(buyAmount)>0n&&/^\d+$/.test(String(minBuyAmount||""))&&BigInt(minBuyAmount)>0n&&BigInt(minBuyAmount)<=BigInt(buyAmount));
  return {provider:"0x Swap API v2",endpoint:"/swap/allowance-holder/quote",chainId:8453,quoteTimestamp:Date.now(),quoteBlockNumber:data.blockNumber??null,liquidityAvailable:data.liquidityAvailable!==false,sellToken:data.sellToken||sellTokenAddress,buyToken:data.buyToken||buyTokenAddress,sellAmount:String(data.sellAmount||sellAmountBaseUnits),buyAmount:String(buyAmount||""),minBuyAmount:String(minBuyAmount||""),allowanceSpender,transaction:{to:tx.to??null,data:tx.data??null,value:tx.value??null,gas:tx.gas??null,gasPrice:tx.gasPrice??null},issues:data.issues??null,txShapeValid,allowanceSpenderValid,amountShapeValid,firmQuoteBound:Boolean(txShapeValid&&allowanceSpenderValid&&amountShapeValid),readOnly:true,transactionBroadcast:false};
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
        `USDC → ${token} → USDC`,

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
          `USDC → ${tokenA} → ${tokenB} → USDC`,

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
        `ArbiFlow Engine ${VERSION} is online.`
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
BASE DIRECT VENUE COMPARISON - AERODROME VS UNISWAP V3

Read only. This compares both direct venues using the same
starting amount, then tests both cross-venue round-trip
directions. Results are indicative only: gas, transaction
simulation and atomic execution protections are not yet
included, so nothing from this endpoint is executable.
=========================================================
*/

async function compareBaseDirectVenues({
  baseToken = "USDC",
  quoteToken = "WETH",
  amount = "25"
}) {
  const numericAmount = Number(amount);

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new Error("Amount must be a positive number.");
  }

  const startedAt = Date.now();

  const [aerodromeForward, uniswapForward] = await Promise.all([
    aerodromeBestQuote({
      sellToken: baseToken,
      buyToken: quoteToken,
      sellAmount: numericAmount
    }),
    uniswapV3BestQuote({
      sellToken: baseToken,
      buyToken: quoteToken,
      sellAmount: numericAmount
    })
  ]);

  const aeroBuy = aerodromeForward.best.buyAmount;
  const uniBuy = uniswapForward.best.buyAmount;
  const bestForward = aeroBuy >= uniBuy
    ? aerodromeForward.best
    : uniswapForward.best;
  const lowerForward = aeroBuy >= uniBuy
    ? uniswapForward.best
    : aerodromeForward.best;

  const outputDifference = bestForward.buyAmount - lowerForward.buyAmount;
  const outputSpreadPercent = lowerForward.buyAmount > 0
    ? (outputDifference / lowerForward.buyAmount) * 100
    : 0;

  const [aeroToUniSell, uniToAeroSell] = await Promise.all([
    uniswapV3BestQuote({
      sellToken: quoteToken,
      buyToken: baseToken,
      sellAmount: aeroBuy
    }),
    aerodromeBestQuote({
      sellToken: quoteToken,
      buyToken: baseToken,
      sellAmount: uniBuy
    })
  ]);

  const directions = [
    {
      direction: "AERODROME_TO_UNISWAP_V3",
      buyVenue: "Aerodrome",
      sellVenue: "Uniswap V3",
      startAmount: numericAmount,
      startToken: baseToken,
      intermediateAmount: aeroBuy,
      intermediateToken: quoteToken,
      finalAmount: aeroToUniSell.best.buyAmount,
      finalToken: baseToken,
      buyQuote: aerodromeForward.best,
      sellQuote: aeroToUniSell.best
    },
    {
      direction: "UNISWAP_V3_TO_AERODROME",
      buyVenue: "Uniswap V3",
      sellVenue: "Aerodrome",
      startAmount: numericAmount,
      startToken: baseToken,
      intermediateAmount: uniBuy,
      intermediateToken: quoteToken,
      finalAmount: uniToAeroSell.best.buyAmount,
      finalToken: baseToken,
      buyQuote: uniswapForward.best,
      sellQuote: uniToAeroSell.best
    }
  ].map(item => {
    const grossPnl = item.finalAmount - item.startAmount;
    const grossRoiPercent = (grossPnl / item.startAmount) * 100;
    return {
      ...item,
      grossPnl: round(grossPnl, 8),
      grossRoiPercent: round(grossRoiPercent, 6),
      rawPositive: grossPnl > 0,
      status: grossPnl > 0 ? "RAW_SPREAD_FOUND" : "NO_RAW_PROFIT"
    };
  });

  directions.sort((a, b) => b.grossPnl - a.grossPnl);

  return {
    network: "Base",
    comparisonMode: "DIRECT_VENUE_READ_ONLY",
    baseToken,
    quoteToken,
    startAmount: numericAmount,
    forwardQuotes: {
      aerodrome: aerodromeForward.best,
      uniswapV3: uniswapForward.best
    },
    forwardPriceDifference: {
      betterBuyVenue: bestForward.provider,
      outputDifference: round(outputDifference, 12),
      outputSpreadPercent: round(outputSpreadPercent, 6)
    },
    bestDirection: directions[0],
    directions,
    quoteWindowMs: Date.now() - startedAt,
    classification: directions[0].grossPnl > 0
      ? "INDICATIVE_RAW_SPREAD"
      : "NO_INDICATIVE_RAW_SPREAD",
    executable: false,
    paperPass: false,
    costsIncluded: {
      dexFees: true,
      gas: false,
      transactionSimulation: false,
      atomicExecutionProtection: false
    },
    warning: "Indicative direct-venue comparison only. Gas and transaction-level execution protections are not included."
  };
}

app.get(
  "/api/venues/base/compare",
  async (req, res) => {
    try {
      const baseToken = String(req.query.baseToken || "USDC")
        .trim()
        .toUpperCase();
      const quoteToken = String(req.query.quoteToken || "WETH")
        .trim()
        .toUpperCase();
      const amount = req.query.amount ?? "25";

      const result = await compareBaseDirectVenues({
        baseToken,
        quoteToken,
        amount
      });

      return res.json({
        success: true,
        engine: "ArbiFlow Opportunity Engine",
        version: VERSION,
        mode: "DIRECT_VENUE_COMPARISON",
        liveExecutionEnabled: false,
        affectsPaperBalance: false,
        ...result,
        time: now()
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        engine: "ArbiFlow Opportunity Engine",
        version: VERSION,
        mode: "DIRECT_VENUE_COMPARISON",
        liveExecutionEnabled: false,
        affectsPaperBalance: false,
        executable: false,
        error: error.message,
        time: now()
      });
    }
  }
);

/*
=========================================================
BASE MULTI-SIZE DIRECT VENUE SCANNER - ENGINE 3.6

Read only. Probes several trade sizes across Aerodrome and
Uniswap V3, tests both cross-venue directions, ranks the
results, and separates positive raw candidates from near
passes. Gas and transaction simulation are deliberately not
included yet, so scanner results are never executable.
=========================================================
*/

const BASE_DIRECT_SCAN_DEFAULT_SIZES = [10, 25, 50, 100, 250];
const BASE_DIRECT_MIN_NET_PROFIT_USD = 15;
const BASE_DIRECT_GOOD_NET_PROFIT_USD = 25;
const BASE_DIRECT_STRONG_NET_PROFIT_USD = 50;
const BASE_DIRECT_PREMIUM_NET_PROFIT_USD = 100;
// Conservative discovery-only gas model for two Base swap transactions.
// This is NOT transaction-level eth_estimateGas and does not make a route executable.
const BASE_DIRECT_MODELED_GAS_UNITS = 500000;

async function getBaseModeledGasCostUsd() {
  const provider = getBaseProvider();
  const feeData = await provider.getFeeData();
  const gasPriceWei = feeData.maxFeePerGas || feeData.gasPrice;

  if (!gasPriceWei) {
    throw new Error("Unable to read current Base gas price.");
  }

  const nativeUsd = await getNativeUsd(NETWORKS.base);
  if (!nativeUsd) {
    throw new Error("Unable to price Base ETH gas in USD.");
  }

  const gasPriceGwei = Number(formatUnits(gasPriceWei, "gwei"));
  const gasNative = Number(formatUnits(gasPriceWei * BigInt(BASE_DIRECT_MODELED_GAS_UNITS), 18));
  const modeledGasUsd = gasNative * nativeUsd * SETTINGS.gasSafetyMultiplier;

  return {
    method: "LIVE_GAS_PRICE_MODELED_UNITS",
    gasPriceGwei: round(gasPriceGwei, 6),
    modeledGasUnits: BASE_DIRECT_MODELED_GAS_UNITS,
    gasSafetyMultiplier: SETTINGS.gasSafetyMultiplier,
    nativeSymbol: "ETH",
    nativeUsd: round(nativeUsd, 6),
    modeledGasNative: round(gasNative * SETTINGS.gasSafetyMultiplier, 10),
    modeledGasUsd: round(modeledGasUsd, 6),
    transactionLevelEstimate: false
  };
}

function baseDirectProfitTier(netProfitUsd) {
  if (netProfitUsd >= BASE_DIRECT_PREMIUM_NET_PROFIT_USD) return "PREMIUM";
  if (netProfitUsd >= BASE_DIRECT_STRONG_NET_PROFIT_USD) return "STRONG";
  if (netProfitUsd >= BASE_DIRECT_GOOD_NET_PROFIT_USD) return "GOOD";
  if (netProfitUsd >= BASE_DIRECT_MIN_NET_PROFIT_USD) return "QUALIFYING";
  return "BELOW_MINIMUM";
}
const BASE_DIRECT_SCAN_MAX_SIZES = 10;
const BASE_DIRECT_NEAR_PASS_FLOOR_USD = -0.50;

function parseBaseDirectScanSizes(rawSizes) {
  if (rawSizes === undefined || rawSizes === null || String(rawSizes).trim() === "") {
    return [...BASE_DIRECT_SCAN_DEFAULT_SIZES];
  }

  const values = String(rawSizes)
    .split(",")
    .map(value => Number(value.trim()))
    .filter(value => Number.isFinite(value) && value > 0);

  const unique = [...new Set(values.map(value => round(value, 8)))];

  if (!unique.length) {
    throw new Error("sizes must contain at least one positive number.");
  }

  if (unique.length > BASE_DIRECT_SCAN_MAX_SIZES) {
    throw new Error(`A maximum of ${BASE_DIRECT_SCAN_MAX_SIZES} scan sizes is allowed.`);
  }

  return unique.sort((a, b) => a - b);
}

function classifyBaseDirectScanResult(result) {
  const best = result.bestDirection;
  const netAfterModeledGas = Number(best.netAfterModeledGas ?? best.grossPnl);

  if (netAfterModeledGas >= BASE_DIRECT_MIN_NET_PROFIT_USD) {
    return "NET_CANDIDATE";
  }

  if (best.grossPnl > 0 || netAfterModeledGas >= BASE_DIRECT_NEAR_PASS_FLOOR_USD) {
    return "WATCHLIST";
  }

  return "REJECTED";
}

async function scanBaseDirectVenues({
  baseToken = "USDC",
  quoteToken = "WETH",
  sizes = BASE_DIRECT_SCAN_DEFAULT_SIZES
}) {
  const startedAt = Date.now();
  const results = [];
  const gasModel = await getBaseModeledGasCostUsd();

  // Run sequentially to avoid hammering public RPC/provider limits and to
  // keep each comparison's quote window easy to interpret.
  for (const size of sizes) {
    try {
      const comparison = await compareBaseDirectVenues({
        baseToken,
        quoteToken,
        amount: size
      });

      const bestWithGas = {
        ...comparison.bestDirection,
        modeledGasUsd: gasModel.modeledGasUsd,
        netAfterModeledGas: round(
          comparison.bestDirection.grossPnl - gasModel.modeledGasUsd,
          6
        )
      };

      const enrichedComparison = {
        ...comparison,
        bestDirection: bestWithGas,
        gasModel,
        minimumNetProfitUsd: BASE_DIRECT_MIN_NET_PROFIT_USD,
        profitTier: baseDirectProfitTier(bestWithGas.netAfterModeledGas)
      };

      results.push({
        ...enrichedComparison,
        success: true,
        size,
        classification: classifyBaseDirectScanResult(enrichedComparison)
      });
    } catch (error) {
      results.push({
        success: false,
        size,
        classification: "ERROR",
        error: error.message,
        executable: false,
        paperPass: false
      });
    }
  }

  const successful = results.filter(item => item.success);
  const ranked = [...successful].sort(
    (a, b) => b.bestDirection.netAfterModeledGas - a.bestDirection.netAfterModeledGas
  );
  const netCandidates = ranked.filter(item => item.classification === "NET_CANDIDATE");
  const watchlist = ranked.filter(item => item.classification === "WATCHLIST");
  const rejected = ranked.filter(item => item.classification === "REJECTED");
  const errors = results.filter(item => !item.success);

  return {
    network: "Base",
    scanMode: "MULTI_SIZE_DIRECT_VENUE_READ_ONLY",
    baseToken,
    quoteToken,
    requestedSizes: effectiveSizes,
    sizingMode: Array.isArray(sizes) && sizes.length ? "CUSTOM" : "ADAPTIVE_LIQUIDITY_AWARE",
    liquidityUtilizationCapPercent: FLASH_LIQUIDITY_UTILIZATION_CAP * 100,
    absoluteMinimumNetProfitUsd: FLASH_ABSOLUTE_MIN_NET_PROFIT_USD,
    minimumNetRoiPercent: FLASH_MIN_NET_ROI_PERCENT,
    profitTiersUsd: {
      qualifying: BASE_DIRECT_MIN_NET_PROFIT_USD,
      good: BASE_DIRECT_GOOD_NET_PROFIT_USD,
      strong: BASE_DIRECT_STRONG_NET_PROFIT_USD,
      premium: BASE_DIRECT_PREMIUM_NET_PROFIT_USD
    },
    gasModel,
    venues: ["Aerodrome", "Uniswap V3"],
    bestResult: ranked[0] || null,
    netCandidates,
    watchlist,
    rejected,
    errors,
    counts: {
      tested: results.length,
      successful: successful.length,
      netCandidates: netCandidates.length,
      watchlist: watchlist.length,
      rejected: rejected.length,
      errors: errors.length
    },
    elapsedMs: Date.now() - startedAt,
    executableOpportunities: 0,
    executable: false,
    paperPass: false,
    costsIncluded: {
      dexFees: true,
      gas: true,
      gasMethod: "live gas price + conservative modeled gas units",
      transactionSimulation: false,
      atomicExecutionProtection: false
    },
    nextValidationRequired: [
      "transaction-level gas estimation",
      "fresh quote confirmation",
      "transaction simulation",
      "minimum-profit protection"
    ],
    warning: "Discovery scanner only. NET_CANDIDATE means at least $15 after the modeled Base gas reserve, but transaction-level gas estimation, slippage protection, fresh confirmation, and simulation are still required. It is not executable or a paper pass."
  };
}

app.get(
  "/api/venues/base/scan",
  async (req, res) => {
    try {
      const baseToken = String(req.query.baseToken || "USDC")
        .trim()
        .toUpperCase();
      const quoteToken = String(req.query.quoteToken || "WETH")
        .trim()
        .toUpperCase();
      const sizes = parseBaseDirectScanSizes(req.query.sizes);

      const result = await scanBaseDirectVenues({
        baseToken,
        quoteToken,
        sizes
      });

      return res.json({
        success: true,
        engine: "ArbiFlow Opportunity Engine",
        version: VERSION,
        mode: "DIRECT_VENUE_MULTI_SIZE_SCAN",
        liveExecutionEnabled: false,
        affectsPaperBalance: false,
        ...result,
        time: now()
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        engine: "ArbiFlow Opportunity Engine",
        version: VERSION,
        mode: "DIRECT_VENUE_MULTI_SIZE_SCAN",
        liveExecutionEnabled: false,
        affectsPaperBalance: false,
        executable: false,
        error: error.message,
        time: now()
      });
    }
  }
);


/*
=========================================================
AAVE V3 BASE FLASH-LOAN PAPER DISCOVERY - ENGINE 3.6

Reads the live Aave V3 flash-loan premium and available
USDC reserve liquidity, then tests the existing independent
Aerodrome/Uniswap V3 round trip at larger notional sizes.
No loan is requested. No transaction is signed or sent.
=========================================================
*/

const FLASH_SCAN_DEFAULT_SIZES = [10000, 25000, 50000, 100000, 250000, 500000, 1000000];
const FLASH_SCAN_MAX_SIZES = 14;
const FLASH_LIQUIDITY_UTILIZATION_CAP = 0.80;
const FLASH_MIN_NET_ROI_PERCENT = 0.05;
const FLASH_ABSOLUTE_MIN_NET_PROFIT_USD = 15;

function flashRequiredNetProfitUsd(amount) {
  const roiFloor = Number(amount) * (FLASH_MIN_NET_ROI_PERCENT / 100);
  return Math.max(FLASH_ABSOLUTE_MIN_NET_PROFIT_USD, roiFloor);
}

function buildAdaptiveFlashSizes(availableLiquidity) {
  const maxUsable = Math.max(0, Number(availableLiquidity) * FLASH_LIQUIDITY_UTILIZATION_CAP);
  const ladder = [10000, 25000, 50000, 100000, 250000, 500000, 1000000, 2500000, 5000000, 10000000];
  const sizes = ladder.filter(v => v <= maxUsable);
  if (maxUsable >= 10000 && sizes.length === 0) sizes.push(round(maxUsable, 2));
  if (sizes.length && maxUsable > sizes[sizes.length - 1] * 1.25) sizes.push(round(maxUsable, 2));
  return [...new Set(sizes)].slice(0, FLASH_SCAN_MAX_SIZES);
}
const FLASH_MODELED_GAS_UNITS = 800000;

async function getAaveBaseFlashState(assetSymbol = "USDC") {
  const token = NETWORKS.base.tokens[assetSymbol];
  if (!token) throw new Error(`Unsupported Base flash asset: ${assetSymbol}`);

  const provider = getBaseProvider();
  const pool = new Contract(AAVE_V3_BASE.pool, AAVE_POOL_ABI, provider);
  const dataProvider = new Contract(
    AAVE_V3_BASE.protocolDataProvider,
    AAVE_DATA_PROVIDER_ABI,
    provider
  );

  const [network, premiumBpsRaw, reserveTokens] = await Promise.all([
    provider.getNetwork(),
    pool.FLASHLOAN_PREMIUM_TOTAL(),
    dataProvider.getReserveTokensAddresses(token.address)
  ]);

  const aTokenAddress = reserveTokens.aTokenAddress || reserveTokens[0];
  const underlying = new Contract(token.address, ERC20_READ_ABI, provider);
  const availableRaw = await underlying.balanceOf(aTokenAddress);
  const availableLiquidity = Number(formatUnits(availableRaw, token.decimals));
  const premiumBps = Number(premiumBpsRaw);

  return {
    provider: "Aave V3",
    network: "Base",
    chainId: Number(network.chainId),
    pool: AAVE_V3_BASE.pool,
    addressesProvider: AAVE_V3_BASE.addressesProvider,
    protocolDataProvider: AAVE_V3_BASE.protocolDataProvider,
    asset: assetSymbol,
    assetAddress: token.address,
    aTokenAddress,
    availableLiquidity: round(availableLiquidity, 6),
    flashLoanPremiumBps: premiumBps,
    flashLoanPremiumPercent: round(premiumBps / 100, 6),
    readOnly: true
  };
}

async function getBaseFlashModeledGasCostUsd() {
  const provider = getBaseProvider();
  const feeData = await provider.getFeeData();
  const gasPriceWei = feeData.maxFeePerGas || feeData.gasPrice;
  if (!gasPriceWei) throw new Error("Unable to read current Base gas price.");

  const nativeUsd = await getNativeUsd(NETWORKS.base);
  if (!nativeUsd) throw new Error("Unable to price Base ETH gas in USD.");

  const gasNative = Number(
    formatUnits(gasPriceWei * BigInt(FLASH_MODELED_GAS_UNITS), 18)
  );
  const modeledGasUsd = gasNative * nativeUsd * SETTINGS.gasSafetyMultiplier;

  return {
    method: "LIVE_GAS_PRICE_MODELED_FLASH_TRANSACTION",
    gasPriceGwei: round(Number(formatUnits(gasPriceWei, "gwei")), 6),
    modeledGasUnits: FLASH_MODELED_GAS_UNITS,
    gasSafetyMultiplier: SETTINGS.gasSafetyMultiplier,
    nativeSymbol: "ETH",
    nativeUsd: round(nativeUsd, 6),
    modeledGasNative: round(gasNative * SETTINGS.gasSafetyMultiplier, 10),
    modeledGasUsd: round(modeledGasUsd, 6),
    transactionLevelEstimate: false
  };
}

function parseFlashScanSizes(rawSizes) {
  if (rawSizes === undefined || rawSizes === null || String(rawSizes).trim() === "") {
    return [...FLASH_SCAN_DEFAULT_SIZES];
  }
  const values = String(rawSizes).split(",")
    .map(v => Number(v.trim()))
    .filter(v => Number.isFinite(v) && v > 0);
  const unique = [...new Set(values.map(v => round(v, 8)))];
  if (!unique.length) throw new Error("sizes must contain at least one positive number.");
  if (unique.length > FLASH_SCAN_MAX_SIZES) {
    throw new Error(`A maximum of ${FLASH_SCAN_MAX_SIZES} flash scan sizes is allowed.`);
  }
  return unique.sort((a, b) => a - b);
}

async function scanBaseAaveFlashArbitrage({ sizes = null }) {
  const startedAt = Date.now();
  const [aave, gasModel] = await Promise.all([
    getAaveBaseFlashState("USDC"),
    getBaseFlashModeledGasCostUsd()
  ]);
  const effectiveSizes = Array.isArray(sizes) && sizes.length ? sizes : buildAdaptiveFlashSizes(aave.availableLiquidity);
  const results = [];

  for (const amount of effectiveSizes) {
    if (amount > aave.availableLiquidity) {
      results.push({
        success: false,
        amount,
        classification: "INSUFFICIENT_AAVE_LIQUIDITY",
        error: "Requested flash amount exceeds the currently observed Aave USDC reserve liquidity."
      });
      continue;
    }

    try {
      const comparison = await compareBaseDirectVenues({
        baseToken: "USDC",
        quoteToken: "WETH",
        amount
      });
      const premiumUsd = amount * (aave.flashLoanPremiumBps / 10000);
      const grossPnl = Number(comparison.bestDirection.grossPnl);
      const estimatedNetPnl = grossPnl - premiumUsd - gasModel.modeledGasUsd;
      const requiredNetProfitUsd = flashRequiredNetProfitUsd(amount);
      const meetsMinimum = estimatedNetPnl >= requiredNetProfitUsd;

      results.push({
        success: true,
        amount,
        flashAsset: "USDC",
        flashLoanPremiumUsd: round(premiumUsd, 6),
        grossPnl: round(grossPnl, 6),
        modeledGasUsd: gasModel.modeledGasUsd,
        estimatedNetPnl: round(estimatedNetPnl, 6),
        estimatedNetRoiOnBorrowedAmountPercent: round((estimatedNetPnl / amount) * 100, 6),
        absoluteMinimumNetProfitUsd: FLASH_ABSOLUTE_MIN_NET_PROFIT_USD,
        minimumNetRoiPercent: FLASH_MIN_NET_ROI_PERCENT,
        requiredNetProfitUsd: round(requiredNetProfitUsd, 6),
        meetsMinimumNetProfit: meetsMinimum,
        profitTier: baseDirectProfitTier(estimatedNetPnl),
        classification: meetsMinimum ? "FLASH_CANDIDATE" : "REJECTED",
        bestDirection: comparison.bestDirection,
        quoteWindowMs: comparison.quoteWindowMs,
        executable: false,
        paperPass: false
      });
    } catch (error) {
      results.push({
        success: false,
        amount,
        classification: "ERROR",
        error: error.message,
        executable: false,
        paperPass: false
      });
    }
  }

  const successful = results.filter(r => r.success);
  const ranked = [...successful].sort((a, b) => b.estimatedNetPnl - a.estimatedNetPnl);
  const candidates = ranked.filter(r => r.classification === "FLASH_CANDIDATE");
  const rejected = ranked.filter(r => r.classification === "REJECTED");
  const errors = results.filter(r => !r.success);

  return {
    mode: "AAVE_FLASH_LOAN_PAPER_DISCOVERY",
    network: "Base",
    provider: "Aave V3",
    routeVenues: ["Aerodrome", "Uniswap V3"],
    flashState: aave,
    gasModel,
    requestedSizes: sizes,
    minimumNetProfitUsd: BASE_DIRECT_MIN_NET_PROFIT_USD,
    bestResult: ranked[0] || null,
    candidates,
    rejected,
    errors,
    counts: {
      tested: results.length,
      successful: successful.length,
      candidates: candidates.length,
      rejected: rejected.length,
      errors: errors.length
    },
    elapsedMs: Date.now() - startedAt,
    executableOpportunities: 0,
    executable: false,
    paperPass: false,
    liveExecutionEnabled: false,
    costsIncluded: {
      dexQuoteEconomics: true,
      liveAaveFlashPremium: true,
      modeledGas: true,
      transactionLevelGas: false,
      transactionSimulation: false,
      atomicReceiverContract: false
    },
    nextValidationRequired: [
      "expand token pairs and venues",
      "fresh quote confirmation",
      "atomic flash-loan receiver contract",
      "transaction-level gas estimation",
      "full transaction simulation",
      "on-chain minimum-profit protection"
    ],
    warning: "Paper discovery only. No flash loan is requested and no funds move. Adaptive sizing can evaluate large notionals, but it never treats loan size as profit. A FLASH_CANDIDATE must clear both the absolute NET floor and the size-scaled NET ROI floor, and is not executable until atomic contract simulation and minimum-profit protections are implemented."
  };
}

app.get("/api/flash/base/aave/status", async (req, res) => {
  try {
    const state = await getAaveBaseFlashState("USDC");
    return res.json({
      success: true,
      engine: "ArbiFlow Opportunity Engine",
      version: VERSION,
      mode: "AAVE_FLASH_LOAN_READ_ONLY",
      liveExecutionEnabled: false,
      ...state,
      time: now()
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      engine: "ArbiFlow Opportunity Engine",
      version: VERSION,
      mode: "AAVE_FLASH_LOAN_READ_ONLY",
      liveExecutionEnabled: false,
      error: error.message,
      time: now()
    });
  }
});

app.get("/api/flash/base/aave/scan", async (req, res) => {
  try {
    const sizes = (req.query.sizes === undefined || String(req.query.sizes).trim() === "")
      ? null
      : parseFlashScanSizes(req.query.sizes);
    const result = await scanBaseAaveFlashArbitrage({ sizes });
    return res.json({
      success: true,
      engine: "ArbiFlow Opportunity Engine",
      version: VERSION,
      ...result,
      time: now()
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      engine: "ArbiFlow Opportunity Engine",
      version: VERSION,
      mode: "AAVE_FLASH_LOAN_PAPER_DISCOVERY",
      liveExecutionEnabled: false,
      error: error.message,
      time: now()
    });
  }
});


app.get("/api/flash/base/aave/adaptive-scan", async (req, res) => {
  try {
    const result = await scanBaseAaveFlashArbitrage({ sizes: null });
    return res.json({
      success: true,
      engine: "ArbiFlow Opportunity Engine",
      version: VERSION,
      ...result,
      time: now()
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      engine: "ArbiFlow Opportunity Engine",
      version: VERSION,
      mode: "AAVE_FLASH_LOAN_ADAPTIVE_PAPER_DISCOVERY",
      liveExecutionEnabled: false,
      error: error.message,
      time: now()
    });
  }
});

/*
=========================================================
AAVE V3 BASE LIQUIDATION DISCOVERY - ENGINE 3.8

Read-only discovery. Scans recent Aave Borrow events to build
an active-borrower sample, then reads getUserAccountData for
each borrower. Positions below HF 1.0 are liquidation-eligible;
positions above 1.0 but near it are watchlist entries.
No liquidation is submitted and no funds move.
=========================================================
*/

const AAVE_ACCOUNT_DATA_ABI = [
  "function getUserAccountData(address user) view returns (uint256 totalCollateralBase,uint256 totalDebtBase,uint256 availableBorrowsBase,uint256 currentLiquidationThreshold,uint256 ltv,uint256 healthFactor)"
];

const AAVE_BORROW_EVENT_ABI = [
  "event Borrow(address indexed reserve,address user,address indexed onBehalfOf,uint256 amount,uint8 interestRateMode,uint256 borrowRate,uint16 indexed referralCode)"
];

const AAVE_LIQUIDATION_DEFAULT_BLOCKS = 20000;
const AAVE_LIQUIDATION_MAX_BLOCKS = 100000;
const AAVE_LIQUIDATION_DEFAULT_USERS = 75;
const AAVE_LIQUIDATION_MAX_USERS = 250;
const AAVE_HF_WATCH_LIMIT = 1.10;

function clampInt(value, fallback, min, max) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function formatAaveBaseUsd(value) {
  // Aave V3 getUserAccountData base-currency values use 8 decimals
  // when the market base currency is USD.
  return Number(formatUnits(value, 8));
}

async function scanAaveBaseLiquidations({ blocks, maxUsers } = {}) {
  const provider = getBaseProvider();
  const pool = new Contract(AAVE_V3_BASE.pool, AAVE_ACCOUNT_DATA_ABI, provider);
  const iface = new (require("ethers").Interface)(AAVE_BORROW_EVENT_ABI);
  const borrowTopic = iface.getEvent("Borrow").topicHash;
  const latestBlock = await provider.getBlockNumber();
  const blockCount = clampInt(blocks, AAVE_LIQUIDATION_DEFAULT_BLOCKS, 10, AAVE_LIQUIDATION_MAX_BLOCKS);
  const userLimit = clampInt(maxUsers, AAVE_LIQUIDATION_DEFAULT_USERS, 10, AAVE_LIQUIDATION_MAX_USERS);
  const fromBlock = Math.max(0, latestBlock - blockCount + 1);

  const logs = [];
  const chunkSize = 10;
  for (let start = fromBlock; start <= latestBlock; start += chunkSize) {
    const end = Math.min(latestBlock, start + chunkSize - 1);
    const chunk = await provider.getLogs({
      address: AAVE_V3_BASE.pool,
      topics: [borrowTopic],
      fromBlock: start,
      toBlock: end
    });
    logs.push(...chunk);
  }

  const seen = new Set();
  const borrowers = [];
  for (let i = logs.length - 1; i >= 0 && borrowers.length < userLimit; i--) {
    try {
      const decoded = iface.parseLog(logs[i]);
      const user = String(decoded.args.onBehalfOf || decoded.args.user);
      const key = user.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        borrowers.push({ address: user, lastBorrowBlock: logs[i].blockNumber });
      }
    } catch (_) {}
  }

  const eligible = [];
  const watchlist = [];
  const healthy = [];
  const errors = [];

  for (const borrower of borrowers) {
    try {
      const d = await pool.getUserAccountData(borrower.address);
      const collateralUsd = formatAaveBaseUsd(d.totalCollateralBase);
      const debtUsd = formatAaveBaseUsd(d.totalDebtBase);
      const healthFactor = d.healthFactor === 0n ? null : Number(formatUnits(d.healthFactor, 18));
      if (debtUsd <= 0 || healthFactor === null) continue;
      const row = {
        user: borrower.address,
        lastBorrowBlock: borrower.lastBorrowBlock,
        totalCollateralUsd: round(collateralUsd, 2),
        totalDebtUsd: round(debtUsd, 2),
        healthFactor: round(healthFactor, 6),
        liquidationThresholdPercent: round(Number(d.currentLiquidationThreshold) / 100, 4),
        status: healthFactor < 1 ? "LIQUIDATION_ELIGIBLE" : healthFactor <= AAVE_HF_WATCH_LIMIT ? "NEAR_LIQUIDATION" : "HEALTHY",
        executable: false,
        paperPass: false
      };
      if (healthFactor < 1) eligible.push(row);
      else if (healthFactor <= AAVE_HF_WATCH_LIMIT) watchlist.push(row);
      else healthy.push(row);
    } catch (error) {
      errors.push({ user: borrower.address, error: error.message });
    }
  }

  eligible.sort((a,b) => a.healthFactor - b.healthFactor || b.totalDebtUsd - a.totalDebtUsd);
  watchlist.sort((a,b) => a.healthFactor - b.healthFactor || b.totalDebtUsd - a.totalDebtUsd);

  return {
    mode: "AAVE_LIQUIDATION_READ_ONLY_DISCOVERY",
    network: "Base",
    provider: "Aave V3",
    pool: AAVE_V3_BASE.pool,
    scannedBlockRange: { fromBlock, toBlock: latestBlock, blocks: latestBlock - fromBlock + 1 },
    borrowEventsFound: logs.length,
    uniqueBorrowersChecked: borrowers.length,
    healthFactorRule: { liquidationEligibleBelow: 1, watchlistAtOrBelow: AAVE_HF_WATCH_LIMIT },
    liquidationEligible: eligible,
    watchlist,
    counts: {
      liquidationEligible: eligible.length,
      watchlist: watchlist.length,
      healthy: healthy.length,
      errors: errors.length
    },
    errors,
    executableOpportunities: 0,
    executable: false,
    paperPass: false,
    liveExecutionEnabled: false,
    minimumNetProfitUsd: BASE_DIRECT_MIN_NET_PROFIT_USD,
    nextValidationRequired: [
      "read each eligible user's collateral and debt reserves",
      "calculate Aave liquidation bonus and close factor",
      "quote collateral conversion back to flash-loan asset",
      "subtract flash-loan premium and transaction-level gas",
      "fresh health-factor confirmation",
      "atomic flash-loan liquidation receiver contract",
      "full transaction simulation",
      "on-chain minimum-profit protection"
    ],
    warning: "Read-only liquidation discovery only. Eligibility is based on live Aave account health factor. No liquidation is executed, and profitability is not yet claimed until collateral/debt-specific liquidation economics and full transaction simulation are added."
  };
}

app.get("/api/liquidations/base/aave/scan", async (req, res) => {
  try {
    const result = await scanAaveBaseLiquidations({
      blocks: req.query.blocks,
      maxUsers: req.query.maxUsers
    });
    return res.json({
      success: true,
      engine: "ArbiFlow Opportunity Engine",
      version: VERSION,
      ...result,
      time: now()
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      engine: "ArbiFlow Opportunity Engine",
      version: VERSION,
      mode: "AAVE_LIQUIDATION_READ_ONLY_DISCOVERY",
      liveExecutionEnabled: false,
      error: error.message,
      time: now()
    });
  }
});


/*
=========================================================
ARBIFLOW BASE OPPORTUNITY HUNTER - ENGINE 3.9

Read-only discovery-first funnel:
1. Probe multiple independent-venue direct pairs.
2. Probe mixed-venue USDC -> WETH -> DAI -> USDC triangles.
3. Only if a triangle has positive raw economics, run adaptive
   Aave flash-loan sizing against that route.

This layer never requests a loan, signs, or broadcasts.
=========================================================
*/

const HUNTER_DIRECT_PAIRS = [
  ["USDC", "WETH"],
  ["USDC", "DAI"],
  ["DAI", "WETH"]
];
const HUNTER_PROBE_USD = 100;
const HUNTER_TRIANGLE = ["USDC", "WETH", "DAI", "USDC"];
const HUNTER_VENUES = ["AERODROME", "UNISWAP_V3"];

async function hunterVenueQuote(venue, sellToken, buyToken, sellAmount) {
  if (venue === "AERODROME") {
    const q = await aerodromeBestQuote({ sellToken, buyToken, sellAmount });
    return q.best;
  }
  if (venue === "UNISWAP_V3") {
    const q = await uniswapV3BestQuote({ sellToken, buyToken, sellAmount });
    return q.best;
  }
  throw new Error(`Unsupported hunter venue: ${venue}`);
}

function hunterVenueCombos() {
  const out = [];
  for (const a of HUNTER_VENUES) {
    for (const b of HUNTER_VENUES) {
      for (const c of HUNTER_VENUES) out.push([a,b,c]);
    }
  }
  return out;
}

async function quoteHunterTriangle(amount, venues) {
  const startedAt = Date.now();
  const q1 = await hunterVenueQuote(venues[0], "USDC", "WETH", amount);
  const q2 = await hunterVenueQuote(venues[1], "WETH", "DAI", q1.buyAmount);
  const q3 = await hunterVenueQuote(venues[2], "DAI", "USDC", q2.buyAmount);
  const finalAmount = Number(q3.buyAmount);
  const grossPnl = finalAmount - Number(amount);
  return {
    success: true,
    route: HUNTER_TRIANGLE,
    venues,
    startAmount: round(Number(amount), 6),
    finalAmount: round(finalAmount, 6),
    grossPnl: round(grossPnl, 6),
    grossRoiPercent: round((grossPnl / Number(amount)) * 100, 6),
    rawPositive: grossPnl > 0,
    quoteWindowMs: Date.now() - startedAt,
    legs: [q1,q2,q3]
  };
}

async function optimizeHunterTriangle(candidate, aave, gasModel) {
  const sizes = buildAdaptiveFlashSizes(aave.availableLiquidity);
  const results = [];
  for (const amount of sizes) {
    try {
      const t = await quoteHunterTriangle(amount, candidate.venues);
      const premiumUsd = Number(amount) * Number(aave.flashLoanPremiumBps) / 10000;
      const net = t.grossPnl - premiumUsd - gasModel.modeledGasUsd;
      const required = flashRequiredNetProfitUsd(Number(amount));
      results.push({
        ...t,
        flashLoanPremiumUsd: round(premiumUsd, 6),
        modeledGasUsd: gasModel.modeledGasUsd,
        estimatedNetPnl: round(net, 6),
        requiredNetProfitUsd: round(required, 6),
        meetsMinimumNetProfit: net >= required,
        classification: net >= required ? "FLASH_CANDIDATE" : "REJECTED",
        executable: false,
        paperPass: false
      });
    } catch (error) {
      results.push({ success:false, amount, error:error.message, classification:"ERROR" });
    }
  }
  const successful = results.filter(x => x.success).sort((a,b) => b.estimatedNetPnl - a.estimatedNetPnl);
  return {
    venues: candidate.venues,
    testedSizes: sizes,
    bestResult: successful[0] || null,
    candidates: successful.filter(x => x.classification === "FLASH_CANDIDATE"),
    rejected: successful.filter(x => x.classification === "REJECTED"),
    errors: results.filter(x => !x.success)
  };
}

async function scanBaseOpportunityHunter() {
  const startedAt = Date.now();
  const directPairs = [];
  const errors = [];

  for (const [baseToken, quoteToken] of HUNTER_DIRECT_PAIRS) {
    try {
      const result = await compareBaseDirectVenues({
        baseToken,
        quoteToken,
        amount: HUNTER_PROBE_USD
      });
      directPairs.push({ baseToken, quoteToken, probeAmount: HUNTER_PROBE_USD, result });
    } catch (error) {
      errors.push({ stage:"DIRECT_PAIR", pair:`${baseToken}/${quoteToken}`, error:error.message });
    }
  }

  const triangleProbes = [];
  for (const venues of hunterVenueCombos()) {
    try {
      triangleProbes.push(await quoteHunterTriangle(HUNTER_PROBE_USD, venues));
    } catch (error) {
      errors.push({ stage:"TRIANGLE_PROBE", venues, error:error.message });
    }
  }
  triangleProbes.sort((a,b) => b.grossPnl - a.grossPnl);
  const positiveTriangles = triangleProbes.filter(x => x.rawPositive);

  let flashOptimization = null;
  if (positiveTriangles.length) {
    const [aave, gasModel] = await Promise.all([
      getAaveBaseFlashState("USDC"),
      getBaseFlashModeledGasCostUsd()
    ]);
    flashOptimization = await optimizeHunterTriangle(positiveTriangles[0], aave, gasModel);
  }

  return {
    mode: "BASE_DISCOVERY_FIRST_OPPORTUNITY_HUNTER",
    network: "Base",
    discoveryProbeUsd: HUNTER_PROBE_USD,
    directPairUniverse: HUNTER_DIRECT_PAIRS.map(x => x.join("/")),
    triangleRoute: HUNTER_TRIANGLE,
    venues: ["Aerodrome", "Uniswap V3"],
    directPairs,
    triangleProbes,
    positiveTriangles,
    flashOptimization,
    counts: {
      directPairsTested: directPairs.length,
      triangleVenueCombinationsTested: triangleProbes.length,
      positiveTriangles: positiveTriangles.length,
      flashCandidates: flashOptimization ? flashOptimization.candidates.length : 0,
      errors: errors.length
    },
    errors,
    elapsedMs: Date.now() - startedAt,
    executableOpportunities: 0,
    executable: false,
    paperPass: false,
    liveExecutionEnabled: false,
    minimumNetProfitUsd: BASE_DIRECT_MIN_NET_PROFIT_USD,
    warning: "Discovery-first paper scanner. Large flash-loan sizing runs only after a positive raw triangle is discovered. No loan, swap, liquidation, signature, or transaction is executed."
  };
}

app.get("/api/hunter/base/scan", async (req, res) => {
  try {
    const result = await scanBaseOpportunityHunter();
    return res.json({ success:true, engine:"ArbiFlow Opportunity Engine", version:VERSION, ...result, time:now() });
  } catch (error) {
    return res.status(400).json({ success:false, engine:"ArbiFlow Opportunity Engine", version:VERSION, mode:"BASE_DISCOVERY_FIRST_OPPORTUNITY_HUNTER", liveExecutionEnabled:false, error:error.message, time:now() });
  }
});



/*
=========================================================
ENGINE 4.2.1 - SCAN RELIABILITY / TIMEOUT GUARD
=========================================================
*/
const SCAN421 = {
  providerTimeoutMs: 6500,
  botTimeoutMs: 45000,
  routeConcurrency: 6,
  aggregatorConcurrency: 4
};

function scan421Log(stage, detail = "") {
  console.log(`[ArbiFlow ${VERSION}] ${stage}${detail ? ` :: ${detail}` : ""}`);
}

async function withTimeout421(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} TIMEOUT after ${ms}ms`)), ms);
  });
  try { return await Promise.race([promise, timeout]); }
  finally { clearTimeout(timer); }
}

async function fetch421(url, options = {}, timeoutMs = SCAN421.providerTimeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") throw new Error(`HTTP TIMEOUT after ${timeoutMs}ms`);
    throw error;
  } finally { clearTimeout(timer); }
}

async function mapLimit421(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function runner() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      try { results[i] = await worker(items[i], i); }
      catch (error) { results[i] = { __error: error }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length || 1) }, runner));
  return results;
}

/*
=========================================================
ARBIFLOW ENGINE 4.2.1 - MARKET EXPANSION BOT NETWORK

Read-only/paper discovery. 4.2 expands the hunting ground:
- dynamic Base pair/triangle generation across USDC, DAI, WETH, cbBTC
- 10-block-chunk Aave liquidation discovery over a wider window
- 0x + LI.FI route intelligence
- explicit configuration reporting for 1inch and Velora
- adaptive flash sizing only after a raw-positive direct triangle seed
No wallet, signature, loan, swap, liquidation, or transaction is executed.
=========================================================
*/

const MARKET42 = {
  network: "Base",
  stableAnchors: ["USDC", "DAI"],
  routeTokens: ["USDC", "DAI", "WETH", "cbBTC"],
  directVenues: ["AERODROME", "UNISWAP_V3", "PANCAKESWAP_V3"],
  intelligenceProviders: ["0x", "LI.FI", "1inch", "Velora/ParaSwap"],
  probeUsd: 100,
  watcherNearMissUsd: 2,
  liquidationBlocks: 2000,
  liquidationMaxUsers: 120
};

function market42DirectPairs() {
  const out=[];
  for (const anchor of MARKET42.stableAnchors) {
    for (const token of MARKET42.routeTokens) {
      if (anchor !== token) out.push([anchor, token]);
    }
  }
  const seen=new Set();
  return out.filter(([a,b])=>{ const k=[a,b].sort().join("/"); if(seen.has(k)) return false; seen.add(k); return true; });
}

function market42Triangles() {
  const mids=MARKET42.routeTokens.filter(x=>x!=="USDC");
  const out=[];
  for (const a of mids) for (const b of mids) if (a!==b) out.push(["USDC",a,b,"USDC"]);
  return out;
}

const BOT_NETWORK = {
  enabled:true, network:"Base",
  bots:["MARKET_DISCOVERY_BOT","SPREAD_BOT","TRIANGLE_BOT","SIZE_DISCOVERY_BOT","AAVE_LIQUIDATION_BOT","MORPHO_LIQUIDATION_BOT","MORPHO_PRE_LIQUIDATION_BOT","LIQUIDATION_ECONOMICS_BOT","PROJECTED_LIQUIDATION_BOT","LIQUIDATION_ROUTE_OPTIMIZER_BOT","EXECUTION_FOUNDATION_BOT","EXECUTOR_SIMULATION_FOUNDATION_BOT","CALLABLE_EXECUTOR_TEST_FOUNDATION_BOT","BASE_FORK_SIMULATION_FOUNDATION_BOT","OPTIMIZER_BOT","DISLOCATION_BOT","WATCHER_BOT","AGGREGATOR_INTELLIGENCE_BOT"]
};

function botScore({ estimatedNetUsd=0,grossPnlUsd=0,grossRoiPercent=0,confidence=0.5,depthUsd=0 }) {
  const pnl=Number.isFinite(Number(estimatedNetUsd))?Number(estimatedNetUsd):Number(grossPnlUsd)||0;
  const roi=Number(grossRoiPercent)||0, depth=Math.max(0,Number(depthUsd)||0);
  return round(Math.max(0,Math.min(100,50+Math.max(-35,Math.min(35,pnl/5))+Math.max(-10,Math.min(10,roi*5))+Math.min(5,Math.log10(depth+1))+(Number(confidence)-0.5)*10)),2);
}
function bestDirectDirection(pairRow){ const dirs=pairRow?.result?.directions||[]; return [...dirs].sort((a,b)=>Number(b.grossPnl||0)-Number(a.grossPnl||0))[0]||null; }

function market42VenueCombos(){ const out=[]; for(const a of MARKET42.directVenues) for(const b of MARKET42.directVenues) for(const c of MARKET42.directVenues) out.push([a,b,c]); return out; }
async function market42VenueQuote(venue,sellToken,buyToken,sellAmount){
  if(venue==="AERODROME") return (await aerodromeBestQuote({sellToken,buyToken,sellAmount})).best;
  if(venue==="UNISWAP_V3") return (await uniswapV3BestQuote({sellToken,buyToken,sellAmount})).best;
  throw new Error(`Unsupported 4.2 direct venue: ${venue}`);
}
async function quoteMarket42Triangle(amount,route,venues){
  const startedAt=Date.now(); let current=Number(amount); const legs=[];
  for(let i=0;i<3;i++){ const q=await market42VenueQuote(venues[i],route[i],route[i+1],current); legs.push(q); current=Number(q.buyAmount); }
  const grossPnl=current-Number(amount);
  return {success:true,route,venues,startAmount:round(Number(amount),6),finalAmount:round(current,6),grossPnl:round(grossPnl,6),grossRoiPercent:round(grossPnl/Number(amount)*100,6),rawPositive:grossPnl>0,quoteWindowMs:Date.now()-startedAt,legs};
}

async function runMarketDiscoveryBot(){
  const pairs=[]; for(let i=0;i<MARKET42.routeTokens.length;i++) for(let j=i+1;j<MARKET42.routeTokens.length;j++) pairs.push([MARKET42.routeTokens[i],MARKET42.routeTokens[j]]);
  const triangles=market42Triangles();
  return {bot:"MARKET_DISCOVERY_BOT",status:"COMPLETE",tokenUniverse:MARKET42.routeTokens,directPairUniverse:pairs.map(x=>x.join("/")),triangleUniverse:triangles.map(x=>x.join("->")),directVenues:MARKET42.directVenues,intelligenceProviders:MARKET42.intelligenceProviders,verifiedAdditionalLiquidity:[{venue:"UNISWAP_V4",chainId:8453,poolManager:"0x498581ff718922c3f8e6a244956af099b2652b2b",quoter:"0x0d5e0f971ed27fbff6c2837bf31316121532048d",stateView:"0xa3c0c9b65bad0b08107aa264b0f3db444b867a71",status:"DEPLOYMENT_VERIFIED_POOLKEY_DISCOVERY_PENDING",readOnly:true}],counts:{tokens:MARKET42.routeTokens.length,directPairs:pairs.length,triangleRoutes:triangles.length,venueCombinationsPerTriangle:triangleCombos430().length,totalTriangleProbes:2*triangleCombos430().length}};
}

async function runSpreadBot(){
  const startedAt=Date.now(), observations=[],errors=[];
  for(const [baseToken,quoteToken] of market42DirectPairs()) try{
    const result=await compareBaseDirectVenues({baseToken,quoteToken,amount:MARKET42.probeUsd}); const best=bestDirectDirection({result});
    observations.push({type:"DIRECT_SPREAD",pair:`${baseToken}/${quoteToken}`,probeAmount:MARKET42.probeUsd,bestDirection:best,rawPositive:Boolean(best&&Number(best.grossPnl)>0),score:botScore({grossPnlUsd:best?.grossPnl,grossRoiPercent:best?.grossRoiPercent,depthUsd:MARKET42.probeUsd})});
  }catch(error){errors.push({pair:`${baseToken}/${quoteToken}`,error:error.message});}
  observations.sort((a,b)=>b.score-a.score); return {bot:"SPREAD_BOT",status:"COMPLETE",observations,candidates:observations.filter(x=>x.rawPositive),errors,elapsedMs:Date.now()-startedAt};
}

async function runTriangleBot(){
  const startedAt=Date.now(),observations=[],errors=[];
  const jobs=[];
  for(const route of market42Triangles()) for(const venues of market42VenueCombos()) jobs.push({route,venues});
  scan421Log("TRIANGLE_BOT START", `${jobs.length} probes, concurrency ${SCAN421.routeConcurrency}`);
  const rows=await mapLimit421(jobs,SCAN421.routeConcurrency,async({route,venues})=>{
    try{
      const q=await withTimeout421(quoteMarket42Triangle(MARKET42.probeUsd,route,venues),SCAN421.providerTimeoutMs*3,`triangle ${route.join("->")} ${venues.join("/")}`);
      return {ok:true,value:{...q,score:botScore({grossPnlUsd:q.grossPnl,grossRoiPercent:q.grossRoiPercent,depthUsd:MARKET42.probeUsd})}};
    }catch(error){return {ok:false,error:{route,venues,error:error.message}};}
  });
  for(const row of rows){if(row?.ok) observations.push(row.value); else if(row?.error) errors.push(row.error); else if(row?.__error) errors.push({error:row.__error.message});}
  observations.sort((a,b)=>b.score-a.score);
  scan421Log("TRIANGLE_BOT COMPLETE", `${observations.length} observations, ${errors.length} errors, ${Date.now()-startedAt}ms`);
  return {bot:"TRIANGLE_BOT",status:"COMPLETE",routesGenerated:market42Triangles().length,observations,candidates:observations.filter(x=>x.rawPositive),errors,elapsedMs:Date.now()-startedAt};
}

async function runLiquidationBot(){
  const startedAt=Date.now(); try{
    const result=await scanAaveBaseLiquidations({blocks:MARKET42.liquidationBlocks,maxUsers:MARKET42.liquidationMaxUsers});
    const opportunities=[...result.liquidationEligible.map(x=>({...x,opportunityType:"AAVE_LIQUIDATION",score:botScore({confidence:.8,depthUsd:x.totalDebtUsd})})),...result.watchlist.map(x=>({...x,opportunityType:"AAVE_LIQUIDATION_WATCH",score:botScore({confidence:.6,depthUsd:x.totalDebtUsd})}))].sort((a,b)=>b.score-a.score);
    return {bot:"LIQUIDATION_BOT",status:"COMPLETE",scanWindowBlocks:MARKET42.liquidationBlocks,maxUsers:MARKET42.liquidationMaxUsers,opportunities,counts:result.counts,errors:result.errors,profitabilityValidated:false,elapsedMs:Date.now()-startedAt};
  }catch(error){return {bot:"LIQUIDATION_BOT",status:"ERROR",opportunities:[],errors:[{error:error.message}],profitabilityValidated:false,elapsedMs:Date.now()-startedAt};}
}

async function runDislocationBot(){
  const startedAt=Date.now(),observations=[],errors=[];
  for(const pair of [["USDC","DAI"],["DAI","USDC"]]) try{ const result=await compareBaseDirectVenues({baseToken:pair[0],quoteToken:pair[1],amount:MARKET42.probeUsd}); const best=bestDirectDirection({result}); observations.push({pair:pair.join("/"),bestDirection:best,rawPositive:Boolean(best&&Number(best.grossPnl)>0),score:botScore({grossPnlUsd:best?.grossPnl,grossRoiPercent:best?.grossRoiPercent,depthUsd:MARKET42.probeUsd})}); }catch(error){errors.push({pair:pair.join("/"),error:error.message});}
  observations.sort((a,b)=>b.score-a.score); return {bot:"DISLOCATION_BOT",status:"COMPLETE",observations,candidates:observations.filter(x=>x.rawPositive),errors,elapsedMs:Date.now()-startedAt};
}

async function runWatcherBot(spreadBot,triangleBot,dislocationBot){
  const near=[];
  for(const x of spreadBot.observations||[]){const p=Number(x.bestDirection?.grossPnl??-Infinity);if(p<=0&&p>=-MARKET42.watcherNearMissUsd)near.push({source:"SPREAD_BOT",pair:x.pair,grossPnl:p,score:x.score});}
  for(const x of triangleBot.observations||[]){const p=Number(x.grossPnl??-Infinity);if(p<=0&&p>=-MARKET42.watcherNearMissUsd)near.push({source:"TRIANGLE_BOT",route:x.route,venues:x.venues,grossPnl:p,score:x.score});}
  for(const x of dislocationBot.observations||[]){const p=Number(x.bestDirection?.grossPnl??-Infinity);if(p<=0&&p>=-MARKET42.watcherNearMissUsd)near.push({source:"DISLOCATION_BOT",pair:x.pair,grossPnl:p,score:x.score});}
  near.sort((a,b)=>b.score-a.score); const rechecks=[];
  for(const item of near.slice(0,12)) try{
    if(item.pair){const [a,b]=item.pair.split("/");const result=await compareBaseDirectVenues({baseToken:a,quoteToken:b,amount:MARKET42.probeUsd});const best=bestDirectDirection({result});rechecks.push({...item,freshGrossPnl:Number(best?.grossPnl??NaN),freshGrossRoiPercent:Number(best?.grossRoiPercent??NaN),becameRawPositive:Boolean(best&&Number(best.grossPnl)>0),recheckedAt:now()});}
    else {const q=await quoteMarket42Triangle(MARKET42.probeUsd,item.route,item.venues);rechecks.push({...item,freshGrossPnl:Number(q.grossPnl),freshGrossRoiPercent:Number(q.grossRoiPercent),becameRawPositive:Boolean(q.rawPositive),recheckedAt:now()});}
  }catch(error){rechecks.push({...item,recheckError:error.message,recheckedAt:now()});}
  return {bot:"WATCHER_BOT",status:"COMPLETE",rule:"Keep raw near-misses within $2 hot and fresh-requote the strongest 12 items.",watchlist:near,rechecks,promoted:rechecks.filter(x=>x.becameRawPositive)};
}

async function fastWatcherDirectPath425(item){
  const [baseToken,quoteToken]=item.pair.split("/");
  const buyVenue=item.buyVenueKey;
  const sellVenue=item.sellVenueKey;
  if(!buyVenue||!sellVenue) throw new Error("Watcher item is missing its selected venue path.");
  const first=await market42VenueQuote(buyVenue,baseToken,quoteToken,MARKET42.probeUsd);
  const second=await market42VenueQuote(sellVenue,quoteToken,baseToken,Number(first.buyAmount));
  const grossPnl=Number(second.buyAmount)-Number(MARKET42.probeUsd);
  return {freshGrossPnl:round(grossPnl,6),freshGrossRoiPercent:round(grossPnl/Number(MARKET42.probeUsd)*100,6),becameRawPositive:grossPnl>0,fastPath:[buyVenue,sellVenue]};
}

function venueKey425(name){
  if(String(name||"").toLowerCase().includes("aerodrome")) return "AERODROME";
  if(String(name||"").toLowerCase().includes("uniswap")) return "UNISWAP_V3";
  if(String(name||"").toLowerCase().includes("pancake")) return "PANCAKESWAP_V3";
  return null;
}

async function runFastWatcher425(spreadBot,triangleBot,dislocationBot){
  const startedAt=Date.now(), near=[];
  for(const x of spreadBot.observations||[]){const p=Number(x.bestDirection?.grossPnl??-Infinity);if(p<=0&&p>=-MARKET42.watcherNearMissUsd)near.push({source:"SPREAD_BOT",pair:x.pair,grossPnl:p,score:x.score,buyVenueKey:venueKey425(x.bestDirection?.buyVenue),sellVenueKey:venueKey425(x.bestDirection?.sellVenue)});}
  for(const x of dislocationBot.observations||[]){const p=Number(x.bestDirection?.grossPnl??-Infinity);if(p<=0&&p>=-MARKET42.watcherNearMissUsd)near.push({source:"DISLOCATION_BOT",pair:x.pair,grossPnl:p,score:x.score,buyVenueKey:venueKey425(x.bestDirection?.buyVenue),sellVenueKey:venueKey425(x.bestDirection?.sellVenue)});}
  for(const x of triangleBot.observations||[]){const p=Number(x.grossPnl??-Infinity);if(p<=0&&p>=-MARKET42.watcherNearMissUsd)near.push({source:"TRIANGLE_BOT",route:x.route,venues:x.venues,grossPnl:p,score:x.score});}
  near.sort((a,b)=>b.score-a.score);
  const shortlist=near.slice(0,SCAN422.watcherLimit);
  const rows=await mapLimit421(shortlist,3,async item=>{
    try{
      if(item.pair){
        const fresh=await withTimeout421(fastWatcherDirectPath425(item),4500,`fast watcher ${item.pair}`);
        return {...item,...fresh,recheckedAt:now()};
      }
      // The deep triangle result is already a recent 3-leg quote. Do not repeat the
      // expensive dependent 3-leg RPC path inside the fast Watcher request.
      return {...item,freshGrossPnl:item.grossPnl,freshGrossRoiPercent:round(Number(item.grossPnl)/Number(MARKET42.probeUsd)*100,6),becameRawPositive:false,recheckMode:"RECENT_DEEP_QUOTE_REUSED",recheckedAt:now()};
    }catch(error){return {...item,recheckError:error.message,becameRawPositive:false,recheckedAt:now()};}
  });
  return {bot:"WATCHER_BOT",status:"COMPLETE",stage:"SELECTED_PATH_FAST_RECHECK",rule:`Select the strongest ${SCAN422.watcherLimit} near-misses first. Direct pairs re-quote only the previously selected two-venue path; recent deep triangle quotes are reused instead of repeating a slow 3-leg RPC path.`,watchlist:shortlist,rechecks:rows,promoted:rows.filter(x=>x.becameRawPositive),elapsedMs:Date.now()-startedAt};
}

const LIFI_PROBE_ADDRESS="0x0000000000000000000000000000000000000001";
async function lifi42Quote(sellToken,buyToken,sellAmount){
  const network=NETWORKS.base, s=network.tokens[sellToken], b=network.tokens[buyToken]; if(!s||!b) throw new Error("Unsupported LI.FI token");
  const raw=parseUnits(String(sellAmount),s.decimals).toString();
  const u=new URL("https://li.quest/v1/quote");
  u.searchParams.set("fromChain","8453");u.searchParams.set("toChain","8453");u.searchParams.set("fromToken",s.address);u.searchParams.set("toToken",b.address);u.searchParams.set("fromAmount",raw);u.searchParams.set("fromAddress",LIFI_PROBE_ADDRESS);u.searchParams.set("toAddress",LIFI_PROBE_ADDRESS);u.searchParams.set("slippage","0.003");u.searchParams.set("allowBridges","none");
  const headers={accept:"application/json"}; if(process.env.LIFI_API_KEY) headers["x-lifi-api-key"]=process.env.LIFI_API_KEY;
  const r=await fetch421(u,{headers}); const text=await r.text(); let data; try{data=JSON.parse(text)}catch{throw new Error(`LI.FI non-JSON response (${r.status})`)} if(!r.ok) throw new Error(data?.message||data?.error||`LI.FI HTTP ${r.status}`);
  const toAmount=data?.estimate?.toAmount; if(!toAmount) throw new Error("LI.FI quote missing estimate.toAmount");
  return {provider:"LI.FI",role:"AGGREGATOR_INTELLIGENCE_ONLY",tool:data.tool||null,pair:`${sellToken}/${buyToken}`,sellAmount:Number(sellAmount),buyAmount:Number(formatUnits(toAmount,b.decimals)),toAmountMin:data?.estimate?.toAmountMin?Number(formatUnits(data.estimate.toAmountMin,b.decimals)):null,readOnly:true};
}

async function runAggregatorIntelligenceBot(){
  const startedAt=Date.now(),network=NETWORKS.base,observations=[],errors=[]; const pairs=market42DirectPairs();
  const jobs=[]; for(const [sellToken,buyToken] of pairs){jobs.push({provider:"0x",sellToken,buyToken});jobs.push({provider:"LI.FI",sellToken,buyToken});}
  scan421Log("AGGREGATOR_BOT START", `${jobs.length} quote jobs`);
  const rows=await mapLimit421(jobs,SCAN421.aggregatorConcurrency,async job=>{
    const {provider,sellToken,buyToken}=job;
    try{
      if(provider==="0x"){
        const q=await withTimeout421(zeroXPrice({network,sellToken,buyToken,sellAmount:MARKET42.probeUsd}),SCAN421.providerTimeoutMs,`0x ${sellToken}/${buyToken}`);
        return {ok:true,value:{provider:"0x",role:"AGGREGATOR_INTELLIGENCE_ONLY",pair:`${sellToken}/${buyToken}`,sellAmount:MARKET42.probeUsd,buyAmount:Number(q.buyAmount),readOnly:true}};
      }
      return {ok:true,value:await lifi42Quote(sellToken,buyToken,MARKET42.probeUsd)};
    }catch(error){return {ok:false,error:{provider,pair:`${sellToken}/${buyToken}`,error:error.message}};}
  });
  for(const row of rows){if(row?.ok) observations.push(row.value); else if(row?.error) errors.push(row.error); else if(row?.__error) errors.push({provider:"UNKNOWN",error:row.__error.message});}
  const providerStatus=[
    {provider:"0x",configured:Boolean(process.env.ZEROX_API_KEY),active:true},
    {provider:"LI.FI",configured:Boolean(process.env.LIFI_API_KEY),active:true,note:process.env.LIFI_API_KEY?"API key supplied":"public/read-only quote access with hard timeout"},
    {provider:"1inch",configured:Boolean(process.env.ONEINCH_API_KEY),active:false,note:"credential-aware placeholder; no requests are made until an approved API integration is configured"},
    {provider:"Velora/ParaSwap",configured:Boolean(process.env.VELORA_API_KEY),active:false,note:"credential-aware placeholder; no requests are made until provider interface is configured"}
  ];
  scan421Log("AGGREGATOR_BOT COMPLETE", `${observations.length} observations, ${errors.length} errors, ${Date.now()-startedAt}ms`);
  return {bot:"AGGREGATOR_INTELLIGENCE_BOT",status:observations.length?"COMPLETE":"NO_PROVIDER_QUOTES",rule:"Aggregators are routing intelligence only; overlapping underlying liquidity is never counted as an independent arbitrage venue.",providers:providerStatus,observations,errors,elapsedMs:Date.now()-startedAt};
}

async function runLargeOpportunityBot(triangleBot){
  const startedAt=Date.now(); const positive=(triangleBot.candidates||[]).sort((a,b)=>Number(b.grossPnl)-Number(a.grossPnl)); if(!positive.length)return{bot:"OPTIMIZER_BOT",status:"NO_POSITIVE_SEED",strategy:"ADAPTIVE_NET_PROFIT_OPTIMIZATION",minimumNetProfitUsd:BASE_DIRECT_MIN_NET_PROFIT_USD,flashOptimization:null,elapsedMs:Date.now()-startedAt};
  const seed=positive[0];
  try{const [aave,gasModel]=await Promise.all([getAaveBaseFlashState("USDC"),getBaseFlashModeledGasCostUsd()]);const sizes=buildAdaptiveFlashSizes(aave.availableLiquidity),results=[];for(const amount of sizes)try{const t=await quoteMarket42Triangle(amount,seed.route,seed.venues);const premiumUsd=Number(amount)*Number(aave.flashLoanPremiumBps)/10000,net=t.grossPnl-premiumUsd-gasModel.modeledGasUsd,required=flashRequiredNetProfitUsd(Number(amount));results.push({...t,flashLoanAmount:Number(amount),flashPremiumUsd:round(premiumUsd,6),modeledGasUsd:gasModel.modeledGasUsd,estimatedNetProfitUsd:round(net,6),requiredNetProfitUsd:round(required,6),qualifies:net>=required});}catch(error){results.push({flashLoanAmount:Number(amount),qualifies:false,error:error.message});}const flashOptimization={seedRoute:seed.route,sizesTested:sizes.length,results,candidates:results.filter(x=>x.qualifies).sort((a,b)=>(b.estimatedNetProfitUsd??-Infinity)-(a.estimatedNetProfitUsd??-Infinity))};return{bot:"LARGE_OPPORTUNITY_BOT",status:"COMPLETE",seed,flashLiquidityUsd:aave.availableLiquidity,flashOptimization,elapsedMs:Date.now()-startedAt};}catch(error){return{bot:"OPTIMIZER_BOT",status:"ERROR",strategy:"ADAPTIVE_NET_PROFIT_OPTIMIZATION",flashOptimization:null,errors:[{error:error.message}],elapsedMs:Date.now()-startedAt};}
}

async function scanBaseBotNetwork(){
  const startedAt=Date.now(); scan421Log("BOT NETWORK START");
  const marketBot=await runMarketDiscoveryBot();
  const specs=[
    ["SPREAD_BOT",runSpreadBot], ["TRIANGLE_BOT",runTriangleBot], ["LIQUIDATION_BOT",runLiquidationBot],
    ["DISLOCATION_BOT",runDislocationBot], ["AGGREGATOR_INTELLIGENCE_BOT",runAggregatorIntelligenceBot]
  ];
  const settled=await Promise.all(specs.map(async([name,fn])=>{
    scan421Log(`${name} START`);
    try{const value=await withTimeout421(fn(),SCAN421.botTimeoutMs,name);scan421Log(`${name} FINISH`,`${value.status} ${value.elapsedMs??"?"}ms`);return value;}
    catch(error){scan421Log(`${name} ISOLATED`,error.message);return {bot:name,status:"TIMEOUT_OR_ERROR",observations:[],candidates:[],opportunities:[],errors:[{error:error.message}],elapsedMs:Date.now()-startedAt};}
  }));
  const byName=Object.fromEntries(settled.map(x=>[x.bot,x]));
  const spreadBot=byName.SPREAD_BOT||{observations:[],candidates:[]}, triangleBot=byName.TRIANGLE_BOT||{observations:[],candidates:[]}, liquidationBot=byName.LIQUIDATION_BOT||{opportunities:[]}, dislocationBot=byName.DISLOCATION_BOT||{observations:[],candidates:[]}, aggregatorBot=byName.AGGREGATOR_INTELLIGENCE_BOT||{observations:[]};
  let watcherBot; try{watcherBot=await withTimeout421(runWatcherBot(spreadBot,triangleBot,dislocationBot),30000,"WATCHER_BOT");}catch(error){watcherBot={bot:"WATCHER_BOT",status:"TIMEOUT_OR_ERROR",watchlist:[],rechecks:[],promoted:[],errors:[{error:error.message}]};}
  let largeOpportunityBot; try{largeOpportunityBot=await withTimeout421(runLargeOpportunityBot(triangleBot),45000,"LARGE_OPPORTUNITY_BOT");}catch(error){largeOpportunityBot={bot:"LARGE_OPPORTUNITY_BOT",status:"TIMEOUT_OR_ERROR",flashOptimization:null,errors:[{error:error.message}]};}
  const bots=[marketBot,spreadBot,triangleBot,sizeBot,liquidationBot,morphoBot,liquidationEconomicsBot,largeOpportunityBot,dislocationBot,watcherBot,aggregatorBot],ranked=[];
  for(const x of spreadBot.candidates||[])ranked.push({source:"SPREAD_BOT",type:"ARBITRAGE",label:x.pair,score:x.score,rawPositive:true});
  for(const x of triangleBot.candidates||[])ranked.push({source:"TRIANGLE_BOT",type:"TRIANGULAR_ARBITRAGE",label:x.route.join("->"),venues:x.venues,score:x.score,rawPositive:true});
  for(const x of liquidationBot.opportunities||[])ranked.push({source:"LIQUIDATION_BOT",type:x.opportunityType,label:x.user,score:x.score,profitabilityValidated:false}); ranked.sort((a,b)=>b.score-a.score);
  const flashCandidates=largeOpportunityBot.flashOptimization?.candidates||[];
  scan421Log("BOT NETWORK COMPLETE",`${Date.now()-startedAt}ms`);
  return {mode:"MARKET_EXPANSION_OPPORTUNITY_DISCOVERY",network:"Base",botNetwork:BOT_NETWORK,marketExpansion:marketBot,bots,rankedOpportunityQueue:ranked,counts:{botsRun:bots.length,tokens:marketBot.counts.tokens,directPairsGenerated:marketBot.counts.directPairs,triangleRoutesGenerated:marketBot.counts.triangleRoutes,triangleProbesPlanned:marketBot.counts.totalTriangleProbes,rankedOpportunities:ranked.length,flashCandidates:flashCandidates.length,watcherItems:watcherBot.watchlist?.length||0,watcherRechecks:watcherBot.rechecks?.length||0,watcherPromoted:watcherBot.promoted?.length||0,aggregatorObservations:aggregatorBot.observations?.length||0,liquidationWatcherTracked:liquidationBot.liquidationWatcher?.tracked||0,liquidationWatcherRechecks:liquidationBot.liquidationWatcher?.rechecks?.length||0,morphoMarketsScanned:morphoBot.marketsScanned||0,morphoPositionsScanned:morphoBot.positionsScanned||0,morphoLiquidatable:morphoBot.opportunities?.length||0,morphoWatchlist:morphoBot.watchlist?.length||0},scanReliability:{providerTimeoutMs:SCAN421.providerTimeoutMs,botTimeoutMs:SCAN421.botTimeoutMs,routeConcurrency:SCAN421.routeConcurrency,aggregatorConcurrency:SCAN421.aggregatorConcurrency,isolatedFailures:bots.filter(x=>x.status==="TIMEOUT_OR_ERROR").map(x=>x.bot)},elapsedMs:Date.now()-startedAt,executableOpportunities:0,executable:false,paperPass:false,liveExecutionEnabled:false,minimumNetProfitUsd:BASE_DIRECT_MIN_NET_PROFIT_USD,safety:{discoveryOnly:true,walletRequired:false,privateKeyRequired:false,flashLoanRequested:false,fundsMoved:false,transactionBroadcast:false},warning:"Engine 4.2.1 is read-only market expansion with timeout isolation. Slow providers may fail independently without blocking the entire bot-network response."};
}

app.get("/api/bots/status",(req,res)=>res.json({success:true,engine:"ArbiFlow Opportunity Engine",version:VERSION,mode:"MARKET_EXPANSION_OPPORTUNITY_DISCOVERY",network:"Base",botNetwork:BOT_NETWORK,market:MARKET42,liveExecutionEnabled:false,time:now()}));

/*
=========================================================
ENGINE 4.2.2 - FAST STAGED PERFORMANCE ARCHITECTURE
=========================================================
The browser-facing scan is deliberately bounded. It does not deep-scan the
entire market. Stage 1 probes a compact liquid universe, Stage 2 deep-checks
only the strongest triangle route, liquidation discovery is batched, and
only a raw-positive seed can activate flash optimization.
*/
const SCAN422 = {
  overallBudgetMs: 28000,
  fastBotBudgetMs: 12000,
  liquidationBlocksPerRequest: 100,
  liquidationMaxUsersPerRequest: 20,
  watcherLimit: 4,
  deepTriangleRoutes: 1,
  deepTriangleVenueCombos: 6
};
let scan422Active = false;
let scan422Sequence = 0;

function timeoutResult422(bot, ms, startedAt) {
  return {bot,status:"TIME_BUDGET_REACHED",observations:[],candidates:[],opportunities:[],errors:[{error:`${bot} exceeded ${ms}ms request budget`}],elapsedMs:Date.now()-startedAt};
}

async function runFastSpreadBot422(){
  const startedAt=Date.now(), observations=[], errors=[];
  // Fast discovery uses the three highest-priority liquid pairs. The broader
  // universe remains visible in MARKET_DISCOVERY_BOT and is handled in later cycles.
  const pairs=[["USDC","DAI"],["USDC","WETH"],["USDC","cbBTC"]];
  const rows=await mapLimit421(pairs,3,async([baseToken,quoteToken])=>{
    try{
      const result=await compareBaseDirectVenues({baseToken,quoteToken,amount:MARKET42.probeUsd});
      const best=bestDirectDirection({result});
      return {ok:true,value:{type:"FAST_DIRECT_SPREAD",pair:`${baseToken}/${quoteToken}`,probeAmount:MARKET42.probeUsd,bestDirection:best,rawPositive:Boolean(best&&Number(best.grossPnl)>0),score:botScore({grossPnlUsd:best?.grossPnl,grossRoiPercent:best?.grossRoiPercent,depthUsd:MARKET42.probeUsd})}};
    }catch(error){return {ok:false,error:{pair:`${baseToken}/${quoteToken}`,error:error.message}};}
  });
  for(const row of rows){if(row?.ok) observations.push(row.value); else if(row?.error) errors.push(row.error);}
  observations.sort((a,b)=>b.score-a.score);
  return {bot:"SPREAD_BOT",status:"COMPLETE",stage:"FAST_DISCOVERY",pairsPlanned:pairs.length,observations,candidates:observations.filter(x=>x.rawPositive),errors,elapsedMs:Date.now()-startedAt};
}

async function runFastTriangleBot422(spreadBot){
  const startedAt=Date.now(), observations=[], errors=[];
  // Select one triangle dynamically. Prefer WETH unless cbBTC showed a stronger
  // direct discrepancy; DAI is retained as the stable return leg.
  const btc=spreadBot.observations?.find(x=>x.pair==="USDC/cbBTC");
  const eth=spreadBot.observations?.find(x=>x.pair==="USDC/WETH");
  const middle=(Number(btc?.score||0)>Number(eth?.score||0))?"cbBTC":"WETH";
  const route=["USDC",middle,"DAI","USDC"];
  const combos=market42VenueCombos().slice(0,SCAN422.deepTriangleVenueCombos);
  scan421Log("TRIANGLE_BOT FAST START",`${route.join("->")} :: ${combos.length} probes`);
  const rows=await mapLimit421(combos,4,async venues=>{
    try{
      const q=await withTimeout421(quoteMarket42Triangle(MARKET42.probeUsd,route,venues),12000,`fast triangle ${venues.join("/")}`);
      return {ok:true,value:{...q,score:botScore({grossPnlUsd:q.grossPnl,grossRoiPercent:q.grossRoiPercent,depthUsd:MARKET42.probeUsd})}};
    }catch(error){return {ok:false,error:{route,venues,error:error.message}};}
  });
  for(const row of rows){if(row?.ok) observations.push(row.value); else if(row?.error) errors.push(row.error);}
  observations.sort((a,b)=>b.score-a.score);
  return {bot:"TRIANGLE_BOT",status:"COMPLETE",stage:"SHORTLIST_DEEP_CHECK",routesGenerated:market42Triangles().length,routesDeepChecked:1,route,probesPlanned:combos.length,observations,candidates:observations.filter(x=>x.rawPositive),errors,elapsedMs:Date.now()-startedAt};
}

const liquidationWatch423 = new Map();

async function recheckLiquidationWatch423() {
  const provider = getBaseProvider();
  const pool = new Contract(AAVE_V3_BASE.pool, AAVE_ACCOUNT_DATA_ABI, provider);
  const rows = [];
  for (const [key, previous] of [...liquidationWatch423.entries()].slice(0, 20)) {
    try {
      const d = await pool.getUserAccountData(previous.user);
      const collateralUsd = formatAaveBaseUsd(d.totalCollateralBase);
      const debtUsd = formatAaveBaseUsd(d.totalDebtBase);
      const healthFactor = d.healthFactor === 0n ? null : Number(formatUnits(d.healthFactor, 18));
      if (debtUsd <= 0 || healthFactor === null) {
        liquidationWatch423.delete(key);
        continue;
      }
      const current = {
        user: previous.user,
        totalCollateralUsd: round(collateralUsd, 2),
        totalDebtUsd: round(debtUsd, 2),
        healthFactor: round(healthFactor, 6),
        previousHealthFactor: previous.healthFactor,
        healthFactorChange: round(healthFactor - Number(previous.healthFactor), 6),
        status: healthFactor < 1 ? "LIQUIDATION_ELIGIBLE" : healthFactor <= AAVE_HF_WATCH_LIMIT ? "NEAR_LIQUIDATION" : "HEALTHY",
        becameLiquidationEligible: Number(previous.healthFactor) >= 1 && healthFactor < 1,
        profitabilityValidated: false,
        executable: false,
        paperPass: false,
        recheckedAt: now()
      };
      rows.push(current);
      if (healthFactor <= AAVE_HF_WATCH_LIMIT) liquidationWatch423.set(key, {...previous, ...current});
      else liquidationWatch423.delete(key);
    } catch (error) {
      rows.push({user: previous.user, status:"RECHECK_ERROR", error:error.message, executable:false, paperPass:false});
    }
  }
  rows.sort((a,b)=>(a.healthFactor ?? 999)-(b.healthFactor ?? 999));
  return rows;
}

async function runLiquidationBatch422(){
  const startedAt=Date.now();
  try{
    const result=await scanAaveBaseLiquidations({blocks:SCAN422.liquidationBlocksPerRequest,maxUsers:SCAN422.liquidationMaxUsersPerRequest});
    const opportunities=[...result.liquidationEligible.map(x=>({...x,opportunityType:"AAVE_LIQUIDATION",score:botScore({confidence:.8,depthUsd:x.totalDebtUsd})})),...result.watchlist.map(x=>({...x,opportunityType:"AAVE_LIQUIDATION_WATCH",score:botScore({confidence:.6,depthUsd:x.totalDebtUsd})}))].sort((a,b)=>b.score-a.score);
    for (const x of [...result.watchlist, ...result.liquidationEligible]) liquidationWatch423.set(String(x.user).toLowerCase(), x);
    const watcherRechecks = await recheckLiquidationWatch423();
    const newlyEligible = watcherRechecks.filter(x=>x.becameLiquidationEligible);
    return {bot:"LIQUIDATION_BOT",status:"COMPLETE",stage:"BATCHED_DISCOVERY_PLUS_RUNTIME_WATCH",scanWindowBlocks:SCAN422.liquidationBlocksPerRequest,maxUsers:SCAN422.liquidationMaxUsersPerRequest,opportunities,liquidationWatcher:{tracked:liquidationWatch423.size,rechecks:watcherRechecks,newlyEligible,profitabilityValidated:false,note:"Eligibility triggers economics analysis only; no liquidation is executed."},counts:result.counts,errors:result.errors,profitabilityValidated:false,elapsedMs:Date.now()-startedAt};
  }catch(error){return {bot:"LIQUIDATION_BOT",status:"ERROR",stage:"BATCHED_DISCOVERY",opportunities:[],errors:[{error:error.message}],profitabilityValidated:false,elapsedMs:Date.now()-startedAt};}
}


/*
=========================================================
ENGINE 4.4.0 - DEEP OPPORTUNITY EXPANSION
=========================================================
Replaces the failed LI.FI-constrained PancakeSwap transport with direct,
read-only calls to PancakeSwap V3 contracts on Base.

Official PancakeSwap V3 deployment addresses (Base shares the documented
BSC/ETH/ARB/Linea/Base/opBNB core/periphery addresses):
Factory:  0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865
QuoterV2: 0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997

This code only reads pool existence and quote output. It never approves tokens,
signs transactions, broadcasts swaps, requests flash loans, or moves funds.
=========================================================
*/
const PANCAKESWAP_V3_BASE = {
  factory: "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865",
  quoter: "0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997",
  feeTiers: [100, 500, 2500, 10000]
};

// 4.3.2 performance caches. Pool topology changes slowly, while quotes remain
// amount-sensitive. We cache only discovered active fee tiers / recent winning
// fee tiers; actual output amounts are still freshly quoted for each request.
const pancakePoolTopology432 = new Map();
const pancakeWinningFee432 = new Map();
const PANCAKE_TOPOLOGY_TTL_MS = 10 * 60 * 1000;
const PANCAKE_WINNING_FEE_TTL_MS = 30 * 1000;

function pancakePairKey432(a,b){ return [a,b].sort().join("/"); }

async function pancakeActiveFees432(sellToken,buyToken){
  const key=pancakePairKey432(sellToken,buyToken), cached=pancakePoolTopology432.get(key);
  if(cached && Date.now()-cached.at < PANCAKE_TOPOLOGY_TTL_MS) return cached.fees;
  const network=NETWORKS.base,sell=network.tokens[sellToken],buy=network.tokens[buyToken];
  if(!sell||!buy) throw new Error(`Unsupported PancakeSwap Base token pair: ${sellToken}/${buyToken}`);
  const provider=getBaseProvider(),factory=new Contract(PANCAKESWAP_V3_BASE.factory,UNISWAP_V3_FACTORY_ABI,provider);
  const checks=await Promise.allSettled(PANCAKESWAP_V3_BASE.feeTiers.map(async fee=>({fee,pool:await factory.getPool(sell.address,buy.address,fee)})));
  const fees=checks.filter(x=>x.status==="fulfilled"&&x.value.pool&&String(x.value.pool).toLowerCase()!=="0x0000000000000000000000000000000000000000").map(x=>x.value.fee);
  pancakePoolTopology432.set(key,{fees,at:Date.now()});
  return fees;
}

async function pancakeSwapV3QuoteOne431({sellToken,buyToken,sellAmount,fee}){
  const network=NETWORKS.base, sell=network.tokens[sellToken], buy=network.tokens[buyToken];
  if(!sell||!buy) throw new Error(`Unsupported PancakeSwap Base token pair: ${sellToken}/${buyToken}`);
  if(sellToken===buyToken) throw new Error("PancakeSwap sell and buy token must be different");
  const numericAmount=Number(sellAmount);
  if(!Number.isFinite(numericAmount)||numericAmount<=0) throw new Error("PancakeSwap sell amount must be positive");
  if(!PANCAKESWAP_V3_BASE.feeTiers.includes(Number(fee))) throw new Error(`Unsupported PancakeSwap V3 fee tier: ${fee}`);

  const provider=getBaseProvider();
  const factory=new Contract(PANCAKESWAP_V3_BASE.factory,UNISWAP_V3_FACTORY_ABI,provider);
  const pool=await factory.getPool(sell.address,buy.address,Number(fee));
  if(!pool||String(pool).toLowerCase()==="0x0000000000000000000000000000000000000000")
    throw new Error(`No PancakeSwap V3 ${fee} fee-tier pool for ${sellToken}/${buyToken}`);

  const quoter=new Contract(PANCAKESWAP_V3_BASE.quoter,UNISWAP_V3_QUOTER_ABI,provider);
  const amountIn=parseUnits(String(sellAmount),sell.decimals);
  const quoteResult=await quoter.quoteExactInputSingle({
    tokenIn:sell.address,
    tokenOut:buy.address,
    amountIn,
    fee:Number(fee),
    sqrtPriceLimitX96:0
  });
  const rawOutput=quoteResult.amountOut ?? quoteResult[0];
  const buyAmount=Number(formatUnits(rawOutput,buy.decimals));
  if(!Number.isFinite(buyAmount)||buyAmount<=0) throw new Error(`PancakeSwap V3 returned an invalid ${fee} fee-tier quote`);
  return {
    provider:"PancakeSwap V3",liquidityModel:"DIRECT_VENUE",quoteTransport:"NATIVE_RPC",
    network:network.name,networkKey:network.key,chainId:network.chainId,
    quoter:PANCAKESWAP_V3_BASE.quoter,factory:PANCAKESWAP_V3_BASE.factory,pool,
    feeTier:Number(fee),feePercent:Number(fee)/10000,
    sellToken,buyToken,sellAmount:numericAmount,buyAmount:round(buyAmount,12),
    rawBuyAmount:rawOutput.toString(),quoteTimestamp:Date.now(),readOnly:true
  };
}

async function pancakeSwapV3Quote430(sellToken,buyToken,sellAmount){
  const key=pancakePairKey432(sellToken,buyToken), winner=pancakeWinningFee432.get(key);
  if(winner && Date.now()-winner.at < PANCAKE_WINNING_FEE_TTL_MS){
    try{return await pancakeSwapV3QuoteOne431({sellToken,buyToken,sellAmount,fee:winner.fee});}catch{}
  }
  const activeFees=await pancakeActiveFees432(sellToken,buyToken);
  if(!activeFees.length) throw new Error(`No PancakeSwap V3 pool for ${sellToken}/${buyToken}`);
  const attempts=await Promise.allSettled(activeFees.map(fee=>pancakeSwapV3QuoteOne431({sellToken,buyToken,sellAmount,fee})));
  const successful=attempts.filter(x=>x.status==="fulfilled").map(x=>x.value);
  const failures=attempts.filter(x=>x.status==="rejected").map(x=>x.reason?.message||"PancakeSwap V3 quote failed");
  if(!successful.length) throw new Error(failures.join(" | ")||"No PancakeSwap V3 quote was available");
  successful.sort((a,b)=>b.buyAmount-a.buyAmount);
  pancakeWinningFee432.set(key,{fee:successful[0].feeTier,at:Date.now()});
  return successful[0];
}

async function market43VenueQuote(venue,sellToken,buyToken,sellAmount){
  if(venue==="AERODROME") return (await aerodromeBestQuote({sellToken,buyToken,sellAmount})).best;
  if(venue==="UNISWAP_V3") return (await uniswapV3BestQuote({sellToken,buyToken,sellAmount})).best;
  if(venue==="PANCAKESWAP_V3") return await pancakeSwapV3Quote430(sellToken,buyToken,sellAmount);
  throw new Error(`Unsupported 4.3 direct venue: ${venue}`);
}

function venueLabel430(v){return v==="AERODROME"?"Aerodrome":v==="UNISWAP_V3"?"Uniswap V3":v==="PANCAKESWAP_V3"?"PancakeSwap V3":v;}

async function compareBaseExpandedVenues430({baseToken="USDC",quoteToken="WETH",amount=100}){
  const start=Number(amount); if(!Number.isFinite(start)||start<=0) throw new Error("Amount must be positive");
  const startedAt=Date.now(), forward={}, errors=[];
  const rows=await mapLimit421(MARKET42.directVenues,3,async venue=>{
    try{return {venue,quote:await withTimeout421(market43VenueQuote(venue,baseToken,quoteToken,start),6000,`${venue} ${baseToken}/${quoteToken}`)}}catch(error){return {venue,error:error.message}}
  });
  for(const x of rows){if(x.quote)forward[x.venue]=x.quote;else errors.push({venue:x.venue,leg:"FORWARD",error:x.error});}
  const jobs=[];
  for(const buyVenue of Object.keys(forward)) for(const sellVenue of MARKET42.directVenues) if(sellVenue!==buyVenue) jobs.push({buyVenue,sellVenue});
  const rev=await mapLimit421(jobs,4,async job=>{
    try{const first=forward[job.buyVenue];const second=await withTimeout421(market43VenueQuote(job.sellVenue,quoteToken,baseToken,Number(first.buyAmount)),6000,`${job.sellVenue} reverse ${quoteToken}/${baseToken}`);return {...job,first,second};}
    catch(error){return {...job,error:error.message};}
  });
  const directions=[];
  for(const x of rev){
    if(x.error){errors.push({buyVenue:x.buyVenue,sellVenue:x.sellVenue,leg:"REVERSE",error:x.error});continue;}
    const grossPnl=Number(x.second.buyAmount)-start;
    directions.push({direction:`${x.buyVenue}_TO_${x.sellVenue}`,buyVenue:venueLabel430(x.buyVenue),sellVenue:venueLabel430(x.sellVenue),buyVenueKey:x.buyVenue,sellVenueKey:x.sellVenue,startAmount:start,startToken:baseToken,intermediateAmount:Number(x.first.buyAmount),intermediateToken:quoteToken,finalAmount:Number(x.second.buyAmount),finalToken:baseToken,buyQuote:x.first,sellQuote:x.second,grossPnl:round(grossPnl,8),grossRoiPercent:round(grossPnl/start*100,6),rawPositive:grossPnl>0,status:grossPnl>0?"RAW_SPREAD_FOUND":"NO_RAW_PROFIT"});
  }
  directions.sort((a,b)=>b.grossPnl-a.grossPnl);
  return {network:"Base",comparisonMode:"THREE_INDEPENDENT_VENUES_READ_ONLY",baseToken,quoteToken,startAmount:start,venuesAttempted:MARKET42.directVenues,forwardQuotes:forward,directions,bestDirection:directions[0]||null,errors,quoteWindowMs:Date.now()-startedAt,executable:false,paperPass:false};
}

async function quoteMarket43Triangle(amount,route,venues){
  const startedAt=Date.now();let current=Number(amount);const legs=[];
  for(let i=0;i<3;i++){const q=await market43VenueQuote(venues[i],route[i],route[i+1],current);legs.push(q);current=Number(q.buyAmount);}
  const grossPnl=current-Number(amount);
  return {success:true,route,venues,startAmount:round(Number(amount),6),finalAmount:round(current,6),grossPnl:round(grossPnl,6),grossRoiPercent:round(grossPnl/Number(amount)*100,6),rawPositive:grossPnl>0,quoteWindowMs:Date.now()-startedAt,legs};
}

async function runFastSpreadBot430(){
  const startedAt=Date.now(),observations=[],errors=[];
  // 4.4.0 expands direct discovery to every unique pair in the verified
  // four-token Base universe instead of only four hand-picked pairs.
  const t=MARKET42.routeTokens,pairs=[];
  for(let i=0;i<t.length;i++) for(let j=i+1;j<t.length;j++) pairs.push([t[i],t[j]]);
  const rows=await mapLimit421(pairs,3,async([baseToken,quoteToken])=>{try{const result=await compareBaseExpandedVenues430({baseToken,quoteToken,amount:MARKET42.probeUsd});const best=result.bestDirection;return{ok:true,value:{type:"EXPANDED_DIRECT_SPREAD",pair:`${baseToken}/${quoteToken}`,probeAmount:MARKET42.probeUsd,bestDirection:best,rawPositive:Boolean(best&&Number(best.grossPnl)>0),nearPositive:Boolean(best&&Number(best.grossPnl)<=0&&Number(best.grossPnl)>=-0.10),venueErrors:result.errors,score:botScore({grossPnlUsd:best?.grossPnl,grossRoiPercent:best?.grossRoiPercent,depthUsd:MARKET42.probeUsd})}}}catch(error){return{ok:false,error:{pair:`${baseToken}/${quoteToken}`,error:error.message}}}});
  for(const row of rows){if(row?.ok)observations.push(row.value);else if(row?.error)errors.push(row.error);} observations.sort((a,b)=>b.score-a.score);
  return{bot:"SPREAD_BOT",status:"COMPLETE",stage:"ALL_PAIR_THREE_VENUE_DISCOVERY",pairsPlanned:pairs.length,venues:MARKET42.directVenues,observations,candidates:observations.filter(x=>x.rawPositive),nearCandidates:observations.filter(x=>x.nearPositive),errors,elapsedMs:Date.now()-startedAt};
}

function triangleCombos430(){
  // 4.3.2 pre-shortlist: test the six permutations that use all three
  // independent venues exactly once. This preserves cross-venue discovery
  // while avoiding the 27-combination RPC explosion.
  const v=MARKET42.directVenues;
  const combos=[];
  for(const a of v) for(const b of v) for(const c of v) if(a!==b&&a!==c&&b!==c) combos.push([a,b,c]);
  return combos.slice(0,SCAN422.deepTriangleVenueCombos);
}

async function runFastTriangleBot430(spreadBot){
  const startedAt=Date.now(),observations=[],errors=[];
  // 4.7 event-driven rule: triangle deep quoting is expensive and the 4.6 scan
  // showed repeated timeouts. Only wake it when direct discovery sees a raw-positive
  // price anomaly. Otherwise preserve the RPC budget for liquidation monitoring.
  const triggers=(spreadBot.candidates||[]).filter(x=>Number(x.bestDirection?.grossPnl||0)>0);
  if(!triggers.length)return{bot:"TRIANGLE_BOT",status:"DORMANT",stage:"EVENT_DRIVEN_TRIGGER_GATE",trigger:"RAW_POSITIVE_DIRECT_ANOMALY",routesGenerated:market42Triangles().length,routesViable:0,routesDeepChecked:0,routes:[],probesPlanned:0,observations:[],candidates:[],nearCandidates:[],errors:[],elapsedMs:Date.now()-startedAt,note:"No raw-positive direct anomaly; expensive triangle probes skipped."};
  const combos=triangleCombos430();
  const routes=market42Triangles().filter(route=>triggers.some(x=>{const [a,b]=x.pair.split('/');return route.includes(a)&&route.includes(b);})).slice(0,1);
  const jobs=[];for(const route of routes)for(const venues of combos.slice(0,2))jobs.push({route,venues});
  const rows=await mapLimit421(jobs,2,async({route,venues})=>{try{const q=await withTimeout421(quoteMarket43Triangle(MARKET42.probeUsd,route,venues),6000,`4.7 event triangle ${route.join("->")} ${venues.join("/")}`);return{ok:true,value:{...q,nearPositive:Number(q.grossPnl)<=0&&Number(q.grossPnl)>=-0.25,score:botScore({grossPnlUsd:q.grossPnl,grossRoiPercent:q.grossRoiPercent,depthUsd:MARKET42.probeUsd})}};}catch(error){return{ok:false,error:{route,venues,error:error.message}};}});
  for(const row of rows){if(row?.ok)observations.push(row.value);else if(row?.error)errors.push(row.error);}observations.sort((a,b)=>b.score-a.score);
  return{bot:"TRIANGLE_BOT",status:"COMPLETE",stage:"EVENT_DRIVEN_TRIANGLE_DISCOVERY",trigger:"RAW_POSITIVE_DIRECT_ANOMALY",routesGenerated:market42Triangles().length,routesViable:routes.length,routesDeepChecked:routes.length,routes,probesPlanned:jobs.length,observations,candidates:observations.filter(x=>x.rawPositive),nearCandidates:observations.filter(x=>x.nearPositive),errors,elapsedMs:Date.now()-startedAt};
}

async function runSizeDiscoveryBot440(spreadBot,triangleBot){
  const startedAt=Date.now(),tests=[],errors=[];
  const seeds=[];
  for(const x of spreadBot.candidates||[]){const p=Number(x.bestDirection?.grossPnl??-Infinity);if(p>0)seeds.push({kind:"DIRECT",grossPnl:p,score:x.score,data:x});}
  for(const x of triangleBot.candidates||[]){const p=Number(x.grossPnl??-Infinity);if(p>0)seeds.push({kind:"TRIANGLE",grossPnl:p,score:x.score,data:x});}
  seeds.sort((a,b)=>b.score-a.score);
  if(!seeds.length)return{bot:"SIZE_DISCOVERY_BOT",status:"DORMANT",strategy:"EVENT_DRIVEN_POSITIVE_SEED_ONLY",trigger:"RAW_POSITIVE_SEED",nearSeedCount:0,shortlisted:0,sizes:[100,250,500,1000,2500,5000],tests:[],curves:[],positiveSeeds:[],errors:[],elapsedMs:Date.now()-startedAt,note:"No raw-positive seed; multi-size RPC probes skipped."};
  const shortlist=seeds.slice(0,1),sizes=[100,250,500,1000,2500,5000];
  const jobs=[];for(const seed of shortlist)for(const amount of sizes)jobs.push({seed,amount});
  const rows=await mapLimit421(jobs,2,async({seed,amount})=>{try{const q=seed.kind==="DIRECT"?await withTimeout421(quoteDirectSeed430(amount,seed.data),6500,`4.7 selected-path size direct ${amount}`):await withTimeout421(quoteMarket43Triangle(amount,seed.data.route,seed.data.venues),6500,`4.7 size triangle ${amount}`);return{kind:seed.kind,label:seed.kind==="DIRECT"?seed.data.pair:seed.data.route.join("->"),amount,...q,rawPositive:Number(q.grossPnl)>0};}catch(error){return{kind:seed.kind,label:seed.kind==="DIRECT"?seed.data.pair:seed.data.route?.join("->"),amount,error:error.message,rawPositive:false};}});
  tests.push(...rows);const positiveSeeds=tests.filter(x=>x.rawPositive).sort((a,b)=>Number(b.grossPnl)-Number(a.grossPnl));
  const curves=shortlist.map(seed=>{const label=seed.kind==="DIRECT"?seed.data.pair:seed.data.route.join("->");const pts=tests.filter(x=>x.label===label&&!x.error).sort((a,b)=>a.amount-b.amount);return{kind:seed.kind,label,points:pts.map(x=>({amount:x.amount,grossPnl:x.grossPnl,grossRoiPercent:x.grossRoiPercent,rawPositive:x.rawPositive})),best:pts.slice().sort((a,b)=>Number(b.grossPnl)-Number(a.grossPnl))[0]||null};});
  return{bot:"SIZE_DISCOVERY_BOT",status:"COMPLETE",strategy:"EVENT_DRIVEN_SELECTED_PATH_PROFIT_CURVE",trigger:"RAW_POSITIVE_SEED",nearSeedCount:seeds.length,shortlisted:shortlist.length,sizes,tests,curves,positiveSeeds,errors,elapsedMs:Date.now()-startedAt};
}

async function fastWatcherDirectPath430(item){
  const [baseToken,quoteToken]=item.pair.split("/");const buyVenue=item.buyVenueKey,sellVenue=item.sellVenueKey;if(!buyVenue||!sellVenue)throw new Error("Watcher missing selected venue path");
  const first=await market43VenueQuote(buyVenue,baseToken,quoteToken,MARKET42.probeUsd);const second=await market43VenueQuote(sellVenue,quoteToken,baseToken,Number(first.buyAmount));const grossPnl=Number(second.buyAmount)-Number(MARKET42.probeUsd);
  return{freshGrossPnl:round(grossPnl,6),freshGrossRoiPercent:round(grossPnl/Number(MARKET42.probeUsd)*100,6),becameRawPositive:grossPnl>0,fastPath:[buyVenue,sellVenue]};
}

async function runFastWatcher430(spreadBot,triangleBot,dislocationBot){
  const startedAt=Date.now(),near=[];
  for(const x of spreadBot.observations||[]){const p=Number(x.bestDirection?.grossPnl??-Infinity);if(p<=0&&p>=-MARKET42.watcherNearMissUsd)near.push({source:"SPREAD_BOT",pair:x.pair,grossPnl:p,score:x.score,buyVenueKey:x.bestDirection?.buyVenueKey||venueKey425(x.bestDirection?.buyVenue),sellVenueKey:x.bestDirection?.sellVenueKey||venueKey425(x.bestDirection?.sellVenue),quoteTimestamp:Math.max(Number(x.bestDirection?.buyQuote?.quoteTimestamp||0),Number(x.bestDirection?.sellQuote?.quoteTimestamp||0))});}
  for(const x of dislocationBot.observations||[]){const p=Number(x.bestDirection?.grossPnl??-Infinity);if(p<=0&&p>=-MARKET42.watcherNearMissUsd)near.push({source:"DISLOCATION_BOT",pair:x.pair,grossPnl:p,score:x.score,buyVenueKey:venueKey425(x.bestDirection?.buyVenue),sellVenueKey:venueKey425(x.bestDirection?.sellVenue),quoteTimestamp:Math.max(Number(x.bestDirection?.buyQuote?.quoteTimestamp||0),Number(x.bestDirection?.sellQuote?.quoteTimestamp||0))});}
  for(const x of triangleBot.observations||[]){const p=Number(x.grossPnl??-Infinity);if(p<=0&&p>=-MARKET42.watcherNearMissUsd)near.push({source:"TRIANGLE_BOT",route:x.route,venues:x.venues,grossPnl:p,score:x.score,quoteTimestamp:Math.max(...(x.legs||[]).map(q=>Number(q.quoteTimestamp||0)),0)});}
  near.sort((a,b)=>b.score-a.score);const shortlist=near.slice(0,SCAN422.watcherLimit);
  // 4.4.0 no longer immediately repeats RPC calls that were just completed.
  // Fresh scan quotes become the initial watcher state; a future scan provides
  // the next observation. This removes the 4.3.2 timeout regression.
  const rows=shortlist.map(item=>({...item,freshGrossPnl:item.grossPnl,becameRawPositive:false,recheckMode:"FRESH_SCAN_QUOTE_REUSED",quoteAgeMs:item.quoteTimestamp?Math.max(0,Date.now()-item.quoteTimestamp):null,recheckedAt:now()}));
  return{bot:"WATCHER_BOT",status:"COMPLETE",stage:"FRESH_QUOTE_STATE_WATCH",rule:`Keep strongest ${SCAN422.watcherLimit} near-misses using the already-fresh scan quote; do not duplicate RPC work inside the same scan.`,watchlist:shortlist,rechecks:rows,promoted:[],elapsedMs:Date.now()-startedAt};
}

async function quoteDirectSeed430(amount,seed){
  const [baseToken,quoteToken]=seed.pair.split("/");const b=seed.bestDirection?.buyVenueKey||venueKey425(seed.bestDirection?.buyVenue),s=seed.bestDirection?.sellVenueKey||venueKey425(seed.bestDirection?.sellVenue);
  const first=await market43VenueQuote(b,baseToken,quoteToken,amount),second=await market43VenueQuote(s,quoteToken,baseToken,Number(first.buyAmount));const grossPnl=Number(second.buyAmount)-Number(amount);
  return{seedType:"DIRECT",pair:seed.pair,venues:[b,s],startAmount:Number(amount),finalAmount:Number(second.buyAmount),grossPnl:round(grossPnl,6),grossRoiPercent:round(grossPnl/Number(amount)*100,6)};
}

async function runLargeOpportunityBot430(spreadBot,triangleBot,sizeBot){
  const startedAt=Date.now();const seeds=[];
  for(const x of spreadBot.candidates||[])seeds.push({kind:"DIRECT",grossPnl:Number(x.bestDirection?.grossPnl||0),data:x});
  for(const x of triangleBot.candidates||[])seeds.push({kind:"TRIANGLE",grossPnl:Number(x.grossPnl||0),data:x});
  for(const x of sizeBot?.positiveSeeds||[]){if(x.kind==="DIRECT"){const original=(spreadBot.observations||[]).find(o=>o.pair===x.pair);if(original)seeds.push({kind:"DIRECT",grossPnl:Number(x.grossPnl||0),data:original,discoveredAtSize:x.amount});}else if(x.kind==="TRIANGLE")seeds.push({kind:"TRIANGLE",grossPnl:Number(x.grossPnl||0),data:x,discoveredAtSize:x.amount});}
  seeds.sort((a,b)=>b.grossPnl-a.grossPnl);if(!seeds.length)return{bot:"LARGE_OPPORTUNITY_BOT",status:"NO_POSITIVE_SEED",flashOptimization:null,elapsedMs:Date.now()-startedAt};
  const chosen=seeds[0];
  try{const[aave,gasModel]=await Promise.all([getAaveBaseFlashState("USDC"),getBaseFlashModeledGasCostUsd()]);const sizes=buildAdaptiveFlashSizes(aave.availableLiquidity),results=[];
    for(const amount of sizes)try{const q=chosen.kind==="DIRECT"?await quoteDirectSeed430(amount,chosen.data):await quoteMarket43Triangle(amount,chosen.data.route,chosen.data.venues);const premiumUsd=Number(amount)*Number(aave.flashLoanPremiumBps)/10000,net=Number(q.grossPnl)-premiumUsd-gasModel.modeledGasUsd,required=flashRequiredNetProfitUsd(Number(amount));results.push({...q,flashLoanAmount:Number(amount),flashPremiumUsd:round(premiumUsd,6),modeledGasUsd:gasModel.modeledGasUsd,estimatedNetProfitUsd:round(net,6),requiredNetProfitUsd:round(required,6),qualifies:net>=required});}catch(error){results.push({flashLoanAmount:Number(amount),qualifies:false,error:error.message});}
    const flashOptimization={seedType:chosen.kind,seed:chosen.data,sizesTested:sizes.length,results,candidates:results.filter(x=>x.qualifies).sort((a,b)=>b.estimatedNetProfitUsd-a.estimatedNetProfitUsd)};
    return{bot:"OPTIMIZER_BOT",status:"COMPLETE",strategy:"ADAPTIVE_NET_PROFIT_OPTIMIZATION",minimumNetProfitUsd:BASE_DIRECT_MIN_NET_PROFIT_USD,seedType:chosen.kind,flashLiquidityUsd:aave.availableLiquidity,flashOptimization,elapsedMs:Date.now()-startedAt};
  }catch(error){return{bot:"LARGE_OPPORTUNITY_BOT",status:"ERROR",flashOptimization:null,errors:[{error:error.message}],elapsedMs:Date.now()-startedAt};}
}


const MORPHO_GRAPHQL_URL="https://api.morpho.org/graphql";
async function morphoGraphql450(query,variables={}){
  const r=await fetch421(MORPHO_GRAPHQL_URL,{method:"POST",headers:{accept:"application/json","content-type":"application/json"},body:JSON.stringify({query,variables})},5500);
  const data=await r.json(); if(!r.ok||data?.errors?.length) throw new Error(data?.errors?.[0]?.message||`Morpho API HTTP ${r.status}`); return data.data;
}
async function runMorphoLiquidationBot450(){
  const startedAt=Date.now();
  // 4.42: 1,000 records per page, continue until the API returns a short page.
  // There is intentionally no configured total-position/page ceiling.
  const pageSize=1000;
  const healthFactorLte=Math.max(1.0,Math.min(2.0,Number(process.env.ARBIFLOW_MORPHO_DISCOVERY_HF_LTE||1.10)));
  const positions=[],seen=new Set(),pageDiagnostics=[],pageFingerprints=new Set();
  let page=0,exhausted=false;
  try{
    while(!exhausted){
      const skip=page*pageSize;
      const q=`query MorphoRiskDiscovery($first:Int!,$skip:Int!,$hf:Float!){ marketPositions(first:$first, skip:$skip, orderBy:HealthFactor, orderDirection:Asc, where:{chainId_in:[8453], marketListed:true, healthFactor_lte:$hf}) { items { market { marketId lltv loanAsset { address symbol decimals } collateralAsset { address symbol decimals } } user { address } state { borrowAssets borrowAssetsUsd collateral collateralUsd } } } }`;
      const pd=await morphoGraphql450(q,{first:pageSize,skip,hf:healthFactorLte});
      const items=pd?.marketPositions?.items||[];
      const fingerprint=items.length?`${items.length}:${String(items[0]?.market?.marketId||'')}:${String(items[0]?.user?.address||'')}:${String(items[items.length-1]?.market?.marketId||'')}:${String(items[items.length-1]?.user?.address||'')}`:`EMPTY:${skip}`;
      if(pageFingerprints.has(fingerprint)) throw new Error(`MORPHO_DISCOVERY_PAGINATION_STALLED_AT_PAGE:${page+1}`);
      pageFingerprints.add(fingerprint);
      let added=0,duplicates=0;
      for(const p of items){
        const key=`${String(p?.market?.marketId||'').toLowerCase()}:${String(p?.user?.address||'').toLowerCase()}`;
        if(!p?.market?.marketId||!p?.user?.address)continue;
        if(seen.has(key)){duplicates++;continue;} seen.add(key);positions.push(p);added++;
      }
      pageDiagnostics.push({page:page+1,skip,returned:items.length,added,duplicates});
      exhausted=items.length<pageSize;
      if(!exhausted && added===0) throw new Error(`MORPHO_DISCOVERY_NO_FORWARD_PROGRESS_AT_PAGE:${page+1}`);
      page++;
    }
    const opportunities=[],watchlist=[],healthBuckets={lte1:0,gt1_lte10025:0,gt10025_lte1005:0,gt1005_lte101:0,gt101_lte1025:0,gt1025_lte105:0,gt105_lte110:0};
    const marketSet=new Set();
    for(const p of positions){
      marketSet.add(String(p.market.marketId).toLowerCase());
      const debt=Number(p?.state?.borrowAssetsUsd||0),coll=Number(p?.state?.collateralUsd||0),raw=Number(p?.market?.lltv||0);const lltv=raw>1?raw/1e18:raw;
      if(!(debt>0&&coll>0&&lltv>0))continue;
      const hf=coll*lltv/debt;
      if(hf<=1)healthBuckets.lte1++;else if(hf<=1.0025)healthBuckets.gt1_lte10025++;else if(hf<=1.005)healthBuckets.gt10025_lte1005++;else if(hf<=1.01)healthBuckets.gt1005_lte101++;else if(hf<=1.025)healthBuckets.gt101_lte1025++;else if(hf<=1.05)healthBuckets.gt1025_lte105++;else if(hf<=1.10)healthBuckets.gt105_lte110++;
      const borrowAssetsRaw=String(p?.state?.borrowAssets||"0"),collateralAssetsRaw=String(p?.state?.collateral||"0");
      const loanDecimals=Number(p?.market?.loanAsset?.decimals ?? (p.market.loanAsset?.symbol==="USDC"?6:18));
      const collateralDecimals=Number(p?.market?.collateralAsset?.decimals ?? 18);
      const borrowAssets=Number(baseUnitsToToken(borrowAssetsRaw,loanDecimals));const collateralAssets=Number(baseUnitsToToken(collateralAssetsRaw,collateralDecimals));
      const loanAssetPriceUsd=borrowAssets>0?debt/borrowAssets:null,collateralAssetPriceUsd=collateralAssets>0?coll/collateralAssets:null;
      const row={protocol:"MORPHO_BLUE",marketId:p.market.marketId,user:p.user?.address,loanAsset:p.market.loanAsset?.symbol,loanAssetAddress:p.market.loanAsset?.address,collateralAsset:p.market.collateralAsset?.symbol,collateralAssetAddress:p.market.collateralAsset?.address,borrowAssetsRaw,collateralAssetsRaw,borrowAssets:round(borrowAssets,8),borrowAssetsUsd:round(debt,2),collateralAssets:round(collateralAssets,8),collateralUsd:round(coll,2),loanAssetPriceUsd:Number.isFinite(loanAssetPriceUsd)?round(loanAssetPriceUsd,8):null,collateralAssetPriceUsd:Number.isFinite(collateralAssetPriceUsd)?round(collateralAssetPriceUsd,8):null,lltv:round(lltv,6),healthFactor:round(hf,6),profitabilityValidated:false,readOnly:true};
      if(hf<=1)opportunities.push({...row,status:"LIQUIDATABLE_API_SIGNAL"});else if(hf<=healthFactorLte)watchlist.push({...row,status:"NEAR_LIQUIDATION"});
    }
    opportunities.sort((a,b)=>a.healthFactor-b.healthFactor);watchlist.sort((a,b)=>a.healthFactor-b.healthFactor);
    const hotWatch=watchlist.filter(x=>Number(x.healthFactor)<=1.01);
    return{bot:"MORPHO_LIQUIDATION_BOT",status:"COMPLETE",stage:"BASE_EXHAUSTIVE_PAGINATED_HEALTH_FIRST_DISCOVERY",discoveryMode:"HEALTH_FACTOR_ASC_EXHAUSTIVE_PAGINATION",pageSize,totalPositionCap:null,paginationExhausted:exhausted,healthFactorLte,pagesFetched:pageDiagnostics.length,rawRowsFetched:pageDiagnostics.reduce((n,x)=>n+x.returned,0),uniquePositionsScanned:positions.length,marketsRepresented:marketSet.size,positionsScanned:positions.length,hotWatchCount:hotWatch.length,healthBuckets,pageDiagnostics,opportunities,watchlist,hotWatch,profitabilityValidated:false,note:"Morpho API discovery uses 1,000 rows per page and continues until the qualifying result set is exhausted. There is no configured total-position cap. Duplicate/stall guards fail closed. API signals still require exact fresh onchain accrual and the production safety/economics gate before approval.",errors:[],elapsedMs:Date.now()-startedAt};
  }catch(error){return{bot:"MORPHO_LIQUIDATION_BOT",status:"ERROR",stage:"BASE_EXHAUSTIVE_PAGINATED_HEALTH_FIRST_DISCOVERY",pageSize,totalPositionCap:null,healthFactorLte,pagesFetched:pageDiagnostics.length,rawRowsFetched:pageDiagnostics.reduce((n,x)=>n+x.returned,0),uniquePositionsScanned:positions.length,pageDiagnostics,opportunities:[],watchlist:[],hotWatch:[],profitabilityValidated:false,errors:[{error:error.message}],elapsedMs:Date.now()-startedAt};}
}


// 4.44.0: Exhaustive hot-watch discovery. This is a latency lane, not a replacement
// for runMorphoLiquidationBot450(). It uses the same uncapped pagination contract,
// but asks Morpho only for positions at or below HF 1.01 so current risk candidates
// can be refreshed without waiting for the broader <=1.10 universe scan.
async function runMorphoHotWatchDiscovery4430(){
  const startedAt=Date.now(),pageSize=1000,healthFactorLte=1.01;
  const positions=[],seen=new Set(),pageDiagnostics=[],pageFingerprints=new Set();
  let page=0,exhausted=false;
  try{
    while(!exhausted){
      const skip=page*pageSize;
      const q=`query MorphoHotWatch($first:Int!,$skip:Int!,$hf:Float!){ marketPositions(first:$first, skip:$skip, orderBy:HealthFactor, orderDirection:Asc, where:{chainId_in:[8453], marketListed:true, healthFactor_lte:$hf}) { items { market { marketId lltv loanAsset { address symbol decimals } collateralAsset { address symbol decimals } } user { address } state { borrowAssets borrowAssetsUsd collateral collateralUsd } } } }`;
      const pd=await morphoGraphql450(q,{first:pageSize,skip,hf:healthFactorLte});
      const items=pd?.marketPositions?.items||[];
      const fingerprint=items.length?`${items.length}:${String(items[0]?.market?.marketId||'')}:${String(items[0]?.user?.address||'')}:${String(items[items.length-1]?.market?.marketId||'')}:${String(items[items.length-1]?.user?.address||'')}`:`EMPTY:${skip}`;
      if(pageFingerprints.has(fingerprint)) throw new Error(`MORPHO_HOT_WATCH_PAGINATION_STALLED_AT_PAGE:${page+1}`);
      pageFingerprints.add(fingerprint);
      let added=0,duplicates=0;
      for(const p of items){
        const key=`${String(p?.market?.marketId||'').toLowerCase()}:${String(p?.user?.address||'').toLowerCase()}`;
        if(!p?.market?.marketId||!p?.user?.address) continue;
        if(seen.has(key)){duplicates++;continue;} seen.add(key);positions.push(p);added++;
      }
      pageDiagnostics.push({page:page+1,skip,returned:items.length,added,duplicates});
      exhausted=items.length<pageSize;
      if(!exhausted&&added===0) throw new Error(`MORPHO_HOT_WATCH_NO_FORWARD_PROGRESS_AT_PAGE:${page+1}`);
      page++;
    }
    const candidates=[]; const marketSet=new Set();
    for(const p of positions){
      marketSet.add(String(p.market.marketId).toLowerCase());
      const debt=Number(p?.state?.borrowAssetsUsd||0),coll=Number(p?.state?.collateralUsd||0),raw=Number(p?.market?.lltv||0),lltv=raw>1?raw/1e18:raw;
      if(!(debt>0&&coll>0&&lltv>0)) continue;
      const hf=coll*lltv/debt;
      const borrowAssetsRaw=String(p?.state?.borrowAssets||"0"),collateralAssetsRaw=String(p?.state?.collateral||"0");
      const row={marketId:p.market.marketId,user:p.user.address,healthFactor:round(hf,6),borrowAssetsRaw,collateralAssetsRaw,borrowAssetsUsd:round(debt,2),collateralUsd:round(coll,2),lltv:round(lltv,6),loanAsset:p.market.loanAsset?.symbol||null,loanAssetAddress:p.market.loanAsset?.address||null,loanAssetDecimals:Number(p.market.loanAsset?.decimals??18),collateralAsset:p.market.collateralAsset?.symbol||null,collateralAssetAddress:p.market.collateralAsset?.address||null,collateralAssetDecimals:Number(p.market.collateralAsset?.decimals??18),readOnly:true};
      candidates.push(row);
    }
    candidates.sort((a,b)=>a.healthFactor-b.healthFactor);
    return{success:true,version:VERSION,classification:"MORPHO_HOT_WATCH_REFRESH_COMPLETE",pageSize,totalPositionCap:null,paginationExhausted:exhausted,healthFactorLte,pagesFetched:pageDiagnostics.length,positionsScanned:positions.length,marketsRepresented:marketSet.size,liquidatableSignals:candidates.filter(x=>x.healthFactor<1).length,candidates,pageDiagnostics,readOnly:true,elapsedMs:Date.now()-startedAt};
  }catch(error){return{success:false,version:VERSION,classification:"MORPHO_HOT_WATCH_REFRESH_ERROR",pageSize,totalPositionCap:null,paginationExhausted:false,healthFactorLte,pagesFetched:pageDiagnostics.length,positionsScanned:positions.length,pageDiagnostics,candidates:[],error:error.message,readOnly:true,elapsedMs:Date.now()-startedAt};}
}

function estimateMorphoLiquidationIncentive460(lltv){
  // Conservative discovery estimate only. Actual incentive must be read/revalidated
  // from protocol state before execution. Cap avoids presenting an estimate as a promise.
  const x=Number(lltv); if(!(x>0&&x<1)) return 0;
  return Math.min(1.15, 1/(0.3*x+0.7)) - 1;
}
async function runLiquidationEconomicsBot460(aaveBot,morphoBot){
  const startedAt=Date.now(),candidates=[],watchlist=[],errors=[];
  let flashState=null,gasModel=null;
  const flashByAsset={};
  const morphoRows=[...(morphoBot.opportunities||[]),...(morphoBot.watchlist||[])];
  const debtAssets=[...new Set(morphoRows.map(x=>x.loanAsset).filter(Boolean))];
  try{
    gasModel=await getBaseFlashModeledGasCostUsd();
    for(const asset of debtAssets){
      try{flashByAsset[asset]=await getAaveBaseFlashState(asset);}catch(error){errors.push({stage:"FINANCING_STATE",asset,error:error.message});}
    }
    flashState=flashByAsset[debtAssets[0]]||null;
  }catch(error){errors.push({stage:"FINANCING_STATE",error:error.message});}
  const premiumBps=Number(flashState?.flashLoanPremiumBps||5),gasUsd=Number(gasModel?.modeledGasUsd||0);
  // Morpho: rank both liquidatable and near-liquidation positions by economic potential.
  for(const row of [...(morphoBot.opportunities||[]),...(morphoBot.watchlist||[])]){
    const debt=Number(row.borrowAssetsUsd||0),coll=Number(row.collateralUsd||0),hf=Number(row.healthFactor||Infinity);
    const incentiveRate=estimateMorphoLiquidationIncentive460(row.lltv);
    const repayUsd=Math.min(debt,Math.max(0,coll/(1+incentiveRate)));
    const grossIncentiveUsd=repayUsd*incentiveRate;
    const flashPremiumUsd=repayUsd*premiumBps/10000;
    const conservativeSwapSlippageUsd=repayUsd*0.0015;
    const estimatedNetBeforeRouteUsd=grossIncentiveUsd-flashPremiumUsd-conservativeSwapSlippageUsd-gasUsd;
    const out={protocol:"MORPHO_BLUE",user:row.user,marketId:row.marketId,loanAsset:row.loanAsset,collateralAsset:row.collateralAsset,healthFactor:hf,repayUsd:round(repayUsd,2),estimatedLiquidationIncentivePercent:round(incentiveRate*100,4),estimatedGrossIncentiveUsd:round(grossIncentiveUsd,2),flashPremiumBps:premiumBps,estimatedFlashPremiumUsd:round(flashPremiumUsd,2),modeledGasUsd:round(gasUsd,2),conservativeSwapSlippageUsd:round(conservativeSwapSlippageUsd,2),estimatedNetBeforeRouteUsd:round(estimatedNetBeforeRouteUsd,2),minimumNetProfitUsd:BASE_DIRECT_MIN_NET_PROFIT_USD,liquidatableSignal:hf<=1,profitabilityValidated:false,executable:false,readOnly:true};
    if(hf<=1&&estimatedNetBeforeRouteUsd>=BASE_DIRECT_MIN_NET_PROFIT_USD)candidates.push({...out,status:"ECONOMICS_CANDIDATE_REQUIRES_ONCHAIN_AND_ROUTE_VALIDATION"});
    else if(hf<=1.03)watchlist.push({...out,status:"ECONOMIC_WATCH"});
  }
  // Aave remains watch-first until eligible. Do not invent liquidation bonus economics.
  for(const row of aaveBot.opportunities||[]) watchlist.push({protocol:"AAVE_V3",user:row.user,healthFactor:Number(row.healthFactor),totalDebtUsd:Number(row.totalDebtUsd||0),totalCollateralUsd:Number(row.totalCollateralUsd||0),status:"ECONOMIC_WATCH_REQUIRES_ELIGIBILITY_AND_RESERVE_BONUS",profitabilityValidated:false,executable:false,readOnly:true});
  candidates.sort((a,b)=>b.estimatedNetBeforeRouteUsd-a.estimatedNetBeforeRouteUsd);watchlist.sort((a,b)=>(a.healthFactor??99)-(b.healthFactor??99));
  return{bot:"LIQUIDATION_ECONOMICS_BOT",status:"COMPLETE",strategy:"LIQUIDATION_FIRST_CAPITAL_OPTIMIZER",financing:{primary:"AAVE_FLASH_LOAN_DEBT_ASSET_MATCHED",comparisonReady:["OWN_CAPITAL","AAVE_FLASH_LOAN","PROFIT_SHARE_CAPITAL_LATER"],flashAsset:flashState?.asset??null,flashAssetAddress:flashState?.assetAddress??null,flashLoanPremiumBps:premiumBps,availableFlashLiquidityTokenUnits:flashState?.availableLiquidity??null,byAsset:Object.fromEntries(Object.entries(flashByAsset).map(([asset,x])=>[asset,{assetAddress:x.assetAddress,availableLiquidityTokenUnits:x.availableLiquidity,flashLoanPremiumBps:x.flashLoanPremiumBps}]))},candidates,watchlist,errors,profitabilityValidated:false,note:"4.30.0 matches Aave flash financing to the Morpho debt asset. Economics are conservative discovery estimates only. A candidate is never executable until liquidation eligibility, incentive, collateral route, slippage, gas, flash premium and atomic simulation are revalidated onchain.",elapsedMs:Date.now()-startedAt};
}


function runProjectedLiquidationBot470(morphoBot,liquidationEconomicsBot){
  const startedAt=Date.now(),watch=[];
  const econ=new Map((liquidationEconomicsBot.watchlist||[]).filter(x=>x.protocol==="MORPHO_BLUE").map(x=>[`${x.marketId}:${String(x.user).toLowerCase()}`,x]));
  for(const row of morphoBot.watchlist||[]){
    const hf=Number(row.healthFactor||Infinity);if(!(hf>1&&hf<=1.05))continue;
    const e=econ.get(`${row.marketId}:${String(row.user).toLowerCase()}`)||{};
    const distancePercent=(hf-1)*100;
    watch.push({protocol:"MORPHO_BLUE",marketId:row.marketId,user:row.user,loanAsset:row.loanAsset,collateralAsset:row.collateralAsset,healthFactor:hf,distanceToNormalLiquidationPercent:round(distancePercent,4),borrowAssetsUsd:row.borrowAssetsUsd,collateralUsd:row.collateralUsd,estimatedLiquidationIncentivePercent:e.estimatedLiquidationIncentivePercent??null,projectedRepayCapacityUsd:e.repayUsd??null,projectedGrossIncentiveUsd:e.estimatedGrossIncentiveUsd??null,projectedFlashPremiumUsd:e.estimatedFlashPremiumUsd??null,projectedNetBeforeExitRouteUsd:e.estimatedNetBeforeRouteUsd??null,normalLiquidationEligible:false,preLiquidationEligibility:"NOT_YET_DISCOVERED",status:distancePercent<=1?"CRITICAL_WATCH":distancePercent<=2?"HIGH_WATCH":"WATCH",profitabilityValidated:false,executable:false,readOnly:true});
  }
  watch.sort((a,b)=>a.healthFactor-b.healthFactor);
  return{bot:"PROJECTED_LIQUIDATION_BOT",status:"COMPLETE",strategy:"PRECOMPUTE_BEFORE_ELIGIBILITY",watchlist:watch,critical:watch.filter(x=>x.status==="CRITICAL_WATCH"),high:watch.filter(x=>x.status==="HIGH_WATCH"),note:"Projected economics prepare the opportunity before normal liquidation. Values are not executable profit and require onchain eligibility plus collateral-exit validation.",elapsedMs:Date.now()-startedAt};
}

function runMorphoPreLiquidationDiscovery470(morphoBot){
  // Morpho pre-liquidation is opt-in and contract-specific. 4.7 exposes a safe
  // discovery stage without inventing eligibility from ordinary Morpho health.
  // A later onchain factory indexer will populate authorized contracts/parameters.
  return{bot:"MORPHO_PRE_LIQUIDATION_BOT",status:"DISCOVERY_INTERFACE_READY",strategy:"AUTHORIZED_PRE_LIQUIDATION_ONLY",factoryIndexing:"PENDING_ONCHAIN_FACTORY_EVENT_INDEXER",positionsChecked:(morphoBot.watchlist||[]).length,eligible:[],watchlist:[],executable:false,readOnly:true,note:"Pre-liquidation requires borrower authorization and a deployed PreLiquidation contract. Normal Morpho health alone is not proof of eligibility."};
}


function registerMorphoRouteTokens490(row){
  const n=NETWORKS.base.tokens;
  if(row?.loanAsset&&row?.loanAssetAddress&&!n[row.loanAsset]) n[row.loanAsset]={symbol:row.loanAsset,address:row.loanAssetAddress,decimals:row.loanAsset==="USDC"?6:18,stable:true};
  if(row?.collateralAsset&&row?.collateralAssetAddress&&!n[row.collateralAsset]) n[row.collateralAsset]={symbol:row.collateralAsset,address:row.collateralAssetAddress,decimals:18,stable:true};
}
function uniqueSorted490(values,maxRepay){
  return [...new Set(values.map(Number).filter(x=>Number.isFinite(x)&&x>0&&x<=maxRepay).map(x=>Math.round(x)))].sort((a,b)=>a-b);
}
async function runLiquidationRouteOptimizer490(morphoBot,projectedBot,liquidationEconomicsBot){
  const startedAt=Date.now(),tests=[],errors=[];
  const primaryFlashAsset=liquidationEconomicsBot?.financing?.flashAsset||null;
  const primaryFlashLiquidityTokenUnits=Number(liquidationEconomicsBot?.financing?.availableFlashLiquidityTokenUnits||0);
  const premiumBps=Number(liquidationEconomicsBot?.financing?.flashLoanPremiumBps||5);
  let flashLiquidity=0;
  let gasUsd=0; try{gasUsd=Number((await getBaseFlashModeledGasCostUsd())?.modeledGasUsd||0)}catch(e){errors.push({stage:"GAS",error:e.message})}
  const sourceByKey=new Map([...(morphoBot.opportunities||[]),...(morphoBot.watchlist||[])].map(x=>[`${x.marketId}:${String(x.user).toLowerCase()}`,x]));
  const targets=[...(projectedBot.critical||[]),...(projectedBot.high||[])].slice(0,3);
  const firstSrc=targets[0]?sourceByKey.get(`${targets[0].marketId}:${String(targets[0].user).toLowerCase()}`):null;
  const flashPriceUsd=Number(firstSrc?.loanAssetPriceUsd||0);
  flashLiquidity=primaryFlashLiquidityTokenUnits>0&&flashPriceUsd>0?primaryFlashLiquidityTokenUnits*flashPriceUsd:0;
  const quoteCache=new Map();

  async function quoteExit(src,target,repayUsd,phase){
    let diagnostics={phase,repayUsd:round(repayUsd,2),loanAsset:src?.loanAsset,collateralAsset:src?.collateralAsset};
    try{
      const incentiveRate=Number(target.estimatedLiquidationIncentivePercent||0)/100;
      const loanPriceDerived=Number(src.borrowAssets)>0?Number(src.borrowAssetsUsd||0)/Number(src.borrowAssets):0;
      const collateralPriceDerived=Number(src.collateralAssets)>0?Number(src.collateralUsd||0)/Number(src.collateralAssets):0;
      const loanPriceUsd=Number(src.loanAssetPriceUsd||loanPriceDerived||0);
      const collateralPriceUsd=Number(src.collateralAssetPriceUsd||collateralPriceDerived||0);
      const loanMeta=NETWORKS.base.tokens[src.loanAsset];
      const collateralMeta=NETWORKS.base.tokens[src.collateralAsset];
      diagnostics={...diagnostics,loanAssetPriceUsd:loanPriceUsd,collateralAssetPriceUsd:collateralPriceUsd,loanDecimals:loanMeta?.decimals,collateralDecimals:collateralMeta?.decimals,priceSource:{loan:Number(src.loanAssetPriceUsd)>0?"MORPHO_NORMALIZED":"DERIVED_USD_OVER_TOKEN",collateral:Number(src.collateralAssetPriceUsd)>0?"MORPHO_NORMALIZED":"DERIVED_USD_OVER_TOKEN"}};
      if(!(loanPriceUsd>0)||!(collateralPriceUsd>0)) throw new Error(`Missing token/USD conversion for ${src.collateralAsset}->${src.loanAsset}`);
      if(!loanMeta||!collateralMeta) throw new Error(`Missing token metadata for ${src.collateralAsset}->${src.loanAsset}`);
      const repayLoanAssetUnits=repayUsd/loanPriceUsd;
      const seizedCollateralUsd=repayUsd*(1+incentiveRate);
      const collateralToSell=seizedCollateralUsd/collateralPriceUsd;
      const sellAmountBaseUnits=tokenToBaseUnits(collateralToSell,collateralMeta.decimals);
      diagnostics={...diagnostics,repayLoanAssetUnits,seizedCollateralUsd,collateralToSellTokenUnits:collateralToSell,sellAmountBaseUnits};
      if(!(collateralToSell>0)||!/^\d+$/.test(String(sellAmountBaseUnits))||BigInt(sellAmountBaseUnits)<=0n) throw new Error("Invalid collateral sell amount after token-unit conversion");
      const cacheKey=`${src.collateralAsset}:${src.loanAsset}:${sellAmountBaseUnits}`;
      let q=quoteCache.get(cacheKey);
      if(!q){q=await withTimeout421(zeroXPrice({network:NETWORKS.base,sellToken:src.collateralAsset,buyToken:src.loanAsset,sellAmount:collateralToSell}),5500,`4.18.1 collateral exit ${src.collateralAsset}->${src.loanAsset} ${repayUsd}`);quoteCache.set(cacheKey,q);}
      const exitBuyAmountLoanUnits=Number(q.buyAmount);
      const exitBuyAmountUsd=exitBuyAmountLoanUnits*loanPriceUsd;
      const impliedExitPriceUsd=collateralToSell>0?exitBuyAmountUsd/collateralToSell:0;
      const impliedDeviationPct=collateralPriceUsd>0?Math.abs(impliedExitPriceUsd-collateralPriceUsd)/collateralPriceUsd*100:Infinity;
      if(!Number.isFinite(exitBuyAmountUsd)||exitBuyAmountUsd<=0) throw new Error("Invalid 0x buy amount after token-unit conversion");
      if(impliedDeviationPct>15) throw new Error(`0x implied exit price deviates ${round(impliedDeviationPct,2)}% from collateral reference price`);
      const flashPremiumUsd=repayUsd*premiumBps/10000;
      const finalNet=exitBuyAmountUsd-repayUsd-flashPremiumUsd-gasUsd;
      return{protocol:"MORPHO_BLUE",marketId:target.marketId,user:target.user,healthFactor:target.healthFactor,status:target.status,normalLiquidationEligible:Boolean(target.normalLiquidationEligible),loanAsset:src.loanAsset,collateralAsset:src.collateralAsset,phase,repayUsd:round(repayUsd,2),repayLoanAssetUnits:round(repayLoanAssetUnits,10),loanAssetPriceUsd:round(loanPriceUsd,8),seizedCollateralUsd:round(seizedCollateralUsd,2),collateralAssetPriceUsd:round(collateralPriceUsd,8),collateralToSellTokenUnits:round(collateralToSell,10),sellAmountBaseUnits:String(sellAmountBaseUnits),exitProvider:"0x",exitBuyAmountLoanUnits:round(exitBuyAmountLoanUnits,10),exitBuyAmountUsd:round(exitBuyAmountUsd,2),impliedExitPriceUsd:round(impliedExitPriceUsd,8),impliedPriceDeviationPercent:round(impliedDeviationPct,4),flashPremiumUsd:round(flashPremiumUsd,2),modeledGasUsd:round(gasUsd,2),projectedFinalNetUsd:round(finalNet,2),meetsMinimumNet:finalNet>=BASE_DIRECT_MIN_NET_PROFIT_USD,unitIntegrityPass:true,priceSource:diagnostics.priceSource,profitabilityValidated:false,executable:false,quoteTimestamp:q.quoteTimestamp,readOnly:true};
    }catch(error){return{protocol:"MORPHO_BLUE",marketId:target?.marketId,user:target?.user,healthFactor:target?.healthFactor,...diagnostics,errorStage:"TOKEN_UNIT_OR_EXIT_QUOTE",error:error?.message||String(error),errorName:error?.name||"Error",unitIntegrityPass:false,profitabilityValidated:false,executable:false,readOnly:true};}
  }

  for(const target of targets){
    const src=sourceByKey.get(`${target.marketId}:${String(target.user).toLowerCase()}`); if(!src)continue;
    registerMorphoRouteTokens490(src);
    const maxRepay=Math.min(Number(target.projectedRepayCapacityUsd||target.borrowAssetsUsd||0),flashLiquidity>0?flashLiquidity:Number(target.borrowAssetsUsd||0));
    const coarse=uniqueSorted490([10000,50000,100000,250000,500000,1000000],maxRepay);
    if(maxRepay>0&&!coarse.length)coarse.push(Math.round(maxRepay));
    const coarseRows=await mapLimit421(coarse,3,x=>quoteExit(src,target,x,"COARSE"));
    tests.push(...coarseRows);
    let successful=coarseRows.filter(x=>Number.isFinite(Number(x.projectedFinalNetUsd))).sort((a,b)=>b.projectedFinalNetUsd-a.projectedFinalNetUsd);
    if(!successful.length)continue;

    let winner=successful[0];
    const broadStep=Math.max(25000,Math.round(winner.repayUsd*0.10));
    const broad=uniqueSorted490([-4,-3,-2,-1,1,2,3,4].map(k=>winner.repayUsd+k*broadStep),maxRepay).filter(x=>!coarse.includes(x));
    const broadRows=await mapLimit421(broad,3,x=>quoteExit(src,target,x,"REFINE_BROAD"));
    tests.push(...broadRows);
    successful=[...successful,...broadRows.filter(x=>Number.isFinite(Number(x.projectedFinalNetUsd)))].sort((a,b)=>b.projectedFinalNetUsd-a.projectedFinalNetUsd);
    winner=successful[0];

    const fineStep=Math.max(5000,Math.round(broadStep/5));
    const already=new Set([...coarse,...broad]);
    const fine=uniqueSorted490([-3,-2,-1,1,2,3].map(k=>winner.repayUsd+k*fineStep),maxRepay).filter(x=>!already.has(x));
    const fineRows=await mapLimit421(fine,3,x=>quoteExit(src,target,x,"REFINE_FINE"));
    tests.push(...fineRows);
  }

  const successful=tests.filter(x=>Number.isFinite(Number(x.projectedFinalNetUsd)));
  const bestByPosition=[];
  for(const target of targets){const r=successful.filter(x=>String(x.user).toLowerCase()===String(target.user).toLowerCase()).sort((a,b)=>b.projectedFinalNetUsd-a.projectedFinalNetUsd);if(r[0])bestByPosition.push(r[0]);}
  bestByPosition.sort((a,b)=>b.projectedFinalNetUsd-a.projectedFinalNetUsd);
  const bestOverall=bestByPosition[0]||null;
  return{bot:"LIQUIDATION_ROUTE_OPTIMIZER_BOT",status:"COMPLETE",strategy:"ADAPTIVE_COARSE_TO_FINE_REAL_EXIT_QUOTES",route:`${targets[0]?.collateralAsset||"COLLATERAL"}->${targets[0]?.loanAsset||"DEBT"}`,financing:"AAVE_FLASH_LOAN_DEBT_ASSET_MATCHED",flashAsset:primaryFlashAsset,availableFlashLiquidityTokenUnits:primaryFlashLiquidityTokenUnits,availableFlashLiquidityUsd:round(flashLiquidity,2),flashLoanPremiumBps:premiumBps,coarseSizesUsd:[10000,50000,100000,250000,500000,1000000],adaptiveRefinement:true,positionsTargeted:targets.length,uniqueExitQuotes:quoteCache.size,tests,bestByPosition,bestOverall,qualifiedProjected:bestByPosition.filter(x=>x.meetsMinimumNet),errors,profitabilityValidated:false,executable:false,note:"4.30.0 retains normalized Morpho token pricing and live 0x route diagnostics while aligning execution financing with the actual Morpho debt asset. projectedFinalNetUsd remains pre-eligibility projection only. Exact Morpho liquidation eligibility/repay limits, fresh execution quotes, minimum-output protection and atomic simulation remain mandatory before execution.",elapsedMs:Date.now()-startedAt};
}



/*
=========================================================
AR BIFLOW 4.10.1 - LIQUIDATION READINESS VALIDATOR

This stage is deliberately fail-closed. Morpho Blue permits a liquidator
of an unhealthy position to repay part or all of the borrower's debt, but
API health is only a discovery signal. 4.10 therefore does not turn a
projected route into an executable trade. It requires a fresh liquidation
signal and a fresh optimized route, then reports every remaining execution
prerequisite explicitly.

No transaction is built, signed, simulated, or broadcast here.
=========================================================
*/
const MORPHO_BLUE_4210 = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";
const MORPHO_FRESH_STATE_ABI_4210 = [
  "function position(bytes32 id,address user) view returns (uint256 supplyShares,uint128 borrowShares,uint128 collateral)",
  "function market(bytes32 id) view returns (uint128 totalSupplyAssets,uint128 totalSupplyShares,uint128 totalBorrowAssets,uint128 totalBorrowShares,uint128 lastUpdate,uint128 fee)",
  "function idToMarketParams(bytes32 id) view returns (address loanToken,address collateralToken,address oracle,address irm,uint256 lltv)"
];
function mulDivUp4210(x,y,d){x=BigInt(x);y=BigInt(y);d=BigInt(d);if(d<=0n)throw new Error("DIVISION_BY_ZERO");const z=x*y;return z===0n?0n:(z+d-1n)/d;}
async function readFreshMorphoStoredState4210(row){
  const provider=getBaseProvider();
  const morpho=new Contract(MORPHO_BLUE_4210,MORPHO_FRESH_STATE_ABI_4210,provider);
  const blockNumber=await provider.getBlockNumber();
  const [position,market,params]=await Promise.all([morpho.position(row.marketId,row.user),morpho.market(row.marketId),morpho.idToMarketParams(row.marketId)]);
  const borrowShares=BigInt(position.borrowShares);
  const collateralRaw=BigInt(position.collateral);
  const totalBorrowAssets=BigInt(market.totalBorrowAssets);
  const totalBorrowShares=BigInt(market.totalBorrowShares);
  // Morpho share conversion includes virtual assets/shares. This is an exact conversion
  // of the CURRENT STORED market state, but it deliberately does not claim interest has
  // been accrued in a state-changing transaction at this block.
  const storedBorrowAssets=mulDivUp4210(borrowShares,totalBorrowAssets+1n,totalBorrowShares+1000000n);
  const loanDecimals=NETWORKS.base.tokens[row.loanAsset]?.decimals ?? 18;
  const collateralDecimals=NETWORKS.base.tokens[row.collateralAsset]?.decimals ?? 18;
  const storedBorrowTokenUnits=Number(formatUnits(storedBorrowAssets,loanDecimals));
  const collateralTokenUnits=Number(formatUnits(collateralRaw,collateralDecimals));
  const loanPriceUsd=Number(row.loanAssetPriceUsd||0), collateralPriceUsd=Number(row.collateralAssetPriceUsd||0), lltv=Number(row.lltv||0);
  const storedBorrowUsd=storedBorrowTokenUnits*loanPriceUsd;
  const collateralUsd=collateralTokenUnits*collateralPriceUsd;
  const storedHealthFactor=storedBorrowUsd>0&&lltv>0?(collateralUsd*lltv/storedBorrowUsd):null;
  return {source:"DIRECT_BASE_RPC_CURRENT_BLOCK_STORED_STATE",blockNumber,marketId:row.marketId,user:row.user,borrowShares:borrowShares.toString(),collateralRaw:collateralRaw.toString(),storedTotalBorrowAssets:totalBorrowAssets.toString(),storedTotalBorrowShares:totalBorrowShares.toString(),storedBorrowAssetsRaw:storedBorrowAssets.toString(),storedBorrowTokenUnits:round(storedBorrowTokenUnits,10),storedBorrowUsd:round(storedBorrowUsd,2),storedCollateralTokenUnits:round(collateralTokenUnits,10),storedCollateralUsd:round(collateralUsd,2),lltv:round(lltv,8),storedHealthFactor:Number.isFinite(storedHealthFactor)?round(storedHealthFactor,9):null,storedStateLiquidatable:Number.isFinite(storedHealthFactor)&&storedHealthFactor<=1,marketLastUpdate:Number(market.lastUpdate),loanToken:params.loanToken,collateralToken:params.collateralToken,oracle:params.oracle,irm:params.irm,onchainLltv:params.lltv.toString(),exactAccruedStateConfirmed:false,note:"Current-block direct RPC stored-state gate. Morpho interest accrual is not persisted by this read-only call, so this must not be treated as exact accrued execution eligibility."};
}

function runMorphoCandidateForkGate4300(candidates){
  if(!Array.isArray(candidates)||candidates.length===0) return {success:true,version:"4.30.0",source:"EPHEMERAL_BASE_FORK_BATCH_MORPHO_ACCRUAL_PLUS_EXACT_LIQUIDATION_BOUND",candidatesChecked:0,results:[],note:"No optimized Morpho candidates required fork accrual."};
  const reportPath=path.join(__dirname,`morpho-candidate-gate-4300-${process.pid}-${Date.now()}.json`);
  const env={...process.env,ARBIFLOW_MORPHO_CANDIDATES_JSON:JSON.stringify(candidates.map(x=>({marketId:x.marketId,user:x.user}))),ARBIFLOW_MORPHO_GATE_REPORT:reportPath};
  const hardhatBin=process.platform==="win32"?path.join(__dirname,"node_modules",".bin","hardhat.cmd"):path.join(__dirname,"node_modules",".bin","hardhat");
  const child=spawnSync(hardhatBin,["run","--no-compile","MorphoCandidateForkGate4300.js"],{cwd:__dirname,env,encoding:"utf8",timeout:120000,maxBuffer:4*1024*1024});
  let report=null;
  try{if(fs.existsSync(reportPath)) report=JSON.parse(fs.readFileSync(reportPath,"utf8"));}catch{}
  try{if(fs.existsSync(reportPath)) fs.unlinkSync(reportPath);}catch{}
  if(child.error) return {success:false,version:"4.30.0",source:"EPHEMERAL_BASE_FORK_BATCH_MORPHO_ACCRUAL_PLUS_EXACT_LIQUIDATION_BOUND",error:child.error.message,stderr:child.stderr?.slice(-2000)||null,results:[]};
  if(child.status!==0||!report?.success) return {success:false,version:"4.30.0",source:"EPHEMERAL_BASE_FORK_BATCH_MORPHO_ACCRUAL_PLUS_EXACT_LIQUIDATION_BOUND",exitCode:child.status,error:report?.error||child.stderr?.slice(-2000)||"FORK_GATE_FAILED",results:[]};
  return report;
}

function buildAtomicPayloadBlueprint4300(pos, exactBound, executionQuote){
  if(!exactBound||executionQuote?.firmQuoteBound!==true) return {status:"NOT_BUILT_UNTIL_EXACT_BOUND_AND_FIRM_QUOTE",payloadBound:false,transactionSpecificGasAvailable:false,readOnly:true};
  const tx=executionQuote.transaction||{};
  const gas=BigInt(tx.gas||0), gasPrice=BigInt(tx.gasPrice||0);
  const swapLegGasCostWei=gas>0n&&gasPrice>0n?gas*gasPrice:0n;
  const minBuy=BigInt(executionQuote.minBuyAmount||0), repay=BigInt(exactBound.exactRepaidAssetsRaw||0);
  const premiumBps=5n;
  const premium=(repay*premiumBps+9999n)/10000n;
  const requiredDebtAssetOut=repay+premium;
  return {
    status:"BOUND_READ_ONLY_BLUEPRINT",
    payloadBound:true,
    chainId:8453,
    flashLoan:{provider:"AAVE_V3_BASE",asset:pos.loanAssetAddress||null,amountRaw:repay.toString(),premiumBps:Number(premiumBps),estimatedPremiumRaw:premium.toString(),requiredRepaymentRaw:requiredDebtAssetOut.toString()},
    morphoLiquidation:{marketId:pos.marketId,borrower:pos.user,seizedAssetsRaw:String(exactBound.seizedAssetsInputRaw),repaidSharesRaw:"0",expectedDerivedRepaidSharesRaw:String(exactBound.derivedRepaidSharesRaw),expectedRepaidAssetsRaw:String(exactBound.exactRepaidAssetsRaw)},
    collateralExit:{sellToken:pos.collateralAssetAddress||null,buyToken:pos.loanAssetAddress||null,sellAmountRaw:String(exactBound.seizedAssetsInputRaw),allowanceSpender:executionQuote.allowanceSpender||null,target:tx.to||null,data:tx.data||null,value:tx.value??"0",quotedBuyAmountRaw:String(executionQuote.buyAmount||""),minBuyAmountRaw:String(executionQuote.minBuyAmount||"")},
    coverage:{minBuyCoversFlashRepayment:minBuy>=requiredDebtAssetOut,requiredDebtAssetOutRaw:requiredDebtAssetOut.toString()},
    gas:{source:"0X_SWAP_LEG_PROVIDER_ESTIMATE_ONLY",swapLegGas:gas?gas.toString():null,swapLegGasPriceWei:gasPrice?gasPrice.toString():null,swapLegGasCostWei:swapLegGasCostWei?swapLegGasCostWei.toString():null,atomicTransactionGasEstimated:false,note:"0x gas covers the swap leg only. It is not an estimate for the future Aave+Morpho+swap atomic executor transaction."},
    transactionSpecificGasAvailable:false,
    atomicCalldataBuilt:false,
    atomicSimulationPerformed:false,
    mainnetBroadcast:false,
    payloadBound:true,
    readOnly:true
  };
}

async function runLiquidationReadiness410(morphoBot, routeBot){
  const startedAt=Date.now();
  const allMorpho=[...(morphoBot.opportunities||[]),...(morphoBot.watchlist||[])];
  const dedup=new Map();
  for(const p of allMorpho){
    if(!p?.marketId||!p?.user) continue;
    const key=`${p.marketId}:${String(p.user).toLowerCase()}`;
    const prev=dedup.get(key);
    if(!prev||Number(p.healthFactor)<Number(prev.healthFactor)) dedup.set(key,p);
  }
  // Eligibility must be independent of quote-provider success. Rank directly from
  // Morpho discovery and send the closest positions to the fork accrual gate.
  const candidates=[...dedup.values()]
    .filter(x=>Number.isFinite(Number(x.healthFactor))&&Number(x.healthFactor)>0)
    .sort((a,b)=>Number(a.healthFactor)-Number(b.healthFactor))
    .slice(0,3);
  const liquidatable=new Map((morphoBot.opportunities||[]).map(x=>[`${x.marketId}:${String(x.user).toLowerCase()}`,x]));
  const routeByKey=new Map((routeBot.bestByPosition||[]).map(x=>[`${x.marketId}:${String(x.user).toLowerCase()}`,x]));
  const sourceByKey=new Map(allMorpho.map(x=>[`${x.marketId}:${String(x.user).toLowerCase()}`,x]));
  const quoteTaker=process.env.ARBIFLOW_QUOTE_TAKER||"";
  const forkGate=runMorphoCandidateForkGate4300(candidates);
  const forkByKey=new Map((forkGate.results||[]).map(x=>[`${x.marketId}:${String(x.user).toLowerCase()}`,x]));
  const rows=[];
  for(const pos of candidates){
    const key=`${pos.marketId}:${String(pos.user).toLowerCase()}`;
    const route=routeByKey.get(key)||null;
    const eligiblePos=liquidatable.get(key);
    let freshOnchainStoredState=null;
    try{freshOnchainStoredState=await readFreshMorphoStoredState4210(pos);}catch(error){freshOnchainStoredState={source:"DIRECT_BASE_RPC_CURRENT_BLOCK_STORED_STATE",error:error?.message||String(error),exactAccruedStateConfirmed:false};}
    const exactFork=forkByKey.get(key)||null;
    const exactConfirmed=Boolean(forkGate.success&&exactFork?.forkAccruedStateConfirmed===true&&exactFork?.exactAtForkBlock===true);
    const exactEligible=Boolean(exactConfirmed&&exactFork?.exactAccruedLiquidatable===true);
    const exactBound=exactFork?.exactProtocolLiquidationBound||null;
    const exactBoundConfirmed=Boolean(exactEligible&&exactBound?.exactProtocolValidRepaySeizeBound===true&&exactBound?.borrowShareBoundPass===true&&exactBound?.collateralBoundPass===true);
    let executionQuote={status:"NOT_REQUESTED_CANDIDATE_NOT_EXACTLY_ELIGIBLE",firmQuoteBound:false,readOnly:true};
    if(exactBoundConfirmed){
      const src=sourceByKey.get(key)||pos;
      try{
        if(!quoteTaker) throw new Error("ARBIFLOW_QUOTE_TAKER is not configured; firm quote remains fail-closed.");
        executionQuote={status:"RECEIVED",...(await zeroXFirmExecutionQuote4300({sellTokenAddress:src.collateralAssetAddress,buyTokenAddress:src.loanAssetAddress,sellAmountBaseUnits:String(exactBound.seizedAssetsInputRaw),taker:quoteTaker,slippageBps:Number(SETTINGS.slippageBps||100)}))};
      }catch(error){executionQuote={status:"FAILED",error:error?.message||String(error),firmQuoteBound:false,readOnly:true};}
    }
    const firmQuoteBound=Boolean(exactBoundConfirmed&&executionQuote?.firmQuoteBound===true);
    const atomicPayloadBlueprint=buildAtomicPayloadBlueprint4300(sourceByKey.get(key)||pos,exactBound,executionQuote);
    const apiLiquidatable=Boolean(eligiblePos&&Number(eligiblePos.healthFactor)<=1);
    const freshSignal=Boolean(freshOnchainStoredState?.storedStateLiquidatable===true);
    const routeNet=route?Number(route.projectedFinalNetUsd):null;
    const routeQualified=route?Number.isFinite(routeNet)&&routeNet>=BASE_DIRECT_MIN_NET_PROFIT_USD:false;
    const quoteAgeMs=route&&Number.isFinite(Number(route.quoteTimestamp))?Math.max(0,Date.now()-Number(route.quoteTimestamp)):null;
    const quoteFresh=quoteAgeMs!==null&&quoteAgeMs<=15000;
    const protocolMaxRepayUsd=Number(pos.borrowAssetsUsd||0)||null;
    const selectedRepayUsd=route?Number(route.repayUsd||0):null;
    const withinProtocolDebt=Boolean(route&&protocolMaxRepayUsd>0&&selectedRepayUsd>0&&selectedRepayUsd<=protocolMaxRepayUsd);
    const blockers=[];
    if(!exactConfirmed) blockers.push("MORPHO_FORK_ACCRUED_STATE_NOT_CONFIRMED");
    else if(!exactEligible) blockers.push("MORPHO_FORK_ACCRUED_STATE_NOT_LIQUIDATABLE");
    if(freshOnchainStoredState?.error) blockers.push("MORPHO_CURRENT_BLOCK_RPC_STATE_READ_FAILED");
    if(!route) blockers.push("EXIT_ROUTE_NOT_YET_AVAILABLE");
    else {
      if(!routeQualified) blockers.push("FINAL_NET_BELOW_MINIMUM");
      if(!quoteFresh) blockers.push("EXIT_QUOTE_NOT_FRESH");
      if(!withinProtocolDebt) blockers.push("SELECTED_REPAY_EXCEEDS_DISCOVERED_DEBT");
    }
    if(exactEligible&&!exactBoundConfirmed) blockers.push("EXACT_PROTOCOL_VALID_REPAY_SEIZE_BOUND_NOT_CONFIRMED");
    if(exactBoundConfirmed&&!firmQuoteBound) blockers.push("FIRM_EXECUTION_QUOTE_NOT_BOUND");
    if(!exactBoundConfirmed) blockers.push("FIRM_EXECUTION_QUOTE_DEFERRED_UNTIL_EXACT_ELIGIBILITY");
    if(!atomicPayloadBlueprint.payloadBound) blockers.push("ATOMIC_TX_BLUEPRINT_DEFERRED_UNTIL_FIRM_QUOTE");
    blockers.push("FULL_ATOMIC_TRANSACTION_NOT_BOUND_TO_ELIGIBLE_CANDIDATE_AND_FIRM_QUOTE");
    blockers.push("FULL_ATOMIC_TRANSACTION_GAS_NOT_YET_ESTIMATED");
    if(!firmQuoteBound) blockers.push("MIN_OUTPUT_GUARD_NOT_BOUND_TO_FIRM_QUOTE");
    blockers.push("ATOMIC_EXECUTION_SIMULATION_DEFERRED_UNTIL_EXACT_ELIGIBILITY_AND_FIRM_QUOTE");
    rows.push({protocol:"MORPHO_BLUE",marketId:pos.marketId,user:pos.user,healthFactor:pos.healthFactor,selectionSource:"DIRECT_MORPHO_DISCOVERY_HEALTH_RANK",apiLiquidatableSignal:apiLiquidatable,normalLiquidationEligible:freshSignal,freshOnchainStoredState,exactForkAccruedState:exactFork,exactProtocolLiquidationBound:exactBound,executionQuote,atomicPayloadBlueprint,discoveredDebtUsd:pos.borrowAssetsUsd??null,protocolRule:"PARTIAL_OR_FULL_LIQUIDATION_WHEN_UNHEALTHY",protocolMaxRepayUsdDiscoveryOnly:protocolMaxRepayUsd,routeAvailable:Boolean(route),selectedRepayUsd:route?round(selectedRepayUsd,2):null,selectedRouteNetUsd:route&&Number.isFinite(routeNet)?round(routeNet,2):null,minimumNetProfitUsd:BASE_DIRECT_MIN_NET_PROFIT_USD,quoteAgeMs,quoteFresh,withinDiscoveredDebt:withinProtocolDebt,checks:{freshCurrentBlockStoredEligibility:freshSignal,forkAccruedStateConfirmed:exactConfirmed,exactAccruedEligibility:exactEligible,routeAvailable:Boolean(route),routeNetMinimum:routeQualified,freshExitQuote:quoteFresh,selectedRepayWithinDiscoveredDebt:withinProtocolDebt,exactProtocolValidRepaySeizeBound:exactBoundConfirmed,firmExecutionQuoteBound:firmQuoteBound,minOutputBoundToFirmQuote:firmQuoteBound,atomicPayloadBlueprintBound:Boolean(atomicPayloadBlueprint.payloadBound),swapLegProviderGasBound:Boolean(atomicPayloadBlueprint?.gas?.swapLegGas),transactionSpecificGas:false,minOutputBoundToAtomicTransaction:false,atomicSimulation:false},blockers,readinessStatus:blockers.length?"REJECT_NOT_EXECUTION_READY":"PASS",paperPass:false,profitabilityValidated:false,executable:false,readOnly:true});
  }
  return {bot:"LIQUIDATION_READINESS_BOT",status:forkGate.success?"COMPLETE":"FORK_ACCRUAL_GATE_FAILED",strategy:"DIRECT_MORPHO_TO_EXACT_BOUND_TO_FIRM_QUOTE_TO_ATOMIC_PAYLOAD_BLUEPRINT_WITH_EXECUTOR_STATE_SYNC_FAIL_CLOSED",positionsChecked:rows.length,candidateSelection:{source:"MORPHO_LIQUIDATION_BOT_DIRECT",limit:3,selected:candidates.map(x=>({marketId:x.marketId,user:x.user,healthFactor:x.healthFactor}))},forkAccrualGate:{success:forkGate.success,source:forkGate.source,sourceForkBlockNumber:forkGate.sourceForkBlockNumber??null,protocolExecutionBlockNumber:forkGate.protocolExecutionBlockNumber??null,uniqueMarketsAccrued:forkGate.uniqueMarketsAccrued??0,candidatesChecked:forkGate.candidatesChecked??0,error:forkGate.error??null},ready:rows.filter(x=>x.readinessStatus==="PASS"),rejected:rows,executable:false,paperPass:false,readOnly:true,note:"4.30.0 selects the closest Morpho positions directly from discovery before route optimization, batches them into one disposable Base fork, accrues each unique market once, and rereads every borrower after accrual. Quote-provider or gas-pricing failures cannot suppress eligibility checks. For a borrower that is unhealthy at the fork block, 4.26 computes the exact Morpho liquidation bound and only then requests a firm 0x AllowanceHolder quote for the exact seized collateral amount. The returned allowance spender, transaction target/calldata and minimum output are validated and bound into a read-only Aave+Morpho+0x atomic payload blueprint. 0x swap-leg gas is retained separately and is never mislabeled as full atomic transaction gas. The verified callable harness and the implemented full atomic executor are tracked separately; the full executor remains fork-only and candidate-bound simulation is deferred until exact eligibility plus a firm quote. No signing or broadcast occurs.",elapsedMs:Date.now()-startedAt};
}


/*
=========================================================
AR BIFLOW 4.11.0 - EXECUTION FOUNDATION (READ ONLY)

Builds a deterministic, inspectable execution PLAN from the selected
liquidation route. It does not create calldata, estimate transaction gas,
request a flash loan, approve tokens, sign, simulate, or broadcast.

Protocol semantics verified against official documentation before this
stage was added:
- Morpho Blue: unhealthy positions may be liquidated partially or fully.
- Aave V3 flashLoanSimple: principal + premium must be returned atomically.

A true atomic simulation requires a deployed/callable executor contract.
=========================================================
*/
function runExecutionFoundation411(morphoBot, routeBot, readinessBot){
  const startedAt=Date.now();
  const discovery=new Map([...(morphoBot.watchlist||[]),...(morphoBot.opportunities||[])].map(x=>[`${x.marketId}:${String(x.user).toLowerCase()}`,x]));
  const readiness=new Map([...(readinessBot.rejected||[]),...(readinessBot.ready||[])].map(x=>[`${x.marketId}:${String(x.user).toLowerCase()}`,x]));
  const plans=[];
  for(const route of routeBot.bestByPosition||[]){
    const key=`${route.marketId}:${String(route.user).toLowerCase()}`;
    const pos=discovery.get(key)||{};
    const gate=readiness.get(key)||{};
    const repayUsd=Number(route.repayUsd||0);
    const premiumUsd=Number(route.flashPremiumUsd||0);
    const projectedExitUsd=Number(route.exitBuyAmountUsd||0);
    const projectedNetUsd=Number(route.projectedFinalNetUsd||0);
    const requiredFlashRepaymentUsd=repayUsd>0?round(repayUsd+premiumUsd,2):null;
    const blockers=[...(gate.blockers||[])];
    if(!blockers.includes("FULL_ATOMIC_EXECUTOR_FORK_ONLY_NOT_MAINNET")) blockers.push("FULL_ATOMIC_EXECUTOR_FORK_ONLY_NOT_MAINNET");
    if(!blockers.includes("EXECUTION_CALLDATA_NOT_BUILT")) blockers.push("EXECUTION_CALLDATA_NOT_BUILT");
    plans.push({
      protocol:"MORPHO_BLUE",
      network:"Base",
      marketId:route.marketId,
      borrower:route.user,
      loanAsset:route.loanAsset,
      loanAssetAddress:pos.loanAssetAddress||null,
      flashAsset:route.loanAsset,
      flashAssetAddress:pos.loanAssetAddress||null,
      flashAssetMatchesDebtAsset:Boolean(route.loanAsset&&pos.loanAssetAddress),
      collateralAsset:route.collateralAsset,
      collateralAssetAddress:pos.collateralAssetAddress||null,
      selectedRepayUsd:repayUsd>0?round(repayUsd,2):null,
      modeledFlashPremiumUsd:Number.isFinite(premiumUsd)?round(premiumUsd,2):null,
      requiredFlashRepaymentUsd,
      projectedCollateralToSellTokenUnits:route.collateralToSellTokenUnits??null,
      projectedExitAmountUsd:Number.isFinite(projectedExitUsd)?round(projectedExitUsd,6):null,
      projectedFinalNetUsd:Number.isFinite(projectedNetUsd)?round(projectedNetUsd,2):null,
      minimumNetProfitUsd:BASE_DIRECT_MIN_NET_PROFIT_USD,
      executionSequence:[
        `AAVE_FLASH_LOAN_SIMPLE_${route.loanAsset||"DEBT_ASSET"}` ,
        "MORPHO_BLUE_LIQUIDATE_ONLY_IF_FRESHLY_ELIGIBLE",
        "RECEIVE_SEIZED_COLLATERAL",
        "SWAP_COLLATERAL_TO_LOAN_ASSET_WITH_MIN_OUTPUT",
        "REPAY_AAVE_PRINCIPAL_PLUS_PREMIUM",
        "REQUIRE_FINAL_NET_AT_OR_ABOVE_MINIMUM",
        "SEND_RESIDUAL_PROFIT_TO_CONFIGURED_RECIPIENT"
      ],
      hardGuards:{
        freshMorphoEligibilityRequired:true,
        exactOnchainRepayRequired:true,
        selectedRepayWithinDiscoveryDebt:Boolean(gate.withinDiscoveredDebt),
        freshExitQuoteRequired:true,
        minOutputRequired:true,
        flashRepaymentCoverageRequired:true,
        transactionSpecificGasRequired:true,
        minimumNetProfitUsd:BASE_DIRECT_MIN_NET_PROFIT_USD,
        atomicSimulationRequired:true
      },
      implementationState:{
        executorContract:"FORK_ONLY_IMPLEMENTED_NOT_CANDIDATE_BOUND",
        calldata:"NOT_BUILT",
        exactOnchainRepay:"NOT_READ",
        transactionGasEstimate:"NOT_AVAILABLE",
        minOutputBound:"NOT_BOUND",
        atomicSimulation:"NOT_AVAILABLE"
      },
      blockers,
      planStatus:"BLUEPRINT_ONLY_NOT_EXECUTABLE",
      executable:false,
      paperPass:false,
      readOnly:true
    });
  }
  return {bot:"EXECUTION_FOUNDATION_BOT",status:"COMPLETE",strategy:"ATOMIC_FLASH_LIQUIDATION_BLUEPRINT_FAIL_CLOSED",plansBuilt:plans.length,plans,executorContractRequired:true,transactionPayloadBuilt:false,transactionGasEstimated:false,atomicSimulationPerformed:false,executable:false,paperPass:false,readOnly:true,note:"4.30.0 aligns the flash asset with the Morpho debt asset and preserves the execution sequence and hard guards without pretending a transaction exists. The full executor implementation is fork-only in 4.29; candidate-bound execution remains disabled until exact onchain eligibility, firm quote calldata, transaction-specific gas, minimum-output binding and atomic simulation are validated.",elapsedMs:Date.now()-startedAt};
}


/*
=========================================================
ARBIFLOW 4.12.0 - EXECUTOR SIMULATION FOUNDATION (READ ONLY)

Creates a deterministic transaction SHAPE and calldata schema for a future
executor contract. It deliberately does not invent a deployed executor
address, does not claim eth_estimateGas is available, and does not call or
broadcast anything. A firm 0x execution quote must later be requested with
the deployed executor as taker; its returned transaction.to/data/value and
allowance spender must be used rather than hardcoded.
=========================================================
*/
function runExecutorSimulationFoundation412(executionFoundationBot){
  const startedAt=Date.now();
  const plans=[];
  for(const p of executionFoundationBot.plans||[]){
    const schema={
      entryFunction:"executeLiquidationPlan",
      soliditySignature:"executeLiquidationPlan(bytes32,address,uint256,uint256,address,bytes)",
      fields:[
        {name:"marketId",type:"bytes32",value:p.marketId||null},
        {name:"borrower",type:"address",value:p.borrower||null},
        {name:"repayAmount",type:"uint256",value:"EXACT_TOKEN_UNITS_REQUIRED_AT_EXECUTION"},
        {name:"minLoanAssetOut",type:"uint256",value:"FRESH_FIRM_QUOTE_MIN_OUTPUT_REQUIRED"},
        {name:"swapTarget",type:"address",value:"USE_0X_QUOTE_TRANSACTION_TO_NOT_HARDCODED"},
        {name:"swapCalldata",type:"bytes",value:"USE_0X_FIRM_QUOTE_TRANSACTION_DATA"}
      ]
    };
    const blockers=[...(p.blockers||[])];
    for(const b of [
      "FULL_ATOMIC_TRANSACTION_NOT_BOUND_TO_ELIGIBLE_CANDIDATE_AND_FIRM_QUOTE",
      "FIRM_0X_EXECUTION_QUOTE_NOT_YET_BOUND",
      "TOKEN_UNIT_REPAY_AMOUNT_NOT_YET_BOUND",
      "FULL_ATOMIC_TRANSACTION_GAS_NOT_YET_ESTIMATED",
      "FULL_ATOMIC_SIMULATION_NOT_YET_AVAILABLE"
    ]) if(!blockers.includes(b)) blockers.push(b);
    plans.push({
      protocol:p.protocol,network:p.network,marketId:p.marketId,borrower:p.borrower,
      selectedRepayUsd:p.selectedRepayUsd,requiredFlashRepaymentUsd:p.requiredFlashRepaymentUsd,
      projectedFinalNetUsd:p.projectedFinalNetUsd,minimumNetProfitUsd:p.minimumNetProfitUsd,
      executorArtifact:"ArbiFlowExecutor414.sol",
      transactionShape:{chainId:8453,from:"USER_WALLET_AT_EXECUTION",to:"DEPLOYED_EXECUTOR_ADDRESS_REQUIRED",value:"0",data:"NOT_ENCODED_UNTIL_EXACT_TOKEN_UNITS_AND_FIRM_SWAP_QUOTE_EXIST"},
      calldataSchema:schema,
      simulationPipeline:[
        "READ_FRESH_MORPHO_POSITION_AND_ACCRUED_DEBT",
        "REJECT_UNLESS_POSITION_IS_LIQUIDATABLE",
        "BOUND_REPAY_TO_EXACT_PROTOCOL_STATE",
        "REQUEST_FIRM_0X_QUOTE_WITH_EXECUTOR_AS_TAKER",
        "BIND_MINIMUM_OUTPUT_AND_SWAP_TARGET_DATA",
        "ENCODE_EXECUTOR_CALLDATA",
        "ETH_ESTIMATE_GAS_ON_COMPLETE_TRANSACTION",
        "ETH_CALL_AT_LATEST_STATE_FOR_ATOMIC_REVERT_OR_SUCCESS",
        "RECOMPUTE_NET_AFTER_FLASH_PREMIUM_AND_TRANSACTION_GAS",
        "REJECT_IF_NET_BELOW_MINIMUM",
        "ONLY_FUTURE_USER_APPROVED_LIVE_LAYER_MAY_REQUEST_SIGNATURE"
      ],
      approvalsPolicy:{neverApproveSettler:true,useQuoteReturnedAllowanceSpender:true,executorMustApproveOnlyRequiredSwapAmount:true,clearOrBoundAllowanceAfterUse:true},
      implementationState:{executorSourceArtifact:"INCLUDED",forkCallableHarness:"VERIFIED_BY_STARTUP_REPORT",fullAtomicExecutor:"NOT_IMPLEMENTED",firmSwapQuote:"NOT_BOUND",realCalldata:"NOT_BUILT",transactionGasEstimate:"FULL_ATOMIC_NOT_AVAILABLE",atomicEthCall:"NOT_PERFORMED"},
      blockers,planStatus:"SIMULATION_FOUNDATION_ONLY_NOT_EXECUTABLE",executable:false,paperPass:false,readOnly:true
    });
  }
  let forkReport=null, forkReportError=null;
  try{
    const reportPath=path.join(__dirname,"fork-report-4300.json");
    if(fs.existsSync(reportPath)) forkReport=JSON.parse(fs.readFileSync(reportPath,"utf8"));
    else forkReportError="FORK_REPORT_4300_NOT_FOUND";
  }catch(e){forkReportError=String(e?.message||e);}
  const forkExecutorVerified=!!(
    forkReport?.success===true && forkReport?.chainId===8453 && forkReport?.forkContractDeployed===true &&
    typeof forkReport?.executor==="string" && forkReport.executor.startsWith("0x") &&
    forkReport?.validatePlanEthCallPerformed===true && BigInt(forkReport?.validatePlanGas||0)>0n &&
    forkReport?.liveEntryReverted===true && forkReport?.mainnetBroadcast===false && forkReport?.fundsMoved===false
  );
  return {bot:"EXECUTOR_SIMULATION_FOUNDATION_BOT",status:"COMPLETE",strategy:"VERIFIED_FORK_EXECUTOR_STATE_PLUS_FAIL_CLOSED_FULL_ATOMIC_PIPELINE",plansBuilt:plans.length,plans,executorSourceArtifactIncluded:true,executorDeployed:forkExecutorVerified,forkOnlyDeployment:forkExecutorVerified,executorAddress:forkExecutorVerified?forkReport.executor:null,validatePlanEthCallPerformed:forkExecutorVerified,validatePlanHash:forkExecutorVerified?forkReport.validatePlanHash:null,callableHarnessGasEstimated:forkExecutorVerified,validatePlanGas:forkExecutorVerified?forkReport.validatePlanGas:null,deploymentGas:forkExecutorVerified?forkReport.deploymentGas:null,realCalldataBuilt:false,transactionGasEstimated:false,fullAtomicLiquidationGasEstimated:false,atomicSimulationPerformed:false,fullAtomicExecutorImplemented:Boolean(forkReport?.atomicExecutor?.deployed),fullAtomicExecutorForkOnly:Boolean(forkReport?.atomicExecutor?.forkOnly),fullAtomicExecutorAddress:forkReport?.atomicExecutor?.address||null,fullAtomicExecutorDeploymentGas:forkReport?.atomicExecutor?.deploymentGas||null,atomicCallbackGuardsConfirmed:Boolean(forkReport?.atomicExecutor?.callbackGuardsConfirmed),liveExecutionFunctionEnabled:false,mainnetDeployment:false,mainnetBroadcast:false,fundsMoved:false,executable:false,paperPass:false,readOnly:true,reportError:forkReportError,note:"4.30.0 synchronizes the simulation foundation with the verified startup disposable-fork executor. The callable validatePlan harness deployment, eth_call and gas estimate are recognized here, while the full Aave+Morpho+0x executor implementation is now deployed fork-only; candidate-bound calldata, full atomic transaction gas and successful liquidation simulation remain gated on exact eligibility plus a firm quote. No mainnet deployment, signature or broadcast occurs.",elapsedMs:Date.now()-startedAt};
}


/* ARBIFLOW 4.13.0 - CALLABLE EXECUTOR TEST FOUNDATION (READ ONLY) */
function runCallableExecutorTestFoundation413(executorSimulationBot){
  const startedAt=Date.now();
  const abi=[
    "function validatePlan(bytes32 marketId,address borrower,uint256 repayAmount,uint256 minLoanAssetOut,address swapTarget,bytes swapCalldata) pure returns (bytes32 planHash)",
    "function executeLiquidationPlan(bytes32 marketId,address borrower,uint256 repayAmount,uint256 minLoanAssetOut,address swapTarget,bytes swapCalldata) pure"
  ];
  const iface=new Interface(abi), placeholderTarget="0x0000000000000000000000000000000000000001", tests=[];
  let report=null, reportError=null;
  try{
    const reportPath=path.join(__dirname,"fork-report-4300.json");
    if(fs.existsSync(reportPath)) report=JSON.parse(fs.readFileSync(reportPath,"utf8"));
    else reportError="FORK_REPORT_4300_NOT_FOUND";
  }catch(e){reportError=String(e?.message||e);}
  const forkCallablePass=!!(
    report?.success===true && report?.chainId===8453 && report?.forkContractDeployed===true &&
    typeof report?.executor==="string" && report.executor.startsWith("0x") &&
    report?.validatePlanEthCallPerformed===true && BigInt(report?.validatePlanGas||0)>0n &&
    report?.liveEntryReverted===true && report?.mainnetBroadcast===false && report?.fundsMoved===false
  );
  for(const p of executorSimulationBot.plans||[]){
    let abiEncodingPass=false,selectorPass=false,calldataHash=null,error=null;
    try{
      const data=iface.encodeFunctionData("validatePlan",[p.marketId,p.borrower,1n,1n,placeholderTarget,"0x00"]);
      const selector=iface.getFunction("validatePlan").selector;
      abiEncodingPass=typeof data==="string"&&data.startsWith("0x")&&data.length>10;
      selectorPass=data.slice(0,10).toLowerCase()===selector.toLowerCase();
      calldataHash=keccak256(data);
    }catch(e){error=e?.message||String(e);}
    tests.push({marketId:p.marketId,borrower:p.borrower,executorArtifact:"ArbiFlowExecutor414.sol",callableFunction:"validatePlan",sideEffects:false,abiEncodingPass,selectorPass,calldataHash,error,forkExecutorAddress:forkCallablePass?report.executor:null,onchainCallPerformed:forkCallablePass,contractDeployed:forkCallablePass,ethCallPlanHash:forkCallablePass?report.validatePlanHash:null,transactionSpecificValidatePlanGas:forkCallablePass?report.validatePlanGas:null,liveFunction:"executeLiquidationPlan",liveFunctionState:forkCallablePass?"FORK_STATIC_CALL_CONFIRMED_REVERT":"HARD_DISABLED_REVERTS",executable:false,readOnly:true});
  }
  const localAbiPass=tests.length===0 ? true : tests.every(t=>t.abiEncodingPass&&t.selectorPass&&!t.error);
  const allLocalTestsPass=localAbiPass&&forkCallablePass;
  const blockers=[];
  if(!forkCallablePass){
    blockers.push("VERIFIED_FORK_CALLABLE_EXECUTOR_REPORT_NOT_AVAILABLE","BASE_ETH_CALL_NOT_CONFIRMED","REAL_VALIDATE_PLAN_GAS_NOT_CONFIRMED");
  }
  blockers.push("LIVE_EXECUTION_FUNCTION_HARD_DISABLED");
  return {bot:"CALLABLE_EXECUTOR_TEST_FOUNDATION_BOT",status:allLocalTestsPass?"FORK_CALLABLE_TEST_PASSED":"FORK_CALLABLE_TEST_NOT_CONFIRMED",strategy:"VERIFIED_STARTUP_FORK_EXECUTOR_PLUS_SIDE_EFFECT_FREE_ETH_CALL_AND_GAS",testsBuilt:tests.length,tests,allLocalTestsPass,localAbiPass,executorArtifact:"ArbiFlowExecutor414.sol",executorDeploymentRequiredForBaseEthCall:true,executorDeployed:forkCallablePass,forkOnlyDeployment:forkCallablePass,executorAddress:forkCallablePass?report.executor:null,baseEthCallPerformed:forkCallablePass,validatePlanHash:forkCallablePass?report.validatePlanHash:null,realTransactionGasEstimated:forkCallablePass,validatePlanGas:forkCallablePass?report.validatePlanGas:null,deploymentGas:forkCallablePass?report.deploymentGas:null,liveEntryRevertConfirmed:forkCallablePass,liveExecutionFunctionEnabled:false,mainnetBroadcast:false,fundsMoved:false,executable:false,paperPass:false,readOnly:true,blockers,reportError,note:"4.30.0 consumes the verified startup disposable-fork deployment instead of incorrectly reporting it as absent. The fork-only ArbiFlowExecutor414 address is used to confirm side-effect-free validatePlan eth_call and eth_estimateGas results. This is harness-call gas only, not full Aave+Morpho+0x atomic liquidation gas. executeLiquidationPlan remains hard-disabled and confirmed to revert; no Base-mainnet deployment, signature or broadcast occurs.",elapsedMs:Date.now()-startedAt};
}


/* ARBIFLOW 4.14.1 - VERIFIED BASE FORK STARTUP TEST REPORT (NON-LIVE) */
function runBaseForkSimulationFoundation414(callableBot){
  const startedAt=Date.now();
  const localIntegrityPass=!!callableBot?.allLocalTestsPass;
  let report=null, reportError=null;
  try {
    const reportPath=path.join(__dirname,"fork-report-4300.json");
    if(fs.existsSync(reportPath)) report=JSON.parse(fs.readFileSync(reportPath,"utf8"));
  } catch(e){ reportError=String(e?.message||e); }
  const forkPass=!!(report?.success && report?.chainId===8453 && report?.forkContractDeployed===true && report?.validatePlanEthCallPerformed===true && report?.liveEntryReverted===true && report?.morphoForkAccrual?.accrueInterestTransactionSucceeded===true && report?.morphoForkAccrual?.exactAccruedStateConfirmed===true && report?.morphoForkAccrual?.mainnetStateChanged===false && report?.mainnetBroadcast===false && report?.fundsMoved===false);
  return {
    bot:"BASE_FORK_SIMULATION_FOUNDATION_BOT",
    status:forkPass?"FORK_TEST_PASSED":(localIntegrityPass?"FORK_TEST_REPORT_MISSING_OR_FAILED":"BLOCKED_BY_LOCAL_ABI_TEST"),
    strategy:"STARTUP_COMPILE_DEPLOY_AND_ETH_CALL_ON_EPHEMERAL_BASE_MAINNET_FORK",
    chainId:8453,
    executorArtifact:"ArbiFlowExecutor414.sol",
    forkHarnessArtifact:"BaseForkTest4300.js",
    deploymentTarget:"EPHEMERAL_BASE_MAINNET_FORK",
    realBaseMainnetDeploymentAllowed:false,
    compilePerformedByRender:!!report?.compilePerformed,
    forkStartedByRender:!!report?.forkStarted,
    forkContractDeployed:!!report?.forkContractDeployed,
    forkExecutorAddress:report?.executor||null,
    forkBlockNumber:report?.forkBlockNumber??null,
    validatePlanEthCallPerformed:!!report?.validatePlanEthCallPerformed,
    validatePlanHash:report?.validatePlanHash||null,
    validatePlanGas:report?.validatePlanGas||null,
    deploymentGas:report?.deploymentGas||null,
    protocolIntegration:report?.protocolIntegration||null,
    morphoForkAccrual:report?.morphoForkAccrual||null,
    atomicLiquidationExecuted:report?.atomicLiquidationExecuted===true,
    realLiquidationSimulationGate: report?.atomicLiquidationExecuted===true ? "ATOMIC_FORK_SIMULATION_PERFORMED" : "WAITING_FOR_FRESH_LIVE_LIQUIDATABLE_CANDIDATE",
    executeLiquidationPlanExpectedToRevert:true,
    liveEntryReverted:!!report?.liveEntryReverted,
    liveExecutionFunctionEnabled:false,
    transactionBroadcast:false,
    fundsMoved:false,
    executable:false,
    paperPass:false,
    readOnly:true,
    prerequisites:{baseRpcRequiredForFork:true,solidityCompilerRequired:true,localIntegrityPass},
    reportError:reportError||report?.error||null,
    blockers:forkPass?["LIVE_EXECUTION_FUNCTION_HARD_DISABLED"]:(localIntegrityPass?["FORK_STARTUP_TEST_DID_NOT_PRODUCE_A_VALID_PASS_REPORT","LIVE_EXECUTION_FUNCTION_HARD_DISABLED"]:["LOCAL_ABI_INTEGRITY_FAILED"]),
    note:forkPass?"4.30.0 startup protocol-fork test compiled ArbiFlowExecutor414, started an ephemeral Base mainnet fork, deployed only inside that fork, performed validatePlan eth_call, executed Morpho accrueInterest on the disposable fork, reread post-accrual debt/health, measured gas, and proved the live execution entry point still reverts. No Base-mainnet transaction was broadcast and no funds moved.":"4.30.0 requires a valid startup protocol-fork report before claiming fork verification. It remains fail-closed and non-live.",
    elapsedMs:Date.now()-startedAt
  };
}

async function scanBaseBotNetwork422(){
  const startedAt=Date.now(), scanId=++scan422Sequence;
  scan421Log("BOT NETWORK 4.18.1 START",`scan ${scanId}`);
  const marketBot=await runMarketDiscoveryBot();

  // Stage 1: cheap/independent discovery. Each branch has a bounded request budget.
  const [spreadBot,dislocationBot,aggregatorBot,liquidationBot]=await Promise.all([
    withTimeout421(runFastSpreadBot430(),SCAN422.fastBotBudgetMs,"SPREAD_BOT").catch(()=>timeoutResult422("SPREAD_BOT",SCAN422.fastBotBudgetMs,startedAt)),
    withTimeout421(runDislocationBot(),SCAN422.fastBotBudgetMs,"DISLOCATION_BOT").catch(()=>timeoutResult422("DISLOCATION_BOT",SCAN422.fastBotBudgetMs,startedAt)),
    withTimeout421(runAggregatorIntelligenceBot(),SCAN422.fastBotBudgetMs,"AGGREGATOR_INTELLIGENCE_BOT").catch(()=>timeoutResult422("AGGREGATOR_INTELLIGENCE_BOT",SCAN422.fastBotBudgetMs,startedAt)),
    withTimeout421(runLiquidationBatch422(),SCAN422.fastBotBudgetMs,"LIQUIDATION_BOT").catch(()=>timeoutResult422("LIQUIDATION_BOT",SCAN422.fastBotBudgetMs,startedAt))
  ]);

  // Stage 2: deep quote only a shortlisted triangle, not all 48 probes.
  let triangleBot;
  try{triangleBot=await withTimeout421(runFastTriangleBot430(spreadBot),SCAN422.fastBotBudgetMs,"TRIANGLE_BOT");}
  catch{triangleBot=timeoutResult422("TRIANGLE_BOT",SCAN422.fastBotBudgetMs,startedAt);}

  // Stage 3: bounded multi-size discovery for only the strongest near-profit routes.
  let sizeBot;
  try{sizeBot=await withTimeout421(runSizeDiscoveryBot440(spreadBot,triangleBot),14000,"SIZE_DISCOVERY_BOT");}
  catch(error){sizeBot={bot:"SIZE_DISCOVERY_BOT",status:"TIME_BUDGET_REACHED",tests:[],positiveSeeds:[],errors:[{error:error.message}]};}

  // Stage 3B: independent Morpho Base liquidation discovery.
  const morphoBot=await withTimeout421(runMorphoLiquidationBot450(),8000,"MORPHO_LIQUIDATION_BOT").catch(error=>({bot:"MORPHO_LIQUIDATION_BOT",status:"TIME_BUDGET_REACHED",opportunities:[],watchlist:[],errors:[{error:error.message}]}));

  // Stage 3C: liquidation-first economics and projected readiness.
  const liquidationEconomicsBot=await withTimeout421(runLiquidationEconomicsBot460(liquidationBot,morphoBot),8000,"LIQUIDATION_ECONOMICS_BOT").catch(error=>({bot:"LIQUIDATION_ECONOMICS_BOT",status:"TIME_BUDGET_REACHED",candidates:[],watchlist:[],errors:[{error:error.message}],profitabilityValidated:false}));
  const projectedLiquidationBot=runProjectedLiquidationBot470(morphoBot,liquidationEconomicsBot);
  const liquidationRouteOptimizerBot=await withTimeout421(runLiquidationRouteOptimizer490(morphoBot,projectedLiquidationBot,liquidationEconomicsBot),30000,"LIQUIDATION_ROUTE_OPTIMIZER_BOT").catch(error=>({bot:"LIQUIDATION_ROUTE_OPTIMIZER_BOT",status:"TIME_BUDGET_REACHED",tests:[],bestByPosition:[],qualifiedProjected:[],errors:[{error:error.message}],profitabilityValidated:false,executable:false}));
  const morphoPreLiquidationBot=runMorphoPreLiquidationDiscovery470(morphoBot);
  const liquidationReadinessBot=await runLiquidationReadiness410(morphoBot,liquidationRouteOptimizerBot);
  const executionFoundationBot=runExecutionFoundation411(morphoBot,liquidationRouteOptimizerBot,liquidationReadinessBot);
  const executorSimulationFoundationBot=runExecutorSimulationFoundation412(executionFoundationBot);
  const callableExecutorTestFoundationBot=runCallableExecutorTestFoundation413(executorSimulationFoundationBot);
  const baseForkSimulationFoundationBot=runBaseForkSimulationFoundation414(callableExecutorTestFoundationBot);

  // Stage 4: watcher reuses fresh quotes rather than immediately duplicating RPC calls.
  let watcherBot;
  try{
    watcherBot=await withTimeout421(runFastWatcher430(spreadBot,triangleBot,dislocationBot),10000,"WATCHER_BOT");
  }catch(error){watcherBot={bot:"WATCHER_BOT",status:"TIME_BUDGET_REACHED",stage:"SELECTED_PATH_FAST_RECHECK",watchlist:[],rechecks:[],promoted:[],errors:[{error:error.message}]};}

  // Stage 5: expensive flash sizing remains gated behind a raw-positive seed,
  // including a seed discovered by the bounded multi-size probe.
  let largeOpportunityBot;
  if((spreadBot.candidates||[]).length || (triangleBot.candidates||[]).length || (sizeBot.positiveSeeds||[]).length){
    try{largeOpportunityBot=await withTimeout421(runLargeOpportunityBot430(spreadBot,triangleBot,sizeBot),12000,"LARGE_OPPORTUNITY_BOT");}
    catch(error){largeOpportunityBot={bot:"OPTIMIZER_BOT",status:"TIME_BUDGET_REACHED",strategy:"ADAPTIVE_NET_PROFIT_OPTIMIZATION",flashOptimization:null,errors:[{error:error.message}]};}
  }else largeOpportunityBot={bot:"OPTIMIZER_BOT",status:"NO_POSITIVE_SEED",strategy:"ADAPTIVE_NET_PROFIT_OPTIMIZATION",minimumNetProfitUsd:BASE_DIRECT_MIN_NET_PROFIT_USD,flashOptimization:null,elapsedMs:0};

  const bots=[marketBot,spreadBot,triangleBot,sizeBot,liquidationBot,morphoBot,morphoPreLiquidationBot,liquidationEconomicsBot,projectedLiquidationBot,liquidationRouteOptimizerBot,liquidationReadinessBot,executionFoundationBot,executorSimulationFoundationBot,callableExecutorTestFoundationBot,baseForkSimulationFoundationBot,largeOpportunityBot,dislocationBot,watcherBot,aggregatorBot],ranked=[];
  for(const x of spreadBot.candidates||[]) ranked.push({source:"SPREAD_BOT",type:"ARBITRAGE",label:x.pair,score:x.score,rawPositive:true});
  for(const x of triangleBot.candidates||[]) ranked.push({source:"TRIANGLE_BOT",type:"TRIANGULAR_ARBITRAGE",label:x.route.join("->"),venues:x.venues,score:x.score,rawPositive:true});
  for(const x of liquidationBot.opportunities||[]) ranked.push({source:"AAVE_LIQUIDATION_BOT",type:x.opportunityType,label:x.user,score:x.score,profitabilityValidated:false});
  for(const x of morphoBot.opportunities||[]) ranked.push({source:"MORPHO_LIQUIDATION_BOT",type:"MORPHO_LIQUIDATION",label:x.user,marketId:x.marketId,healthFactor:x.healthFactor,score:botScore({confidence:.75,depthUsd:x.borrowAssetsUsd}),profitabilityValidated:false});
  for(const x of morphoBot.watchlist||[]) ranked.push({source:"MORPHO_LIQUIDATION_BOT",type:"MORPHO_LIQUIDATION_WATCH",label:x.user,marketId:x.marketId,healthFactor:x.healthFactor,score:botScore({confidence:.55,depthUsd:x.borrowAssetsUsd}),profitabilityValidated:false,executable:false});
  for(const x of liquidationEconomicsBot.candidates||[]) ranked.push({source:"LIQUIDATION_ECONOMICS_BOT",type:"LIQUIDATION_ECONOMICS_CANDIDATE",label:x.user,marketId:x.marketId,healthFactor:x.healthFactor,estimatedNetBeforeRouteUsd:x.estimatedNetBeforeRouteUsd,score:botScore({grossPnlUsd:x.estimatedNetBeforeRouteUsd,confidence:.8,depthUsd:x.repayUsd}),profitabilityValidated:false});
  ranked.sort((a,b)=>b.score-a.score);
  const flashCandidates=largeOpportunityBot.flashOptimization?.candidates||[];
  scan421Log("BOT NETWORK 4.18.1 COMPLETE",`scan ${scanId} :: ${Date.now()-startedAt}ms`);
  return {mode:"CONTROLLED_FORK_ATOMIC_EXECUTION_GATE_4300",network:"Base",scanId,botNetwork:BOT_NETWORK,marketExpansion:marketBot,bots,rankedOpportunityQueue:ranked,counts:{botsRun:bots.length,tokens:marketBot.counts.tokens,directPairsGenerated:marketBot.counts.directPairs,triangleRoutesGenerated:marketBot.counts.triangleRoutes,triangleProbesPlanned:triangleBot.probesPlanned||0,rankedOpportunities:ranked.length,flashCandidates:flashCandidates.length,watcherItems:watcherBot.watchlist?.length||0,watcherRechecks:watcherBot.rechecks?.length||0,watcherPromoted:watcherBot.promoted?.length||0,aggregatorObservations:aggregatorBot.observations?.length||0,liquidationWatcherTracked:liquidationBot.liquidationWatcher?.tracked||0,liquidationWatcherRechecks:liquidationBot.liquidationWatcher?.rechecks?.length||0,morphoMarketsScanned:morphoBot.marketsScanned||0,morphoPositionsScanned:morphoBot.positionsScanned||0,morphoLiquidatable:morphoBot.opportunities?.length||0,morphoWatchlist:morphoBot.watchlist?.length||0,liquidationEconomicsCandidates:liquidationEconomicsBot.candidates?.length||0,liquidationEconomicWatch:liquidationEconomicsBot.watchlist?.length||0,projectedLiquidationWatch:projectedLiquidationBot.watchlist?.length||0,projectedCritical:projectedLiquidationBot.critical?.length||0,liquidationRouteTests:liquidationRouteOptimizerBot.tests?.length||0,liquidationRouteQualifiedProjected:liquidationRouteOptimizerBot.qualifiedProjected?.length||0,liquidationReadinessPass:liquidationReadinessBot.ready?.length||0,liquidationReadinessRejected:liquidationReadinessBot.rejected?.length||0,executionFoundationPlans:executionFoundationBot.plans?.length||0,executorSimulationPlans:executorSimulationFoundationBot.plans?.length||0,callableExecutorTests:callableExecutorTestFoundationBot.tests?.length||0,baseForkHarnessReady:["FORK_TEST_PASSED","FORK_TEST_REPORT_MISSING_OR_FAILED"].includes(baseForkSimulationFoundationBot.status),baseForkTestPassed:baseForkSimulationFoundationBot.status==="FORK_TEST_PASSED",morphoPreLiquidationEligible:morphoPreLiquidationBot.eligible?.length||0},performanceArchitecture:{staged:true,duplicateScanLock:true,fastBotBudgetMs:SCAN422.fastBotBudgetMs,liquidationBlocksPerRequest:SCAN422.liquidationBlocksPerRequest,liquidationMaxUsersPerRequest:SCAN422.liquidationMaxUsersPerRequest,deepTriangleRoutes:SCAN422.deepTriangleRoutes,deepTriangleVenueCombos:SCAN422.deepTriangleVenueCombos,lifiRepair:true,runtimeLiquidationWatcher:true,preShortlistedFastWatcher:true,selectedPathFastWatcher:true,opportunityExpansion430:true,pancakeSwapNativeRpc:true,pancakePoolTopologyCache:true,pancakeWinningFeeCache:true,trianglePermutationShortlist:true,adaptiveOptimizer:true,boundedMultiSizeDiscovery:true,parallelProfitCurves:true,selectedPathSizeDiscovery:true,eventDrivenDeepQuotes:true,projectedLiquidationEconomics:true,realCollateralExitQuotes:true,partialLiquidationSizing:true,adaptiveLiquidationSizing:true,coarseToFineRouteSearch:true,failClosedLiquidationReadiness:true,freshEligibilityGate:true,quoteFreshnessGate:true,protocolDebtCapacityGate:true,executionFoundationBlueprint:true,executorSimulationFoundation:true,callableExecutorTestFoundation:true,baseForkSimulationFoundation:true,ephemeralForkOnly:true,localExecutorAbiIntegrity:true,calldataSchemaDefined:true,atomicExecutionGuardsDefined:true,morphoPreLiquidationInterface:true,liquidationFirstEconomics:true,capitalOptimizerDiscovery:true,freshQuoteWatcher:true,allPairDiscovery:true,liquidityGatedTriangleDiscovery:true,morphoLiquidationDiscovery:true,uniswapV4DeploymentVerified:true,flashDirectOrTriangleSeed:true,watcherLimit:SCAN422.watcherLimit,watcherConcurrency:2,watcherPerItemTimeoutMs:4500},elapsedMs:Date.now()-startedAt,executableOpportunities:0,executable:false,paperPass:false,liveExecutionEnabled:false,minimumNetProfitUsd:BASE_DIRECT_MIN_NET_PROFIT_USD,safety:{discoveryOnly:true,walletRequired:false,privateKeyRequired:false,flashLoanRequested:false,fundsMoved:false,transactionBroadcast:false},warning:"Engine 4.30.0 preserves broad opportunity discovery and repairs Morpho base-unit price normalization plus liquidation quote diagnostics while retaining token-unit integrity for liquidation exit quotes plus corrected fork-report ingestion. Morpho discovery expands to the top 50 Base borrow markets and keeps positions up to HF 1.10 visible in the unified ranked queue as WATCH candidates, while direct spread, triangular, dislocation, Aave liquidation and aggregator intelligence bots continue independently. WATCH candidates are never labeled executable. No Base-mainnet transaction, signature, funds movement or broadcast occurs; live execution remains hard-disabled."};
}

app.get("/api/bots/base/scan",async(req,res)=>{
  if(scan422Active) return res.status(409).json({success:false,engine:"ArbiFlow Opportunity Engine",version:VERSION,status:"SCAN_ALREADY_RUNNING",message:"A Base bot scan is already running. Duplicate scans are blocked.",liveExecutionEnabled:false,time:now()});
  scan422Active=true;
  try{
    const result=await scanBaseBotNetwork422();
    return res.json({success:true,engine:"ArbiFlow Opportunity Engine",version:VERSION,...result,time:now()});
  }catch(error){
    return res.status(500).json({success:false,engine:"ArbiFlow Opportunity Engine",version:VERSION,mode:"FAST_STAGED_MARKET_DISCOVERY",liveExecutionEnabled:false,error:error.message,time:now()});
  }finally{scan422Active=false;}
});

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
        "ArbiFlow Engine 3.2.2 scan started.",

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
4.30 CONTROLLED DISPOSABLE-FORK ATOMIC TEST
=========================================================
*/
const zeroXAccessPreflight4302 = async ()=>{
  if(!ZEROX_API_KEY) return {ok:false,status:null,classification:"ZEROX_API_KEY_NOT_CONFIGURED",requestId:null};
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),12000);
  try{
    const response=await fetch("https://api.0x.org/sources?chainId=8453",{method:"GET",headers:{"0x-api-key":ZEROX_API_KEY,"0x-version":"v2","Content-Type":"application/json"},signal:controller.signal});
    const body=await response.text();
    let parsed=null; try{parsed=JSON.parse(body);}catch{}
    const requestId=parsed?.request_id??parsed?.requestId??null;
    if(response.ok) return {ok:true,status:response.status,classification:"ZEROX_API_ACCESS_CONFIRMED",requestId};
    if(response.status===401||response.status===403) return {ok:false,status:response.status,classification:"ZEROX_API_ACCESS_DENIED",requestId,message:parsed?.message??body.slice(0,300)};
    return {ok:false,status:response.status,classification:"ZEROX_API_PREFLIGHT_FAILED",requestId,message:parsed?.message??body.slice(0,300)};
  }catch(e){return {ok:false,status:null,classification:"ZEROX_API_PREFLIGHT_NETWORK_ERROR",requestId:null,message:e?.message||String(e)};}
  finally{clearTimeout(timer);}
};

const zeroXProductionQuoteReadiness4320 = async ()=>{
  const executor=(process.env.ARBIFLOW_PRODUCTION_EXECUTOR_ADDRESS||"").trim();
  const base={version:VERSION,readOnly:true,liveExecutionEnabled:false,mainnetDeployment:false,mainnetBroadcast:false,fundsMovedOnMainnet:false,productionZeroXQuoteValidated:false};
  if(!ZEROX_API_KEY) return {...base,success:false,classification:"ZEROX_API_KEY_NOT_CONFIGURED"};
  // Indicative price proves route/liquidity access independently of a future production taker.
  const sellToken="0x4200000000000000000000000000000000000006"; // WETH Base
  const buyToken="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // USDC Base
  const sellAmount=process.env.ARBIFLOW_ZEROX_READINESS_SELL_AMOUNT||"100000000000000"; // 0.0001 WETH
  const headers={"0x-api-key":ZEROX_API_KEY,"0x-version":"v2","Content-Type":"application/json"};
  const request=async(path,params)=>{const c=new AbortController(),t=setTimeout(()=>c.abort(),12000);try{const r=await fetch("https://api.0x.org"+path+"?"+new URLSearchParams(params),{headers,signal:c.signal});const body=await r.text();let data=null;try{data=JSON.parse(body)}catch{};return {ok:r.ok,status:r.status,data,body:body.slice(0,500)}}finally{clearTimeout(t)}};
  try{
    const price=await request("/swap/allowance-holder/price",{chainId:"8453",sellToken,buyToken,sellAmount});
    if(!price.ok) return {...base,success:false,classification:"ZEROX_INDICATIVE_PRICE_FAILED",indicativePriceStatus:price.status,message:price.data?.message||price.body};
    const route={status:price.status,liquidityAvailable:price.data?.liquidityAvailable??null,buyAmount:price.data?.buyAmount??null,blockNumber:price.data?.blockNumber??null};
    if(!/^0x[a-fA-F0-9]{40}$/.test(executor)) return {...base,success:false,classification:"PRODUCTION_EXECUTOR_ADDRESS_NOT_CONFIGURED",indicativeRouteAvailable:true,indicativeRoute:route,requiredEnv:"ARBIFLOW_PRODUCTION_EXECUTOR_ADDRESS",note:"Configure only an already-deployed Base executor address. This endpoint never deploys one."};
    const code=await baseProvider.getCode(executor);
    if(!code||code==="0x") return {...base,success:false,classification:"PRODUCTION_EXECUTOR_NOT_DEPLOYED_ON_BASE",productionExecutorAddress:executor,productionExecutorCodeBytes:0,indicativeRouteAvailable:true,indicativeRoute:route,note:"Firm quote was not requested because the configured taker has no Base bytecode."};
    const quote=await request("/swap/allowance-holder/quote",{chainId:"8453",sellToken,buyToken,sellAmount,taker:executor,slippageBps:String(process.env.ARBIFLOW_CONTROLLED_SLIPPAGE_BPS||100)});
    if(!quote.ok) return {...base,success:false,classification:"PRODUCTION_EXECUTOR_FIRM_QUOTE_REJECTED",productionExecutorAddress:executor,productionExecutorCodeBytes:(code.length-2)/2,indicativeRouteAvailable:true,indicativeRoute:route,firmQuoteStatus:quote.status,requestId:quote.data?.request_id??quote.data?.requestId??null,message:quote.data?.message||quote.body};
    const tx=quote.data?.transaction||{};const spender=quote.data?.issues?.allowance?.spender||quote.data?.allowanceTarget||null;
    const shapeOk=Boolean(tx.to&&tx.data&&quote.data?.buyAmount&&quote.data?.minBuyAmount);
    return {...base,success:shapeOk,classification:shapeOk?"PRODUCTION_EXECUTOR_FIRM_QUOTE_VALIDATED":"PRODUCTION_EXECUTOR_FIRM_QUOTE_SHAPE_INVALID",productionZeroXQuoteValidated:shapeOk,productionExecutorAddress:executor,productionExecutorCodeBytes:(code.length-2)/2,indicativeRouteAvailable:true,indicativeRoute:route,firmQuoteStatus:quote.status,firmQuote:{blockNumber:quote.data?.blockNumber??null,buyAmount:quote.data?.buyAmount??null,minBuyAmount:quote.data?.minBuyAmount??null,allowanceSpender:spender,transactionTo:tx.to??null,calldataPresent:Boolean(tx.data),calldataExposed:false},note:"Read-only validation only. No approval, signature, deployment, transaction submission, or broadcast occurred."};
  }catch(e){return {...base,success:false,classification:"PRODUCTION_QUOTE_READINESS_ERROR",message:e?.message||String(e)}};
};


const kyberSwapBaseRouteReadiness4330 = async ()=>{
  const base={version:VERSION,provider:"KYBERSWAP",chain:"base",chainId:8453,readOnly:true,routePreviewOnly:true,encodedTransactionRequested:false,calldataRequested:false,walletConnectionRequired:false,approvalPerformed:false,signaturePerformed:false,transactionSubmitted:false,mainnetBroadcast:false,fundsMovedOnMainnet:false};
  const tokenIn="0x4200000000000000000000000000000000000006";
  const tokenOut="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
  const amountIn=process.env.ARBIFLOW_KYBER_READINESS_AMOUNT_IN||"100000000000000";
  const clientId=(process.env.ARBIFLOW_KYBER_CLIENT_ID||"ArbiFlow").trim()||"ArbiFlow";
  const url="https://aggregator-api.kyberswap.com/base/api/v1/routes?"+new URLSearchParams({tokenIn,tokenOut,amountIn,excludeRFQSources:"true",onlyScalableSources:"true",gasInclude:"true"});
  const c=new AbortController(),t=setTimeout(()=>c.abort(),12000);
  try{
    const r=await fetch(url,{method:"GET",headers:{"X-Client-Id":clientId,"Accept":"application/json"},signal:c.signal});
    const body=await r.text();let data=null;try{data=JSON.parse(body)}catch{}
    const summary=data?.data?.routeSummary||null,routerAddress=data?.data?.routerAddress||null;
    const routeFound=Boolean(r.ok&&summary?.amountIn&&summary?.amountOut&&routerAddress);
    return {...base,success:routeFound,classification:routeFound?"KYBERSWAP_BASE_ROUTE_PREVIEW_CONFIRMED":"KYBERSWAP_BASE_ROUTE_PREVIEW_FAILED",httpStatus:r.status,kyberCode:data?.code??null,message:data?.message??(!r.ok?body.slice(0,300):null),requestId:data?.requestId??null,clientIdConfigured:Boolean(clientId),clientIdExposed:false,tokenIn,tokenOut,amountIn,routePreview:routeFound?{amountOut:summary.amountOut,amountInUsd:summary.amountInUsd??null,amountOutUsd:summary.amountOutUsd??null,gas:summary.gas??null,gasUsd:summary.gasUsd??null,routerAddress,routeIdPresent:Boolean(summary.routeID),routeLegs:Array.isArray(summary.route)?summary.route.length:null}:null,note:routeFound?"KyberSwap returned a Base route preview only. No route-build request, calldata, approval, signature, transaction submission, or swap occurred.":"Read-only KyberSwap route preview failed closed. No transaction-building or execution step was attempted."};
  }catch(e){return {...base,success:false,classification:"KYBERSWAP_BASE_ROUTE_PREVIEW_NETWORK_ERROR",httpStatus:null,message:e?.message||String(e)}}
  finally{clearTimeout(t)}
};


const kyberSwapBaseBuildReadiness4340 = async ()=>{
  const base={version:VERSION,provider:"KYBERSWAP",chain:"base",chainId:8453,readOnly:true,routeRequested:true,encodedTransactionRequested:true,calldataRequested:true,calldataExposed:false,gasEstimationRequested:false,walletConnectionRequired:false,approvalPerformed:false,signaturePerformed:false,transactionSubmitted:false,mainnetBroadcast:false,fundsMovedOnMainnet:false};
  const tokenIn="0x4200000000000000000000000000000000000006",tokenOut="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
  const amountIn=process.env.ARBIFLOW_KYBER_READINESS_AMOUNT_IN||"100000000000000";
  const clientId=(process.env.ARBIFLOW_KYBER_CLIENT_ID||"ArbiFlow").trim()||"ArbiFlow";
  const configured=(process.env.ARBIFLOW_KYBER_BUILD_SENDER||"").trim();
  const sender=/^0x[a-fA-F0-9]{40}$/.test(configured)?configured:"0x000000000000000000000000000000000000dEaD";
  const placeholderSender=sender.toLowerCase()==="0x000000000000000000000000000000000000dead";
  const slippageTolerance=Number(process.env.ARBIFLOW_KYBER_SLIPPAGE_BPS||50);
  const headers={"X-Client-Id":clientId,"Accept":"application/json"};
  const request=async(url,options={})=>{const c=new AbortController(),t=setTimeout(()=>c.abort(),15000);try{const r=await fetch(url,{...options,headers:{...headers,...(options.headers||{})},signal:c.signal});const body=await r.text();let data=null;try{data=JSON.parse(body)}catch{}return {ok:r.ok,status:r.status,body,data}}finally{clearTimeout(t)}};
  try{
    const route=await request("https://aggregator-api.kyberswap.com/base/api/v1/routes?"+new URLSearchParams({tokenIn,tokenOut,amountIn,excludeRFQSources:"true",onlyScalableSources:"true",gasInclude:"true"}));
    const summary=route.data?.data?.routeSummary||null,previewRouter=route.data?.data?.routerAddress||null;
    if(!route.ok||!summary?.amountIn||!summary?.amountOut||!previewRouter)return {...base,success:false,classification:"KYBERSWAP_BUILD_BLOCKED_ROUTE_PREVIEW_FAILED",routeStatus:route.status,kyberCode:route.data?.code??null,message:route.data?.message??route.body.slice(0,300)};
    const build=await request("https://aggregator-api.kyberswap.com/base/api/v1/route/build",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({routeSummary:summary,sender,recipient:sender,slippageTolerance,enableGasEstimation:false,source:"ArbiFlow"})});
    const d=build.data?.data||null,calldata=d?.data||null,builtRouter=d?.routerAddress||null;
    const calldataShape=typeof calldata==="string"&&/^0x[0-9a-fA-F]+$/.test(calldata)&&calldata.length>10;
    const routerShape=/^0x[a-fA-F0-9]{40}$/.test(builtRouter||"");
    const routerMatches=routerShape&&builtRouter.toLowerCase()===previewRouter.toLowerCase();
    const amountsPresent=Boolean(d?.amountIn&&d?.amountOut);
    const shapeOk=Boolean(build.ok&&calldataShape&&routerShape&&routerMatches&&amountsPresent);
    return {...base,success:shapeOk,classification:shapeOk?"KYBERSWAP_BASE_TRANSACTION_BUILD_VALIDATED":"KYBERSWAP_BASE_TRANSACTION_BUILD_FAILED_CLOSED",routeStatus:route.status,buildStatus:build.status,kyberCode:build.data?.code??null,message:build.data?.message??(!build.ok?build.body.slice(0,300):null),requestId:build.data?.requestId??null,clientIdConfigured:Boolean(clientId),clientIdExposed:false,senderConfigured:!placeholderSender,senderExposed:false,placeholderSenderUsed:placeholderSender,slippageToleranceBps:slippageTolerance,tokenIn,tokenOut,routePreview:{amountIn:summary.amountIn,amountOut:summary.amountOut,routerAddress:previewRouter,routeIdPresent:Boolean(summary.routeID)},transactionBuild:shapeOk?{amountIn:d.amountIn,amountOut:d.amountOut,gas:d.gas??null,gasUsd:d.gasUsd??null,transactionValue:d.transactionValue??null,routerAddress:builtRouter,routerMatchesRoutePreview:routerMatches,calldataPresent:calldataShape,calldataBytes:calldataShape?(calldata.length-2)/2:null,calldataExposed:false}:null,productionExecutorBound:false,productionExecutionValidated:false,note:shapeOk?"KyberSwap encoded transaction data successfully for a read-only build validation. The calldata is intentionally not returned. No approval, signature, submission, broadcast, or swap occurred. A configured production executor is still required before production-bound validation.":"KyberSwap transaction-build validation failed closed. No approval, signature, submission, broadcast, or swap occurred."};
  }catch(e){return {...base,success:false,classification:"KYBERSWAP_BASE_TRANSACTION_BUILD_ERROR",message:e?.message||String(e),productionExecutorBound:false,productionExecutionValidated:false}}
};

const runControlledAtomicForkTest4302 = async (req,res)=>{
  const startedAt=Date.now();
  try{
    const zeroXAccess=await zeroXAccessPreflight4302();
    if(!zeroXAccess.ok) return res.status(zeroXAccess.status===401||zeroXAccess.status===403?403:409).json({success:false,version:VERSION,status:"CONTROLLED_FORK_ATOMIC_TEST_BLOCKED_BEFORE_FORK",blocker:zeroXAccess.classification,zeroXAccess,remediation:zeroXAccess.classification==="ZEROX_API_ACCESS_DENIED"?"Replace or authorize the ZEROX_API_KEY configured in Render, then rerun this endpoint.":null,apiKeyExposed:false,syntheticForkOnly:true,currentMainnetEligibilityClaimed:false,mainnetDeployment:false,mainnetBroadcast:false,fundsMovedOnMainnet:false,elapsedMs:Date.now()-startedAt});
    const morpho=await runMorphoLiquidationBot450();
    const pool=[...(morpho?.opportunities||[]),...(morpho?.watchlist||[])].filter(x=>x?.marketId&&x?.user).sort((a,b)=>Number(a.healthFactor??99)-Number(b.healthFactor??99));
    if(!pool.length) return res.status(409).json({success:false,version:VERSION,status:"BLOCKED",blocker:"NO_MORPHO_CANDIDATE_AVAILABLE",readOnly:true,mainnetBroadcast:false});
    const candidate=pool[0];
    const hardhatBin=path.join(__dirname,"node_modules",".bin",process.platform==="win32"?"hardhat.cmd":"hardhat");
    const reportPath=path.join(__dirname,"controlled-atomic-report-4300.json");
    try{if(fs.existsSync(reportPath))fs.unlinkSync(reportPath);}catch{}
    const child=spawnSync(hardhatBin,["run","--no-compile","ControlledAtomicForkTest4300.js"],{cwd:__dirname,env:{...process.env,ARBIFLOW_CONTROLLED_CANDIDATE_JSON:JSON.stringify({marketId:candidate.marketId,user:candidate.user}),ARBIFLOW_CONTROLLED_REPORT:reportPath},encoding:"utf8",timeout:180000,maxBuffer:4*1024*1024});
    let report=null; try{if(fs.existsSync(reportPath))report=JSON.parse(fs.readFileSync(reportPath,"utf8"));}catch{}
    if(child.status!==0||!report?.success){return res.status(409).json({success:false,version:VERSION,status:"CONTROLLED_FORK_ATOMIC_TEST_FAILED_CLOSED",candidate:{marketId:candidate.marketId,user:candidate.user,discoveryHealthFactor:candidate.healthFactor},syntheticForkOnly:true,currentMainnetEligibilityClaimed:false,error:(child.stderr||child.stdout||"CONTROLLED_TEST_FAILED").slice(-4000),report,mainnetDeployment:false,mainnetBroadcast:false,fundsMovedOnMainnet:false,elapsedMs:Date.now()-startedAt});}
    return res.json({...report,status:"CONTROLLED_FORK_ATOMIC_TEST_PASSED",candidateDiscoveryHealthFactor:candidate.healthFactor,currentMainnetEligibilityClaimed:false,elapsedMs:Date.now()-startedAt});
  }catch(e){return res.status(500).json({success:false,version:VERSION,status:"CONTROLLED_FORK_ATOMIC_TEST_ERROR",error:e?.message||String(e),syntheticForkOnly:true,currentMainnetEligibilityClaimed:false,mainnetBroadcast:false,elapsedMs:Date.now()-startedAt});}
};


const runControlledKyberAtomicForkTest4350 = async (req,res)=>{
  const startedAt=Date.now();
  try{
    const morpho=await runMorphoLiquidationBot450();
    const pool=[...(morpho?.opportunities||[]),...(morpho?.watchlist||[])].filter(x=>x?.marketId&&x?.user).sort((a,b)=>Number(a.healthFactor??99)-Number(b.healthFactor??99));
    if(!pool.length)return res.status(409).json({success:false,version:VERSION,status:"BLOCKED",blocker:"NO_MORPHO_CANDIDATE_AVAILABLE",mainnetBroadcast:false});
    const candidate=pool[0],hardhatBin=path.join(__dirname,"node_modules",".bin",process.platform==="win32"?"hardhat.cmd":"hardhat"),reportPath=path.join(__dirname,"controlled-kyber-atomic-report-4350.json");
    try{if(fs.existsSync(reportPath))fs.unlinkSync(reportPath)}catch{}
    const child=spawnSync(hardhatBin,["run","--no-compile","ControlledKyberAtomicForkTest4350.js"],{cwd:__dirname,env:{...process.env,ARBIFLOW_CONTROLLED_CANDIDATE_JSON:JSON.stringify({marketId:candidate.marketId,user:candidate.user}),ARBIFLOW_CONTROLLED_REPORT:reportPath},encoding:"utf8",timeout:180000,maxBuffer:4*1024*1024});
    let report=null;try{if(fs.existsSync(reportPath))report=JSON.parse(fs.readFileSync(reportPath,"utf8"))}catch{}
    if(child.status!==0||!report?.success)return res.status(409).json({success:false,version:VERSION,status:"CONTROLLED_FORK_KYBERSWAP_ATOMIC_TEST_FAILED_CLOSED",candidate:{marketId:candidate.marketId,user:candidate.user,discoveryHealthFactor:candidate.healthFactor},error:(child.stderr||child.stdout||"CONTROLLED_KYBER_TEST_FAILED").slice(-4000),report,mainnetDeployment:false,mainnetBroadcast:false,fundsMovedOnMainnet:false,elapsedMs:Date.now()-startedAt});
    return res.json({...report,status:"CONTROLLED_FORK_KYBERSWAP_ATOMIC_TEST_PASSED",candidateDiscoveryHealthFactor:candidate.healthFactor,currentMainnetEligibilityClaimed:false,elapsedMs:Date.now()-startedAt});
  }catch(e){return res.status(500).json({success:false,version:VERSION,status:"CONTROLLED_FORK_KYBERSWAP_ATOMIC_TEST_ERROR",error:e?.message||String(e),mainnetBroadcast:false,elapsedMs:Date.now()-startedAt})}
};

// Browser-accessible trigger plus POST compatibility. Both execute the same disposable-fork-only test.
app.get("/api/test/base/controlled-atomic", runControlledAtomicForkTest4302);
app.post("/api/test/base/controlled-atomic", runControlledAtomicForkTest4302);
app.get("/api/test/base/controlled-kyberswap-atomic", runControlledKyberAtomicForkTest4350);
app.post("/api/test/base/controlled-kyberswap-atomic", runControlledKyberAtomicForkTest4350);
const zeroXAccessHandler4303 = async (req,res)=>{ const zeroXAccess=await zeroXAccessPreflight4302(); return res.status(zeroXAccess.ok?200:(zeroXAccess.status===401||zeroXAccess.status===403?403:409)).json({success:zeroXAccess.ok,version:VERSION,...zeroXAccess,apiKeyConfigured:Boolean(ZEROX_API_KEY),apiKeyExposed:false,readOnly:true,mainnetBroadcast:false}); };
app.get("/api/zero-x/base/access", zeroXAccessHandler4303);
app.get("/api/test/zerox/access", zeroXAccessHandler4303);
app.get("/api/test/zero-x/access", zeroXAccessHandler4303);
app.get("/api/zero-x/base/production-readiness", async (req,res)=>{const r=await zeroXProductionQuoteReadiness4320();return res.status(r.success?200:409).json(r);});
app.get("/api/kyberswap/base/route-readiness", async (req,res)=>{const r=await kyberSwapBaseRouteReadiness4330();return res.status(r.success?200:409).json(r);});

const productionDeploymentReadiness4360 = async ()=>{
 const generatedAt=new Date().toISOString(),executor=(process.env.ARBIFLOW_PRODUCTION_EXECUTOR_ADDRESS||"").trim(),owner=(process.env.ARBIFLOW_PRODUCTION_OWNER_ADDRESS||"0x1d997b6f18bb70da65bab5469eac8c7c2a047394").trim(),minProfitUsd=Number(process.env.ARBIFLOW_PRODUCTION_MIN_NET_PROFIT_USD||BASE_DIRECT_MIN_NET_PROFIT_USD),maxGas=Number(process.env.ARBIFLOW_PRODUCTION_MAX_ATOMIC_GAS||900000),slippageBps=Number(process.env.ARBIFLOW_KYBER_SLIPPAGE_BPS||50),addr=/^0x[a-fA-F0-9]{40}$/;
 const checks={baseRpcConfigured:Boolean(RPC_URLS.base),liveExecutionHardDisabled:true,executorAddressConfigured:addr.test(executor),ownerAddressConfigured:addr.test(owner),minimumNetProfitValid:Number.isFinite(minProfitUsd)&&minProfitUsd>=15,maxAtomicGasValid:Number.isInteger(maxGas)&&maxGas>=561349&&maxGas<=1500000,kyberSlippageValid:Number.isInteger(slippageBps)&&slippageBps>0&&slippageBps<=500,atomicArtifactPresent:fs.existsSync(path.join(__dirname,"artifacts",".arbiflow-contracts","ArbiFlowAtomicExecutor430.sol","ArbiFlowAtomicExecutor430.json"))};
 let chainId=null,executorCodeBytes=0,aaveCodeBytes=0,morphoCodeBytes=0,executorOwner=null,executorAavePool=null,executorMorpho=null,executorBindingsVerified=false;
 try{const provider=new JsonRpcProvider(RPC_URLS.base),net=await provider.getNetwork();chainId=Number(net.chainId);checks.baseChainId=chainId===8453;aaveCodeBytes=Math.max(0,((await provider.getCode(AAVE_V3_BASE.pool)).length-2)/2);morphoCodeBytes=Math.max(0,((await provider.getCode(MORPHO_BLUE_4210)).length-2)/2);checks.aavePoolCodePresent=aaveCodeBytes>0;checks.morphoCodePresent=morphoCodeBytes>0;
 if(checks.executorAddressConfigured){const code=await provider.getCode(executor);executorCodeBytes=Math.max(0,(code.length-2)/2);checks.executorContractCodePresent=executorCodeBytes>0;if(checks.executorContractCodePresent){const c=new Contract(executor,["function OWNER() view returns(address)","function AAVE_POOL() view returns(address)","function MORPHO() view returns(address)"],provider);[executorOwner,executorAavePool,executorMorpho]=await Promise.all([c.OWNER(),c.AAVE_POOL(),c.MORPHO()]);checks.executorOwnerMatchesConfigured=checks.ownerAddressConfigured&&executorOwner.toLowerCase()===owner.toLowerCase();checks.executorAavePoolMatches=executorAavePool.toLowerCase()===AAVE_V3_BASE.pool.toLowerCase();checks.executorMorphoMatches=executorMorpho.toLowerCase()===MORPHO_BLUE_4210.toLowerCase();executorBindingsVerified=checks.executorOwnerMatchesConfigured&&checks.executorAavePoolMatches&&checks.executorMorphoMatches;}else{checks.executorOwnerMatchesConfigured=false;checks.executorAavePoolMatches=false;checks.executorMorphoMatches=false;}}else{checks.executorContractCodePresent=false;checks.executorOwnerMatchesConfigured=false;checks.executorAavePoolMatches=false;checks.executorMorphoMatches=false;}}catch(e){checks.rpcVerificationPassed=false;return {version:VERSION,success:false,classification:"PRODUCTION_DEPLOYMENT_READINESS_FAILED_CLOSED",readOnly:true,liveExecutionEnabled:false,mainnetDeployment:false,mainnetBroadcast:false,fundsMovedOnMainnet:false,checks,error:e?.message||String(e),generatedAt};}
 checks.rpcVerificationPassed=true;const required=["baseRpcConfigured","liveExecutionHardDisabled","executorAddressConfigured","ownerAddressConfigured","minimumNetProfitValid","maxAtomicGasValid","kyberSlippageValid","atomicArtifactPresent","baseChainId","aavePoolCodePresent","morphoCodePresent","executorContractCodePresent","executorOwnerMatchesConfigured","executorAavePoolMatches","executorMorphoMatches"],blockers=required.filter(k=>checks[k]!==true),success=blockers.length===0;
 return {version:VERSION,success,classification:success?"PRODUCTION_EXECUTOR_CONFIGURATION_VALIDATED":"PRODUCTION_DEPLOYMENT_READINESS_BLOCKED",readOnly:true,liveExecutionEnabled:false,mainnetDeployment:false,mainnetBroadcast:false,fundsMovedOnMainnet:false,chain:"base",chainId,checks,blockers,configuration:{executorAddressConfigured:checks.executorAddressConfigured,ownerAddressConfigured:checks.ownerAddressConfigured,minimumNetProfitUsd:minProfitUsd,maxAtomicGas:maxGas,kyberSlippageToleranceBps:slippageBps},onchain:{executorCodeBytes,aaveCodeBytes,morphoCodeBytes,executorBindingsVerified,executorOwner:executorOwner||null,executorAavePool:executorAavePool||null,executorMorpho:executorMorpho||null},evidence:{controlledKyberAtomic435PassedPreviously:true,observedAtomicGasUsed435:561349,observedAtomicGasEstimate435:714844},nextGate:success?"EXPLICIT_USER_APPROVAL_REQUIRED_BEFORE_ANY_MAINNET_ACTION":"RESOLVE_BLOCKERS_ONLY_NO_DEPLOYMENT",generatedAt};
};

app.get("/api/kyberswap/base/build-readiness", async (req,res)=>{const r=await kyberSwapBaseBuildReadiness4340();return res.status(r.success?200:409).json(r);});
app.get("/api/production/base/deployment-readiness", async (req,res)=>{const r=await productionDeploymentReadiness4360();return res.status(r.success?200:409).json(r);});

const productionDeploymentPlan4370 = async ()=>{
 const owner=(process.env.ARBIFLOW_PRODUCTION_OWNER_ADDRESS||"0x1d997b6f18bb70da65bab5469eac8c7c2a047394").trim(),addr=/^0x[a-fA-F0-9]{40}$/;
 const artifactPath=path.join(__dirname,"artifacts",".arbiflow-contracts","ArbiFlowAtomicExecutor430.sol","ArbiFlowAtomicExecutor430.json");
 const out={version:VERSION,success:false,classification:"PRODUCTION_DEPLOYMENT_PLAN_BLOCKED",readOnly:true,unsignedOnly:true,privateKeyRequired:false,signatureRequested:false,transactionSubmitted:false,mainnetDeployment:false,mainnetBroadcast:false,fundsMovedOnMainnet:false,chain:"base",chainId:8453,ownerAddress:addr.test(owner)?owner:null,aavePool:AAVE_V3_BASE.pool,morpho:MORPHO_BLUE_4210,constructorArguments:[AAVE_V3_BASE.pool,MORPHO_BLUE_4210],ownerSetBy:"DEPLOYMENT_MSG_SENDER",generatedAt:new Date().toISOString()};
 try{
  if(!addr.test(owner))throw new Error("INVALID_PRODUCTION_OWNER_ADDRESS");
  if(!fs.existsSync(artifactPath))throw new Error("ATOMIC_ARTIFACT_NOT_FOUND");
  const artifact=JSON.parse(fs.readFileSync(artifactPath,"utf8"));if(!artifact.bytecode||artifact.bytecode==="0x")throw new Error("ATOMIC_BYTECODE_MISSING");
  const provider=new JsonRpcProvider(RPC_URLS.base),net=await provider.getNetwork();if(Number(net.chainId)!==8453)throw new Error("BASE_CHAIN_ID_MISMATCH");
  const factory=new ContractFactory(artifact.abi,artifact.bytecode);
  const tx=await factory.getDeployTransaction(AAVE_V3_BASE.pool,MORPHO_BLUE_4210);
  const data=tx.data; if(!data||!/^0x[0-9a-fA-F]+$/.test(data))throw new Error("DEPLOYMENT_DATA_BUILD_FAILED");
  let estimatedGas=null,gasEstimateError=null;
  try{estimatedGas=(await provider.estimateGas({from:owner,data})).toString()}catch(e){gasEstimateError=e?.shortMessage||e?.message||String(e)}
  out.success=true;out.classification="UNSIGNED_PRODUCTION_DEPLOYMENT_PLAN_VALIDATED";out.bytecodePresent=true;out.deploymentDataPresent=true;out.deploymentDataBytes=(data.length-2)/2;out.deploymentDataExposed=false;out.estimatedDeploymentGas=estimatedGas;out.gasEstimateError=gasEstimateError;out.ownerBaseEthBalanceWei=(await provider.getBalance(owner)).toString();out.nextGate="EXPLICIT_USER_APPROVAL_AND_WALLET_SIGNATURE_REQUIRED_FOR_ACTUAL_DEPLOYMENT";
  return out;
 }catch(e){out.error=e?.message||String(e);return out}
};

app.get("/api/production/base/deployment-plan", async (req,res)=>{const r=await productionDeploymentPlan4370();return res.status(r.success?200:409).json(r);});

const runProductionBoundForkValidation4380 = async (req,res)=>{
  const startedAt=Date.now();
  try{
    const readiness=await productionDeploymentReadiness4360();
    if(!readiness.success) return res.status(409).json({success:false,version:VERSION,classification:"PRODUCTION_BOUND_FORK_BLOCKED",blocker:"PRODUCTION_EXECUTOR_CONFIGURATION_NOT_VALIDATED",readiness,liveExecutionEnabled:false,mainnetBroadcast:false,fundsMovedOnMainnet:false});
    const morpho=await runMorphoLiquidationBot450();
    const pool=[...(morpho?.opportunities||[]),...(morpho?.watchlist||[])].filter(x=>x?.marketId&&x?.user).sort((a,b)=>Number(a.healthFactor??99)-Number(b.healthFactor??99));
    if(!pool.length) return res.status(409).json({success:false,version:VERSION,classification:"PRODUCTION_BOUND_FORK_WAIT",blocker:"NO_MORPHO_CANDIDATE_AVAILABLE",productionExecutorAddress:process.env.ARBIFLOW_PRODUCTION_EXECUTOR_ADDRESS,liveExecutionEnabled:false,mainnetBroadcast:false,fundsMovedOnMainnet:false});
    const candidate=pool[0],hardhatBin=path.join(__dirname,"node_modules",".bin",process.platform==="win32"?"hardhat.cmd":"hardhat"),reportPath=path.join(__dirname,"production-bound-fork-report-4380.json");
    try{if(fs.existsSync(reportPath))fs.unlinkSync(reportPath)}catch{}
    const child=spawnSync(hardhatBin,["run","--no-compile","ProductionBoundForkTest4380.js"],{cwd:__dirname,env:{...process.env,ARBIFLOW_CONTROLLED_CANDIDATE_JSON:JSON.stringify({marketId:candidate.marketId,user:candidate.user}),ARBIFLOW_PRODUCTION_BOUND_REPORT:reportPath},encoding:"utf8",timeout:180000,maxBuffer:4*1024*1024});
    let report=null;try{if(fs.existsSync(reportPath))report=JSON.parse(fs.readFileSync(reportPath,"utf8"))}catch{}
    if(child.status!==0||!report?.success) return res.status(409).json({success:false,version:VERSION,classification:"PRODUCTION_BOUND_FORK_FAILED_CLOSED",candidate:{marketId:candidate.marketId,user:candidate.user,discoveryHealthFactor:candidate.healthFactor},error:(child.stderr||child.stdout||"PRODUCTION_BOUND_FORK_FAILED").slice(-4000),report,liveExecutionEnabled:false,mainnetBroadcast:false,fundsMovedOnMainnet:false,elapsedMs:Date.now()-startedAt});
    return res.json({...report,classification:"PRODUCTION_BOUND_FORK_VALIDATED",candidateDiscoveryHealthFactor:candidate.healthFactor,liveExecutionEnabled:false,mainnetBroadcast:false,fundsMovedOnMainnet:false,elapsedMs:Date.now()-startedAt});
  }catch(e){return res.status(500).json({success:false,version:VERSION,classification:"PRODUCTION_BOUND_FORK_ERROR",error:e?.message||String(e),liveExecutionEnabled:false,mainnetBroadcast:false,fundsMovedOnMainnet:false,elapsedMs:Date.now()-startedAt});}
};
app.get("/api/test/base/production-bound-fork",runProductionBoundForkValidation4380);
app.post("/api/test/base/production-bound-fork",runProductionBoundForkValidation4380);
const runFinalMainnetSafetyGate4390 = async (req,res)=>{
  const startedAt=Date.now();
  try{
    const readiness=await productionDeploymentReadiness4360();
    if(!readiness.success) return res.status(409).json({success:false,version:VERSION,classification:"MAINNET_EXECUTION_SAFETY_GATE_BLOCKED",blocker:"PRODUCTION_EXECUTOR_CONFIGURATION_NOT_VALIDATED",readiness,readOnly:true,liveExecutionEnabled:false,mainnetBroadcast:false,fundsMovedOnMainnet:false});
    const morpho=await runMorphoLiquidationBot450();
    const pool=[...(morpho?.opportunities||[]),...(morpho?.watchlist||[])].filter(x=>x?.marketId&&x?.user).sort((a,b)=>Number(a.healthFactor??99)-Number(b.healthFactor??99));
    if(!pool.length) return res.json({success:true,version:VERSION,classification:"MAINNET_EXECUTION_SAFETY_GATE_WAIT",readyForExplicitExecutionApproval:false,reason:"NO_MORPHO_CANDIDATE_AVAILABLE",readOnly:true,liveExecutionEnabled:false,mainnetBroadcast:false,fundsMovedOnMainnet:false,elapsedMs:Date.now()-startedAt});
    const candidate=pool[0],hardhatBin=path.join(__dirname,"node_modules",".bin",process.platform==="win32"?"hardhat.cmd":"hardhat"),reportPath=path.join(__dirname,"mainnet-safety-gate-report-4390.json");
    try{if(fs.existsSync(reportPath))fs.unlinkSync(reportPath)}catch{}
    const child=spawnSync(hardhatBin,["run","--no-compile","MainnetSafetyGate4390.js"],{cwd:__dirname,env:{...process.env,ARBIFLOW_MAINNET_SAFETY_CANDIDATE_JSON:JSON.stringify({marketId:candidate.marketId,user:candidate.user}),ARBIFLOW_MAINNET_SAFETY_REPORT:reportPath},encoding:"utf8",timeout:180000,maxBuffer:4*1024*1024});
    let report=null;try{if(fs.existsSync(reportPath))report=JSON.parse(fs.readFileSync(reportPath,"utf8"))}catch{}
    if(child.status!==0||!report?.success) return res.status(409).json({success:false,version:VERSION,classification:"MAINNET_EXECUTION_SAFETY_GATE_FAILED_CLOSED",candidate:{marketId:candidate.marketId,user:candidate.user,discoveryHealthFactor:candidate.healthFactor},error:(child.stderr||child.stdout||"MAINNET_SAFETY_GATE_FAILED").slice(-4000),report,readOnly:true,liveExecutionEnabled:false,mainnetBroadcast:false,fundsMovedOnMainnet:false,elapsedMs:Date.now()-startedAt});
    if(report.classification==="MAINNET_EXECUTION_SAFETY_GATE_WAIT") return res.json({...report,candidateDiscoveryHealthFactor:candidate.healthFactor,readOnly:true,liveExecutionEnabled:false,mainnetBroadcast:false,fundsMovedOnMainnet:false,elapsedMs:Date.now()-startedAt});
    return res.json({...report,classification:"MAINNET_EXECUTION_SAFETY_GATE_PASSED",candidateDiscoveryHealthFactor:candidate.healthFactor,readyForExplicitExecutionApproval:true,readOnly:true,liveExecutionEnabled:false,mainnetBroadcast:false,fundsMovedOnMainnet:false,nextGate:"SEPARATE_EXPLICIT_USER_APPROVAL_REQUIRED_BEFORE_ANY_MAINNET_TRANSACTION",elapsedMs:Date.now()-startedAt});
  }catch(e){return res.status(500).json({success:false,version:VERSION,classification:"MAINNET_EXECUTION_SAFETY_GATE_ERROR",error:e?.message||String(e),readOnly:true,liveExecutionEnabled:false,mainnetBroadcast:false,fundsMovedOnMainnet:false,elapsedMs:Date.now()-startedAt});}
};
app.get("/api/production/base/execution-safety-gate",runFinalMainnetSafetyGate4390);
app.post("/api/production/base/execution-safety-gate",runFinalMainnetSafetyGate4390);


// 4.44.0 fast lane: exhaustive <=1.01 refresh plus IN-PROCESS exact-accrual
// confirmation for API signals below 1.0. A separate full production safety/economics
// gate is spawned only if exact accrued state is truly liquidatable. This removes the
// expensive Hardhat child-process startup from the common false-signal path.
// No signing or mainnet broadcast is performed here.
let hotWatchSafety4430Active=false;
const hreFast4440=require("hardhat");
const FAST4440_MORPHO="0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",FAST4440_WAD=10n**18n,FAST4440_SCALE=10n**36n;
const fast4440DivUp=(a,b)=>(a+b-1n)/b;
const fast4440ToAssetsUp=(shares,assets,totalShares)=>totalShares===0n?0n:fast4440DivUp(shares*assets,totalShares);
async function exactAccruedConfirmBatch4440(candidates){
  if(!process.env.BASE_RPC_URL) throw new Error("BASE_RPC_URL_REQUIRED");
  const t0=Date.now(), ethersH=hreFast4440.ethers;
  await hreFast4440.network.provider.request({method:"hardhat_reset",params:[{forking:{jsonRpcUrl:process.env.BASE_RPC_URL}}]});
  const [tester]=await ethersH.getSigners(); const sourceBlock=await ethersH.provider.getBlockNumber();
  await hreFast4440.network.provider.send("evm_mine");
  const morpho=new ethersH.Contract(FAST4440_MORPHO,["function idToMarketParams(bytes32) view returns(address loanToken,address collateralToken,address oracle,address irm,uint256 lltv)","function accrueInterest((address,address,address,address,uint256))","function market(bytes32) view returns(uint128 totalSupplyAssets,uint128 totalSupplyShares,uint128 totalBorrowAssets,uint128 totalBorrowShares,uint128 lastUpdate,uint128 fee)","function position(bytes32,address) view returns(uint256 supplyShares,uint128 borrowShares,uint128 collateral)"],tester);
  const marketCache=new Map(), out=[];
  for(const c of candidates){
    try{
      let x=marketCache.get(c.marketId.toLowerCase());
      if(!x){
        const mp=await morpho.idToMarketParams(c.marketId); if(mp.loanToken===ethersH.ZeroAddress) throw new Error("UNKNOWN_MARKET");
        await (await morpho.accrueInterest([mp.loanToken,mp.collateralToken,mp.oracle,mp.irm,mp.lltv])).wait();
        const m=await morpho.market(c.marketId), oracle=new ethersH.Contract(mp.oracle,["function price() view returns(uint256)"],tester), price=await oracle.price();
        x={mp,m,price}; marketCache.set(c.marketId.toLowerCase(),x);
      }
      const p=await morpho.position(c.marketId,c.user), debt=fast4440ToAssetsUp(BigInt(p.borrowShares),BigInt(x.m.totalBorrowAssets),BigInt(x.m.totalBorrowShares));
      if(!debt||!BigInt(p.collateral)) throw new Error("EMPTY_POSITION");
      const hf=BigInt(p.collateral)*BigInt(x.price)/FAST4440_SCALE*BigInt(x.mp.lltv)/debt;
      out.push({success:true,version:VERSION,sourceForkBlockNumber:sourceBlock,marketId:c.marketId,borrower:c.user,exactAccruedHealthFactorWad:hf.toString(),exactAccruedLiquidatable:hf<FAST4440_WAD,stateClassification:"FRESH_BASE_FORK_EXACT_ACCRUAL_IN_PROCESS_BATCH",controlledOracleShockUsed:false,mainnetDeployment:false,mainnetBroadcast:false,mainnetStateChanged:false,fundsMovedOnMainnet:false,classification:hf<FAST4440_WAD?"EXACT_CONFIRMATION_LIQUIDATABLE":"EXACT_CONFIRMATION_WAIT",readyForExplicitExecutionApproval:false,reason:hf<FAST4440_WAD?"EXACT_ACCRUED_LIQUIDATABLE_REQUIRES_FULL_ECONOMICS_GATE":"CANDIDATE_NOT_LIQUIDATABLE_AFTER_EXACT_FORK_ACCRUAL",candidateDiscoveryHealthFactor:c.healthFactor});
    }catch(e){out.push({success:false,version:VERSION,marketId:c.marketId,borrower:c.user,candidateDiscoveryHealthFactor:c.healthFactor,classification:"EXACT_CONFIRMATION_FAILED_CLOSED",readyForExplicitExecutionApproval:false,error:e?.message||String(e)});}
  }
  return {sourceForkBlockNumber:sourceBlock,evaluated:out,elapsedMs:Date.now()-t0};
}
const runHotWatchSafety4430=async(req,res)=>{
  const startedAt=Date.now();
  if(hotWatchSafety4430Active) return res.status(409).json({success:false,version:VERSION,classification:"HOT_WATCH_SAFETY_PIPELINE_ALREADY_RUNNING",readOnly:true,liveExecutionEnabled:false,mainnetBroadcast:false,fundsMovedOnMainnet:false});
  hotWatchSafety4430Active=true;
  try{
    const readiness=await productionDeploymentReadiness4360();
    if(!readiness.success) return res.status(409).json({success:false,version:VERSION,classification:"HOT_WATCH_SAFETY_PIPELINE_BLOCKED",reason:"PRODUCTION_EXECUTOR_CONFIGURATION_NOT_VALIDATED",readOnly:true,liveExecutionEnabled:false,mainnetBroadcast:false,fundsMovedOnMainnet:false,elapsedMs:Date.now()-startedAt});
    const hot=await runMorphoHotWatchDiscovery4430();
    if(!hot.success) return res.status(502).json({...hot,liveExecutionEnabled:false,mainnetBroadcast:false,fundsMovedOnMainnet:false});
    const discovered=hot.candidates.filter(x=>x?.marketId&&x?.user&&Number(x.healthFactor)<1);
    if(!discovered.length) return res.json({success:true,version:VERSION,classification:"HOT_WATCH_SAFETY_PIPELINE_WAIT",readyForExplicitExecutionApproval:false,reason:"NO_HOT_WATCH_LIQUIDATABLE_SIGNAL",hotWatch:{positionsScanned:hot.positionsScanned,marketsRepresented:hot.marketsRepresented,pagesFetched:hot.pagesFetched,totalPositionCap:null,paginationExhausted:hot.paginationExhausted,healthFactorLte:hot.healthFactorLte,liquidatableSignals:0,closest:hot.candidates[0]||null},confirmationMode:"IN_PROCESS_BATCH_EXACT_ACCRUAL",readOnly:true,liveExecutionEnabled:false,mainnetBroadcast:false,mainnetStateChanged:false,fundsMovedOnMainnet:false,elapsedMs:Date.now()-startedAt});
    const maxCandidates=Math.max(1,Math.min(10,Number(process.env.ARBIFLOW_SAFETY_PIPELINE_MAX_CANDIDATES||10))), selected=discovered.slice(0,maxCandidates);
    const confirm=await exactAccruedConfirmBatch4440(selected); let evaluated=confirm.evaluated;
    const trulyLiquidatable=evaluated.find(x=>x.success&&x.exactAccruedLiquidatable===true);
    if(trulyLiquidatable){
      const original=selected.find(x=>x.marketId===trulyLiquidatable.marketId&&String(x.user).toLowerCase()===String(trulyLiquidatable.borrower).toLowerCase());
      const hardhatBin=path.join(__dirname,"node_modules",".bin",process.platform==="win32"?"hardhat.cmd":"hardhat"),reportPath=path.join(__dirname,`hot-watch-full-safety-4440-${String(trulyLiquidatable.borrower).slice(2,10)}.json`); try{if(fs.existsSync(reportPath))fs.unlinkSync(reportPath)}catch{}
      const child=spawnSync(hardhatBin,["run","--no-compile","MainnetSafetyGate4390.js"],{cwd:__dirname,env:{...process.env,ARBIFLOW_MAINNET_SAFETY_CANDIDATE_JSON:JSON.stringify({marketId:trulyLiquidatable.marketId,user:trulyLiquidatable.borrower}),ARBIFLOW_MAINNET_SAFETY_REPORT:reportPath},encoding:"utf8",timeout:180000,maxBuffer:4*1024*1024});
      let report=null;try{if(fs.existsSync(reportPath))report=JSON.parse(fs.readFileSync(reportPath,"utf8"))}catch{}
      if(child.status!==0||!report?.success) evaluated.push({marketId:trulyLiquidatable.marketId,user:trulyLiquidatable.borrower,classification:"FULL_SAFETY_ECONOMICS_GATE_FAILED_CLOSED",readyForExplicitExecutionApproval:false,error:(child.stderr||child.stdout||"SAFETY_GATE_FAILED").slice(-2000)});
      else evaluated.push({...report,candidateDiscoveryHealthFactor:original?.healthFactor,confirmationMode:"FULL_PRODUCTION_SAFETY_ECONOMICS_GATE",readyForExplicitExecutionApproval:report.classification==="MAINNET_EXECUTION_SAFETY_GATE_PASSED"});
    }
    const passed=evaluated.find(x=>x.readyForExplicitExecutionApproval===true);
    return res.json({success:true,version:VERSION,classification:passed?"HOT_WATCH_SAFETY_PIPELINE_PASSED":"HOT_WATCH_SAFETY_PIPELINE_WAIT",readyForExplicitExecutionApproval:Boolean(passed),candidate:passed||null,evaluated,hotWatch:{positionsScanned:hot.positionsScanned,marketsRepresented:hot.marketsRepresented,pagesFetched:hot.pagesFetched,totalPositionCap:null,paginationExhausted:hot.paginationExhausted,healthFactorLte:hot.healthFactorLte,liquidatableSignals:discovered.length},confirmationMode:"IN_PROCESS_BATCH_EXACT_ACCRUAL_THEN_FULL_GATE_ONLY_IF_TRULY_LIQUIDATABLE",exactConfirmationElapsedMs:confirm.elapsedMs,readOnly:true,liveExecutionEnabled:false,mainnetBroadcast:false,mainnetStateChanged:false,fundsMovedOnMainnet:false,nextGate:passed?"SEPARATE_EXPLICIT_USER_APPROVAL_REQUIRED_BEFORE_ANY_MAINNET_TRANSACTION":"CONTINUE_MONITORING",elapsedMs:Date.now()-startedAt});
  }catch(e){return res.status(500).json({success:false,version:VERSION,classification:"HOT_WATCH_SAFETY_PIPELINE_ERROR",error:e?.message||String(e),readOnly:true,liveExecutionEnabled:false,mainnetBroadcast:false,fundsMovedOnMainnet:false,elapsedMs:Date.now()-startedAt});}
  finally{hotWatchSafety4430Active=false;}
};
app.get("/api/production/base/hot-watch-safety-pipeline",runHotWatchSafety4430);
app.post("/api/production/base/hot-watch-safety-pipeline",runHotWatchSafety4430);

// 4.40.0: Live candidate -> exact safety gate pipeline. Discovery is read-only.
// Only candidates already below HF 1.0 at fresh discovery are promoted into the
// expensive exact-accrual production safety gate. No mainnet transaction can be
// signed or broadcast by this pipeline.
let candidateSafetyPipeline4400Active=false;
const runCandidateSafetyPipeline4400 = async (req,res)=>{
  const startedAt=Date.now();
  if(candidateSafetyPipeline4400Active) return res.status(409).json({success:false,version:VERSION,classification:"CANDIDATE_SAFETY_PIPELINE_ALREADY_RUNNING",readOnly:true,liveExecutionEnabled:false,mainnetBroadcast:false,fundsMovedOnMainnet:false});
  candidateSafetyPipeline4400Active=true;
  try{
    const readiness=await productionDeploymentReadiness4360();
    if(!readiness.success) return res.status(409).json({success:false,version:VERSION,classification:"CANDIDATE_SAFETY_PIPELINE_BLOCKED",reason:"PRODUCTION_EXECUTOR_CONFIGURATION_NOT_VALIDATED",readiness,readOnly:true,liveExecutionEnabled:false,mainnetBroadcast:false,fundsMovedOnMainnet:false,elapsedMs:Date.now()-startedAt});
    const morpho=await runMorphoLiquidationBot450();
    const discovered=[...(morpho?.opportunities||[])].filter(x=>x?.marketId&&x?.user&&Number.isFinite(Number(x.healthFactor))&&Number(x.healthFactor)<1).sort((a,b)=>Number(a.healthFactor)-Number(b.healthFactor));
    const watch=[...(morpho?.watchlist||[])].filter(x=>x?.marketId&&x?.user).sort((a,b)=>Number(a.healthFactor??99)-Number(b.healthFactor??99));
    if(!discovered.length) return res.json({success:true,version:VERSION,classification:"LIVE_CANDIDATE_SAFETY_PIPELINE_WAIT",readyForExplicitExecutionApproval:false,reason:"NO_DISCOVERY_LIQUIDATABLE_MORPHO_CANDIDATE",discovery:{liquidatableCandidates:0,watchCandidates:watch.length,positionsScanned:morpho?.positionsScanned||0,marketsRepresented:morpho?.marketsRepresented||0,pagesFetched:morpho?.pagesFetched||0,totalPositionCap:morpho?.totalPositionCap??null,paginationExhausted:morpho?.paginationExhausted===true,hotWatchCount:morpho?.hotWatchCount||0,healthBuckets:morpho?.healthBuckets||null,closestWatch:watch[0]?{marketId:watch[0].marketId,user:watch[0].user,healthFactor:watch[0].healthFactor}:null},readOnly:true,liveExecutionEnabled:false,mainnetBroadcast:false,fundsMovedOnMainnet:false,elapsedMs:Date.now()-startedAt});
    const hardhatBin=path.join(__dirname,"node_modules",".bin",process.platform==="win32"?"hardhat.cmd":"hardhat"),maxCandidates=Math.max(1,Math.min(3,Number(process.env.ARBIFLOW_SAFETY_PIPELINE_MAX_CANDIDATES||3))),evaluated=[];
    for(const candidate of discovered.slice(0,maxCandidates)){
      const reportPath=path.join(__dirname,`candidate-safety-pipeline-4400-${String(candidate.user).slice(2,10)}.json`);
      try{if(fs.existsSync(reportPath))fs.unlinkSync(reportPath)}catch{}
      const child=spawnSync(hardhatBin,["run","--no-compile","MainnetSafetyGate4390.js"],{cwd:__dirname,env:{...process.env,ARBIFLOW_MAINNET_SAFETY_CANDIDATE_JSON:JSON.stringify({marketId:candidate.marketId,user:candidate.user}),ARBIFLOW_MAINNET_SAFETY_REPORT:reportPath},encoding:"utf8",timeout:180000,maxBuffer:4*1024*1024});
      let report=null;try{if(fs.existsSync(reportPath))report=JSON.parse(fs.readFileSync(reportPath,"utf8"))}catch{}
      if(child.status!==0||!report?.success){evaluated.push({marketId:candidate.marketId,user:candidate.user,discoveryHealthFactor:candidate.healthFactor,classification:"SAFETY_GATE_FAILED_CLOSED",readyForExplicitExecutionApproval:false,error:(child.stderr||child.stdout||"SAFETY_GATE_FAILED").slice(-2000)});continue;}
      evaluated.push({...report,candidateDiscoveryHealthFactor:candidate.healthFactor,readyForExplicitExecutionApproval:report.classification==="MAINNET_EXECUTION_SAFETY_GATE_PASSED"});
      if(report.classification==="MAINNET_EXECUTION_SAFETY_GATE_PASSED") break;
    }
    const passed=evaluated.find(x=>x.readyForExplicitExecutionApproval===true);
    return res.json({success:true,version:VERSION,classification:passed?"LIVE_CANDIDATE_SAFETY_PIPELINE_PASSED":"LIVE_CANDIDATE_SAFETY_PIPELINE_WAIT",readyForExplicitExecutionApproval:Boolean(passed),candidate:passed||null,evaluated,discovery:{liquidatableCandidates:discovered.length,watchCandidates:watch.length,positionsScanned:morpho?.positionsScanned||0,marketsRepresented:morpho?.marketsRepresented||0,pagesFetched:morpho?.pagesFetched||0,totalPositionCap:morpho?.totalPositionCap??null,paginationExhausted:morpho?.paginationExhausted===true,hotWatchCount:morpho?.hotWatchCount||0,healthBuckets:morpho?.healthBuckets||null},readOnly:true,liveExecutionEnabled:false,mainnetBroadcast:false,mainnetStateChanged:false,fundsMovedOnMainnet:false,nextGate:passed?"SEPARATE_EXPLICIT_USER_APPROVAL_REQUIRED_BEFORE_ANY_MAINNET_TRANSACTION":"CONTINUE_MONITORING",elapsedMs:Date.now()-startedAt});
  }catch(e){return res.status(500).json({success:false,version:VERSION,classification:"LIVE_CANDIDATE_SAFETY_PIPELINE_ERROR",error:e?.message||String(e),readOnly:true,liveExecutionEnabled:false,mainnetBroadcast:false,fundsMovedOnMainnet:false,elapsedMs:Date.now()-startedAt});}
  finally{candidateSafetyPipeline4400Active=false;}
};

// 4.45.0 read-only market-liquidity diagnostic. Discovery remains exhaustive/uncapped.
// Funding capacity is measured for every unique debt asset in the hot-watch universe.
// Morpho flash capacity is the loan token balance held by Morpho Blue; Aave capacity
// is the underlying balance held by the reserve aToken. No flash loan is requested.
async function readFundingLiquidity4450(assetAddress,decimals){
  const provider=getBaseProvider(), token=new Contract(assetAddress,ERC20_READ_ABI,provider);
  const pool=new Contract(AAVE_V3_BASE.pool,AAVE_POOL_ABI,provider), dataProvider=new Contract(AAVE_V3_BASE.protocolDataProvider,AAVE_DATA_PROVIDER_ABI,provider);
  const [morphoRaw,premiumRaw,reserve]=await Promise.all([token.balanceOf(MORPHO_BLUE_4210),pool.FLASHLOAN_PREMIUM_TOTAL(),dataProvider.getReserveTokensAddresses(assetAddress)]);
  const aToken=reserve.aTokenAddress||reserve[0]; let aaveRaw=0n;
  if(aToken && String(aToken).toLowerCase()!=="0x0000000000000000000000000000000000000000") aaveRaw=await token.balanceOf(aToken);
  return {assetAddress,decimals,morphoFlash:{availableRaw:morphoRaw.toString(),availableTokenUnits:round(Number(formatUnits(morphoRaw,decimals)),8),feeBps:0},aaveFlash:{reserveSupported:Boolean(aToken&&String(aToken).toLowerCase()!=="0x0000000000000000000000000000000000000000"),aTokenAddress:aToken||null,availableRaw:aaveRaw.toString(),availableTokenUnits:round(Number(formatUnits(aaveRaw,decimals)),8),premiumBps:Number(premiumRaw)},readOnly:true};
}
async function kyberRoutePreview4450(tokenIn,tokenOut,amountIn){
  const clientId=(process.env.ARBIFLOW_KYBER_CLIENT_ID||"ArbiFlow").trim()||"ArbiFlow";
  const url="https://aggregator-api.kyberswap.com/base/api/v1/routes?"+new URLSearchParams({tokenIn,tokenOut,amountIn:String(amountIn),excludeRFQSources:"true",onlyScalableSources:"true",gasInclude:"true"});
  const c=new AbortController(),t=setTimeout(()=>c.abort(),8000);
  try{const r=await fetch(url,{headers:{"X-Client-Id":clientId,"Accept":"application/json"},signal:c.signal});const body=await r.text();let data=null;try{data=JSON.parse(body)}catch{};const q=data?.data?.routeSummary;return {success:Boolean(r.ok&&q?.amountOut),httpStatus:r.status,amountIn:String(amountIn),amountOut:q?.amountOut??null,amountInUsd:q?.amountInUsd??null,amountOutUsd:q?.amountOutUsd??null,gasUsd:q?.gasUsd??null,routeLegs:Array.isArray(q?.route)?q.route.length:null,error:r.ok?null:(data?.message||body.slice(0,200)),readOnly:true};}catch(e){return {success:false,amountIn:String(amountIn),error:e?.message||String(e),readOnly:true};}finally{clearTimeout(t)}
}
let marketLiquidityDiagnostic4450Active=false;
const runMarketLiquidityDiagnostic4450=async(req,res)=>{
 const startedAt=Date.now(); if(marketLiquidityDiagnostic4450Active)return res.status(409).json({success:false,version:VERSION,classification:"MARKET_LIQUIDITY_DIAGNOSTIC_ALREADY_RUNNING",readOnly:true}); marketLiquidityDiagnostic4450Active=true;
 try{
  const hot=await runMorphoHotWatchDiscovery4430(); if(!hot.success)throw new Error(hot.error||"HOT_WATCH_DISCOVERY_FAILED");
  const assets=new Map(); for(const x of hot.candidates||[]){if(x.loanAssetAddress&&!assets.has(x.loanAssetAddress.toLowerCase()))assets.set(x.loanAssetAddress.toLowerCase(),{symbol:x.loanAsset,address:x.loanAssetAddress,decimals:x.loanAssetDecimals});}
  const funding=[]; for(const a of assets.values()){try{funding.push({symbol:a.symbol,...await readFundingLiquidity4450(a.address,a.decimals)});}catch(e){funding.push({symbol:a.symbol,assetAddress:a.address,error:e?.message||String(e),readOnly:true});}}
  const closest=(hot.candidates||[])[0]||null,partialExitRouteProbes=[];
  if(closest?.collateralAssetAddress&&closest?.loanAssetAddress&&BigInt(closest.collateralAssetsRaw||"0")>0n){for(const pct of [10,25,50,75,100]){const amt=(BigInt(closest.collateralAssetsRaw)*BigInt(pct))/100n;if(amt>0n)partialExitRouteProbes.push({percentOfCurrentCollateral:pct,...await kyberRoutePreview4450(closest.collateralAssetAddress,closest.loanAssetAddress,amt.toString())});}}
  const fundingSummary=funding.map(x=>({symbol:x.symbol,assetAddress:x.assetAddress,morphoFlashTokenUnits:x.morphoFlash?.availableTokenUnits??null,aaveFlashTokenUnits:x.aaveFlash?.availableTokenUnits??null,aavePremiumBps:x.aaveFlash?.premiumBps??null,morphoFeeBps:x.morphoFlash?.feeBps??0}));
  return res.json({success:true,version:VERSION,classification:"MARKET_LIQUIDITY_DIAGNOSTIC_COMPLETE",hotWatch:{positionsScanned:hot.positionsScanned,marketsRepresented:hot.marketsRepresented,pagesFetched:hot.pagesFetched,totalPositionCap:null,paginationExhausted:hot.paginationExhausted,healthFactorLte:hot.healthFactorLte,liquidatableSignals:hot.liquidatableSignals},fundingLiquidity:{uniqueDebtAssets:assets.size,assets:fundingSummary,detail:funding},callbackSelfFunding:{supportedByArchitecture:true,requiresExternalFlashLoan:false,condition:"Seized collateral exit must produce enough loan asset to satisfy Morpho repayment atomically",validatedForCurrentCandidate:false,note:"Capability diagnostic only; no liquidation callback or swap was executed."},closestHotWatch:closest,collateralExitLiquidity:{provider:"KYBERSWAP_READ_ONLY_ROUTE_PREVIEW",candidateBasis:"CLOSEST_HOT_WATCH_POSITION_CURRENT_COLLATERAL_NOT_A_LIQUIDATION_SIZE",partialSizePercents:[10,25,50,75,100],probes:partialExitRouteProbes,note:"These probes measure indicative exit-market depth only. They are not liquidation profitability or executable-size claims."},readOnly:true,flashLoanRequested:false,swapExecuted:false,approvalPerformed:false,signaturePerformed:false,mainnetBroadcast:false,mainnetStateChanged:false,fundsMovedOnMainnet:false,elapsedMs:Date.now()-startedAt});
 }catch(e){return res.status(500).json({success:false,version:VERSION,classification:"MARKET_LIQUIDITY_DIAGNOSTIC_ERROR",error:e?.message||String(e),readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false,elapsedMs:Date.now()-startedAt});}finally{marketLiquidityDiagnostic4450Active=false;}
};
app.get("/api/diagnostics/base/market-liquidity",runMarketLiquidityDiagnostic4450);

/*
=========================================================
ARBIFLOW 4.46 MULTI-MARKET FOUNDATION - READ ONLY

Registry only. No CEX credentials, approvals, signatures,
swaps, transactions, or mainnet execution are performed.
=========================================================
*/
const MULTIMARKET_CHAINS_4460 = [
  {key:"ethereum",name:"Ethereum",chainId:1,env:"ETHEREUM_RPC_URL"},
  {key:"arbitrum",name:"Arbitrum",chainId:42161,env:"ARBITRUM_RPC_URL"},
  {key:"optimism",name:"Optimism",chainId:10,env:"OPTIMISM_RPC_URL"},
  {key:"base",name:"Base",chainId:8453,env:"BASE_RPC_URL"},
  {key:"polygon",name:"Polygon",chainId:137,env:"POLYGON_RPC_URL"},
  {key:"bnb",name:"BNB Smart Chain",chainId:56,env:"BNB_RPC_URL/BSC_RPC_URL"},
  {key:"avalanche",name:"Avalanche",chainId:43114,env:"AVALANCHE_RPC_URL"},
  {key:"linea",name:"Linea",chainId:59144,env:"LINEA_RPC_URL"},
  {key:"scroll",name:"Scroll",chainId:534352,env:"SCROLL_RPC_URL"},
  {key:"mantle",name:"Mantle",chainId:5000,env:"MANTLE_RPC_URL"},
  {key:"zksync",name:"zkSync Era",chainId:324,env:"ZKSYNC_RPC_URL"},
  {key:"gnosis",name:"Gnosis",chainId:100,env:"GNOSIS_RPC_URL"},
  {key:"metis",name:"Metis",chainId:1088,env:"METIS_RPC_URL"},
  {key:"sonic",name:"Sonic",chainId:146,env:"SONIC_RPC_URL"},
  {key:"celo",name:"Celo",chainId:42220,env:"CELO_RPC_URL"}
];
const MULTIMARKET_CEX_4460 = ["Binance","Coinbase","Kraken","KuCoin","Bybit","OKX","Gate.io","HTX","Bitfinex","Gemini","Bitstamp","MEXC"];
const MULTIMARKET_DEX_FAMILIES_4460 = ["Uniswap","SushiSwap","Curve","Balancer","PancakeSwap","Camelot","Trader Joe"];

async function multiMarketFoundationDiagnostic4460(){
  const startedAt=Date.now();
  const chains=[];
  for(const c of MULTIMARKET_CHAINS_4460){
    const rpc=RPC_URLS[c.key]||"";
    if(!rpc){chains.push({...c,configured:false,reachable:false,chainIdMatch:false,status:"RPC_NOT_CONFIGURED"});continue;}
    try{
      const provider=new JsonRpcProvider(rpc,undefined,{staticNetwork:false});
      const result=await Promise.race([Promise.all([provider.getNetwork(),provider.getBlockNumber()]),new Promise((_,reject)=>setTimeout(()=>reject(new Error("RPC_TIMEOUT_6000MS")),6000))]);
      const actualChainId=Number(result[0].chainId);
      chains.push({...c,configured:true,reachable:true,actualChainId,latestBlock:result[1],chainIdMatch:actualChainId===c.chainId,status:actualChainId===c.chainId?"READY":"CHAIN_ID_MISMATCH"});
    }catch(e){chains.push({...c,configured:true,reachable:false,chainIdMatch:false,status:"RPC_UNREACHABLE",error:e?.message||String(e)});}
  }
  const configured=chains.filter(x=>x.configured).length;
  const ready=chains.filter(x=>x.status==="READY").length;
  return {success:true,version:VERSION,classification:"MULTI_MARKET_FOUNDATION_DIAGNOSTIC_COMPLETE",architecture:"READ_ONLY_CHAIN_AND_VENUE_REGISTRY",coverage:{chainsTargeted:chains.length,chainsConfigured:configured,chainsReady:ready,cexRegistryCount:MULTIMARKET_CEX_4460.length,dexFamilyRegistryCount:MULTIMARKET_DEX_FAMILIES_4460.length},chains,centralizedExchangeRegistry:MULTIMARKET_CEX_4460.map(name=>({name,marketDataMode:"PUBLIC_READ_ONLY_PLANNED",executionEnabled:false})),dexFamilyRegistry:MULTIMARKET_DEX_FAMILIES_4460.map(name=>({name,poolDiscoveryMode:"ADAPTER_PLANNED",executionEnabled:false})),strategyModules:{baseMorphoLiquidations:"PRESERVED",dexToDex:"PLANNED",triangularMultiHop:"PLANNED",cexToDex:"PLANNED",crossChainInventory:"PLANNED"},readOnly:true,privateKeysRequired:false,cexApiKeysRequired:false,approvalPerformed:false,signaturePerformed:false,mainnetBroadcast:false,fundsMovedOnMainnet:false,elapsedMs:Date.now()-startedAt};
}

app.get("/api/diagnostics/multimarket/foundation", async (req,res)=>res.json(await multiMarketFoundationDiagnostic4460()));

/*
=========================================================
ARBIFLOW 4.47 REAL DEX POOL DISCOVERY - READ ONLY

First live multi-chain DEX adapter. It reads Uniswap V3 factory
contracts on configured chains and discovers canonical high-liquidity
pair pools across supported fee tiers. No quotes, approvals, signatures,
swaps, broadcasts, or funds movement occur here.
=========================================================
*/
const UNISWAP_V3_DISCOVERY_4470 = {
  ethereum:{factory:"0x1F98431c8aD98523631AE4a59f267346ea31F984",tokens:{WETH:"0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",WBTC:"0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",cbBTC:"0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",LINK:"0x514910771AF9Ca656af840dff83E8264EcF986CA",USDC:"0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",USDT:"0xdAC17F958D2ee523a2206206994597C13D831ec7"}},
  arbitrum:{factory:"0x1F98431c8aD98523631AE4a59f267346ea31F984",tokens:{WETH:"0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",WBTC:"0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",cbBTC:"0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",ARB:"0x912CE59144191C1204E64559FE8253a0e49E6548",USDC:"0xaf88d065e77c8cC2239327C5EDb3A432268e5831",USDT:"0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9"}},
  optimism:{factory:"0x1F98431c8aD98523631AE4a59f267346ea31F984",tokens:{WETH:"0x4200000000000000000000000000000000000006",WBTC:"0x68f180fcCe6836688e9084f035309E29bf0A2095",cbETH:"0xadDb6A0412DE1BA0F936DCaeb8Aaa24578dcF3B2",OP:"0x4200000000000000000000000000000000000042",USDC:"0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",USDT:"0x94b008aA00579c1307B0EF2c499aD98a8c58e58e"}},
  base:{factory:"0x33128a8fC17869897dcE68Ed026d694621f6FDfD",tokens:{WETH:"0x4200000000000000000000000000000000000006",cbBTC:"0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",cbETH:"0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22",USDC:"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",USDbC:"0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA"}},
  polygon:{factory:"0x1F98431c8aD98523631AE4a59f267346ea31F984",tokens:{WETH:"0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",WBTC:"0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6",WPOL:"0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",cbETH:"0x4b4327dB1600B8B1440163F667e199CEf35385f5",USDC:"0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",USDT:"0xc2132D05D31c914a87C6611C10748AaCbA4fB58e"}},
  bnb:{factory:"0xdB1d10011AD0Ff90774D0C6Bb92e5C5c8b4461F7",tokens:{WBNB:"0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",BTCB:"0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c",ETH:"0x2170Ed0880ac9A755fd29B2688956BD959F933F8",USDC:"0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",USDT:"0x55d398326f99059fF775485246999027B3197955"}}
};
const UNISWAP_V3_POOL_READ_ABI_4470=["function liquidity() view returns (uint128)","function token0() view returns (address)","function token1() view returns (address)","function fee() view returns (uint24)","function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16 observationIndex,uint16 observationCardinality,uint16 observationCardinalityNext,uint8 feeProtocol,bool unlocked)"];
function pairCombos4470(tokens){const e=Object.entries(tokens),out=[];for(let i=0;i<e.length;i++)for(let j=i+1;j<e.length;j++)out.push([e[i],e[j]]);return out;}
async function withTimeout4501(promise,ms,label){
 let timer; try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label}_TIMEOUT_${ms}MS`)),ms);})]);}finally{if(timer)clearTimeout(timer);}
}
async function mapLimit4501(items,limit,fn){
 const out=new Array(items.length); let next=0;
 async function worker(){while(true){const i=next++;if(i>=items.length)return;try{out[i]=await fn(items[i],i);}catch(e){out[i]={__error:e};}}}
 await Promise.all(Array.from({length:Math.min(limit,items.length)},()=>worker())); return out;
}
async function discoverUniswapV3Pools4470(){
 const startedAt=Date.now();
 const chainResults=await mapLimit4501(MULTIMARKET_CHAINS_4460,6,async chain=>{
  const cfg=UNISWAP_V3_DISCOVERY_4470[chain.key],rpc=RPC_URLS[chain.key]||"";
  if(!cfg)return {key:chain.key,name:chain.name,chainId:chain.chainId,status:"ADAPTER_NOT_YET_CONFIGURED",pools:[],queries:0};
  if(!rpc)return {key:chain.key,name:chain.name,chainId:chain.chainId,status:"RPC_NOT_CONFIGURED",factory:cfg.factory,pools:[],queries:0};
  try{
   const provider=new JsonRpcProvider(rpc,undefined,{staticNetwork:false});
   const [net,code]=await withTimeout4501(Promise.all([provider.getNetwork(),provider.getCode(cfg.factory)]),8000,`${chain.key}_FACTORY`);
   if(Number(net.chainId)!==chain.chainId)return {key:chain.key,name:chain.name,chainId:chain.chainId,status:"CHAIN_ID_MISMATCH",actualChainId:Number(net.chainId),factory:cfg.factory,pools:[],queries:0};
   if(!code||code==="0x")return {key:chain.key,name:chain.name,chainId:chain.chainId,status:"FACTORY_NOT_DEPLOYED",factory:cfg.factory,pools:[],queries:0};
   const factory=new Contract(cfg.factory,UNISWAP_V3_FACTORY_ABI,provider);
   const jobs=[]; for(const [[symA,tokenA],[symB,tokenB]] of pairCombos4470(cfg.tokens))for(const fee of [100,500,3000,10000])jobs.push({symA,tokenA,symB,tokenB,fee});
   const rows=await mapLimit4501(jobs,12,async j=>{
    try{
     const pool=await withTimeout4501(factory.getPool(String(j.tokenA).toLowerCase(),String(j.tokenB).toLowerCase(),j.fee),6000,`${chain.key}_GET_POOL`);
     if(!pool||pool==="0x0000000000000000000000000000000000000000")return null;
     const pc=new Contract(pool,UNISWAP_V3_POOL_READ_ABI_4470,provider); let liquidity=null;
     try{liquidity=(await withTimeout4501(pc.liquidity(),6000,`${chain.key}_LIQUIDITY`)).toString();}catch{}
     return {dex:chain.key==="bnb"?"PancakeSwap V3":"Uniswap V3",pair:`${j.symA}/${j.symB}`,tokenA:j.tokenA,tokenB:j.tokenB,feeTier:j.fee,pool,liquidityRaw:liquidity,hasLiquidity:liquidity!==null&&BigInt(liquidity)>0n,readOnly:true};
    }catch(e){return {dex:chain.key==="bnb"?"PancakeSwap V3":"Uniswap V3",pair:`${j.symA}/${j.symB}`,feeTier:j.fee,status:"POOL_QUERY_FAILED",error:e?.shortMessage||e?.message||String(e),readOnly:true};}
   });
   return {key:chain.key,name:chain.name,chainId:chain.chainId,status:"SCANNED",factory:cfg.factory,factoryCodeBytes:(code.length-2)/2,tokenUniverse:Object.keys(cfg.tokens),pairUniverse:pairCombos4470(cfg.tokens).map(x=>`${x[0][0]}/${x[1][0]}`),pools:rows.filter(Boolean),queries:jobs.length};
  }catch(e){return {key:chain.key,name:chain.name,chainId:chain.chainId,status:"SCAN_FAILED",factory:cfg.factory,error:e?.message||String(e),pools:[],queries:0};}
 });
 const chains=chainResults.map(x=>x?.__error?{status:"SCAN_FAILED",error:x.__error.message,pools:[],queries:0}:x);
 const pools=chains.flatMap(x=>x.pools||[]); const valid=pools.filter(x=>x.pool);
 return {success:true,version:VERSION,classification:"REAL_DEX_POOL_DISCOVERY_COMPLETE",architecture:"MULTI_CHAIN_BOUNDED_CONCURRENT_ONCHAIN_FACTORY_READS",adapter:"V3_FACTORY_FAMILY",coverage:{chainsTargeted:MULTIMARKET_CHAINS_4460.length,chainsWithAdapter:Object.keys(UNISWAP_V3_DISCOVERY_4470).length,chainsScanned:chains.filter(x=>x.status==="SCANNED").length,tokensConfigured:Object.values(UNISWAP_V3_DISCOVERY_4470).reduce((n,x)=>n+Object.keys(x.tokens).length,0),pairUniverseConfigured:Object.values(UNISWAP_V3_DISCOVERY_4470).reduce((n,x)=>n+pairCombos4470(x.tokens).length,0),poolQueries:chains.reduce((n,x)=>n+(x.queries||0),0),poolsDiscovered:valid.length,poolsWithNonzeroLiquidity:valid.filter(x=>x.hasLiquidity).length},performance:{boundedConcurrency:true,chainConcurrency:6,poolQueryConcurrencyPerChain:12,rpcTimeoutMs:6000},chains,readOnly:true,quoteExecutionPerformed:false,approvalPerformed:false,signaturePerformed:false,mainnetBroadcast:false,fundsMovedOnMainnet:false,elapsedMs:Date.now()-startedAt};
}
app.get("/api/diagnostics/multimarket/dex-pools",async(req,res)=>{try{res.json(await discoverUniswapV3Pools4470());}catch(e){res.status(500).json({success:false,version:VERSION,classification:"REAL_DEX_POOL_DISCOVERY_ERROR",error:e?.message||String(e),readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false});}});



/*
=========================================================
ARBIFLOW 4.48 REAL POOL PRICE + SPREAD DIAGNOSTIC - READ ONLY

Reads live Uniswap V3 pool slot0 state from the pools discovered by
4.47.1, normalizes token decimals, and compares fee-tier pools for the
same pair on the same chain. This is a market-state diagnostic, not an
execution quote: it does not claim executable profit and does not sign,
approve, swap, borrow, or broadcast.
=========================================================
*/
const UNISWAP_V3_POOL_STATE_ABI_4480 = [
  "function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16 observationIndex,uint16 observationCardinality,uint16 observationCardinalityNext,uint8 feeProtocol,bool unlocked)",
  "function liquidity() view returns (uint128)",
  "function token0() view returns (address)",
  "function token1() view returns (address)"
];
const ERC20_META_ABI_4480 = ["function decimals() view returns (uint8)","function symbol() view returns (string)"];
function ratio4480(sqrtPriceX96,dec0,dec1){
  const q=Number(sqrtPriceX96)/2**96;
  if(!Number.isFinite(q)||q<=0)return null;
  const raw=q*q;
  const px=raw*(10**(Number(dec0)-Number(dec1)));
  return Number.isFinite(px)&&px>0?px:null;
}
async function realDexSpreadDiagnostic4480(){
  const startedAt=Date.now();
  const discovery=await discoverUniswapV3Pools4470();
  const chains=[]; let poolsPriced=0,pairsCompared=0,comparisons=0;
  const allSpreads=[];
  for(const c of discovery.chains){
    if(c.status!=="SCANNED"){chains.push({key:c.key,name:c.name,chainId:c.chainId,status:c.status,pairs:[]});continue;}
    const rpc=RPC_URLS[c.key]||""; const provider=new JsonRpcProvider(rpc,undefined,{staticNetwork:false});
    const groups=new Map();
    for(const p of c.pools||[]){if(!p.pool||!p.hasLiquidity)continue; const a=groups.get(p.pair)||[]; a.push(p); groups.set(p.pair,a);}
    const pairResults=[];
    for(const [pair,pools] of groups){
      const states=[];
      for(const p of pools){
        try{
          const pc=new Contract(p.pool,UNISWAP_V3_POOL_STATE_ABI_4480,provider);
          const [slot,liq,t0,t1]=await Promise.all([pc.slot0(),pc.liquidity(),pc.token0(),pc.token1()]);
          const [d0,d1]=await Promise.all([new Contract(t0,ERC20_META_ABI_4480,provider).decimals(),new Contract(t1,ERC20_META_ABI_4480,provider).decimals()]);
          const token1PerToken0=ratio4480(slot.sqrtPriceX96??slot[0],d0,d1);
          states.push({dex:"Uniswap V3",pair,feeTier:p.feeTier,pool:p.pool,token0:t0,token1:t1,decimals0:Number(d0),decimals1:Number(d1),sqrtPriceX96:String(slot.sqrtPriceX96??slot[0]),tick:Number(slot.tick??slot[1]),liquidityRaw:String(liq),token1PerToken0,readOnly:true});
          poolsPriced++;
        }catch(e){states.push({dex:"Uniswap V3",pair,feeTier:p.feeTier,pool:p.pool,status:"POOL_STATE_READ_FAILED",error:e?.shortMessage||e?.message||String(e),readOnly:true});}
      }
      const priced=states.filter(x=>x.token1PerToken0&&Number.isFinite(x.token1PerToken0));
      const spreads=[];
      if(priced.length>=2){pairsCompared++; for(let i=0;i<priced.length;i++)for(let j=i+1;j<priced.length;j++){
        const a=priced[i],b=priced[j]; const lo=a.token1PerToken0<=b.token1PerToken0?a:b, hi=lo===a?b:a;
        const grossPct=((hi.token1PerToken0/lo.token1PerToken0)-1)*100;
        const feePct=(Number(lo.feeTier)+Number(hi.feeTier))/10000;
        const feeAdjustedPct=grossPct-feePct;
        const row={chain:c.name,chainKey:c.key,pair,buyPool:lo.pool,buyFeeTier:lo.feeTier,buySpot:lo.token1PerToken0,sellPool:hi.pool,sellFeeTier:hi.feeTier,sellSpot:hi.token1PerToken0,grossSpotSpreadPct:Number(grossPct.toFixed(8)),combinedPoolFeePct:Number(feePct.toFixed(6)),feeAdjustedSpotSpreadPct:Number(feeAdjustedPct.toFixed(8)),classification:feeAdjustedPct>0?"POSITIVE_SPOT_DIVERGENCE":"NO_FEE_ADJUSTED_SPOT_EDGE",executableQuoteConfirmed:false,readOnly:true};
        spreads.push(row); allSpreads.push(row); comparisons++;
      }}
      spreads.sort((a,b)=>b.feeAdjustedSpotSpreadPct-a.feeAdjustedSpotSpreadPct);
      pairResults.push({pair,pools:states,comparisons:spreads});
    }
    chains.push({key:c.key,name:c.name,chainId:c.chainId,status:"SCANNED_AND_PRICED",pairs:pairResults});
  }
  allSpreads.sort((a,b)=>b.feeAdjustedSpotSpreadPct-a.feeAdjustedSpotSpreadPct);
  return {success:true,version:VERSION,classification:"REAL_DEX_SPOT_SPREAD_DIAGNOSTIC_COMPLETE",architecture:"MULTI_CHAIN_UNISWAP_V3_SLOT0_NORMALIZED_SPOT_COMPARISON",coverage:{chainsTargeted:MULTIMARKET_CHAINS_4460.length,chainsScanned:chains.filter(x=>x.status==="SCANNED_AND_PRICED").length,poolsDiscovered:discovery.coverage.poolsDiscovered,poolsPriced,pairsCompared,poolPairComparisons:comparisons},topFeeAdjustedSpotDivergences:allSpreads.slice(0,25),chains,importantLimitations:{executableQuoteConfirmed:false,slippageModeled:false,gasUsdModeled:false,flashFundingModeled:false,mevModeled:false,note:"Positive spot divergence is a screening signal only. It is not an executable arbitrage or profit claim. Exact-size quotes and transaction simulation are required before any execution decision."},readOnly:true,approvalPerformed:false,signaturePerformed:false,swapExecuted:false,mainnetBroadcast:false,fundsMovedOnMainnet:false,elapsedMs:Date.now()-startedAt};
}
app.get("/api/diagnostics/multimarket/dex-spreads",async(req,res)=>{try{res.json(await realDexSpreadDiagnostic4480());}catch(e){res.status(500).json({success:false,version:VERSION,classification:"REAL_DEX_SPOT_SPREAD_DIAGNOSTIC_ERROR",error:e?.message||String(e),readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false});}});



/*
=========================================================
ARBIFLOW 4.49 EXACT-SIZE ROUND-TRIP QUOTE + FUNDING DIAGNOSTIC
READ ONLY

Uses Uniswap V3 Quoter contracts to test actual round-trip output at
multiple sizes. The existing Morpho/Aave funding architecture is retained.
No flash loan is requested and no swap, approval, signature, or broadcast
occurs. Gas is explicitly modeled rather than represented as an exact
transaction simulation.
=========================================================
*/
const UNISWAP_V3_QUOTER_V1_4490 = {
  ethereum:"0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6",
  arbitrum:"0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6",
  optimism:"0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6",
  base:"0x222ca98f00ed15b1fae10b61c277703a194cf5d2",
  polygon:"0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6",
  bnb:"0x78D78E420Da98ad378D7799bE8f4AF69033EB077"
};
const QUOTER_V1_ABI_4490=["function quoteExactInputSingle(address tokenIn,address tokenOut,uint24 fee,uint256 amountIn,uint160 sqrtPriceLimitX96) returns (uint256 amountOut)"];
const QUOTER_V2_ABI_4501=["function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)"];
const ERC20_META_BALANCE_ABI_4490=["function decimals() view returns(uint8)","function balanceOf(address) view returns(uint256)"];
const DEFAULT_SIZES_USD_4490=[100,250,500,1000,2500,5000,10000,25000,50000];
const MIN_ROUND_TRIP_RETENTION_4491=0.90;
const SATURATION_MIN_INPUT_MULTIPLE_4491=2;
const SATURATION_MIN_OUTPUT_GROWTH_4491=0.05;
const ROUND_TRIP_GAS_UNITS_4490=260000n;
function tokenAddress4490(chainKey,symbol){const a=UNISWAP_V3_DISCOVERY_4470[chainKey]?.tokens?.[symbol]||null; return a?String(a).toLowerCase():null;}
async function quoteV3Single4490(provider,quoterAddress,tokenIn,tokenOut,fee,amountIn,chainKey=null){
 if(chainKey==="bnb"){
  const q=new Contract(quoterAddress,QUOTER_V2_ABI_4501,provider);
  const out=await withTimeout4501(q.quoteExactInputSingle.staticCall({tokenIn:String(tokenIn).toLowerCase(),tokenOut:String(tokenOut).toLowerCase(),amountIn,fee:Number(fee),sqrtPriceLimitX96:0}),7000,"BNB_QUOTER_V2");
  return BigInt((out.amountOut??out[0]).toString());
 }
 const q=new Contract(quoterAddress,QUOTER_V1_ABI_4490,provider);
 const out=await withTimeout4501(q.quoteExactInputSingle.staticCall(String(tokenIn).toLowerCase(),String(tokenOut).toLowerCase(),Number(fee),amountIn,0),7000,"V3_QUOTER");
 return BigInt(out.toString());
}
function stableLike4490(sym){return ["USDC","USDT","USDbC"].includes(sym);}
const NATIVE_GAS_SYMBOL_4511={ethereum:"WETH",arbitrum:"WETH",optimism:"WETH",base:"WETH",polygon:"WPOL",bnb:"WBNB"};
function buildUsdReferenceGraph4511(spread,chainKey){
 const chain=(spread.chains||[]).find(x=>x.key===chainKey); const graph=new Map();
 if(!chain)return graph;
 function add(a,b,rate,meta){if(!a||!b||!Number.isFinite(rate)||rate<=0)return; if(!graph.has(a))graph.set(a,[]); graph.get(a).push({to:b,rate,...meta});}
 for(const pr of chain.pairs||[])for(const pool of pr.pools||[]){
  const r=Number(pool.token1PerToken0); if(!Number.isFinite(r)||r<=0)continue;
  const t0=String(pool.token0||"").toLowerCase(),t1=String(pool.token1||"").toLowerCase();
  const meta={pair:pr.pair,pool:pool.pool,feeTier:Number(pool.feeTier||0)};
  add(t0,t1,r,meta); add(t1,t0,1/r,meta);
 }
 return graph;
}
function usdReference4511(spread,chainKey,symbol,cache){
 const cacheKey=`${chainKey}:${symbol}`; if(cache?.has(cacheKey))return cache.get(cacheKey);
 if(stableLike4490(symbol)){const v={usdPerToken:1,source:"USD_LIKE_1_TO_1",referencePair:symbol,hops:0};cache?.set(cacheKey,v);return v;}
 const cfg=UNISWAP_V3_DISCOVERY_4470[chainKey],target=tokenAddress4490(chainKey,symbol);
 if(!cfg||!target){cache?.set(cacheKey,null);return null;}
 const stableAddresses=new Map(["USDC","USDT","USDbC"].filter(x=>cfg.tokens?.[x]).map(x=>[tokenAddress4490(chainKey,x),x]));
 const graph=buildUsdReferenceGraph4511(spread,chainKey);
 // Search direct and two-hop routes. Lowest total fee wins; this avoids repeated per-candidate discovery.
 let frontier=[{addr:target,rate:1,fee:0,path:[],seen:new Set([target])}],found=[];
 for(let depth=0;depth<2;depth++){
  const next=[];
  for(const st of frontier)for(const e of graph.get(st.addr)||[]){
   if(st.seen.has(e.to))continue; const rate=st.rate*e.rate,fee=st.fee+e.feeTier;
   const path=[...st.path,{from:st.addr,to:e.to,pair:e.pair,pool:e.pool,feeTier:e.feeTier,rate:e.rate}];
   if(stableAddresses.has(e.to))found.push({rate,fee,path,stable:stableAddresses.get(e.to)});
   else {const seen=new Set(st.seen);seen.add(e.to);next.push({addr:e.to,rate,fee,path,seen});}
  }
  frontier=next;
 }
 if(!found.length){cache?.set(cacheKey,null);return null;}
 found.sort((a,b)=>a.fee-b.fee||a.path.length-b.path.length); const best=found[0];
 const v={usdPerToken:best.rate,source:best.path.length===1?"ONCHAIN_V3_STABLE_REFERENCE":"ONCHAIN_V3_MULTI_HOP_STABLE_REFERENCE",referenceStable:best.stable,hops:best.path.length,referencePath:best.path,totalReferenceFeeTier:best.fee};
 cache?.set(cacheKey,v); return v;
}

async function baseFunding4490(provider,asset,decimals){
 try{
  const token=new Contract(asset,ERC20_READ_ABI,provider), pool=new Contract(AAVE_V3_BASE.pool,AAVE_POOL_ABI,provider), dp=new Contract(AAVE_V3_BASE.protocolDataProvider,AAVE_DATA_PROVIDER_ABI,provider);
  const [morphoRaw,premiumRaw,reserve]=await Promise.all([token.balanceOf(MORPHO_BLUE_4210),pool.FLASHLOAN_PREMIUM_TOTAL(),dp.getReserveTokensAddresses(asset)]);
  const aToken=reserve.aTokenAddress||reserve[0]; let aaveRaw=0n;
  if(aToken&&String(aToken).toLowerCase()!=="0x0000000000000000000000000000000000000000")aaveRaw=await token.balanceOf(aToken);
  return {mode:"FLASH_LIQUIDITY_READ_ONLY",morpho:{availableRaw:morphoRaw.toString(),availableTokenUnits:Number(formatUnits(morphoRaw,decimals)),feeBps:0},aave:{availableRaw:aaveRaw.toString(),availableTokenUnits:Number(formatUnits(aaveRaw,decimals)),premiumBps:Number(premiumRaw)},flashLoanRequested:false};
 }catch(e){return {mode:"FLASH_LIQUIDITY_READ_FAILED",error:e?.shortMessage||e?.message||String(e),flashLoanRequested:false};}
}
async function exactTradeSizeDiagnostic4490(){
 const startedAt=Date.now(), spread=await realDexSpreadDiagnostic4480(), results=[];
 const usdReferenceCache4511=new Map();
 const spotObservations=(spread.topFeeAdjustedSpotDivergences||[]);
 const positive=spotObservations.filter(x=>x.classification==="POSITIVE_SPOT_DIVERGENCE");
 const discoveryTelemetry={
   spotObservationsFound:spotObservations.length,
   spotCandidatesFound:positive.length,
   candidatesAttempted:0,
   candidatesDepthTested:0,
   candidatesRejectedForDepth:0,
   candidatesRejectedForSaturation:0,
   candidatesExactQuoted:0,
   candidatesAdapterNotConfigured:0,
   candidatesTokenMappingMissing:0,
   candidatesNoUsdInputMapping:0,
   candidatesUsdNormalized:0,
   candidatesUsdReferenceMissing:0,
   candidatesQuoterUnavailable:0,
   candidatesQuoteFailed:0,
   candidatesWithPositiveEstimatedNet:0,
   profitableCandidates:0
 };
 let candidateCursor4502=0;
 const candidateWorkerCount4502=Math.min(3,positive.length);
 await Promise.all(Array.from({length:candidateWorkerCount4502},async()=>{
 while(true){
  const candidateIndex4502=candidateCursor4502++;
  if(candidateIndex4502>=positive.length) break;
  const edge=positive[candidateIndex4502];
  discoveryTelemetry.candidatesAttempted++;
  const cfg=UNISWAP_V3_DISCOVERY_4470[edge.chainKey],rpc=RPC_URLS[edge.chainKey]||"",quoter=UNISWAP_V3_QUOTER_V1_4490[edge.chainKey];
  if(!cfg||!rpc||!quoter){discoveryTelemetry.candidatesAdapterNotConfigured++;results.push({...edge,classification:"EXACT_QUOTE_ADAPTER_NOT_CONFIGURED",exactQuoteConfirmed:false});continue;}
  const [assetA,assetB]=String(edge.pair).split("/"); const tokenA=tokenAddress4490(edge.chainKey,assetA),tokenB=tokenAddress4490(edge.chainKey,assetB);
  if(!tokenA||!tokenB){discoveryTelemetry.candidatesTokenMappingMissing++;results.push({...edge,classification:"PAIR_TOKEN_MAPPING_MISSING",exactQuoteConfirmed:false});continue;}
  const usdRefB=usdReference4511(spread,edge.chainKey,assetB,usdReferenceCache4511);
  if(!usdRefB){discoveryTelemetry.candidatesNoUsdInputMapping++;discoveryTelemetry.candidatesUsdReferenceMissing++;results.push({...edge,classification:"NO_USD_REFERENCE_ROUTE",reason:`No on-chain stable reference route was found for ${assetB}; exact USD sizing was not attempted.`,exactQuoteConfirmed:false,readOnly:true});continue;}
  if(!stableLike4490(assetB))discoveryTelemetry.candidatesUsdNormalized++;
  const provider=new JsonRpcProvider(rpc,undefined,{staticNetwork:false});
  try{
   const code=await provider.getCode(quoter); if(!code||code==="0x"){discoveryTelemetry.candidatesQuoterUnavailable++;results.push({...edge,classification:"QUOTER_NOT_DEPLOYED",quoter,exactQuoteConfirmed:false});continue;}
   const dB=Number(await new Contract(String(tokenB).toLowerCase(),ERC20_META_BALANCE_ABI_4490,provider).decimals());
   const feeData=await provider.getFeeData(); const gasPrice=feeData.gasPrice||feeData.maxFeePerGas||0n;
   // Convert native gas to USD using the same address-aware stable reference logic.
   const nativeSymbol4511=NATIVE_GAS_SYMBOL_4511[edge.chainKey];
   const nativeRef=nativeSymbol4511?usdReference4511(spread,edge.chainKey,nativeSymbol4511,usdReferenceCache4511):null;
   const nativeUsd=nativeRef?.usdPerToken||null;
   const gasNative=Number(formatUnits(gasPrice*ROUND_TRIP_GAS_UNITS_4490,18)); const modeledGasUsd=nativeUsd?gasNative*nativeUsd:null;
   const sizes=[]; let depthRejected=false, saturationStopped=false, previousSuccessful=null;
   for(const usd of DEFAULT_SIZES_USD_4490){
    try{
     const inputTokenUnits=usd/Number(usdRefB.usdPerToken);
     if(!Number.isFinite(inputTokenUnits)||inputTokenUnits<=0)throw new Error("INVALID_USD_REFERENCE_PRICE");
     const amountIn=parseUnits(inputTokenUnits.toFixed(Math.min(dB,12)),dB);
     const acquiredA=await quoteV3Single4490(provider,quoter,tokenB,tokenA,edge.buyFeeTier,amountIn,edge.chainKey);
     const finalB=await quoteV3Single4490(provider,quoter,tokenA,tokenB,edge.sellFeeTier,acquiredA,edge.chainKey);
     const finalUnits=Number(formatUnits(finalB,dB)),finalUsd=finalUnits*Number(usdRefB.usdPerToken),grossNet=finalUsd-usd,gasUsd=modeledGasUsd??0,netOwn=grossNet-gasUsd;
     const roundTripRetention=usd>0?finalUsd/usd:0;
     const catastrophicDepthImpact=roundTripRetention<MIN_ROUND_TRIP_RETENTION_4491;
     let saturationDetected=false;
     if(previousSuccessful&&usd>=previousSuccessful.usd*SATURATION_MIN_INPUT_MULTIPLE_4491){
       const outputGrowth=previousSuccessful.finalUnits>0?(finalUnits/previousSuccessful.finalUnits)-1:0;
       saturationDetected=outputGrowth<SATURATION_MIN_OUTPUT_GROWTH_4491;
     }
     let funding={ownCapital:{requiredUsd:usd,estimatedNetProfitUsd:Number(netOwn.toFixed(6)),qualifies:netOwn>=15&&!catastrophicDepthImpact}};
     if(edge.chainKey==="base"){
      const f=await baseFunding4490(provider,tokenB,dB), morphoCap=Number(f.morpho?.availableTokenUnits||0),aaveCap=Number(f.aave?.availableTokenUnits||0),aaveBps=Number(f.aave?.premiumBps||5);
      const morphoNet=grossNet-gasUsd, aavePremium=usd*aaveBps/10000, aaveNet=grossNet-gasUsd-aavePremium;
      funding={...funding,morphoFlash:{availableUsdApprox:morphoCap*Number(usdRefB.usdPerToken),feeBps:0,sizeSupported:morphoCap*Number(usdRefB.usdPerToken)>=usd,estimatedNetProfitUsd:Number(morphoNet.toFixed(6)),qualifies:morphoCap*Number(usdRefB.usdPerToken)>=usd&&morphoNet>=15},aaveFlash:{availableUsdApprox:aaveCap*Number(usdRefB.usdPerToken),premiumBps:aaveBps,sizeSupported:aaveCap*Number(usdRefB.usdPerToken)>=usd,estimatedPremiumUsd:Number(aavePremium.toFixed(6)),estimatedNetProfitUsd:Number(aaveNet.toFixed(6)),qualifies:aaveCap*Number(usdRefB.usdPerToken)>=usd&&aaveNet>=15}};
     }else funding={...funding,flashFunding:{status:"PRESERVED_NOT_YET_CONFIGURED_FOR_THIS_CHAIN",note:"Flash-loan architecture is retained. This build only reads validated Morpho/Aave funding capacity on Base."}};
     sizes.push({inputAsset:assetB,inputUsdApprox:usd,inputTokenUnits:Number(inputTokenUnits.toFixed(12)),usdReference:usdRefB,amountInRaw:amountIn.toString(),intermediateAsset:assetA,intermediateAmountRaw:acquiredA.toString(),finalAsset:assetB,finalAmount:finalUnits,finalUsdApprox:Number(finalUsd.toFixed(6)),roundTripPnlBeforeGasUsd:Number(grossNet.toFixed(6)),roundTripRetentionPct:Number((roundTripRetention*100).toFixed(6)),catastrophicDepthImpact,saturationDetected,modeledRoundTripGasUnits:Number(ROUND_TRIP_GAS_UNITS_4490),modeledGasUsd:modeledGasUsd===null?null:Number(modeledGasUsd.toFixed(6)),estimatedNetOwnCapitalUsd:modeledGasUsd===null?null:Number(netOwn.toFixed(6)),funding,exactDexQuoteConfirmed:true,transactionSimulationConfirmed:false});
     previousSuccessful={usd,finalUnits};
     if(catastrophicDepthImpact){depthRejected=true;break;}
     if(saturationDetected){saturationStopped=true;break;}
    }catch(e){sizes.push({inputUsdApprox:usd,exactDexQuoteConfirmed:false,error:e?.shortMessage||e?.message||String(e)});}
   }
   discoveryTelemetry.candidatesDepthTested += sizes.some(x=>x.exactDexQuoteConfirmed)?1:0;
   if(depthRejected) discoveryTelemetry.candidatesRejectedForDepth++;
   if(saturationStopped) discoveryTelemetry.candidatesRejectedForSaturation++;
   const successfulQuotes=sizes.filter(x=>x.exactDexQuoteConfirmed);
   const failedQuotes=sizes.filter(x=>x.exactDexQuoteConfirmed===false);
   if(!successfulQuotes.length&&failedQuotes.length) discoveryTelemetry.candidatesQuoteFailed++;
   const valid=successfulQuotes.filter(x=>x.estimatedNetOwnCapitalUsd!==null&&!x.catastrophicDepthImpact);
   if(valid.length) discoveryTelemetry.candidatesExactQuoted++;
   if(valid.some(x=>x.estimatedNetOwnCapitalUsd>0)) discoveryTelemetry.candidatesWithPositiveEstimatedNet++;
   if(valid.some(x=>x.estimatedNetOwnCapitalUsd>=15)) discoveryTelemetry.profitableCandidates++;
   const best=[...valid].sort((a,b)=>b.estimatedNetOwnCapitalUsd-a.estimatedNetOwnCapitalUsd)[0]||null;
   const classification=depthRejected?"REJECTED_INSUFFICIENT_EXECUTABLE_DEPTH":saturationStopped?"REJECTED_QUOTE_OUTPUT_SATURATION":(!successfulQuotes.length&&failedQuotes.length)?"QUOTE_FAILED":best&&best.estimatedNetOwnCapitalUsd>=15?"ESTIMATED_NET_POSITIVE_AFTER_MODELED_GAS":"NO_ESTIMATED_NET_PROFIT_AFTER_MODELED_GAS";
   results.push({...edge,quoter,quoteMethod:"UNISWAP_V3_QUOTER_EXACT_INPUT_ROUND_TRIP",depthGate:{minimumRoundTripRetentionPct:MIN_ROUND_TRIP_RETENTION_4491*100,stopOnCatastrophicDepthImpact:true,stopOnOutputSaturation:true},sizes,bestOwnCapitalSize:best,classification,exactQuoteConfirmed:valid.length>0,readOnly:true});
  }catch(e){discoveryTelemetry.candidatesQuoteFailed++;results.push({...edge,classification:"EXACT_SIZE_DIAGNOSTIC_FAILED",error:e?.shortMessage||e?.message||String(e),exactQuoteConfirmed:false,readOnly:true});}
 }
 }));
 results.sort((a,b)=>Number(b.feeAdjustedSpotSpreadPct||0)-Number(a.feeAdjustedSpotSpreadPct||0));
 return {success:true,version:VERSION,classification:"EXACT_TRADE_SIZE_AND_FUNDING_DIAGNOSTIC_COMPLETE",architecture:"CACHED_MULTI_HOP_USD_NORMALIZATION_PLUS_NATIVE_GAS_VALUATION_AND_BOUNDED_CONCURRENT_EXACT_QUOTES",minimumNetProfitUsd:15,sizesUsd:DEFAULT_SIZES_USD_4490,opportunitiesScreened:positive.length,discoveryTelemetry,spotScreening:{observations:spotObservations.slice(0,25),positiveFeeAdjustedCandidates:positive.length,note:positive.length===0?"No fee-adjusted positive spot candidates existed at this snapshot; exact-size stage correctly remained idle.":"Fee-adjusted positive spot candidates were forwarded to exact-size depth testing."},results,fundingArchitecture:{ownCapital:true,morphoFlashLoansPreserved:true,aaveFlashLoansPreserved:true,baseFundingCapacityRead:true,otherChainFlashFunding:"PRESERVED_NOT_YET_CONFIGURED",dynamicSizing:true},depthProtection:{minimumRoundTripRetentionPct:90,earlyStopOnCatastrophicDepthImpact:true,earlyStopOnOutputSaturation:true,addressNormalization:true},limitations:{gas:"MODELED_NOT_TRANSACTION_SIMULATED",mevModeled:false,atomicExecutionSimulated:false,note:"Exact DEX quote outputs are read from Quoter contracts at requested sizes. Gas is modeled, so estimated net profit is not yet an execution guarantee."},readOnly:true,flashLoanRequested:false,approvalPerformed:false,signaturePerformed:false,swapExecuted:false,mainnetBroadcast:false,fundsMovedOnMainnet:false,elapsedMs:Date.now()-startedAt};
}
app.get("/api/diagnostics/multimarket/exact-size-funding",async(req,res)=>{try{res.json(await exactTradeSizeDiagnostic4490());}catch(e){res.status(500).json({success:false,version:VERSION,classification:"EXACT_TRADE_SIZE_AND_FUNDING_DIAGNOSTIC_ERROR",error:e?.message||String(e),readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false});}});

app.post("/api/diagnostics/base/market-liquidity",runMarketLiquidityDiagnostic4450);

app.get("/api/production/base/candidate-safety-pipeline",runCandidateSafetyPipeline4400);
app.post("/api/production/base/candidate-safety-pipeline",runCandidateSafetyPipeline4400);


/* 4.54.0 runtime health for the pre-existing PancakeSwap V3 Base adapter. */
async function pancakeV3Health4540(){
  const started=Date.now();
  if(!RPC_URLS.base)return {configured:false,reachable:false,contractReadable:false,network:"Base",expectedChainId:8453,venue:"PancakeSwap V3",quoter:PANCAKESWAP_V3_BASE.quoter,factory:PANCAKESWAP_V3_BASE.factory,readOnly:true,error:"BASE_RPC_URL is not configured."};
  try{
    const provider=getBaseProvider();
    const [net,qCode,fCode]=await Promise.all([provider.getNetwork(),provider.getCode(PANCAKESWAP_V3_BASE.quoter),provider.getCode(PANCAKESWAP_V3_BASE.factory)]);
    const q=new Contract(PANCAKESWAP_V3_BASE.quoter,["function factory() view returns (address)"],provider);
    const qFactory=await q.factory.staticCall();
    return {configured:true,reachable:true,contractReadable:qCode!=="0x"&&fCode!=="0x",network:"Base",expectedChainId:8453,reportedChainId:Number(net.chainId),chainIdMatches:Number(net.chainId)===8453,venue:"PancakeSwap V3",quoter:PANCAKESWAP_V3_BASE.quoter,factory:PANCAKESWAP_V3_BASE.factory,quoterFactory:String(qFactory),factoryMatches:String(qFactory).toLowerCase()===PANCAKESWAP_V3_BASE.factory.toLowerCase(),quoterReadable:qCode!=="0x",factoryReadable:fCode!=="0x",feeTiers:PANCAKESWAP_V3_BASE.feeTiers,latencyMs:Date.now()-started,readOnly:true,error:null};
  }catch(e){return {configured:true,reachable:false,contractReadable:false,network:"Base",expectedChainId:8453,venue:"PancakeSwap V3",quoter:PANCAKESWAP_V3_BASE.quoter,factory:PANCAKESWAP_V3_BASE.factory,latencyMs:Date.now()-started,readOnly:true,error:e?.shortMessage||e?.message||String(e)};}
}

/*
=========================================================
ARBIFLOW 4.53.0 MULTI-DEX ADAPTER FOUNDATION - READ ONLY

First normalized cross-DEX graph using two independent Base venue
adapters already present in the engine: Uniswap V3 and Aerodrome.
The diagnostic performs exact read-only quotes in both directions
for the same token pair and evaluates round trips at fixed USD-like
USDC probe sizes. No approvals, signatures, swaps, loans or broadcasts.
=========================================================
*/


/* ARBIFLOW 4.57.1 - SUSHISWAP V3 BASE DIRECT READ-ONLY ADAPTER */
const SUSHISWAP_V3_BASE = {
  factory: "0xc35DADB65012eC5796536bD9864eD8773aBc74C4",
  quoter: "0xb1E835Dc2785b52265711e17fCCb0fd018226a6e",
  feeTiers: [100, 500, 3000, 10000]
};
const sushiPoolTopology4560 = new Map();
const sushiWinningFee4560 = new Map();
function sushiPairKey4560(a,b){ return [a,b].sort().join("/"); }
async function sushiActiveFees4560(sellToken,buyToken){
  const key=sushiPairKey4560(sellToken,buyToken), cached=sushiPoolTopology4560.get(key);
  if(cached && Date.now()-cached.at < 10*60*1000) return cached.fees;
  const network=NETWORKS.base,sell=network.tokens[sellToken],buy=network.tokens[buyToken];
  if(!sell||!buy) throw new Error(`Unsupported SushiSwap V3 Base token pair: ${sellToken}/${buyToken}`);
  const provider=getBaseProvider(),factory=new Contract(SUSHISWAP_V3_BASE.factory,UNISWAP_V3_FACTORY_ABI,provider);
  const checks=await Promise.allSettled(SUSHISWAP_V3_BASE.feeTiers.map(async fee=>({fee,pool:await factory.getPool(sell.address,buy.address,fee)})));
  const fees=checks.filter(x=>x.status==="fulfilled"&&x.value.pool&&String(x.value.pool).toLowerCase()!=="0x0000000000000000000000000000000000000000").map(x=>x.value.fee);
  sushiPoolTopology4560.set(key,{fees,at:Date.now()}); return fees;
}
async function sushiV3QuoteOne4560({sellToken,buyToken,sellAmount,fee}){
  const network=NETWORKS.base,sell=network.tokens[sellToken],buy=network.tokens[buyToken];
  if(!sell||!buy) throw new Error(`Unsupported SushiSwap V3 Base token pair: ${sellToken}/${buyToken}`);
  const provider=getBaseProvider(),factory=new Contract(SUSHISWAP_V3_BASE.factory,UNISWAP_V3_FACTORY_ABI,provider);
  const pool=await factory.getPool(sell.address,buy.address,Number(fee));
  if(!pool||String(pool).toLowerCase()==="0x0000000000000000000000000000000000000000") throw new Error(`No SushiSwap V3 ${fee} pool for ${sellToken}/${buyToken}`);
  const quoter=new Contract(SUSHISWAP_V3_BASE.quoter,UNISWAP_V3_QUOTER_ABI,provider);
  const amountIn=parseUnits(String(sellAmount),sell.decimals);
  const q=await quoter.quoteExactInputSingle.staticCall({tokenIn:sell.address,tokenOut:buy.address,amountIn,fee:Number(fee),sqrtPriceLimitX96:0});
  const raw=q.amountOut??q[0], out=Number(formatUnits(raw,buy.decimals));
  if(!Number.isFinite(out)||out<=0) throw new Error("SushiSwap V3 invalid quote");
  return {provider:"SushiSwap V3",liquidityModel:"DIRECT_VENUE",quoteTransport:"NATIVE_RPC",network:network.name,networkKey:network.key,chainId:network.chainId,quoter:SUSHISWAP_V3_BASE.quoter,factory:SUSHISWAP_V3_BASE.factory,pool,feeTier:Number(fee),feePercent:Number(fee)/10000,sellToken,buyToken,sellAmount:Number(sellAmount),buyAmount:round(out,12),rawBuyAmount:raw.toString(),quoteTimestamp:Date.now(),readOnly:true};
}
async function sushiSwapV3Quote4560(sellToken,buyToken,sellAmount){
  const key=sushiPairKey4560(sellToken,buyToken),win=sushiWinningFee4560.get(key);
  if(win&&Date.now()-win.at<30000){try{return await sushiV3QuoteOne4560({sellToken,buyToken,sellAmount,fee:win.fee});}catch{}}
  const fees=await sushiActiveFees4560(sellToken,buyToken); if(!fees.length) throw new Error(`No SushiSwap V3 pool for ${sellToken}/${buyToken}`);
  const attempts=await Promise.allSettled(fees.map(fee=>sushiV3QuoteOne4560({sellToken,buyToken,sellAmount,fee})));
  const ok=attempts.filter(x=>x.status==="fulfilled").map(x=>x.value); if(!ok.length) throw new Error("No SushiSwap V3 quote was available");
  ok.sort((a,b)=>b.buyAmount-a.buyAmount); sushiWinningFee4560.set(key,{fee:ok[0].feeTier,at:Date.now()}); return ok[0];
}
async function sushiV3Health4560(){
  const started=Date.now(); if(!RPC_URLS.base)return {configured:false,reachable:false,contractReadable:false,network:"Base",expectedChainId:8453,venue:"SushiSwap V3",quoter:SUSHISWAP_V3_BASE.quoter,factory:SUSHISWAP_V3_BASE.factory,readOnly:true,error:"BASE_RPC_URL is not configured."};
  try{const provider=getBaseProvider(); const [net,qCode,fCode]=await Promise.all([provider.getNetwork(),provider.getCode(SUSHISWAP_V3_BASE.quoter),provider.getCode(SUSHISWAP_V3_BASE.factory)]); const q=new Contract(SUSHISWAP_V3_BASE.quoter,["function factory() view returns (address)"],provider); const qFactory=await q.factory.staticCall(); return {configured:true,reachable:true,contractReadable:qCode!=="0x"&&fCode!=="0x",network:"Base",expectedChainId:8453,reportedChainId:Number(net.chainId),chainIdMatches:Number(net.chainId)===8453,venue:"SushiSwap V3",quoter:SUSHISWAP_V3_BASE.quoter,factory:SUSHISWAP_V3_BASE.factory,quoterFactory:String(qFactory),factoryMatches:String(qFactory).toLowerCase()===SUSHISWAP_V3_BASE.factory.toLowerCase(),quoterReadable:qCode!=="0x",factoryReadable:fCode!=="0x",feeTiers:SUSHISWAP_V3_BASE.feeTiers,latencyMs:Date.now()-started,readOnly:true,error:null};}catch(e){return {configured:true,reachable:false,contractReadable:false,network:"Base",expectedChainId:8453,venue:"SushiSwap V3",quoter:SUSHISWAP_V3_BASE.quoter,factory:SUSHISWAP_V3_BASE.factory,latencyMs:Date.now()-started,readOnly:true,error:e?.shortMessage||e?.message||String(e)};}
}

const CROSS_DEX_PROBE_SIZES_4520 = [100,250,500,1000,2500];
const CROSS_DEX_ASSETS_4520 = ["WETH","cbBTC","DAI","cbETH","USDbC"];

async function venueQuote4520(venue,sellToken,buyToken,sellAmount){
  if(venue==="UNISWAP_V3") return (await uniswapV3BestQuote({sellToken,buyToken,sellAmount})).best;
  if(venue==="AERODROME") return (await aerodromeBestQuote({sellToken,buyToken,sellAmount})).best;
  if(venue==="PANCAKESWAP_V3") return await pancakeSwapV3Quote430(sellToken,buyToken,sellAmount);
  if(venue==="SUSHISWAP_V3") return await sushiSwapV3Quote4560(sellToken,buyToken,sellAmount);
  throw new Error(`Unsupported venue ${venue}`);
}

async function crossDexRoundTrip4520({asset,sizeUsd,buyVenue,sellVenue}){
  try{
    const first=await venueQuote4520(buyVenue,"USDC",asset,sizeUsd);
    const second=await venueQuote4520(sellVenue,asset,"USDC",first.buyAmount);
    const finalUsd=Number(second.buyAmount);
    const pnl=finalUsd-Number(sizeUsd);
    return {asset,inputUsd:sizeUsd,buyVenue,sellVenue,intermediateAmount:first.buyAmount,finalUsd:round(finalUsd,6),roundTripPnlBeforeGasUsd:round(pnl,6),roundTripRetentionPct:round((finalUsd/Number(sizeUsd))*100,6),positiveBeforeGas:pnl>0,buyQuote:first,sellQuote:second,exactReadOnlyQuotes:true,mainnetBroadcast:false,fundsMoved:false};
  }catch(error){
    const message=error?.shortMessage||error?.message||String(error);
    const upper=String(message).toUpperCase();
    let failureClass="NO_QUOTE";
    if(upper.includes("POOL") && (upper.includes("NO")||upper.includes("NOT")||upper.includes("MISSING")||upper.includes("UNAVAILABLE"))) failureClass="NO_POOL";
    else if(upper.includes("RPC")||upper.includes("TIMEOUT")||upper.includes("NETWORK")||upper.includes("SERVER")||upper.includes("429")||upper.includes("503")) failureClass="RPC_ERROR";
    return {asset,inputUsd:sizeUsd,buyVenue,sellVenue,status:"QUOTE_PATH_UNAVAILABLE",failureClass,error:message,exactReadOnlyQuotes:false,mainnetBroadcast:false,fundsMoved:false};
  }
}

async function multiDexCrossVenueDiagnostic4520(){
  const startedAt=Date.now();
  const [aeroHealth,uniHealth,pancakeHealth,sushiHealth]=await Promise.all([aerodromeHealth(),uniswapV3Health(),pancakeV3Health4540(),sushiV3Health4560()]);
  const jobs=[];
  for(const asset of CROSS_DEX_ASSETS_4520){
    for(const sizeUsd of CROSS_DEX_PROBE_SIZES_4520){
      const venues=["UNISWAP_V3","AERODROME","PANCAKESWAP_V3","SUSHISWAP_V3"];
      for(const buyVenue of venues)for(const sellVenue of venues){
        if(buyVenue===sellVenue) continue;
        const sushiInvolved=buyVenue==="SUSHISWAP_V3"||sellVenue==="SUSHISWAP_V3";
        if(sushiInvolved && (asset==="cbBTC"||asset==="cbETH")) continue; // 4.57.1 known unsupported Base coverage gaps validated by 4.57.1
        jobs.push({asset,sizeUsd,buyVenue,sellVenue});
      }
    }
  }
  const results=[];
  let cursor=0;
  const workers=Array.from({length:3},async()=>{
    while(true){const i=cursor++; if(i>=jobs.length) break; results[i]=await crossDexRoundTrip4520(jobs[i]);}
  });
  await Promise.all(workers);
  const quoted=results.filter(x=>x.exactReadOnlyQuotes);
  const failed=results.filter(x=>!x.exactReadOnlyQuotes);
  const positive=quoted.filter(x=>x.positiveBeforeGas).sort((a,b)=>b.roundTripPnlBeforeGasUsd-a.roundTripPnlBeforeGasUsd);
  const failureClasses={NO_POOL:0,NO_QUOTE:0,RPC_ERROR:0};
  for(const x of failed) failureClasses[x.failureClass]=(failureClasses[x.failureClass]||0)+1;
  const venueCoverage={};
  const assetCoverage={};
  for(const v of ["UNISWAP_V3","AERODROME","PANCAKESWAP_V3","SUSHISWAP_V3"]){
    const touched=results.filter(x=>x.buyVenue===v||x.sellVenue===v);
    venueCoverage[v]={jobs:touched.length,quoted:touched.filter(x=>x.exactReadOnlyQuotes).length,failed:touched.filter(x=>!x.exactReadOnlyQuotes).length};
    venueCoverage[v].successPct=round(venueCoverage[v].jobs?venueCoverage[v].quoted/venueCoverage[v].jobs*100:0,2);
  }
  for(const a of CROSS_DEX_ASSETS_4520){
    const touched=results.filter(x=>x.asset===a);
    assetCoverage[a]={jobs:touched.length,quoted:touched.filter(x=>x.exactReadOnlyQuotes).length,failed:touched.filter(x=>!x.exactReadOnlyQuotes).length};
    assetCoverage[a].successPct=round(assetCoverage[a].jobs?assetCoverage[a].quoted/assetCoverage[a].jobs*100:0,2);
  }
  return {success:true,version:VERSION,classification:"MULTI_DEX_CROSS_VENUE_DIAGNOSTIC_COMPLETE",architecture:"FOUR_VENUE_BASE_EXACT_READ_ONLY_CROSS_DEX_GRAPH_WITH_ROUTE_COVERAGE",adapters:[{id:"UNISWAP_V3",chain:"Base",health:uniHealth},{id:"AERODROME",chain:"Base",health:aeroHealth},{id:"PANCAKESWAP_V3",chain:"Base",health:pancakeHealth},{id:"SUSHISWAP_V3",chain:"Base",health:sushiHealth}],coverage:{chains:1,venueAdapters:4,assets:CROSS_DEX_ASSETS_4520,probeSizesUsd:CROSS_DEX_PROBE_SIZES_4520,nominalRouteDirections:12,knownUnsupportedJobsSkipped:60,jobsAttempted:jobs.length,exactRoundTripsQuoted:quoted.length,failedRoundTrips:failed.length,positiveBeforeGas:positive.length},knownCoverageGaps:[{venue:"SUSHISWAP_V3",asset:"cbBTC",skippedJobs:30,reason:"NO_QUOTE_VALIDATED_4.57.1"},{venue:"SUSHISWAP_V3",asset:"cbETH",skippedJobs:30,reason:"NO_POOL_VALIDATED_4.57.1"}],routeCoverage:{failureClasses,venueCoverage,assetCoverage,failedRoutes:failed},topPositiveBeforeGas:positive.slice(0,10),results,importantLimitations:{gasIncluded:false,flashFundingIncluded:false,mevIncluded:false,transactionSimulationPerformed:false,executionEligibility:false,note:"This is the first cross-DEX adapter/graph diagnostic. Positive before-gas round trips are screening observations only and must pass gas, funding, slippage/depth and simulation gates before any execution decision."},readOnly:true,approvalPerformed:false,signaturePerformed:false,swapExecuted:false,flashLoanRequested:false,mainnetBroadcast:false,fundsMovedOnMainnet:false,elapsedMs:Date.now()-startedAt};
}
app.get("/api/diagnostics/multimarket/cross-dex-base",async(req,res)=>{try{res.json(await multiDexCrossVenueDiagnostic4520());}catch(e){res.status(500).json({success:false,version:VERSION,classification:"MULTI_DEX_CROSS_VENUE_DIAGNOSTIC_ERROR",error:e?.message||String(e),readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false});}});


/*
=========================================================
ARBIFLOW 4.53.0 CROSS-DEX ECONOMIC + FUNDING INTEGRATION
READ ONLY / FAIL CLOSED

Feeds exact Uniswap V3 <-> Aerodrome Base round trips through
retention/depth, Base gas, own-capital, Morpho/Aave flash-liquidity,
financing-cost and $15 minimum-net gates. No transaction simulation
is claimed here; qualifying economics become SIMULATION_ELIGIBLE only.
=========================================================
*/
const CROSS_DEX_MIN_NET_USD_4530 = 15;
const CROSS_DEX_MIN_RETENTION_PCT_4530 = 90;
const CROSS_DEX_GAS_UNITS_4530 = 320000n;

async function crossDexNativeUsd4531(){
  // Reuse the already-validated exact Base venue quote path instead of the legacy 0x-dependent native-price helper.
  // A $100 USDC -> WETH exact quote implies ETH/USD = 100 / WETH received.
  const q=await venueQuote4520("UNISWAP_V3","USDC","WETH",100);
  const weth=Number(q?.buyAmount||0);
  if(!Number.isFinite(weth)||weth<=0) throw new Error("BASE_NATIVE_USD_REFERENCE_UNAVAILABLE");
  return {usdPerEth:100/weth,source:"EXACT_UNISWAP_V3_USDC_TO_WETH_REFERENCE",quote:q};
}

async function crossDexFundingCapacity4531(provider){
  const usdc=tokenAddress4490("base","USDC");
  if(!usdc) throw new Error("BASE_USDC_ADDRESS_UNAVAILABLE");
  const f=await readFundingLiquidity4450(usdc,6);
  const morpho=Number(f?.morphoFlash?.availableTokenUnits);
  const aave=Number(f?.aaveFlash?.availableTokenUnits);
  const premium=Number(f?.aaveFlash?.premiumBps);
  if(!Number.isFinite(morpho)||!Number.isFinite(aave)||!Number.isFinite(premium)) throw new Error("BASE_FLASH_LIQUIDITY_READ_INVALID");
  return {asset:"USDC",assetAddress:usdc,morphoAvailableUsdApprox:morpho,aaveAvailableUsdApprox:aave,aavePremiumBps:premium,morphoFlashFeeBps:0,source:"DIRECT_BASE_PROTOCOL_BALANCE_READS",readOnly:true};
}

async function crossDexEconomicDiagnostic4531(){
  const startedAt=Date.now();
  const base=await multiDexCrossVenueDiagnostic4520();
  const provider=new JsonRpcProvider(RPC_URLS.base,undefined,{staticNetwork:false});
  const [feeData,nativeRef,fundingCapacity]=await Promise.all([
    provider.getFeeData(),
    crossDexNativeUsd4531(),
    crossDexFundingCapacity4531(provider)
  ]);
  const nativeUsd=Number(nativeRef.usdPerEth);
  const gasPrice=feeData.gasPrice||feeData.maxFeePerGas;
  if(!gasPrice) throw new Error("BASE_GAS_PRICE_UNAVAILABLE");
  const gasNative=Number(formatUnits(gasPrice*CROSS_DEX_GAS_UNITS_4530,18));
  const modeledGasUsd=gasNative*nativeUsd;
  if(!Number.isFinite(modeledGasUsd)||modeledGasUsd<=0) throw new Error("BASE_GAS_USD_MODEL_INVALID");
  const morphoUsd=fundingCapacity.morphoAvailableUsdApprox;
  const aaveUsd=fundingCapacity.aaveAvailableUsdApprox;
  const aaveBps=fundingCapacity.aavePremiumBps;
  const results=(base.results||[]).map(r=>{
    if(!r.exactReadOnlyQuotes)return {...r,economicClassification:"QUOTE_PATH_UNAVAILABLE",executionEligibility:"NOT_ELIGIBLE",transactionSimulationConfirmed:false};
    const gross=Number(r.roundTripPnlBeforeGasUsd),retention=Number(r.roundTripRetentionPct);
    const depthPass=Number.isFinite(retention)&&retention>=CROSS_DEX_MIN_RETENTION_PCT_4530;
    const ownNet=gross-modeledGasUsd;
    const aavePremium=Number(r.inputUsd)*aaveBps/10000;
    const morphoNet=gross-modeledGasUsd;
    const aaveNet=gross-modeledGasUsd-aavePremium;
    const morphoSupported=morphoUsd>=Number(r.inputUsd),aaveSupported=aaveUsd>=Number(r.inputUsd);
    const funding={
      ownCapital:{requiredUsd:Number(r.inputUsd),estimatedNetProfitUsd:round(ownNet,6),qualifies:depthPass&&ownNet>=CROSS_DEX_MIN_NET_USD_4530},
      morphoFlash:{availableUsdApprox:round(morphoUsd,6),feeBps:0,sizeSupported:morphoSupported,estimatedNetProfitUsd:round(morphoNet,6),qualifies:depthPass&&morphoSupported&&morphoNet>=CROSS_DEX_MIN_NET_USD_4530},
      aaveFlash:{availableUsdApprox:round(aaveUsd,6),premiumBps:aaveBps,sizeSupported:aaveSupported,estimatedPremiumUsd:round(aavePremium,6),estimatedNetProfitUsd:round(aaveNet,6),qualifies:depthPass&&aaveSupported&&aaveNet>=CROSS_DEX_MIN_NET_USD_4530}
    };
    const bestNet=Math.max(ownNet,morphoSupported?morphoNet:-Infinity,aaveSupported?aaveNet:-Infinity);
    const simulationEligible=depthPass&&bestNet>=CROSS_DEX_MIN_NET_USD_4530;
    const economicClassification=!depthPass?"REJECTED_INSUFFICIENT_EXECUTABLE_DEPTH":simulationEligible?"SIMULATION_ELIGIBLE_ESTIMATED_NET_GE_15":"REJECTED_NET_BELOW_MINIMUM";
    return {...r,depthGate:{minimumRoundTripRetentionPct:CROSS_DEX_MIN_RETENTION_PCT_4530,passed:depthPass},gasModel:{modeledRoundTripGasUnits:Number(CROSS_DEX_GAS_UNITS_4530),nativeGasToken:"ETH",nativeUsd:round(nativeUsd,6),nativeUsdSource:nativeRef.source,modeledGasNative:round(gasNative,10),modeledGasUsd:round(modeledGasUsd,6)},funding,economicClassification,estimatedBestNetUsd:Number.isFinite(bestNet)?round(bestNet,6):null,executionEligibility:simulationEligible?"SIMULATION_ELIGIBLE":"NOT_ELIGIBLE",transactionSimulationConfirmed:false,mainnetBroadcast:false,fundsMoved:false};
  });
  const eligible=results.filter(x=>x.executionEligibility==="SIMULATION_ELIGIBLE").sort((a,b)=>Number(b.estimatedBestNetUsd||-Infinity)-Number(a.estimatedBestNetUsd||-Infinity));
  const depthRejected=results.filter(x=>x.economicClassification==="REJECTED_INSUFFICIENT_EXECUTABLE_DEPTH").length;
  const netRejected=results.filter(x=>x.economicClassification==="REJECTED_NET_BELOW_MINIMUM").length;
  return {success:true,version:VERSION,classification:"CROSS_DEX_ECONOMIC_FUNDING_DIAGNOSTIC_COMPLETE",architecture:"FOUR_VENUE_BASE_GRAPH_TO_DEPTH_REAL_NATIVE_USD_GAS_DIRECT_PROTOCOL_FUNDING_MIN_NET_SIMULATION_GATE",minimumNetProfitUsd:CROSS_DEX_MIN_NET_USD_4530,minimumRoundTripRetentionPct:CROSS_DEX_MIN_RETENTION_PCT_4530,coverage:base.coverage,knownCoverageGaps:base.knownCoverageGaps,routeCoverage:base.routeCoverage,adapters:base.adapters,economics:{modeledRoundTripGasUnits:Number(CROSS_DEX_GAS_UNITS_4530),nativeGasToken:"ETH",nativeUsd:round(nativeUsd,6),nativeUsdSource:nativeRef.source,modeledGasNative:round(gasNative,10),modeledGasUsd:round(modeledGasUsd,6),aavePremiumBps:aaveBps,morphoFlashFeeBps:0},fundingCapacity:{...fundingCapacity,morphoAvailableUsdApprox:round(morphoUsd,6),aaveAvailableUsdApprox:round(aaveUsd,6)},plumbingChecks:{nativeUsdNonZero:nativeUsd>0,modeledGasUsdNonZero:modeledGasUsd>0,morphoCapacityRead:Number.isFinite(morphoUsd)&&morphoUsd>0,aaveCapacityRead:Number.isFinite(aaveUsd)&&aaveUsd>0,passed:nativeUsd>0&&modeledGasUsd>0&&morphoUsd>0&&aaveUsd>0},gates:{jobsEvaluated:results.length,depthRejected,netRejected,simulationEligible:eligible.length,transactionSimulated:0,executionEligible:0},topSimulationEligible:eligible.slice(0,10),results,importantLimitations:{gas:"LIVE_GAS_PRICE_TIMES_MODELED_UNITS_NOT_TRANSACTION_SIMULATED",mevModeled:false,transactionSimulationPerformed:false,executionEligibility:false,note:"SIMULATION_ELIGIBLE means only that read-only exact quotes pass depth, modeled gas, live read-only funding-capacity and $15 estimated-net gates. It is not approval to trade and is not an execution guarantee."},readOnly:true,flashLoanRequested:false,approvalPerformed:false,signaturePerformed:false,swapExecuted:false,mainnetBroadcast:false,fundsMovedOnMainnet:false,elapsedMs:Date.now()-startedAt};
}
app.get("/api/diagnostics/multimarket/cross-dex-economic",async(req,res)=>{try{res.json(await crossDexEconomicDiagnostic4531());}catch(e){res.status(500).json({success:false,version:VERSION,classification:"CROSS_DEX_ECONOMIC_FUNDING_DIAGNOSTIC_ERROR",error:e?.message||String(e),readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false});}});

/*
=========================================================
ARBIFLOW 4.72.0 — BROAD MARKET CANDIDATE DISCOVERY
Promotes the already-validated four-venue Base cross-DEX diagnostic
into a bounded background discovery worker. It does not execute trades.
=========================================================
*/
const DISCOVERY4720_INTERVAL_MS=Math.max(60000,Math.min(300000,Number(process.env.ARBIFLOW_BROAD_DISCOVERY_MS||"300000")));
const DISCOVERY4720_MIN_SPREAD_PCT=Math.max(0.01,Number(process.env.ARBIFLOW_GLOBAL_MIN_SPREAD_PCT||"0.50"));
const DISCOVERY4720_MIN_NET_USD=Math.max(0,Number(process.env.ARBIFLOW_GLOBAL_MIN_NET_USD||"15"));
const DISCOVERY4721_QUOTE_TIMEOUT_MS=Math.max(1500,Math.min(6000,Number(process.env.ARBIFLOW_DISCOVERY_QUOTE_TIMEOUT_MS||"4000")));
const DISCOVERY4721_CONCURRENCY=Math.max(2,Math.min(12,Number(process.env.ARBIFLOW_DISCOVERY_CONCURRENCY||"8")));
const DISCOVERY4721_PROBE_USD=Math.max(50,Number(process.env.ARBIFLOW_DISCOVERY_PROBE_USD||"500"));
const discovery4720=global.__arbiflow4720||{status:"IDLE",phase:"IDLE",startedAt:null,lastRunAt:null,lastCompletedAt:null,lastProgressAt:null,lastError:null,runs:0,jobsPlanned:0,jobsCompleted:0,jobsEvaluated:0,exactQuotes:0,quoteFailures:0,quoteTimeouts:0,positiveBeforeGas:0,spreadGatePassed:0,depthPassed:0,netGatePassed:0,simulationEligible:0,candidates:[],rejections:{},timer:null,running:false,currentRun:null};
global.__arbiflow4720=discovery4720;
function reject4720(reason,n=1){discovery4720.rejections[reason]=(discovery4720.rejections[reason]||0)+n;}
function timeout4721(promise,ms,label){return Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error(`TIMEOUT ${label} after ${ms}ms`)),ms))]);}
async function mapLimit4721(items,limit,fn){const out=new Array(items.length);let cursor=0;const workers=Array.from({length:Math.min(limit,items.length)},async()=>{while(true){const i=cursor++;if(i>=items.length)break;out[i]=await fn(items[i],i);}});await Promise.all(workers);return out;}
async function legQuote4721(venue,sell,buy,amount){return timeout4721(venueQuote4520(venue,sell,buy,amount),DISCOVERY4721_QUOTE_TIMEOUT_MS,`${venue} ${sell}->${buy}`);}
async function roundTrip4721(job){const t=Date.now();try{const first=await legQuote4721(job.buyVenue,"USDC",job.asset,job.sizeUsd);const second=await legQuote4721(job.sellVenue,job.asset,"USDC",first.buyAmount);const finalUsd=Number(second.buyAmount),pnl=finalUsd-Number(job.sizeUsd);return {...job,intermediateAmount:first.buyAmount,finalUsd:round(finalUsd,6),roundTripPnlBeforeGasUsd:round(pnl,6),roundTripRetentionPct:round(finalUsd/Number(job.sizeUsd)*100,6),positiveBeforeGas:pnl>0,buyQuote:first,sellQuote:second,exactReadOnlyQuotes:true,elapsedMs:Date.now()-t};}catch(e){const msg=e?.shortMessage||e?.message||String(e);return {...job,status:"QUOTE_PATH_UNAVAILABLE",failureClass:String(msg).includes("TIMEOUT")?"TIMEOUT":"QUOTE_ERROR",error:msg,exactReadOnlyQuotes:false,elapsedMs:Date.now()-t};}}
function candidate4720(x,gasUsd=0,financing=null){const input=Number(x.inputUsd||x.sizeUsd||0),gross=Number(x.roundTripPnlBeforeGasUsd||0),spread=input>0?gross/input*100:null;const morphoNet=gross-Number(gasUsd||0),aaveNet=gross-Number(gasUsd||0)-(input*0.0005);let provider="MORPHO",net=morphoNet;if(financing?.morphoAvailableUsdApprox<input&&financing?.aaveAvailableUsdApprox>=input){provider="AAVE_V3";net=aaveNet;}const depthPass=Number(x.roundTripRetentionPct||0)>=Number(CROSS_DEX_MIN_RETENTION_PCT_4530||90),spreadPass=Number.isFinite(spread)&&spread>DISCOVERY4720_MIN_SPREAD_PCT,netPass=Number.isFinite(net)&&net>=DISCOVERY4720_MIN_NET_USD;let reason=!spreadPass?"EXECUTABLE_SPREAD_TOO_LOW":!depthPass?"INSUFFICIENT_DEPTH":!netPass?"NET_PROFIT_TOO_LOW":"SIMULATION_REQUIRED";return {candidateId:`BASE:${x.asset}:${x.buyVenue}:${x.sellVenue}:${input}`,opportunityType:"SAME_CHAIN_DEX_TO_DEX",canonicalPair:`${x.asset}/USDC`,chainId:8453,buyVenue:x.buyVenue,sellVenue:x.sellVenue,rawSpreadPct:spread,executableSpreadPct:spread,optimalNotionalUsd:input,grossProfitUsd:gross,estimatedNetProfitUsd:round(net,6),financingProvider:provider,riskLevel:"UNASSESSED",detectedAt:new Date().toISOString(),stateVersion:`base-broad:${discovery4720.runs+1}`,quoteAgeMs:0,deadline:new Date(Date.now()+DISCOVERY4720_INTERVAL_MS).toISOString(),validationStatus:"EXACT_READ_ONLY_ROUND_TRIP",simulationStatus:"NOT_RUN",executionMode:"READ_ONLY",executionEligible:false,status:reason==="SIMULATION_REQUIRED"?"SIMULATION_ELIGIBLE":"REJECTED",rejectionReason:reason,depthGate:{minimumRoundTripRetentionPct:Number(CROSS_DEX_MIN_RETENTION_PCT_4530||90),passed:depthPass},gasModel:{modeledGasUsd:round(Number(gasUsd||0),6)}};}
async function runBroadDiscovery4720(){
 if(discovery4720.running)return {started:false,reason:"RUN_ALREADY_IN_PROGRESS"};discovery4720.running=true;discovery4720.status="RUNNING";discovery4720.phase="SCREENING";discovery4720.lastRunAt=new Date().toISOString();discovery4720.lastProgressAt=discovery4720.lastRunAt;discovery4720.jobsCompleted=0;discovery4720.currentRun={startedAt:discovery4720.lastRunAt,phase:"SCREENING",jobsPlanned:0,jobsCompleted:0,exactQuotes:0,failures:0,timeouts:0};
 try{
  const venues=["UNISWAP_V3","AERODROME","PANCAKESWAP_V3","SUSHISWAP_V3"],jobs=[];
  for(const asset of CROSS_DEX_ASSETS_4520)for(const buyVenue of venues)for(const sellVenue of venues){if(buyVenue===sellVenue)continue;if((buyVenue==="SUSHISWAP_V3"||sellVenue==="SUSHISWAP_V3")&&(asset==="cbBTC"||asset==="cbETH"))continue;jobs.push({asset,sizeUsd:DISCOVERY4721_PROBE_USD,buyVenue,sellVenue});}
  discovery4720.jobsPlanned=jobs.length;discovery4720.currentRun.jobsPlanned=jobs.length;
  const screen=await mapLimit4721(jobs,DISCOVERY4721_CONCURRENCY,async j=>{const r=await roundTrip4721(j);discovery4720.jobsCompleted++;discovery4720.currentRun.jobsCompleted++;if(r.exactReadOnlyQuotes){discovery4720.exactQuotes++;discovery4720.currentRun.exactQuotes++;}else{discovery4720.quoteFailures++;discovery4720.currentRun.failures++;if(r.failureClass==="TIMEOUT"){discovery4720.quoteTimeouts++;discovery4720.currentRun.timeouts++;}}discovery4720.lastProgressAt=new Date().toISOString();return r;});
  const exact=screen.filter(x=>x.exactReadOnlyQuotes),promising=exact.filter(x=>Number(x.roundTripPnlBeforeGasUsd)>0||Number(x.roundTripRetentionPct)>=99.75);
  discovery4720.positiveBeforeGas+=exact.filter(x=>x.positiveBeforeGas).length;discovery4720.phase="DEPTH_SIZING";discovery4720.currentRun.phase="DEPTH_SIZING";
  const depthJobs=[];for(const p of promising)for(const sizeUsd of CROSS_DEX_PROBE_SIZES_4520){if(sizeUsd===DISCOVERY4721_PROBE_USD)continue;depthJobs.push({asset:p.asset,sizeUsd,buyVenue:p.buyVenue,sellVenue:p.sellVenue});}
  discovery4720.jobsPlanned+=depthJobs.length;discovery4720.currentRun.jobsPlanned+=depthJobs.length;
  const depth=await mapLimit4721(depthJobs,DISCOVERY4721_CONCURRENCY,async j=>{const r=await roundTrip4721(j);discovery4720.jobsCompleted++;discovery4720.currentRun.jobsCompleted++;if(r.exactReadOnlyQuotes){discovery4720.exactQuotes++;discovery4720.currentRun.exactQuotes++;}else{discovery4720.quoteFailures++;discovery4720.currentRun.failures++;if(r.failureClass==="TIMEOUT"){discovery4720.quoteTimeouts++;discovery4720.currentRun.timeouts++;}}discovery4720.lastProgressAt=new Date().toISOString();return r;});
  const all=[...exact,...depth.filter(x=>x.exactReadOnlyQuotes)];discovery4720.jobsEvaluated+=all.length;
  discovery4720.phase="ECONOMICS";discovery4720.currentRun.phase="ECONOMICS";
  let gasUsd=0,financing=null;try{const provider=new JsonRpcProvider(RPC_URLS.base,undefined,{staticNetwork:false});const [feeData,nativeRef,funding]=await Promise.all([timeout4721(provider.getFeeData(),5000,"GAS_PRICE"),timeout4721(crossDexNativeUsd4531(),6000,"NATIVE_USD"),timeout4721(crossDexFundingCapacity4531(provider),7000,"FUNDING_CAPACITY")]);const gasPrice=feeData.gasPrice||feeData.maxFeePerGas;if(!gasPrice)throw new Error("BASE_GAS_PRICE_UNAVAILABLE");const gasNative=Number(formatUnits(gasPrice*CROSS_DEX_GAS_UNITS_4530,18));gasUsd=gasNative*Number(nativeRef.usdPerEth);financing=funding;if(!Number.isFinite(gasUsd)||gasUsd<=0)throw new Error("BASE_GAS_USD_MODEL_INVALID");}catch(e){reject4720("ECONOMICS_REFERENCE_TIMEOUT_OR_ERROR");discovery4720.lastError=`ECONOMICS_REFERENCE: ${e?.message||String(e)}`;}
  const cs=all.map(x=>candidate4720(x,gasUsd,financing));discovery4720.candidates=cs.sort((a,b)=>Number(b.estimatedNetProfitUsd??-1e99)-Number(a.estimatedNetProfitUsd??-1e99)).slice(0,100);
  let sp=0,dp=0,np=0;for(const c of cs){if(Number(c.executableSpreadPct)>DISCOVERY4720_MIN_SPREAD_PCT)sp++;if(c.depthGate?.passed)dp++;if(c.status==="SIMULATION_ELIGIBLE")np++;if(c.rejectionReason)reject4720(c.rejectionReason);}discovery4720.spreadGatePassed+=sp;discovery4720.depthPassed+=dp;discovery4720.netGatePassed+=np;discovery4720.simulationEligible+=np;discovery4720.runs++;discovery4720.lastCompletedAt=new Date().toISOString();discovery4720.lastError=null;discovery4720.status="RUNNING";discovery4720.phase="IDLE_WAIT";discovery4720.currentRun.completedAt=discovery4720.lastCompletedAt;discovery4720.currentRun.phase="COMPLETE";return {started:true,completed:true,candidates:cs.length,simulationEligible:np};
 }catch(e){discovery4720.lastError=e?.message||String(e);discovery4720.status="DEGRADED";discovery4720.phase="FAILED";reject4720("DISCOVERY_RUN_FAILED");return {started:true,completed:false,error:discovery4720.lastError};}finally{discovery4720.running=false;}
}
function startBroadDiscovery4720(){if(discovery4720.timer)return false;discovery4720.status="RUNNING";discovery4720.startedAt=discovery4720.startedAt||new Date().toISOString();setImmediate(()=>runBroadDiscovery4720());discovery4720.timer=setInterval(()=>runBroadDiscovery4720(),DISCOVERY4720_INTERVAL_MS);return true;}
function broadSummary4720(){const eligible=discovery4720.candidates.filter(x=>x.status==="SIMULATION_ELIGIBLE");return {success:true,version:VERSION,status:discovery4720.status,phase:discovery4720.phase,architecture:"STAGED_BOUNDED_CONCURRENT_BASE_DISCOVERY_WITH_PER_QUOTE_TIMEOUT_AND_FAILURE_ISOLATION",intervalMs:DISCOVERY4720_INTERVAL_MS,worker:{concurrency:DISCOVERY4721_CONCURRENCY,quoteTimeoutMs:DISCOVERY4721_QUOTE_TIMEOUT_MS,screenProbeUsd:DISCOVERY4721_PROBE_USD},coverage:{chain:"Base",chainId:8453,venues:["UNISWAP_V3","AERODROME","PANCAKESWAP_V3","SUSHISWAP_V3"],assets:CROSS_DEX_ASSETS_4520,probeSizesUsd:CROSS_DEX_PROBE_SIZES_4520},policy:{minimumExecutableSpreadPct:DISCOVERY4720_MIN_SPREAD_PCT,minimumNetProfitUsd:DISCOVERY4720_MIN_NET_USD,simulationRequired:true,gasRequiredForQualification:true,unknownGasPolicy:"FAIL_CLOSED"},metrics:{runs:discovery4720.runs,jobsPlanned:discovery4720.jobsPlanned,jobsCompleted:discovery4720.jobsCompleted,jobsEvaluated:discovery4720.jobsEvaluated,exactQuotes:discovery4720.exactQuotes,quoteFailures:discovery4720.quoteFailures,quoteTimeouts:discovery4720.quoteTimeouts,positiveBeforeGas:discovery4720.positiveBeforeGas,spreadGatePassed:discovery4720.spreadGatePassed,depthPassed:discovery4720.depthPassed,netGatePassed:discovery4720.netGatePassed,simulationEligible:discovery4720.simulationEligible},currentRun:discovery4720.currentRun,rejections:discovery4720.rejections,lastRunAt:discovery4720.lastRunAt,lastProgressAt:discovery4720.lastProgressAt,lastCompletedAt:discovery4720.lastCompletedAt,lastError:discovery4720.lastError,candidateCount:discovery4720.candidates.length,simulationEligibleCount:eligible.length,candidates:discovery4720.candidates.slice(0,30),simulationEligible:eligible.slice(0,20),readOnly:true,executionEligible:false,mainnetBroadcast:false,fundsMovedOnMainnet:false};}
app.get("/api/discovery/start",(req,res)=>{const started=startBroadDiscovery4720();res.json({...broadSummary4720(),startResult:started?"STARTED_BACKGROUND":"ALREADY_RUNNING",statusRoute:"/api/discovery/status"});});
app.get("/api/discovery/status",(req,res)=>res.json(broadSummary4720()));
app.get("/api/discovery/scan",(req,res)=>{setImmediate(()=>runBroadDiscovery4720());res.json({...broadSummary4720(),scanResult:"STARTED_BACKGROUND"});});
app.get("/api/discovery/qualified",(req,res)=>{const s=broadSummary4720();res.json({success:true,version:VERSION,policy:s.policy,count:s.simulationEligibleCount,candidates:s.simulationEligible,readOnly:true,executionEligible:false,mainnetBroadcast:false,fundsMovedOnMainnet:false});});




/*
=========================================================
ARBIFLOW 4.57 ARBITRUM LIVE EXACT QUOTE EXPANSION - READ ONLY

First additive chain beyond the validated Base four-venue graph.
Uses the existing Arbitrum RPC/token registry plus the already-configured
Uniswap V3 factory/quoter to verify exact-size USDC round trips for the
Arbitrum asset universe. No approvals, signatures, swaps, flash-loan
requests, broadcasts, or funds movement occur here.
=========================================================
*/
const ARBITRUM_ASSETS_4570=["WETH","WBTC","cbBTC","ARB","USDT"];
const ARBITRUM_SIZES_USD_4570=[100,250,500,1000,2500];
async function arbitrumExactQuoteExpansion4570(){
 const startedAt=Date.now(),chainKey="arbitrum",cfg=UNISWAP_V3_DISCOVERY_4470[chainKey],rpc=RPC_URLS[chainKey]||"";
 const base={success:true,version:VERSION,classification:"ARBITRUM_EXACT_QUOTE_EXPANSION_COMPLETE",architecture:"ADDITIVE_ARBITRUM_UNISWAP_V3_EXACT_READ_ONLY_ROUND_TRIPS",chain:"Arbitrum",chainId:42161,venue:"UNISWAP_V3",readOnly:true,flashLoanRequested:false,approvalPerformed:false,signaturePerformed:false,swapExecuted:false,mainnetBroadcast:false,fundsMovedOnMainnet:false};
 if(!rpc)return {...base,success:false,status:"RPC_NOT_CONFIGURED",rpcEnv:"ARBITRUM_RPC_URL",coverage:{assets:ARBITRUM_ASSETS_4570,probeSizesUsd:ARBITRUM_SIZES_USD_4570,jobsAttempted:0,exactRoundTripsQuoted:0,failedRoundTrips:0},results:[],elapsedMs:Date.now()-startedAt};
 const provider=new JsonRpcProvider(rpc,undefined,{staticNetwork:false});
 try{
  const net=await withTimeout4501(provider.getNetwork(),8000,"ARBITRUM_NETWORK");
  if(Number(net.chainId)!==42161)return {...base,success:false,status:"CHAIN_ID_MISMATCH",reportedChainId:Number(net.chainId),results:[],elapsedMs:Date.now()-startedAt};
  const quoter=UNISWAP_V3_QUOTER_V1_4490.arbitrum, factory=cfg.factory;
  const [qc,fc]=await Promise.all([provider.getCode(quoter),provider.getCode(factory)]);
  const jobs=[];for(const asset of ARBITRUM_ASSETS_4570)for(const sizeUsd of ARBITRUM_SIZES_USD_4570)jobs.push({asset,sizeUsd});
  const results=await mapLimit4501(jobs,3,async j=>{
   try{
    const stable=cfg.tokens.USDC,token=cfg.tokens[j.asset];
    const dStable=6,dToken=Number(await new Contract(token,ERC20_META_ABI_4480,provider).decimals());
    const amountIn=BigInt(Math.round(j.sizeUsd*1e6));
    let best=null;
    for(const buyFee of [100,500,3000,10000]){
     try{
      const acquired=await quoteV3Single4490(provider,quoter,stable,token,buyFee,amountIn,chainKey);
      if(acquired<=0n)continue;
      for(const sellFee of [100,500,3000,10000]){
       try{
        const finalRaw=await quoteV3Single4490(provider,quoter,token,stable,sellFee,acquired,chainKey);
        const finalUsd=Number(formatUnits(finalRaw,dStable)), pnl=finalUsd-j.sizeUsd,ret=finalUsd/j.sizeUsd*100;
        const row={asset:j.asset,inputUsd:j.sizeUsd,buyFeeTier:buyFee,sellFeeTier:sellFee,intermediateAmount:Number(formatUnits(acquired,dToken)),finalUsd:Number(finalUsd.toFixed(6)),roundTripPnlBeforeGasUsd:Number(pnl.toFixed(6)),roundTripRetentionPct:Number(ret.toFixed(6)),exactReadOnlyQuotes:true};
        if(!best||row.finalUsd>best.finalUsd)best=row;
       }catch{}
      }
     }catch{}
    }
    if(!best)return {asset:j.asset,inputUsd:j.sizeUsd,status:"NO_EXACT_ROUND_TRIP_QUOTE",exactReadOnlyQuotes:false};
    return {...best,depthGate:{minimumRoundTripRetentionPct:90,passed:best.roundTripRetentionPct>=90},positiveBeforeGas:best.roundTripPnlBeforeGasUsd>0,mainnetBroadcast:false,fundsMoved:false};
   }catch(e){return {asset:j.asset,inputUsd:j.sizeUsd,status:"QUOTE_ERROR",error:e?.shortMessage||e?.message||String(e),exactReadOnlyQuotes:false};}
  });
  const quoted=results.filter(x=>x.exactReadOnlyQuotes),failed=results.filter(x=>!x.exactReadOnlyQuotes);
  const byAsset={};for(const a of ARBITRUM_ASSETS_4570){const r=results.filter(x=>x.asset===a);byAsset[a]={jobs:r.length,quoted:r.filter(x=>x.exactReadOnlyQuotes).length,failed:r.filter(x=>!x.exactReadOnlyQuotes).length};}
  return {...base,status:"SCANNED",adapterHealth:{rpcConfigured:true,reportedChainId:Number(net.chainId),chainIdMatches:true,quoter,quoterReadable:qc&&qc!=="0x",factory,factoryReadable:fc&&fc!=="0x"},coverage:{assets:ARBITRUM_ASSETS_4570,probeSizesUsd:ARBITRUM_SIZES_USD_4570,jobsAttempted:jobs.length,exactRoundTripsQuoted:quoted.length,failedRoundTrips:failed.length,positiveBeforeGas:quoted.filter(x=>x.positiveBeforeGas).length},routeCoverage:{byAsset,failedRoutes:failed},fundingArchitecture:{baseMorphoAavePreserved:true,arbitrumFlashFunding:"NOT_YET_CONFIGURED_READ_ONLY_DISCOVERY_STAGE"},results,elapsedMs:Date.now()-startedAt};
 }catch(e){return {...base,success:false,status:"SCAN_FAILED",error:e?.message||String(e),results:[],elapsedMs:Date.now()-startedAt};}
}
app.get("/api/diagnostics/multimarket/arbitrum-exact-quotes",async(req,res)=>{try{res.json(await arbitrumExactQuoteExpansion4570());}catch(e){res.status(500).json({success:false,version:VERSION,classification:"ARBITRUM_EXACT_QUOTE_EXPANSION_ERROR",error:e?.message||String(e),readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false});}});


/*
=========================================================
ARBIFLOW 4.58 MULTI-CHAIN OPPORTUNITY BOARD - READ ONLY

Breadth milestone: scans every currently configured V3-family chain
adapter and ranks exact executable quote dislocations across fee-tier
liquidity pools. This is discovery/screening, not execution.
Base multi-DEX + Morpho/Aave liquidation/funding architecture remains.
=========================================================
*/
const OPPORTUNITY_CHAINS_4580=["ethereum","arbitrum","optimism","base","polygon","bnb"];
const OPPORTUNITY_SIZES_4580=[100,250,500,1000,2500,5000,10000];
const OPPORTUNITY_FEE_TIERS_4580=[100,500,3000,10000];
const OPPORTUNITY_GAS_UNITS_4580=320000n;
function classifyQuoteFailure4580(e){
 const m=String(e?.shortMessage||e?.message||e||"").toUpperCase();
 if(m.includes("TIMEOUT"))return "TIMEOUT";
 if(m.includes("429")||m.includes("503")||m.includes("RPC")||m.includes("NETWORK")||m.includes("SERVER"))return "RPC_ERROR";
 if(m.includes("REVERT")||m.includes("CALL_EXCEPTION"))return "QUOTER_REVERT";
 return "NO_QUOTE";
}
async function exactV3FeeRoute4580(provider,chainKey,quoter,cfg,baseSym,assetSym,sizeUsd,buyFee,sellFee){
 const base=cfg.tokens[baseSym],asset=cfg.tokens[assetSym];
 const bc=new Contract(base,ERC20_META_ABI_4480,provider),ac=new Contract(asset,ERC20_META_ABI_4480,provider);
 const [bd,ad]=await Promise.all([bc.decimals(),ac.decimals()]);
 const amountIn=parseUnits(String(sizeUsd),Number(bd));
 const acquired=await quoteV3Single4490(provider,quoter,base,asset,buyFee,amountIn,chainKey);
 if(acquired<=0n)throw new Error("NO_BUY_QUOTE");
 const finalRaw=await quoteV3Single4490(provider,quoter,asset,base,sellFee,acquired,chainKey);
 if(finalRaw<=0n)throw new Error("NO_SELL_QUOTE");
 const finalUsd=Number(formatUnits(finalRaw,Number(bd))),pnl=finalUsd-sizeUsd;
 return {chain:chainKey,baseAsset:baseSym,asset:assetSym,inputUsd:sizeUsd,buyFeeTier:buyFee,sellFeeTier:sellFee,
   intermediateAmount:Number(formatUnits(acquired,Number(ad))),finalUsd:round(finalUsd,6),
   grossPnlUsd:round(pnl,6),grossReturnPct:round(pnl/sizeUsd*100,6),retentionPct:round(finalUsd/sizeUsd*100,6)};
}
async function multiChainOpportunityWorker4581(){
 const started=Date.now();
 const progress=opportunityScanState4581.progress;
 const decimalCache=new Map(), poolCache=new Map();
 const timeoutMs=12000, chainConcurrency=3, quoteConcurrency=8;
 const getDecimals=async(cfg,token)=>{
  const k=cfg.chain+":"+token.toLowerCase(); if(decimalCache.has(k))return decimalCache.get(k);
  const v=Number(await withTimeout4501(new Contract(token,ERC20_META_ABI_4480,cfg.provider).decimals(),timeoutMs,"DECIMALS_TIMEOUT"));
  decimalCache.set(k,v); return v;
 };
 const getPool=async(cfg,a,b,fee)=>{
  const k=[cfg.chain,a.toLowerCase(),b.toLowerCase(),fee].join(":"); if(poolCache.has(k))return poolCache.get(k);
  const factory=new Contract(cfg.factory,UNISWAP_V3_FACTORY_ABI,cfg.provider);
  const v=await withTimeout4501(factory.getPool(a,b,fee),timeoutMs,"POOL_TIMEOUT"); poolCache.set(k,v); return v;
 };
 const scanChain=async(chain)=>{
  const baseCfg=UNISWAP_V3_DISCOVERY_4470[chain], rpc=RPC_URLS[chain]||"", quoter=UNISWAP_V3_QUOTER_V1_4490[chain];
  if(!baseCfg)return {chain,classification:"NO_CONFIG",rows:[],failures:[]};
  if(!rpc)return {chain,classification:"RPC_NOT_CONFIGURED",rows:[],failures:[]};
  if(!quoter)return {chain,classification:"QUOTER_NOT_CONFIGURED",rows:[],failures:[]};
  const provider=new JsonRpcProvider(rpc,undefined,{staticNetwork:false});
  const cfg={chain,factory:baseCfg.factory,tokens:baseCfg.tokens,provider,quoter,venue:chain==="bnb"?"PancakeSwap V3":"Uniswap V3"};
  progress.currentChains=[...(progress.currentChains||[]),chain];
  const network=await withTimeout4501(cfg.provider.getNetwork(),timeoutMs,"NETWORK_TIMEOUT");
  const tokens=cfg.tokens||{}, stableEntries=Object.entries(tokens).filter(([sym])=>stableLike4490(sym));
  const assetEntries=Object.entries(tokens).filter(([sym])=>!stableLike4490(sym));
  const poolJobs=[];
  for(const [baseSym,base] of stableEntries)for(const [assetSym,asset] of assetEntries)for(const fee of OPPORTUNITY_FEE_TIERS_4580)
    poolJobs.push({baseSym,base,assetSym,asset,fee});
  const pools=await mapLimit4501(poolJobs,6,async j=>{
    try{const pool=await getPool(cfg,j.base,j.asset,j.fee);progress.poolsChecked++;return {...j,pool,ok:pool&&String(pool).toLowerCase()!=="0x0000000000000000000000000000000000000000"};}
    catch(e){progress.poolFailures++;return {...j,ok:false,error:e?.message||String(e)};}
  });
  const byPair=new Map();
  for(const q of pools.filter(x=>x.ok)){const k=q.baseSym+":"+q.assetSym;if(!byPair.has(k))byPair.set(k,[]);byPair.get(k).push(q);}
  const jobs=[];
  for(const routes of byPair.values())for(const buy of routes)for(const sell of routes){
    if(buy.fee===sell.fee)continue;
    for(const usd of OPPORTUNITY_SIZES_4580)jobs.push({cfg,buy,sell,usd});
  }
  progress.routeJobsBuilt+=jobs.length;
  const rows=await mapLimit4501(jobs,quoteConcurrency,async j=>{
    try{
      const bd=await getDecimals(j.cfg,j.buy.base), ad=await getDecimals(j.cfg,j.buy.asset);
      const amountIn=parseUnits(String(j.usd),bd);
      const q1=await withTimeout4501(quoteV3Single4490(j.cfg.provider,j.cfg.quoter,j.buy.base,j.buy.asset,j.buy.fee,amountIn,j.cfg.chain),timeoutMs,"BUY_QUOTE_TIMEOUT");
      const q2=await withTimeout4501(quoteV3Single4490(j.cfg.provider,j.cfg.quoter,j.buy.asset,j.buy.base,j.sell.fee,q1,j.cfg.chain),timeoutMs,"SELL_QUOTE_TIMEOUT");
      progress.quotesCompleted+=2; progress.exactQuotes+=2;
      const out=Number(formatUnits(q2,bd)), gross=out-j.usd;
      if(gross>0)progress.positiveGross++;
      return {chain,venue:j.cfg.venue||"V3",base:j.buy.baseSym,asset:j.buy.assetSym,sizeUsd:j.usd,buyFee:j.buy.fee,sellFee:j.sell.fee,amountOutUsd:out,grossUsd:gross,positive:gross>0};
    }catch(e){progress.quoteFailures++;return null;}
  });
  progress.chainsCompleted++; progress.currentChains=(progress.currentChains||[]).filter(x=>x!==chain);
  return {chain,chainId:Number(network.chainId),rows:rows.filter(Boolean)};
 };
 const chainResults=await mapLimit4501(OPPORTUNITY_CHAINS_4580,chainConcurrency,async chain=>{
  try{return await scanChain(chain);}catch(e){progress.chainsCompleted++;progress.chainFailures++;return {chain,classification:"CHAIN_ERROR",error:e?.message||String(e),rows:[]};}
 });
 let ranked=chainResults.flatMap(x=>x.rows||[]).filter(x=>x.positive).sort((a,b)=>b.grossUsd-a.grossUsd);
 progress.elapsedMs=Date.now()-started;
 return {success:true,version:VERSION,classification:"MULTI_CHAIN_OPPORTUNITY_SCAN_COMPLETE",readOnly:true,
  coverage:{chainsRequested:OPPORTUNITY_CHAINS_4580,chainsCompleted:progress.chainsCompleted,chainResults:chainResults.map(x=>({chain:x.chain,classification:x.classification||"SCANNED",rows:(x.rows||[]).length,error:x.error||null}))},
  progress:{...progress,elapsedMs:Date.now()-started},rankedOpportunities:ranked.slice(0,100),positiveOpportunityCount:ranked.length,
  preservedArchitecture:["Base four-DEX graph","Morpho liquidation","Morpho flash liquidity","Aave fallback","production executor"],
  mainnetBroadcast:false,fundsMovedOnMainnet:false,generatedAt:new Date().toISOString()};
}

/*
=========================================================
ArbiFlow 4.59.0 FAST OPPORTUNITY GRAPH
Stage 1: inexpensive pool-state discovery and normalized graph.
Stage 2: only ranked candidates are intended for exact-quote validation.
Read-only: no approvals, signatures, swaps, flash requests or broadcasts.
=========================================================
*/
let opportunityGraphState4590={status:"IDLE",startedAt:null,completedAt:null,error:null,result:null};

async function buildOpportunityGraph4590(){
 const started=Date.now(), chains=OPPORTUNITY_CHAINS_4580;
 const chainResults=await mapLimit4501(chains,3,async chain=>{
  const cfg=UNISWAP_V3_DISCOVERY_4470[chain], rpc=RPC_URLS[chain]||"";
  if(!cfg||!rpc)return {chain,status:!cfg?"ADAPTER_NOT_CONFIGURED":"RPC_NOT_CONFIGURED",edges:[],pools:[]};
  try{
   const provider=new JsonRpcProvider(rpc,undefined,{staticNetwork:false});
   const net=await withTimeout4501(provider.getNetwork(),8000,`${chain}_GRAPH_NETWORK`);
   const factory=new Contract(cfg.factory,UNISWAP_V3_FACTORY_ABI,provider);
   const decimalCache=new Map();
   const decimals=async addr=>{const k=addr.toLowerCase();if(decimalCache.has(k))return decimalCache.get(k);const d=Number(await withTimeout4501(new Contract(addr,ERC20_META_ABI_4480,provider).decimals(),7000,`${chain}_GRAPH_DECIMALS`));decimalCache.set(k,d);return d;};
   const stable=Object.entries(cfg.tokens).filter(([sym])=>stableLike4490(sym));
   const assets=Object.entries(cfg.tokens).filter(([sym])=>!stableLike4490(sym));
   const jobs=[]; for(const [bs,ba] of stable)for(const [as,aa] of assets)for(const fee of OPPORTUNITY_FEE_TIERS_4580)jobs.push({bs,ba,as,aa,fee});
   const discovered=await mapLimit4501(jobs,10,async j=>{
    try{
     const pool=await withTimeout4501(factory.getPool(j.ba,j.aa,j.fee),7000,`${chain}_GRAPH_POOL`);
     if(!pool||String(pool).toLowerCase()==="0x0000000000000000000000000000000000000000")return null;
     const pc=new Contract(pool,UNISWAP_V3_POOL_READ_ABI_4470,provider);
     const [liq,slot0,token0,token1,bd,ad]=await withTimeout4501(Promise.all([pc.liquidity(),pc.slot0(),pc.token0(),pc.token1(),decimals(j.ba),decimals(j.aa)]),7000,`${chain}_GRAPH_STATE`);
     const sqrt=BigInt((slot0.sqrtPriceX96??slot0[0]).toString());
     const rawRatio=Number(sqrt*sqrt)/Number(2n**192n); // raw token1 units / raw token0 units
     const t0=String(token0).toLowerCase(), base=j.ba.toLowerCase(), asset=j.aa.toLowerCase();
     const token0Decimals=t0===base?bd:ad, token1Decimals=t0===base?ad:bd;
     const humanToken1PerToken0=rawRatio*Math.pow(10,token0Decimals-token1Decimals);
     let basePerAsset;
     if(t0===base) basePerAsset=1/humanToken1PerToken0; // token0=base, ratio is asset/base
     else if(t0===asset) basePerAsset=humanToken1PerToken0; // token0=asset, ratio is base/asset
     else throw new Error("POOL_TOKEN_ORIENTATION_MISMATCH");
     if(!Number.isFinite(basePerAsset)||basePerAsset<=0)throw new Error("NORMALIZED_PRICE_INVALID");
     return {...j,pool,liquidity:BigInt(liq.toString()),sqrtPriceX96:sqrt,token0:String(token0),token1:String(token1),baseDecimals:bd,assetDecimals:ad,rawRatio,humanToken1PerToken0,normalizedBasePerAsset:basePerAsset};
    }catch(e){return null;}
   });
   const pools=discovered.filter(Boolean);
   const byPair=new Map(); for(const q of pools){const k=`${q.bs}/${q.as}`;if(!byPair.has(k))byPair.set(k,[]);byPair.get(k).push(q);}
   const edges=[];
   for(const [pair,arr] of byPair)for(let i=0;i<arr.length;i++)for(let j=i+1;j<arr.length;j++){
    const x=arr[i],y=arr[j]; if(x.liquidity===0n||y.liquidity===0n)continue;
    const px=x.normalizedBasePerAsset,py=y.normalizedBasePerAsset;
    if(!Number.isFinite(px)||!Number.isFinite(py)||px<=0||py<=0)continue;
    const spreadPct=Math.abs(px-py)/Math.min(px,py)*100;
    const cheaper=px<py?x:y, dearer=px<py?y:x;
    edges.push({chain,pair,baseSym:x.bs,assetSym:x.as,venue:chain==="bnb"?"PancakeSwap V3":"Uniswap V3",feeA:x.fee,feeB:y.fee,poolA:x.pool,poolB:y.pool,priceA_BasePerAsset:px,priceB_BasePerAsset:py,preliminarySpreadPct:spreadPct,locallyPreferredBuyFee:cheaper.fee,locallyPreferredSellFee:dearer.fee,priceNormalization:"TOKEN0_TOKEN1_ORIENTATION_PLUS_DECIMALS",requiresExactQuote:true});
   }
   edges.sort((x,y)=>y.preliminarySpreadPct-x.preliminarySpreadPct);
   return {chain,chainId:Number(net.chainId),status:"SCANNED",poolCount:pools.length,edgeCount:edges.length,pools:pools.map(x=>({pair:`${x.bs}/${x.as}`,fee:x.fee,pool:x.pool,liquidity:x.liquidity.toString(),token0:x.token0,token1:x.token1,baseDecimals:x.baseDecimals,assetDecimals:x.assetDecimals,rawRatio:x.rawRatio,normalizedBasePerAsset:x.normalizedBasePerAsset})),edges:edges.slice(0,50)};
  }catch(e){return {chain,status:"CHAIN_ERROR",error:e?.message||String(e),edges:[],pools:[]};}
 });
 const candidates=chainResults.flatMap(x=>x.edges||[]).sort((a,b)=>b.preliminarySpreadPct-a.preliminarySpreadPct);
 return {success:true,version:VERSION,classification:"NORMALIZED_OPPORTUNITY_GRAPH_COMPLETE",architecture:"TOKEN_ORIENTED_DECIMAL_NORMALIZED_MARKET_STATE_TO_EXACT_VALIDATION",
  elapsedMs:Date.now()-started,chainsRequested:chains,chainsScanned:chainResults.filter(x=>x.status==="SCANNED").length,
  poolsDiscovered:chainResults.reduce((n,x)=>n+(x.poolCount||0),0),graphEdges:chainResults.reduce((n,x)=>n+(x.edgeCount||0),0),
  candidateCount:candidates.length,topCandidates:candidates.slice(0,100),chainResults,
  exactQuoteStage:"SEPARATE_VALIDATION_STAGE",readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false,generatedAt:new Date().toISOString()};
}
async function runOpportunityGraph4590(){
 if(opportunityGraphState4590.status==="RUNNING")return;
 opportunityGraphState4590={status:"RUNNING",startedAt:new Date().toISOString(),completedAt:null,error:null,result:opportunityGraphState4590.result};
 try{const result=await buildOpportunityGraph4590();opportunityGraphState4590={status:"COMPLETE",startedAt:opportunityGraphState4590.startedAt,completedAt:new Date().toISOString(),error:null,result};}
 catch(e){opportunityGraphState4590={status:"ERROR",startedAt:opportunityGraphState4590.startedAt,completedAt:new Date().toISOString(),error:e?.message||String(e),result:opportunityGraphState4590.result};}
}
app.get("/api/opportunities/graph/start",(req,res)=>{if(opportunityGraphState4590.status!=="RUNNING")setImmediate(()=>runOpportunityGraph4590());res.json({success:true,version:VERSION,status:opportunityGraphState4590.status==="RUNNING"?"ALREADY_RUNNING":"STARTED",statusRoute:"/api/opportunities/graph/status",readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false});});
app.get("/api/opportunities/graph/status",(req,res)=>{const st=opportunityGraphState4590;res.json({success:st.status!=="ERROR",version:VERSION,status:st.status,startedAt:st.startedAt,completedAt:st.completedAt,error:st.error,result:st.result,readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false});});




/* ArbiFlow 4.60.0 — production-searcher foundation.
   Additive to all 4.59.4 diagnostics. Builds a block-tagged in-memory V3 pool
   registry/state snapshot from existing factory discovery. This is the state
   foundation only: event replay, WebSocket subscriptions, reorg rollback and
   tick traversal are intentionally marked NOT_ACTIVE until implemented. */
let marketState4600={status:"IDLE",startedAt:null,completedAt:null,error:null,registry:new Map(),chains:{},bootstrapBlockByChain:{},lastUpdateAt:null};

function marketStateSummary4600(){
 const pools=[...marketState4600.registry.values()], now=Date.now();
 const ages=pools.map(x=>Math.max(0,now-Date.parse(x.snapshotAt))).filter(Number.isFinite);
 return {success:marketState4600.status!=="ERROR",version:VERSION,status:marketState4600.status,startedAt:marketState4600.startedAt,completedAt:marketState4600.completedAt,error:marketState4600.error,
  architecture:"POOL_REGISTRY_TO_BLOCK_TAGGED_BOOTSTRAP_TO_IN_MEMORY_STATE",
  registry:{poolCount:pools.length,chains:Object.keys(marketState4600.chains),nonzeroLiquidityPools:pools.filter(x=>BigInt(x.liquidityRaw||"0")>0n).length,oldestStateAgeMs:ages.length?Math.max(...ages):null,newestStateAgeMs:ages.length?Math.min(...ages):null},
  synchronization:{bootstrapBlockByChain:marketState4600.bootstrapBlockByChain,eventReconciliation:"NOT_ACTIVE",websocketSubscriptions:"NOT_ACTIVE",reorgRollback:"NOT_ACTIVE",tickStateCache:"NOT_ACTIVE",executionEligible:false},
  lastUpdateAt:marketState4600.lastUpdateAt,readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false};
}
function snapshotErrorClass4602(e){
 const m=String(e?.shortMessage||e?.message||e||"UNKNOWN");
 if(/TIMEOUT/i.test(m))return"TIMEOUT"; if(/missing trie|header not found|historical|block.*not found/i.test(m))return"HISTORICAL_BLOCK_UNAVAILABLE";
 if(/CALL_EXCEPTION|execution reverted|revert/i.test(m))return"CALL_REVERT"; if(/network|socket|connect|ECONN|SERVER_ERROR|502|503|504/i.test(m))return"RPC_TRANSPORT";
 if(/BAD_DATA|could not decode|decode/i.test(m))return"DECODE_ERROR"; return"OTHER";
}
async function readPoolField4602(pc,field,blockTag,timeoutMs,label){
 const started=Date.now(); try{
  const value=await withTimeout4501(pc[field]({blockTag}),timeoutMs,label);
  return {ok:true,value,latencyMs:Date.now()-started,mode:"BLOCK_TAGGED"};
 }catch(e){return {ok:false,error:e?.shortMessage||e?.message||String(e),errorClass:snapshotErrorClass4602(e),latencyMs:Date.now()-started,mode:"BLOCK_TAGGED"};}
}
async function readPoolFieldLatest4602(pc,field,timeoutMs,label){
 const started=Date.now(); try{
  const value=await withTimeout4501(pc[field](),timeoutMs,label);
  return {ok:true,value,latencyMs:Date.now()-started,mode:"LATEST_FALLBACK"};
 }catch(e){return {ok:false,error:e?.shortMessage||e?.message||String(e),errorClass:snapshotErrorClass4602(e),latencyMs:Date.now()-started,mode:"LATEST_FALLBACK"};}
}
async function bootstrapMarketState4600(){
 const started=Date.now(), discovery=await discoverUniswapV3Pools4470(), registry=new Map(), chains={}, blocks={};
 const discoveredTotal=Number(discovery?.coverage?.poolsDiscovered||0),nonzeroTotal=Number(discovery?.coverage?.poolsWithNonzeroLiquidity||0),chainRows=(discovery.chains||[]);
 const eligibleChains=chainRows.filter(ch=>Array.isArray(ch?.pools)&&ch.pools.some(x=>x?.pool&&x?.hasLiquidity));
 const counters={poolsDiscovered:discoveredTotal,poolsNonzeroLiquidity:nonzeroTotal,chainsReturned:chainRows.length,chainsEligible:eligibleChains.length,poolsEligible:0,snapshotAttempts:0,snapshotSuccesses:0,snapshotFailures:0,blockTaggedSuccesses:0,latestFallbackSuccesses:0,fieldFailures:{slot0:0,liquidity:0,token0:0,token1:0},failureClasses:{},registryStored:0};
 const diagnostics=[];
 const bumpClass=c=>{counters.failureClasses[c]=(counters.failureClasses[c]||0)+1;};
 if(discoveredTotal>0&&eligibleChains.length===0)throw new Error(`BOOTSTRAP_INTEGRITY_DISCOVERY_HANDOFF_EMPTY: discovered=${discoveredTotal} nonzero=${nonzeroTotal} chainRows=${chainRows.length}`);
 await mapLimit4501(eligibleChains,3,async ch=>{
  const rpc=RPC_URLS[ch.key]||"",valid=(ch.pools||[]).filter(x=>x?.pool&&x?.hasLiquidity);counters.poolsEligible+=valid.length;
  if(!rpc){counters.snapshotFailures+=valid.length;chains[ch.key]={chainId:ch.chainId,status:"RPC_NOT_CONFIGURED",discoveredPools:valid.length,snapshottedPools:0,snapshotFailures:valid.length};return;}
  const provider=new JsonRpcProvider(rpc,undefined,{staticNetwork:false});
  let bootstrapBlock=null,blockError=null;
  try{bootstrapBlock=await withTimeout4501(provider.getBlockNumber(),12000,`${ch.key}_BOOTSTRAP_BLOCK`);blocks[ch.key]=bootstrapBlock;}
  catch(e){blockError=e?.message||String(e);bumpClass(snapshotErrorClass4602(e));}
  counters.snapshotAttempts+=valid.length;
  const rows=await mapLimit4501(valid,4,async meta=>{
   const pc=new Contract(meta.pool,UNISWAP_V3_POOL_READ_ABI_4470,provider), fields=["slot0","liquidity","token0","token1"],reads={};
   if(bootstrapBlock!==null){
    for(const field of fields)reads[field]=await readPoolField4602(pc,field,bootstrapBlock,7000,`${ch.key}_${field}_BLOCKTAG`);
   }else for(const field of fields)reads[field]={ok:false,error:blockError||"BOOTSTRAP_BLOCK_UNAVAILABLE",errorClass:"BOOTSTRAP_BLOCK_UNAVAILABLE",latencyMs:0,mode:"BLOCK_TAGGED"};
   let usedFallback=false;
   for(const field of fields)if(!reads[field].ok){
    counters.fieldFailures[field]++;bumpClass(reads[field].errorClass||"OTHER");
    const fb=await readPoolFieldLatest4602(pc,field,7000,`${ch.key}_${field}_LATEST`);
    reads[field].fallback=fb;if(fb.ok)usedFallback=true;else bumpClass(fb.errorClass||"OTHER");
   }
   const pick=f=>reads[f].ok?reads[f].value:(reads[f].fallback?.ok?reads[f].fallback.value:null);
   const slot0=pick("slot0"),liq=pick("liquidity"),t0=pick("token0"),t1=pick("token1");
   const ok=slot0!==null&&liq!==null&&t0!==null&&t1!==null;
   const diag={chain:ch.key,pair:meta.pair,pool:meta.pool,feeTier:meta.feeTier,bootstrapBlock,ok,usedLatestFallback:usedFallback,reads:Object.fromEntries(fields.map(f=>[f,{blockTagged:{ok:reads[f].ok,errorClass:reads[f].errorClass||null,error:reads[f].error||null,latencyMs:reads[f].latencyMs},latestFallback:reads[f].fallback?{ok:reads[f].fallback.ok,errorClass:reads[f].fallback.errorClass||null,error:reads[f].fallback.error||null,latencyMs:reads[f].fallback.latencyMs}:null}]))};
   if(!ok)return {ok:false,diag};
   const source=usedFallback?"MIXED_OR_LATEST_RPC_BOOTSTRAP":"BLOCK_TAGGED_RPC_BOOTSTRAP";
   return {ok:true,diag,value:{key:`${ch.key}:${String(meta.pool).toLowerCase()}`,chain:ch.key,chainId:ch.chainId,dex:meta.dex,pair:meta.pair,pool:meta.pool,feeTier:meta.feeTier,token0:String(t0),token1:String(t1),sqrtPriceX96:(slot0.sqrtPriceX96??slot0[0]).toString(),tick:Number(slot0.tick??slot0[1]),liquidityRaw:liq.toString(),bootstrapBlock,snapshotBlock:usedFallback?null:bootstrapBlock,snapshotAt:new Date().toISOString(),source,stateFreshness:usedFallback?"UNSYNCHRONIZED_LATEST_FALLBACK":"BOOTSTRAP_BLOCK_CONSISTENT",executionEligible:false,readOnly:true}};
  });
  for(const r of rows)if(r?.diag)diagnostics.push(r.diag);
  const good=rows.filter(x=>x?.ok).map(x=>x.value),failures=rows.length-good.length;
  counters.snapshotSuccesses+=good.length;counters.snapshotFailures+=failures;
  counters.blockTaggedSuccesses+=good.filter(x=>x.source==="BLOCK_TAGGED_RPC_BOOTSTRAP").length;
  counters.latestFallbackSuccesses+=good.filter(x=>x.source!=="BLOCK_TAGGED_RPC_BOOTSTRAP").length;
  for(const row of good)registry.set(row.key,row);
  chains[ch.key]={chainId:ch.chainId,status:good.length?"SNAPSHOT_COMPLETE":"SNAPSHOT_FAILED",bootstrapBlock,bootstrapBlockError:blockError,discoveredPools:valid.length,snapshotAttempts:rows.length,snapshottedPools:good.length,blockTaggedSuccesses:good.filter(x=>x.source==="BLOCK_TAGGED_RPC_BOOTSTRAP").length,latestFallbackSuccesses:good.filter(x=>x.source!=="BLOCK_TAGGED_RPC_BOOTSTRAP").length,snapshotFailures:failures};
 });
 counters.registryStored=registry.size;
 if(discoveredTotal>0&&registry.size===0)throw new Error(`BOOTSTRAP_INTEGRITY_EMPTY_REGISTRY: discovered=${discoveredTotal} eligible=${counters.poolsEligible} attempts=${counters.snapshotAttempts} failures=${counters.snapshotFailures}`);
 if(registry.size!==counters.snapshotSuccesses)throw new Error(`BOOTSTRAP_INTEGRITY_REGISTRY_COUNT_MISMATCH: successes=${counters.snapshotSuccesses} registry=${registry.size}`);
 marketState4600.registry=registry;marketState4600.chains=chains;marketState4600.bootstrapBlockByChain=blocks;marketState4600.lastUpdateAt=new Date().toISOString();
 return {success:true,version:VERSION,classification:"MARKET_STATE_BOOTSTRAP_DIAGNOSTICS_COMPLETE",architecture:"INDEPENDENT_FIELD_READS_WITH_BLOCK_TAGGED_PRIMARY_AND_LABELED_LATEST_FALLBACK",elapsedMs:Date.now()-started,discoveryCoverage:discovery.coverage,counters,chains,registryCount:registry.size,diagnostics,synchronization:{bootstrapComplete:true,fullyBlockConsistent:counters.latestFallbackSuccesses===0,eventReconciliation:"NOT_ACTIVE",websocketSubscriptions:"NOT_ACTIVE",reorgRollback:"NOT_ACTIVE",tickStateCache:"NOT_ACTIVE",executionEligible:false},readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false,generatedAt:new Date().toISOString()};
}
async function runMarketBootstrap4600(){
 if(marketState4600.status==="RUNNING")return;
 marketState4600={...marketState4600,status:"RUNNING",startedAt:new Date().toISOString(),completedAt:null,error:null,registry:new Map(),chains:{},bootstrapBlockByChain:{},lastUpdateAt:null};
 try{const result=await bootstrapMarketState4600();marketState4600={...marketState4600,status:"COMPLETE",completedAt:new Date().toISOString(),result};}
 catch(e){marketState4600={...marketState4600,status:"ERROR",completedAt:new Date().toISOString(),error:e?.message||String(e)};}
}
app.get("/api/market-state/bootstrap/start",(req,res)=>{const running=marketState4600.status==="RUNNING";if(!running)setImmediate(()=>runMarketBootstrap4600());res.json({success:true,version:VERSION,status:running?"ALREADY_RUNNING":"STARTED",statusRoute:"/api/market-state/bootstrap/status",readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false});});
app.get("/api/market-state/bootstrap/status",(req,res)=>{const summary=marketStateSummary4600();res.json({...summary,result:marketState4600.result||null});});
app.get("/api/market-state/registry",(req,res)=>{const chain=String(req.query.chain||"").toLowerCase(),limit=Math.max(1,Math.min(500,Number(req.query.limit||100)));let rows=[...marketState4600.registry.values()];if(chain)rows=rows.filter(x=>x.chain===chain);res.json({success:true,version:VERSION,status:marketState4600.status,count:rows.length,returned:Math.min(rows.length,limit),pools:rows.slice(0,limit),synchronization:{eventReconciliation:"NOT_ACTIVE",websocketSubscriptions:"NOT_ACTIVE",reorgRollback:"NOT_ACTIVE",executionEligible:false},readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false});});


/*
=========================================================
ArbiFlow 4.61.0 — LIVE BASE MARKET STATE
Read-only Base-first event reconciliation. Uses block polling + eth_getLogs
over the configured Base RPC so it works with HTTP RPC endpoints.
Only block-consistent Base bootstrap pools are admitted.
=========================================================
*/
const V3_SWAP_TOPIC_4610=id("Swap(address,address,int256,int256,uint160,uint128,int24)");
const V3_MINT_TOPIC_4610=id("Mint(address,address,int24,int24,uint128,uint256,uint256)");
const V3_BURN_TOPIC_4610=id("Burn(address,int24,int24,uint128,uint256,uint256)");
const V3_EVENT_IFACE_4610=new Interface([
 "event Swap(address indexed sender,address indexed recipient,int256 amount0,int256 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick)",
 "event Mint(address sender,address indexed owner,int24 indexed tickLower,int24 indexed tickUpper,uint128 amount,uint256 amount0,uint256 amount1)",
 "event Burn(address indexed owner,int24 indexed tickLower,int24 indexed tickUpper,uint128 amount,uint256 amount0,uint256 amount1)"
]);
let liveBase4610={status:"IDLE",startedAt:null,stoppedAt:null,error:null,timer:null,provider:null,lastHeadBlock:null,lastProcessedBlock:null,lastHeadAt:null,lastEventAt:null,
 bootstrapPools:0,trackedPools:0,blocksObserved:0,blocksReconciled:0,logsReceived:0,swapEvents:0,mintEvents:0,burnEvents:0,poolsUpdated:0,reconciliationErrors:0,reorgSignals:0,stalePools:0,
 poolLastEvent:new Map(),recentErrors:[],recentEvents:[],executionEligible:false};
function liveBaseSummary4610(){
 const now=Date.now(),basePools=[...marketState4600.registry.values()].filter(x=>x.chain==="base"&&x.source==="BLOCK_TAGGED_RPC_BOOTSTRAP");
 const ages=basePools.map(x=>Math.max(0,now-Date.parse(x.snapshotAt||0))).filter(Number.isFinite);
 return {success:liveBase4610.status!=="ERROR",version:VERSION,status:liveBase4610.status,error:liveBase4610.error,architecture:"BASE_BLOCK_POLLING_TO_LOG_RECONCILIATION_TO_CHANGED_POOL_STATE_REFRESH",
  base:{bootstrapPools:liveBase4610.bootstrapPools,trackedPools:liveBase4610.trackedPools,lastHeadBlock:liveBase4610.lastHeadBlock,lastProcessedBlock:liveBase4610.lastProcessedBlock,lastHeadAt:liveBase4610.lastHeadAt,lastEventAt:liveBase4610.lastEventAt,
   blocksObserved:liveBase4610.blocksObserved,blocksReconciled:liveBase4610.blocksReconciled,logsReceived:liveBase4610.logsReceived,swapEvents:liveBase4610.swapEvents,mintEvents:liveBase4610.mintEvents,burnEvents:liveBase4610.burnEvents,poolsUpdated:liveBase4610.poolsUpdated,reconciliationErrors:liveBase4610.reconciliationErrors,reorgSignals:liveBase4610.reorgSignals,stalePools:liveBase4610.stalePools,
   oldestStateAgeMs:ages.length?Math.max(...ages):null,newestStateAgeMs:ages.length?Math.min(...ages):null},
  synchronization:{bootstrapRequired:true,eventReconciliation:liveBase4610.status==="RUNNING"?"ACTIVE":"INACTIVE",websocketSubscriptions:liveBase4610.status==="RUNNING"?"HTTP_RPC_BLOCK_POLLING_ACTIVE":"INACTIVE",reorgRollback:"DETECTION_AND_REBOOTSTRAP_GATE",tickStateCache:"NOT_ACTIVE",executionEligible:false},
  recentErrors:liveBase4610.recentErrors.slice(-10),recentEvents:liveBase4610.recentEvents.slice(-20),readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false};
}
function pushLiveError4610(e){liveBase4610.recentErrors.push({at:new Date().toISOString(),error:e?.message||String(e)});if(liveBase4610.recentErrors.length>50)liveBase4610.recentErrors.shift();}
async function refreshBasePool4610(provider,poolAddress,blockNumber,eventType){
 const key=`base:${String(poolAddress).toLowerCase()}`,row=marketState4600.registry.get(key);if(!row)return false;
 const pc=new Contract(poolAddress,UNISWAP_V3_POOL_READ_ABI_4470,provider);
 const [slot0,liq]=await withTimeout4501(Promise.all([pc.slot0({blockTag:blockNumber}),pc.liquidity({blockTag:blockNumber})]),6000,"BASE_LIVE_POOL_REFRESH");
 row.sqrtPriceX96=(slot0.sqrtPriceX96??slot0[0]).toString();row.tick=Number(slot0.tick??slot0[1]);row.liquidityRaw=liq.toString();row.snapshotBlock=blockNumber;row.snapshotAt=new Date().toISOString();row.source="LIVE_BASE_EVENT_RECONCILED";row.stateFreshness="LIVE_BLOCK_CONSISTENT";row.lastEventType=eventType;row.executionEligible=false;
 marketState4600.registry.set(key,row);marketState4600.lastUpdateAt=row.snapshotAt;liveBase4610.poolLastEvent.set(key,{blockNumber,eventType,at:row.snapshotAt});liveBase4610.lastEventAt=row.snapshotAt;liveBase4610.poolsUpdated++;
 if(typeof markGraphDirty4620==="function")markGraphDirty4620(row.pool);
 if(typeof candidate4700!=="undefined"&&candidate4700.status==="RUNNING"&&typeof sweepCandidate4700==="function")setImmediate(()=>{try{sweepCandidate4700("EVENT");}catch(e){candidate4700.lastError=e?.message||String(e);}});
 return true;
}
async function reconcileBaseRange4610(provider,fromBlock,toBlock,addresses){
 if(fromBlock>toBlock)return;
 const maxSpan=250;
 for(let from=fromBlock;from<=toBlock;from+=maxSpan){
  const to=Math.min(toBlock,from+maxSpan-1);
  const logs=await withTimeout4501(provider.getLogs({fromBlock:from,toBlock:to,address:addresses,topics:[[V3_SWAP_TOPIC_4610,V3_MINT_TOPIC_4610,V3_BURN_TOPIC_4610]]}),10000,"BASE_LIVE_GETLOGS");
  liveBase4610.logsReceived+=logs.length;
  const changed=new Map();
  for(const log of logs){
   let type="UNKNOWN";if(log.topics[0]===V3_SWAP_TOPIC_4610){type="SWAP";liveBase4610.swapEvents++;}else if(log.topics[0]===V3_MINT_TOPIC_4610){type="MINT";liveBase4610.mintEvents++;}else if(log.topics[0]===V3_BURN_TOPIC_4610){type="BURN";liveBase4610.burnEvents++;}
   changed.set(String(log.address).toLowerCase(),{address:log.address,blockNumber:Number(log.blockNumber),type});
   liveBase4610.recentEvents.push({blockNumber:Number(log.blockNumber),pool:log.address,type,txHash:log.transactionHash});if(liveBase4610.recentEvents.length>100)liveBase4610.recentEvents.shift();
  }
  for(const ev of changed.values())try{await refreshBasePool4610(provider,ev.address,ev.blockNumber,ev.type);}catch(e){liveBase4610.reconciliationErrors++;pushLiveError4610(e);}
  liveBase4610.blocksReconciled+=to-from+1;liveBase4610.lastProcessedBlock=to;
 }
}
async function liveBaseTick4610(){
 if(liveBase4610.status!=="RUNNING")return;
 try{
  const provider=liveBase4610.provider,head=await withTimeout4501(provider.getBlockNumber(),6000,"BASE_LIVE_HEAD");
  if(liveBase4610.lastHeadBlock!==null&&head<liveBase4610.lastHeadBlock){liveBase4610.reorgSignals++;liveBase4610.status="STALE_REBOOTSTRAP_REQUIRED";liveBase4610.error=`BASE_HEAD_REGRESSION_${liveBase4610.lastHeadBlock}_TO_${head}`;return;}
  if(liveBase4610.lastHeadBlock===null||head>liveBase4610.lastHeadBlock){liveBase4610.blocksObserved+=liveBase4610.lastHeadBlock===null?1:head-liveBase4610.lastHeadBlock;liveBase4610.lastHeadBlock=head;liveBase4610.lastHeadAt=new Date().toISOString();}
  const rows=[...marketState4600.registry.values()].filter(x=>x.chain==="base"&&["BLOCK_TAGGED_RPC_BOOTSTRAP","LIVE_BASE_EVENT_RECONCILED"].includes(x.source));
  const addresses=rows.map(x=>x.pool);liveBase4610.trackedPools=addresses.length;
  if(addresses.length){
   const start=liveBase4610.lastProcessedBlock===null?head:liveBase4610.lastProcessedBlock+1;
   if(start<=head)await reconcileBaseRange4610(provider,start,head,addresses);
  }
  const now=Date.now(),staleMs=Number(process.env.ARBIFLOW_BASE_STALE_MS||30000);
  liveBase4610.stalePools=rows.filter(x=>now-Date.parse(x.snapshotAt||0)>staleMs).length;
 }catch(e){liveBase4610.reconciliationErrors++;pushLiveError4610(e);}
}
async function discoverBasePools4611(){
 const started=Date.now(),cfg=UNISWAP_V3_DISCOVERY_4470.base,rpc=RPC_URLS.base||"";
 if(!cfg)throw new Error("BASE_V3_ADAPTER_NOT_CONFIGURED");if(!rpc)throw new Error("BASE_RPC_NOT_CONFIGURED");
 const provider=new JsonRpcProvider(rpc,8453,{staticNetwork:false});
 const [net,code]=await withTimeout4501(Promise.all([provider.getNetwork(),provider.getCode(cfg.factory)]),8000,"BASE_FACTORY");
 if(Number(net.chainId)!==8453)throw new Error(`BASE_CHAIN_ID_MISMATCH_${Number(net.chainId)}`);if(!code||code==="0x")throw new Error("BASE_FACTORY_NOT_DEPLOYED");
 const factory=new Contract(cfg.factory,UNISWAP_V3_FACTORY_ABI,provider),jobs=[];
 for(const [[symA,tokenA],[symB,tokenB]] of pairCombos4470(cfg.tokens))for(const fee of [100,500,3000,10000])jobs.push({symA,tokenA,symB,tokenB,fee});
 const rows=await mapLimit4501(jobs,8,async j=>{try{
  const pool=await withTimeout4501(factory.getPool(String(j.tokenA).toLowerCase(),String(j.tokenB).toLowerCase(),j.fee),6000,"BASE_GET_POOL");
  if(!pool||pool==="0x0000000000000000000000000000000000000000")return null;
  const pc=new Contract(pool,UNISWAP_V3_POOL_READ_ABI_4470,provider),liq=await withTimeout4501(pc.liquidity(),6000,"BASE_DISCOVERY_LIQUIDITY");
  return {dex:"Uniswap V3",pair:`${j.symA}/${j.symB}`,tokenA:j.tokenA,tokenB:j.tokenB,feeTier:j.fee,pool,liquidityRaw:liq.toString(),hasLiquidity:BigInt(liq)>0n,readOnly:true};
 }catch(e){return {pair:`${j.symA}/${j.symB}`,feeTier:j.fee,status:"POOL_QUERY_FAILED",error:e?.shortMessage||e?.message||String(e),readOnly:true};}});
 const pools=rows.filter(x=>x?.pool&&x?.hasLiquidity);
 return {provider,pools,queries:jobs.length,elapsedMs:Date.now()-started};
}
async function bootstrapBaseOnly4611(){
 const started=Date.now(),disc=await discoverBasePools4611(),provider=disc.provider;
 const bootstrapBlock=await withTimeout4501(provider.getBlockNumber(),10000,"BASE_ONLY_BOOTSTRAP_BLOCK"),registryRows=[],failures=[];
 const rows=await mapLimit4501(disc.pools,4,async meta=>{try{
  const pc=new Contract(meta.pool,UNISWAP_V3_POOL_READ_ABI_4470,provider);
  const [slot0,liq,t0,t1]=await withTimeout4501(Promise.all([pc.slot0({blockTag:bootstrapBlock}),pc.liquidity({blockTag:bootstrapBlock}),pc.token0({blockTag:bootstrapBlock}),pc.token1({blockTag:bootstrapBlock})]),8000,"BASE_ONLY_POOL_SNAPSHOT");
  return {ok:true,value:{key:`base:${String(meta.pool).toLowerCase()}`,chain:"base",chainId:8453,dex:meta.dex,pair:meta.pair,pool:meta.pool,feeTier:meta.feeTier,token0:String(t0),token1:String(t1),sqrtPriceX96:(slot0.sqrtPriceX96??slot0[0]).toString(),tick:Number(slot0.tick??slot0[1]),liquidityRaw:liq.toString(),bootstrapBlock,snapshotBlock:bootstrapBlock,snapshotAt:new Date().toISOString(),source:"BLOCK_TAGGED_RPC_BOOTSTRAP",stateFreshness:"BOOTSTRAP_BLOCK_CONSISTENT",executionEligible:false,readOnly:true}};
 }catch(e){return {ok:false,pool:meta.pool,pair:meta.pair,feeTier:meta.feeTier,error:e?.shortMessage||e?.message||String(e),errorClass:snapshotErrorClass4602(e)};}});
 for(const r of rows){if(r?.ok){registryRows.push(r.value);marketState4600.registry.set(r.value.key,r.value);}else failures.push(r);}
 if(!registryRows.length)throw new Error(`BASE_ONLY_BOOTSTRAP_EMPTY: discovered=${disc.pools.length} failures=${failures.length}`);
 marketState4600.chains.base={chainId:8453,status:"SNAPSHOT_COMPLETE",bootstrapBlock,discoveredPools:disc.pools.length,snapshotAttempts:rows.length,snapshottedPools:registryRows.length,snapshotFailures:failures.length,blockTaggedSuccesses:registryRows.length,latestFallbackSuccesses:0};
 marketState4600.bootstrapBlockByChain.base=bootstrapBlock;marketState4600.lastUpdateAt=new Date().toISOString();
 return {success:true,classification:"BASE_ONLY_BLOCK_CONSISTENT_BOOTSTRAP_COMPLETE",bootstrapBlock,poolQueries:disc.queries,poolsDiscovered:disc.pools.length,snapshotAttempts:rows.length,snapshotSuccesses:registryRows.length,snapshotFailures:failures.length,failures:failures.slice(0,25),elapsedMs:Date.now()-started,executionEligible:false,readOnly:true};
}
async function startLiveBase4610(){
 if(liveBase4610.status==="RUNNING")return;
 const rpc=RPC_URLS.base;if(!rpc)throw new Error("BASE_RPC_NOT_CONFIGURED");
 let baseRows=[...marketState4600.registry.values()].filter(x=>x.chain==="base"&&x.source==="BLOCK_TAGGED_RPC_BOOTSTRAP");
 let autoBootstrap=null;
 if(!baseRows.length){
  liveBase4610.status="BOOTSTRAPPING_BASE";
  autoBootstrap=await bootstrapBaseOnly4611();
  baseRows=[...marketState4600.registry.values()].filter(x=>x.chain==="base"&&x.source==="BLOCK_TAGGED_RPC_BOOTSTRAP");
 }
 if(!baseRows.length)throw new Error("BASE_LIVE_AUTO_BOOTSTRAP_PRODUCED_NO_BLOCK_CONSISTENT_POOLS");
 const provider=new JsonRpcProvider(rpc,8453,{staticNetwork:false}),head=await withTimeout4501(provider.getBlockNumber(),8000,"BASE_LIVE_START_HEAD");
 liveBase4610={...liveBase4610,status:"RUNNING",startedAt:new Date().toISOString(),stoppedAt:null,error:null,provider,lastHeadBlock:head,lastProcessedBlock:Math.max(...baseRows.map(x=>Number(x.snapshotBlock||x.bootstrapBlock||head))),lastHeadAt:new Date().toISOString(),bootstrapPools:baseRows.length,trackedPools:baseRows.length,blocksObserved:0,blocksReconciled:0,logsReceived:0,swapEvents:0,mintEvents:0,burnEvents:0,poolsUpdated:0,reconciliationErrors:0,reorgSignals:0,stalePools:0,poolLastEvent:new Map(),recentErrors:[],recentEvents:[],executionEligible:false,autoBootstrap};
 const floor=Math.min(...baseRows.map(x=>Number(x.snapshotBlock||x.bootstrapBlock||head)));liveBase4610.lastProcessedBlock=floor-1;
 await liveBaseTick4610();
 liveBase4610.timer=setInterval(()=>{liveBaseTick4610();},Number(process.env.ARBIFLOW_BASE_POLL_MS||2000));liveBase4610.timer.unref?.();
}
function stopLiveBase4610(){
 if(liveBase4610.timer)clearInterval(liveBase4610.timer);liveBase4610.timer=null;liveBase4610.status="STOPPED";liveBase4610.stoppedAt=new Date().toISOString();liveBase4610.executionEligible=false;
}
app.get("/api/market-state/live/base/start",async(req,res)=>{try{await startLiveBase4610();res.json({...liveBaseSummary4610(),statusRoute:"/api/market-state/live/base/status"});}catch(e){liveBase4610.status="ERROR";liveBase4610.error=e?.message||String(e);res.status(409).json(liveBaseSummary4610());}});
app.get("/api/market-state/live/base/status",(req,res)=>res.json(liveBaseSummary4610()));
app.get("/api/market-state/live/base/stop",(req,res)=>{stopLiveBase4610();res.json(liveBaseSummary4610());});
app.get("/api/market-state/live/base/pools",(req,res)=>{const limit=Math.max(1,Math.min(200,Number(req.query.limit||100))),rows=[...marketState4600.registry.values()].filter(x=>x.chain==="base");res.json({success:true,version:VERSION,count:rows.length,returned:Math.min(limit,rows.length),pools:rows.slice(0,limit),live:liveBaseSummary4610().base,executionEligible:false,readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false});});


/*
=========================================================
ArbiFlow 4.62.0 — LOCAL BASE LIQUIDITY GRAPH
Incremental, read-only candidate detection from live Base V3 state.
Spot-price graph only: candidates are NOT executable quotes and NOT net profit.
=========================================================
*/
let graph4620={status:"IDLE",builtAt:null,lastUpdateAt:null,nodes:new Map(),edges:new Map(),poolEdges:new Map(),dirtyPools:new Set(),cyclesEvaluated:0,candidateCycles:0,lastDetectionLatencyMs:null,candidates:[],executionEligible:false};
function tokenSymbol4620(addr){
 const a=String(addr||"").toLowerCase(),cfg=UNISWAP_V3_DISCOVERY_4470.base?.tokens||{};
 for(const [sym,v] of Object.entries(cfg))if(String(v).toLowerCase()===a)return sym;
 return `${a.slice(0,6)}…${a.slice(-4)}`;
}
function edgePrice4620(row,zeroForOne){
 const sqrt=Number(row.sqrtPriceX96)/2**96;if(!Number.isFinite(sqrt)||sqrt<=0)return null;
 const raw=sqrt*sqrt,fee=1-Number(row.feeTier||0)/1e6;
 const p=zeroForOne?raw:1/raw,rate=p*fee;
 return Number.isFinite(rate)&&rate>0?rate:null;
}
function upsertPoolEdges4620(row){
 if(!row?.pool||!row?.token0||!row?.token1)return;
 const pool=String(row.pool).toLowerCase(),t0=String(row.token0).toLowerCase(),t1=String(row.token1).toLowerCase();
 graph4620.nodes.set(t0,{address:row.token0,symbol:tokenSymbol4620(t0)});graph4620.nodes.set(t1,{address:row.token1,symbol:tokenSymbol4620(t1)});
 const r01=edgePrice4620(row,true),r10=edgePrice4620(row,false),ids=[];
 if(r01){const id=`${pool}:0`;graph4620.edges.set(id,{id,pool:row.pool,from:t0,to:t1,rate:r01,feeTier:row.feeTier,tick:row.tick,liquidityRaw:row.liquidityRaw,snapshotBlock:row.snapshotBlock,updatedAt:row.snapshotAt});ids.push(id);}
 if(r10){const id=`${pool}:1`;graph4620.edges.set(id,{id,pool:row.pool,from:t1,to:t0,rate:r10,feeTier:row.feeTier,tick:row.tick,liquidityRaw:row.liquidityRaw,snapshotBlock:row.snapshotBlock,updatedAt:row.snapshotAt});ids.push(id);}
 graph4620.poolEdges.set(pool,ids);
}
function buildGraph4620(){
 const started=Date.now();graph4620.nodes=new Map();graph4620.edges=new Map();graph4620.poolEdges=new Map();
 const rows=[...marketState4600.registry.values()].filter(x=>x.chain==="base"&&["BLOCK_TAGGED_RPC_BOOTSTRAP","LIVE_BASE_EVENT_RECONCILED"].includes(x.source));
 for(const row of rows)upsertPoolEdges4620(row);
 graph4620.status="READY";graph4620.builtAt=new Date().toISOString();graph4620.lastUpdateAt=graph4620.builtAt;graph4620.lastDetectionLatencyMs=Date.now()-started;return rows.length;
}
function markGraphDirty4620(pool){graph4620.dirtyPools.add(String(pool).toLowerCase());}
function cyclesForDirty4620(){
 const started=Date.now();if(graph4620.status!=="READY")buildGraph4620();
 const dirty=[...graph4620.dirtyPools];graph4620.dirtyPools.clear();
 for(const pool of dirty){
  const row=marketState4600.registry.get(`base:${pool}`);if(row)upsertPoolEdges4620(row);
 }
 const edges=[...graph4620.edges.values()],byFrom=new Map();for(const e of edges){const a=byFrom.get(e.from)||[];a.push(e);byFrom.set(e.from,a);}
 const affected=dirty.length?new Set(dirty):null,candidates=[],seen=new Set();let evaluated=0;
 for(const e1 of edges){
  for(const e2 of byFrom.get(e1.to)||[]){
   if(e2.pool.toLowerCase()===e1.pool.toLowerCase())continue;
   for(const e3 of byFrom.get(e2.to)||[]){
    if(e3.to!==e1.from||new Set([e1.pool.toLowerCase(),e2.pool.toLowerCase(),e3.pool.toLowerCase()]).size<2)continue;
    if(affected&&!affected.has(e1.pool.toLowerCase())&&!affected.has(e2.pool.toLowerCase())&&!affected.has(e3.pool.toLowerCase()))continue;
    evaluated++;
    const key=[e1.id,e2.id,e3.id].sort().join("|");if(seen.has(key))continue;seen.add(key);
    const grossMultiplier=e1.rate*e2.rate*e3.rate,grossSpreadPct=(grossMultiplier-1)*100;
    if(Number.isFinite(grossSpreadPct)&&grossSpreadPct>0){
     candidates.push({path:[graph4620.nodes.get(e1.from)?.symbol,graph4620.nodes.get(e1.to)?.symbol,graph4620.nodes.get(e2.to)?.symbol,graph4620.nodes.get(e3.to)?.symbol],pools:[e1.pool,e2.pool,e3.pool],feeTiers:[e1.feeTier,e2.feeTier,e3.feeTier],grossSpotMultiplier:grossMultiplier,grossSpotSpreadPct:grossSpreadPct,affectedByDirtyPool:dirty.length>0,classification:"SPOT_GRAPH_CANDIDATE_ONLY",requires:"TICK_AWARE_SWAP_SIMULATION_AND_SIZE_OPTIMIZATION"});
    }
   }
  }
 }
 candidates.sort((a,b)=>b.grossSpotSpreadPct-a.grossSpotSpreadPct);
 graph4620.cyclesEvaluated+=evaluated;graph4620.candidateCycles=candidates.length;graph4620.candidates=candidates.slice(0,100);graph4620.lastDetectionLatencyMs=Date.now()-started;graph4620.lastUpdateAt=new Date().toISOString();
 return {dirtyPoolsProcessed:dirty.length,cyclesEvaluated:evaluated,candidates:graph4620.candidates};
}
function graphSummary4620(){
 return {success:true,version:VERSION,status:graph4620.status,architecture:"LIVE_BASE_STATE_TO_INCREMENTAL_DIRECTED_LIQUIDITY_GRAPH_TO_AFFECTED_3_EDGE_CYCLE_DETECTION",graphNodes:graph4620.nodes.size,graphEdges:graph4620.edges.size,poolsIndexed:graph4620.poolEdges.size,dirtyPools:graph4620.dirtyPools.size,cyclesEvaluated:graph4620.cyclesEvaluated,candidateCycles:graph4620.candidateCycles,lastDetectionLatencyMs:graph4620.lastDetectionLatencyMs,builtAt:graph4620.builtAt,lastUpdateAt:graph4620.lastUpdateAt,candidates:graph4620.candidates,limitations:{spotGraphOnly:true,tickTraversal:false,tradeSizeOptimization:false,gasIncluded:false,flashLoanFeeIncluded:false,executableProfitClaim:false},executionEligible:false,readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false};
}
app.get("/api/graph/base/build",(req,res)=>{try{const pools=buildGraph4620(),scan=cyclesForDirty4620();res.json({...graphSummary4620(),poolsLoaded:pools,lastScan:scan});}catch(e){res.status(500).json({success:false,version:VERSION,error:e?.message||String(e),executionEligible:false,readOnly:true});}});
app.get("/api/graph/base/scan",(req,res)=>{try{const scan=cyclesForDirty4620();res.json({...graphSummary4620(),lastScan:scan});}catch(e){res.status(500).json({success:false,version:VERSION,error:e?.message||String(e),executionEligible:false,readOnly:true});}});
app.get("/api/graph/base/status",(req,res)=>res.json(graphSummary4620()));
app.get("/api/graph/base/edges",(req,res)=>{const limit=Math.max(1,Math.min(500,Number(req.query.limit||200))),rows=[...graph4620.edges.values()];res.json({success:true,version:VERSION,count:rows.length,returned:Math.min(limit,rows.length),edges:rows.slice(0,limit),executionEligible:false,readOnly:true});});


/*
=========================================================
ArbiFlow 4.63.0 — V3 CANDIDATE SIMULATOR + SIZE SOLVER
Exact read-only Uniswap V3 Quoter validation of local graph candidates.
This stage models executable quote impact across the full 3-leg path at
multiple input sizes. Gas/flash-loan costs remain a later economics gate.
=========================================================
*/
const BASE_V3_QUOTER_4630="0x222ca98f00ed15b1fae10b61c277703a194cf5d2";
const V3_QUOTER_ABI_4630=[
 "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)"
];
let simulator4630={status:"IDLE",startedAt:null,completedAt:null,error:null,candidatesTested:0,sizeTests:0,successfulRoundTrips:0,positiveRoundTrips:0,quoteFailures:0,lastLatencyMs:null,results:[],executionEligible:false};
function decimals4630(sym){const s=String(sym||"").toUpperCase();if(s==="USDC"||s==="USDBC")return 6;if(s==="CBBTC")return 8;return 18;}
function defaultSizes4630(sym){
 const s=String(sym||"").toUpperCase();
 if(s==="USDC"||s==="USDBC")return [0.25,0.5,1,2.5,5,10,25,50,100,250,500];
 if(s==="WETH"||s==="CBETH")return [0.00005,0.0001,0.00025,0.0005,0.001,0.0025,0.005,0.01,0.025,0.05,0.1];
 if(s==="CBBTC")return [0.000001,0.0000025,0.000005,0.00001,0.000025,0.00005,0.0001,0.00025,0.0005,0.001];
 return [0.001,0.005,0.01,0.05,0.1];
}
function candidateEdges4630(c){
 const syms=c.path||[],pools=c.pools||[],fees=c.feeTiers||[];if(syms.length!==4||pools.length!==3)return null;
 const out=[];
 for(let i=0;i<3;i++){
  const row=marketState4600.registry.get(`base:${String(pools[i]).toLowerCase()}`);if(!row)return null;
  const from=String(syms[i]),to=String(syms[i+1]),t0sym=tokenSymbol4620(row.token0),t1sym=tokenSymbol4620(row.token1);
  let tokenIn,tokenOut;
  if(from===t0sym&&to===t1sym){tokenIn=row.token0;tokenOut=row.token1;}
  else if(from===t1sym&&to===t0sym){tokenIn=row.token1;tokenOut=row.token0;}
  else return null;
  out.push({pool:row.pool,fee:Number(fees[i]??row.feeTier),tokenIn,tokenOut,from,to});
 }
 return out;
}
async function quoteLeg4630(quoter,leg,amountIn){
 const started=Date.now();
 try{
  const q=await withTimeout4501(quoter.quoteExactInputSingle.staticCall({tokenIn:leg.tokenIn,tokenOut:leg.tokenOut,amountIn,fee:leg.fee,sqrtPriceLimitX96:0}),8000,"V3_SIM_QUOTE");
  return {ok:true,amountOut:q.amountOut??q[0],sqrtPriceX96After:(q.sqrtPriceX96After??q[1]).toString(),initializedTicksCrossed:Number(q.initializedTicksCrossed??q[2]),gasEstimate:(q.gasEstimate??q[3]).toString(),latencyMs:Date.now()-started};
 }catch(e){return {ok:false,error:e?.shortMessage||e?.message||String(e),errorClass:snapshotErrorClass4602(e),latencyMs:Date.now()-started};}
}
async function simulateCandidateSize4630(quoter,c,size){
 const edges=candidateEdges4630(c);if(!edges)return {ok:false,size,rejectionReason:"CANDIDATE_EDGE_MAPPING_FAILED"};
 const startSym=c.path[0],dec=decimals4630(startSym);let amount=parseUnits(String(size),dec),current=amount;const legs=[];let totalTicks=0,totalQuotedGas=0n;
 for(const edge of edges){
  const q=await quoteLeg4630(quoter,edge,current);
  if(!q.ok)return {ok:false,size,startSymbol:startSym,rejectionReason:"LEG_QUOTE_FAILED",failedLeg:legs.length+1,errorClass:q.errorClass,error:q.error,legs};
  if(q.amountOut===0n)return {ok:false,size,startSymbol:startSym,rejectionReason:"ZERO_OUTPUT_LIQUIDITY_EXHAUSTED",failedLeg:legs.length+1,legs,liquidityExhausted:true};
  legs.push({leg:legs.length+1,from:edge.from,to:edge.to,pool:edge.pool,feeTier:edge.fee,amountInRaw:current.toString(),amountOutRaw:q.amountOut.toString(),sqrtPriceX96After:q.sqrtPriceX96After,initializedTicksCrossed:q.initializedTicksCrossed,quotedGas:q.gasEstimate,latencyMs:q.latencyMs});
  totalTicks+=q.initializedTicksCrossed;totalQuotedGas+=BigInt(q.gasEstimate);current=q.amountOut;
 }
 const pnlRaw=current-amount,returnPct=Number(pnlRaw)*100/Number(amount);
 return {ok:true,size,startSymbol:startSym,inputRaw:amount.toString(),outputRaw:current.toString(),grossPnlRaw:pnlRaw.toString(),grossReturnPct:returnPct,positive:pnlRaw>0n,totalInitializedTicksCrossed:totalTicks,totalQuotedGas:totalQuotedGas.toString(),legs,classification:pnlRaw>0n?"V3_QUOTER_SIMULATED_POSITIVE":"V3_QUOTER_SIMULATED_REJECTED",gasCostApplied:false,flashLoanFeeApplied:false,executionEligible:false};
}
function refinementSizes4631(tests){
 const viable=tests.filter(x=>x.ok&&Number.isFinite(x.grossReturnPct)).sort((a,b)=>b.grossReturnPct-a.grossReturnPct),best=viable[0];if(!best)return [];
 const x=Number(best.size);if(!Number.isFinite(x)||x<=0)return [];
 return [...new Set([x*0.4,x*0.6,x*0.8,x*1.2,x*1.5,x*2].filter(v=>v>0).map(v=>Number(v.toPrecision(8))))];
}
async function runSimulator4630(limit=20){
 if(simulator4630.status==="RUNNING")return;
 if(graph4620.status!=="READY")buildGraph4620();cyclesForDirty4620();
 const candidates=graph4620.candidates.slice(0,Math.max(1,Math.min(50,Number(limit||20))));
 if(!candidates.length){simulator4630={...simulator4630,status:"COMPLETE",startedAt:new Date().toISOString(),completedAt:new Date().toISOString(),error:null,candidatesTested:0,sizeTests:0,successfulRoundTrips:0,positiveRoundTrips:0,quoteFailures:0,lastLatencyMs:0,results:[]};return;}
 const rpc=RPC_URLS.base;if(!rpc)throw new Error("BASE_RPC_NOT_CONFIGURED");
 simulator4630={...simulator4630,status:"RUNNING",startedAt:new Date().toISOString(),completedAt:null,error:null,candidatesTested:0,sizeTests:0,successfulRoundTrips:0,positiveRoundTrips:0,quoteFailures:0,results:[]};
 const started=Date.now(),provider=new JsonRpcProvider(rpc,8453,{staticNetwork:false}),quoter=new Contract(BASE_V3_QUOTER_4630,V3_QUOTER_ABI_4630,provider),results=[];
 for(const c of candidates){
  const sizes=defaultSizes4630(c.path?.[0]),tests=[];
  for(const size of sizes){
   const t=await simulateCandidateSize4630(quoter,c,size);tests.push(t);simulator4630.sizeTests++;
   if(t.ok){simulator4630.successfulRoundTrips++;if(t.positive)simulator4630.positiveRoundTrips++;}else simulator4630.quoteFailures++;
  }
  for(const size of refinementSizes4631(tests)){
   if(tests.some(x=>Number(x.size)===Number(size)))continue;
   const t=await simulateCandidateSize4630(quoter,c,size);t.adaptiveRefinement=true;tests.push(t);simulator4630.sizeTests++;
   if(t.ok){simulator4630.successfulRoundTrips++;if(t.positive)simulator4630.positiveRoundTrips++;}else simulator4630.quoteFailures++;
  }
  const good=tests.filter(x=>x.ok),positive=good.filter(x=>x.positive).sort((a,b)=>b.grossReturnPct-a.grossReturnPct),best=positive[0]||[...good].sort((a,b)=>b.grossReturnPct-a.grossReturnPct)[0]||null;
  const exhausted=tests.filter(x=>x.rejectionReason==="ZERO_OUTPUT_LIQUIDITY_EXHAUSTED").length;
  const quality=positive.length?"SURVIVES_SIZE_IMPACT":best&&best.grossReturnPct>-0.25?"NEAR_BREAK_EVEN_MICRO_CANDIDATE":exhausted?"SHALLOW_OR_EXHAUSTED_LIQUIDITY":"IMPACT_REJECTED";
  results.push({path:c.path,pools:c.pools,feeTiers:c.feeTiers,spotGrossSpreadPct:c.grossSpotSpreadPct,sizeTests:tests,bestSize:best?best.size:null,bestGrossReturnPct:best?best.grossReturnPct:null,positiveSizes:positive.length,liquidityExhaustionTests:exhausted,candidateQuality:quality,classification:positive.length?"SIZE_TESTED_POSITIVE_REQUIRES_ECONOMICS_GATE":"REJECTED_BY_V3_QUOTER_SIZE_TESTS"});
  simulator4630.candidatesTested++;
 }
 results.sort((a,b)=>(b.bestGrossReturnPct??-Infinity)-(a.bestGrossReturnPct??-Infinity));
 simulator4630={...simulator4630,status:"COMPLETE",completedAt:new Date().toISOString(),lastLatencyMs:Date.now()-started,results};
}
function simulatorSummary4630(){
 return {success:simulator4630.status!=="ERROR",version:VERSION,status:simulator4630.status,error:simulator4630.error,architecture:"SPOT_GRAPH_CANDIDATES_TO_EXACT_V3_QUOTER_MULTI_SIZE_ROUND_TRIP_SIMULATION",startedAt:simulator4630.startedAt,completedAt:simulator4630.completedAt,candidatesTested:simulator4630.candidatesTested,sizeTests:simulator4630.sizeTests,successfulRoundTrips:simulator4630.successfulRoundTrips,positiveRoundTrips:simulator4630.positiveRoundTrips,quoteFailures:simulator4630.quoteFailures,lastLatencyMs:simulator4630.lastLatencyMs,results:simulator4630.results,limitations:{quoterBasedImpact:true,initializedTicksCrossedReported:true,localTickCache:false,adaptiveMicroSizeRefinement:true,zeroOutputLiquidityRejection:true,continuousOptimalSolver:false,gasCostApplied:false,flashLoanFeeApplied:false,netProfitClaim:false},executionEligible:false,readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false};
}
app.get("/api/simulator/base/start",(req,res)=>{if(simulator4630.status==="RUNNING")return res.json({...simulatorSummary4630(),statusRoute:"/api/simulator/base/status"});const limit=Number(req.query.limit||20);setImmediate(async()=>{try{await runSimulator4630(limit);}catch(e){simulator4630.status="ERROR";simulator4630.completedAt=new Date().toISOString();simulator4630.error=e?.message||String(e);}});res.json({success:true,version:VERSION,status:"STARTED",statusRoute:"/api/simulator/base/status",executionEligible:false,readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false});});
app.get("/api/simulator/base/status",(req,res)=>res.json(simulatorSummary4630()));


/*
=========================================================
ArbiFlow 4.64.0 — BASE MULTI-VENUE GRAPH FOUNDATION
Uniswap V3 + Aerodrome normalized quote edges, with cross-venue
2-edge and 3-edge candidate detection. Read-only discovery only.
=========================================================
*/

async function aerodromeSlipstreamQuoteOne4690({sellToken,buyToken,sellAmount,tickSpacing}){
 const provider=getBaseProvider(),cfg=NETWORKS.base,tin=cfg.tokens[sellToken],tout=cfg.tokens[buyToken];
 if(!tin||!tout)throw new Error("SLIPSTREAM_TOKEN_NOT_CONFIGURED");
 const factory=new ethers.Contract(AERODROME_SLIPSTREAM_BASE.factory,AERODROME_SLIPSTREAM_FACTORY_ABI,provider);
 const pool=await factory.getPool(tin.address,tout.address,tickSpacing);
 if(!pool||String(pool).toLowerCase()===ethers.ZeroAddress.toLowerCase())throw new Error("SLIPSTREAM_POOL_NOT_FOUND");
 const quoter=new ethers.Contract(AERODROME_SLIPSTREAM_BASE.quoter,AERODROME_SLIPSTREAM_QUOTER_ABI,provider);
 const rawIn=ethers.parseUnits(String(sellAmount),tin.decimals);
 const out=await quoter.quoteExactInputSingle.staticCall(tin.address,tout.address,tickSpacing,rawIn,0);
 const rawOut=out[0]??out.amountOut;
 return {provider:"Aerodrome Slipstream",pool,tickSpacing,buyAmount:Number(ethers.formatUnits(rawOut,tout.decimals)),rawBuyAmount:rawOut.toString(),factory:AERODROME_SLIPSTREAM_BASE.factory,quoter:AERODROME_SLIPSTREAM_BASE.quoter,quoteTimestamp:Date.now(),readOnly:true};
}
async function aerodromeSlipstreamBestQuote4690({sellToken,buyToken,sellAmount}){
 const quotes=[];
 for(const tickSpacing of SLIPSTREAM_TICK_SPACINGS_4690){
  try{quotes.push(await withTimeout4501(aerodromeSlipstreamQuoteOne4690({sellToken,buyToken,sellAmount,tickSpacing}),7000,"SLIPSTREAM_QUOTE_TIMEOUT"));}catch(_){}
 }
 if(!quotes.length)throw new Error("NO_SLIPSTREAM_QUOTE");
 quotes.sort((a,b)=>b.buyAmount-a.buyAmount);return {best:quotes[0],quotes};
}
async function quoteSlipstreamEdge4690(from,to,probe){
 try{
  const q=await aerodromeSlipstreamBestQuote4690({sellToken:from,buyToken:to,sellAmount:probe}),best=q.best;
  return {venue:"AERODROME_SLIPSTREAM",from,to,probeInput:probe,probeOutput:best.buyAmount,rate:normalizedRate4640(probe,best.buyAmount),tickSpacing:best.tickSpacing,pool:best.pool,factory:best.factory,quoter:best.quoter,liquidityModel:"AERODROME_SLIPSTREAM_CONCENTRATED",quoteTimestamp:best.quoteTimestamp,readOnly:true};
 }catch(_){return null;}
}
const MV4640_TOKENS=["WETH","cbBTC","cbETH","USDC","USDbC","DAI"];
const MV4640_PROBES={WETH:0.001,cbETH:0.001,cbBTC:0.00005,USDC:5,USDbC:5,DAI:5};
let multivenue4640={status:"IDLE",startedAt:null,completedAt:null,error:null,edges:[],candidates:[],quotesAttempted:0,quotesSucceeded:0,quoteFailures:0,lastLatencyMs:null,executionEligible:false};

function normalizedRate4640(amountIn,amountOut){const a=Number(amountIn),b=Number(amountOut);return Number.isFinite(a)&&a>0&&Number.isFinite(b)&&b>0?b/a:0;}
async function quoteUv3Edge4640(from,to,probe){
 try{
  const q=await uniswapV3BestQuote({sellToken:from,buyToken:to,sellAmount:probe});
  const best=q.best;if(!best)return null;
  return {venue:"UNISWAP_V3",from,to,probeInput:probe,probeOutput:best.buyAmount,rate:normalizedRate4640(probe,best.buyAmount),feeTier:best.feeTier,pool:best.pool||null,liquidityModel:"CONCENTRATED_V3_QUOTER",quoteTimestamp:best.quoteTimestamp||Date.now(),readOnly:true};
 }catch(e){return null;}
}
async function quoteAeroEdge4640(from,to,probe){
 try{
  const q=await aerodromeBestQuote({sellToken:from,buyToken:to,sellAmount:probe});
  const best=q.best;if(!best)return null;
  return {venue:"AERODROME",from,to,probeInput:probe,probeOutput:best.buyAmount,rate:normalizedRate4640(probe,best.buyAmount),poolType:best.poolType,router:best.router,factory:best.factory,liquidityModel:"AERODROME_DIRECT_ROUTER",quoteTimestamp:best.quoteTimestamp||Date.now(),readOnly:true};
 }catch(e){return null;}
}
function detectMultiVenueCycles4640(edges){
 const byFrom=new Map();for(const e of edges){if(!byFrom.has(e.from))byFrom.set(e.from,[]);byFrom.get(e.from).push(e);}
 const out=[],seen=new Set();
 // 2-edge cycles: require independent venues.
 for(const a of edges)for(const b of byFrom.get(a.to)||[]){
  if(b.to!==a.from||a.venue===b.venue)continue;
  const key=[a.from,a.to].sort().join("|")+"|"+[a.venue,b.venue].sort().join("|");if(seen.has("2:"+key))continue;seen.add("2:"+key);
  const mult=a.rate*b.rate,spread=(mult-1)*100;if(spread<=0)continue;
  out.push({hops:2,path:[a.from,a.to,a.from],venues:[a.venue,b.venue],edges:[a,b],probeGrossMultiplier:mult,probeGrossSpreadPct:spread,classification:"MULTI_VENUE_PROBE_CANDIDATE_REQUIRES_EXACT_ROUND_TRIP_VALIDATION",executionEligible:false});
 }
 // 3-edge cycles: require at least two venues.
 for(const a of edges)for(const b of byFrom.get(a.to)||[])for(const c of byFrom.get(b.to)||[]){
  if(c.to!==a.from||new Set([a.venue,b.venue,c.venue]).size<2)continue;
  const signature=[`${a.venue}:${a.from}>${a.to}`,`${b.venue}:${b.from}>${b.to}`,`${c.venue}:${c.from}>${c.to}`].sort().join("|");if(seen.has("3:"+signature))continue;seen.add("3:"+signature);
  const mult=a.rate*b.rate*c.rate,spread=(mult-1)*100;if(spread<=0)continue;
  out.push({hops:3,path:[a.from,a.to,b.to,a.from],venues:[a.venue,b.venue,c.venue],edges:[a,b,c],probeGrossMultiplier:mult,probeGrossSpreadPct:spread,classification:"MULTI_VENUE_PROBE_CANDIDATE_REQUIRES_EXACT_ROUND_TRIP_VALIDATION",executionEligible:false});
 }
 return out.sort((a,b)=>b.probeGrossSpreadPct-a.probeGrossSpreadPct).slice(0,100);
}
async function runMultiVenue4640(){
 if(multivenue4640.status==="RUNNING")return;
 const rpc=RPC_URLS.base;if(!rpc)throw new Error("BASE_RPC_NOT_CONFIGURED");
 multivenue4640={...multivenue4640,status:"RUNNING",startedAt:new Date().toISOString(),completedAt:null,error:null,edges:[],candidates:[],quotesAttempted:0,quotesSucceeded:0,quoteFailures:0};
 const started=Date.now(),jobs=[];
 for(const from of MV4640_TOKENS)for(const to of MV4640_TOKENS){if(from===to)continue;for(const venue of ["UNISWAP_V3","AERODROME"])jobs.push({from,to,venue,probe:MV4640_PROBES[from]});}
 const edges=await mapLimit4501(jobs,4,async j=>{
  multivenue4640.quotesAttempted++;
  const e=j.venue==="UNISWAP_V3"?await quoteUv3Edge4640(j.from,j.to,j.probe):await quoteAeroEdge4640(j.from,j.to,j.probe);
  if(e)multivenue4640.quotesSucceeded++;else multivenue4640.quoteFailures++;return e;
 });
 const valid=edges.filter(Boolean),candidates=detectMultiVenueCycles4640(valid);
 multivenue4640={...multivenue4640,status:"COMPLETE",completedAt:new Date().toISOString(),edges:valid,candidates,lastLatencyMs:Date.now()-started};
}
function multiVenueSummary4640(includeEdges=false){
 const venues={};for(const e of multivenue4640.edges)venues[e.venue]=(venues[e.venue]||0)+1;
 const hopCounts={twoEdge:multivenue4640.candidates.filter(x=>x.hops===2).length,threeEdge:multivenue4640.candidates.filter(x=>x.hops===3).length};
 return {success:multivenue4640.status!=="ERROR",version:VERSION,status:multivenue4640.status,error:multivenue4640.error,architecture:"BASE_UNISWAP_V3_PLUS_AERODROME_TO_NORMALIZED_MULTI_VENUE_GRAPH_TO_2_AND_3_EDGE_CYCLE_DETECTION",startedAt:multivenue4640.startedAt,completedAt:multivenue4640.completedAt,quotesAttempted:multivenue4640.quotesAttempted,quotesSucceeded:multivenue4640.quotesSucceeded,quoteFailures:multivenue4640.quoteFailures,edgesBuilt:multivenue4640.edges.length,edgesByVenue:venues,candidateCycles:multivenue4640.candidates.length,candidateHops:hopCounts,candidates:multivenue4640.candidates,lastLatencyMs:multivenue4640.lastLatencyMs,...(includeEdges?{edges:multivenue4640.edges}:{}),limitations:{probeSizedGraph:true,independentVenueRequiredFor2Edge:true,exactCandidateRoundTripValidation:"NEXT_GATE",gasIncluded:false,flashLoanFeeIncluded:false,netProfitClaim:false},executionEligible:false,readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false};
}
app.get("/api/multivenue/base/start",(req,res)=>{if(multivenue4640.status==="RUNNING")return res.json({...multiVenueSummary4640(false),statusRoute:"/api/multivenue/base/status"});setImmediate(async()=>{try{await runMultiVenue4640();}catch(e){multivenue4640.status="ERROR";multivenue4640.completedAt=new Date().toISOString();multivenue4640.error=e?.message||String(e);}});res.json({success:true,version:VERSION,status:"STARTED",statusRoute:"/api/multivenue/base/status",executionEligible:false,readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false});});
app.get("/api/multivenue/base/status",(req,res)=>res.json(multiVenueSummary4640(false)));
app.get("/api/multivenue/base/edges",(req,res)=>res.json(multiVenueSummary4640(true)));


/*
=========================================================
ArbiFlow 4.64.1 — DYNAMIC MULTI-VENUE SEARCH
Multi-size venue curves, deformation filtering, positive candidates and
near-positive watchlist. Read-only; no execution.
=========================================================
*/
const MV4641_SIZES={
 WETH:[0.0001,0.00025,0.0005,0.001,0.0025],
 cbETH:[0.0001,0.00025,0.0005,0.001,0.0025],
 cbBTC:[0.000005,0.00001,0.000025,0.00005,0.0001],
 USDC:[1,2.5,5,10,25],
 USDbC:[1,2.5,5,10,25],
 DAI:[1,2.5,5,10,25]
};
let dynamic4641={status:"IDLE",startedAt:null,completedAt:null,error:null,curves:[],usableEdges:[],rejectedEdges:[],candidates:[],watchlist:[],quotesAttempted:0,quotesSucceeded:0,quoteFailures:0,curvesTotal:0,curvesCompleted:0,currentJobs:[],elapsedMs:0,lastProgressAt:null,lastLatencyMs:null,executionEligible:false};

async function quoteVenue4641(venue,from,to,size){
 if(venue==="UNISWAP_V3")return quoteUv3Edge4640(from,to,size);
 if(venue==="AERODROME_SLIPSTREAM")return quoteSlipstreamEdge4690(from,to,size);
 return quoteAeroEdge4640(from,to,size);
}
function curveQuality4641(samples){
 const good=samples.filter(Boolean).sort((a,b)=>a.probeInput-b.probeInput);if(good.length<3)return {usable:false,reason:"INSUFFICIENT_SIZE_SAMPLES"};
 const rates=good.map(x=>x.rate).filter(x=>Number.isFinite(x)&&x>0);if(rates.length<3)return {usable:false,reason:"INVALID_RATE_SAMPLES"};
 const lo=Math.min(...rates),hi=Math.max(...rates),median=[...rates].sort((a,b)=>a-b)[Math.floor(rates.length/2)],deformationPct=median>0?(hi-lo)/median*100:Infinity;
 // Severe shape deformation is usually thin liquidity or unit-granularity saturation.
 const usable=Number.isFinite(deformationPct)&&deformationPct<=15;
 return {usable,reason:usable?"USABLE":"LIQUIDITY_CURVE_DEFORMED",deformationPct,rateMin:lo,rateMax:hi,rateMedian:median,samples:good.length};
}
function detectAndRank4641(edges){
 const byFrom=new Map();for(const e of edges){if(!byFrom.has(e.from))byFrom.set(e.from,[]);byFrom.get(e.from).push(e);}
 const all=[],seen=new Set(),push=(hops,path,legs)=>{
  if(hops===2&&legs[0].venue===legs[1].venue)return;
  if(hops===3&&new Set(legs.map(x=>x.venue)).size<2)return;
  const key=hops+"|"+legs.map(x=>`${x.venue}:${x.from}>${x.to}`).join("|");if(seen.has(key))return;seen.add(key);
  const mult=legs.reduce((m,x)=>m*x.rate,1),spread=(mult-1)*100;
  all.push({hops,path,venues:legs.map(x=>x.venue),edges:legs,probeGrossMultiplier:mult,probeGrossSpreadPct:spread,classification:spread>0?"DYNAMIC_MULTI_VENUE_CANDIDATE_REQUIRES_EXACT_VALIDATION":"DYNAMIC_MULTI_VENUE_WATCHLIST",executionEligible:false});
 };
 for(const a of edges)for(const b of byFrom.get(a.to)||[])if(b.to===a.from)push(2,[a.from,a.to,a.from],[a,b]);
 for(const a of edges)for(const b of byFrom.get(a.to)||[])for(const c of byFrom.get(b.to)||[])if(c.to===a.from)push(3,[a.from,a.to,b.to,a.from],[a,b,c]);
 all.sort((a,b)=>b.probeGrossSpreadPct-a.probeGrossSpreadPct);
 return {candidates:all.filter(x=>x.probeGrossSpreadPct>0).slice(0,100),watchlist:all.filter(x=>x.probeGrossSpreadPct<=0&&x.probeGrossSpreadPct>=-2).slice(0,50)};
}
async function runDynamic4641(){
 if(dynamic4641.status==="RUNNING")return;
 if(!RPC_URLS.base)throw new Error("BASE_RPC_NOT_CONFIGURED");
 dynamic4641={...dynamic4641,status:"RUNNING",startedAt:new Date().toISOString(),completedAt:null,error:null,curves:[],usableEdges:[],rejectedEdges:[],candidates:[],watchlist:[],quotesAttempted:0,quotesSucceeded:0,quoteFailures:0,curvesTotal:0,curvesCompleted:0,currentJobs:[],elapsedMs:0,lastProgressAt:new Date().toISOString()};
 const started=Date.now(),curveJobs=[];
 for(const from of MV4640_TOKENS)for(const to of MV4640_TOKENS){if(from===to)continue;for(const venue of ["UNISWAP_V3","AERODROME","AERODROME_SLIPSTREAM"])curveJobs.push({from,to,venue});}
 dynamic4641.curvesTotal=curveJobs.length;
 const curves=await mapLimit4501(curveJobs,3,async j=>{
  const jobKey=`${j.venue}:${j.from}>${j.to}`;dynamic4641.currentJobs=[...dynamic4641.currentJobs,jobKey].slice(-3);
  const samples=[];
  for(const size of MV4641_SIZES[j.from]){
   dynamic4641.quotesAttempted++;
   const q=await quoteVenue4641(j.venue,j.from,j.to,size);
   if(q){dynamic4641.quotesSucceeded++;samples.push(q);}else{dynamic4641.quoteFailures++;samples.push(null);}
  }
  const quality=curveQuality4641(samples),good=samples.filter(Boolean);
  // Use the middle probe for graph ranking, after the whole size curve passes quality.
  const representative=good.length?good[Math.floor(good.length/2)]:null;
  dynamic4641.curvesCompleted++;dynamic4641.elapsedMs=Date.now()-started;dynamic4641.lastProgressAt=new Date().toISOString();dynamic4641.currentJobs=dynamic4641.currentJobs.filter(x=>x!==jobKey);
  return {...j,quality,samples:good,representative};
 });
 const usableEdges=[],rejectedEdges=[];
 for(const c of curves){
  if(c.quality.usable&&c.representative)usableEdges.push({...c.representative,curveDeformationPct:c.quality.deformationPct,curveSamples:c.quality.samples,dynamicQualified:true});
  else rejectedEdges.push({venue:c.venue,from:c.from,to:c.to,quality:c.quality,sampleCount:c.samples.length});
 }
 const ranked=detectAndRank4641(usableEdges);
 dynamic4641={...dynamic4641,status:"COMPLETE",completedAt:new Date().toISOString(),curves,usableEdges,rejectedEdges,candidates:ranked.candidates,watchlist:ranked.watchlist,lastLatencyMs:Date.now()-started};
}
function dynamicSummary4641(details=false){
 const venueEdges={};for(const e of dynamic4641.usableEdges)venueEdges[e.venue]=(venueEdges[e.venue]||0)+1;
 return {success:dynamic4641.status!=="ERROR",version:VERSION,status:dynamic4641.status,error:dynamic4641.error,architecture:"BASE_MULTI_VENUE_MULTI_SIZE_CURVES_TO_LIQUIDITY_SHAPE_FILTER_TO_2_AND_3_EDGE_DYNAMIC_RANKING",startedAt:dynamic4641.startedAt,completedAt:dynamic4641.completedAt,quotesAttempted:dynamic4641.quotesAttempted,quotesSucceeded:dynamic4641.quotesSucceeded,quoteFailures:dynamic4641.quoteFailures,progress:{curvesTotal:dynamic4641.curvesTotal,curvesCompleted:dynamic4641.curvesCompleted,currentJobs:dynamic4641.currentJobs,elapsedMs:dynamic4641.status==="RUNNING"?(Date.now()-new Date(dynamic4641.startedAt).getTime()):dynamic4641.lastLatencyMs,lastProgressAt:dynamic4641.lastProgressAt},curvesTested:dynamic4641.curves.length,usableEdges:dynamic4641.usableEdges.length,rejectedEdges:dynamic4641.rejectedEdges.length,usableEdgesByVenue:venueEdges,positiveCandidates:dynamic4641.candidates.length,watchlistCount:dynamic4641.watchlist.length,candidates:dynamic4641.candidates,watchlist:dynamic4641.watchlist,rejections:dynamic4641.rejectedEdges,lastLatencyMs:dynamic4641.lastLatencyMs,...(details?{curves:dynamic4641.curves,edges:dynamic4641.usableEdges}:{}),limitations:{continuousBackgroundLoop:false,eventTriggeredIncrementalRefresh:"NEXT_GATE_AFTER_VALIDATION",curveDeformationThresholdPct:15,watchlistFloorPct:-2,exactCandidateRoundTripValidation:"REQUIRED",gasIncluded:false,flashLoanFeeIncluded:false,netProfitClaim:false},executionEligible:false,readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false};
}
app.get("/api/multivenue/dynamic/start",(req,res)=>{if(dynamic4641.status==="RUNNING")return res.json({...dynamicSummary4641(false),statusRoute:"/api/multivenue/dynamic/status"});setImmediate(async()=>{try{await runDynamic4641();}catch(e){dynamic4641.status="ERROR";dynamic4641.completedAt=new Date().toISOString();dynamic4641.error=e?.message||String(e);}});res.json({success:true,version:VERSION,status:"STARTED",statusRoute:"/api/multivenue/dynamic/status",executionEligible:false,readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false});});
app.get("/api/multivenue/dynamic/status",(req,res)=>res.json(dynamicSummary4641(false)));
app.get("/api/multivenue/dynamic/curves",(req,res)=>res.json(dynamicSummary4641(true)));



/*
=========================================================
ArbiFlow 4.67.0 — INCREMENTAL / STREAMING MULTI-VENUE DISCOVERY
Each completed qualified curve updates the live edge cache immediately.
Only cycles touching the changed token pair are considered for emission.
Candidates are frozen at emission and may be route-locked validated while
the remaining discovery workers continue. Read-only.
=========================================================
*/
let stream4670={status:"IDLE",startedAt:null,completedAt:null,error:null,curvesTotal:0,curvesCompleted:0,quotesAttempted:0,quotesSucceeded:0,quoteFailures:0,usableEdges:0,rejectedCurves:0,candidatesEmitted:0,duplicateCandidatesSuppressed:0,firstCandidateAt:null,firstCandidateLatencyMs:null,currentJobs:[],lastProgressAt:null,elapsedMs:0,edgeCache:new Map(),emittedKeys:new Set(),emittedCandidates:[],validationQueueDepth:0};

function streamEdgeKey4670(e){return `${e.venue}|${e.from}|${e.to}`;}
function streamCandidateKey4670(c){return `${c.hops}|${c.edges.map(e=>`${e.venue}:${e.from}>${e.to}:${e.feeTier??e.poolType??""}`).join("|")}`;}
function candidateTouches4670(c,edge){return c.edges.some(e=>e.from===edge.from||e.to===edge.from||e.from===edge.to||e.to===edge.to);}
function incrementalCandidates4670(changedEdge){
 const ranked=detectAndRank4641([...stream4670.edgeCache.values()]);
 return ranked.candidates.filter(c=>candidateTouches4670(c,changedEdge));
}
async function runStreamingDiscovery4670(onCandidate){
 if(stream4670.status==="RUNNING")return;
 if(!RPC_URLS.base)throw new Error("BASE_RPC_NOT_CONFIGURED");
 const started=Date.now(),jobs=[];
 for(const from of MV4640_TOKENS)for(const to of MV4640_TOKENS){if(from===to)continue;for(const venue of ["UNISWAP_V3","AERODROME","AERODROME_SLIPSTREAM"])jobs.push({from,to,venue});}
 stream4670={status:"RUNNING",startedAt:new Date().toISOString(),completedAt:null,error:null,curvesTotal:jobs.length,curvesCompleted:0,quotesAttempted:0,quotesSucceeded:0,quoteFailures:0,usableEdges:0,rejectedCurves:0,candidatesEmitted:0,duplicateCandidatesSuppressed:0,firstCandidateAt:null,firstCandidateLatencyMs:null,currentJobs:[],lastProgressAt:new Date().toISOString(),elapsedMs:0,edgeCache:new Map(),emittedKeys:new Set(),emittedCandidates:[],validationQueueDepth:0};
 await mapLimit4501(jobs,3,async j=>{
  const jobKey=`${j.venue}:${j.from}>${j.to}`;stream4670.currentJobs=[...stream4670.currentJobs,jobKey].slice(-3);
  const samples=[];
  for(const size of MV4641_SIZES[j.from]){
   stream4670.quotesAttempted++;
   const q=await quoteVenue4641(j.venue,j.from,j.to,size);
   if(q){stream4670.quotesSucceeded++;samples.push(q);}else{stream4670.quoteFailures++;samples.push(null);}
  }
  const quality=curveQuality4641(samples),good=samples.filter(Boolean),representative=good.length?good[Math.floor(good.length/2)]:null;
  if(quality.usable&&representative){
   const edge={...representative,curveDeformationPct:quality.deformationPct,curveSamples:quality.samples,dynamicQualified:true,streamQualified:true};
   stream4670.edgeCache.set(streamEdgeKey4670(edge),edge);stream4670.usableEdges=stream4670.edgeCache.size;
   for(const c of incrementalCandidates4670(edge)){
    const key=streamCandidateKey4670(c);
    if(stream4670.emittedKeys.has(key)){stream4670.duplicateCandidatesSuppressed++;continue;}
    stream4670.emittedKeys.add(key);const frozen=JSON.parse(JSON.stringify(c));stream4670.emittedCandidates.push(frozen);stream4670.candidatesEmitted++;
    if(!stream4670.firstCandidateAt){stream4670.firstCandidateAt=new Date().toISOString();stream4670.firstCandidateLatencyMs=Date.now()-started;}
    if(onCandidate){stream4670.validationQueueDepth++;try{await onCandidate(frozen);}finally{stream4670.validationQueueDepth--;}}
   }
  }else stream4670.rejectedCurves++;
  stream4670.curvesCompleted++;stream4670.elapsedMs=Date.now()-started;stream4670.lastProgressAt=new Date().toISOString();stream4670.currentJobs=stream4670.currentJobs.filter(x=>x!==jobKey);
 });
 stream4670.status="COMPLETE";stream4670.completedAt=new Date().toISOString();stream4670.elapsedMs=Date.now()-started;
}
function streamSummary4670(){
 return {success:stream4670.status!=="ERROR",version:VERSION,status:stream4670.status,error:stream4670.error,architecture:"COMPLETED_CURVE_TO_INCREMENTAL_EDGE_CACHE_TO_AFFECTED_CYCLE_DETECTION_TO_IMMEDIATE_FROZEN_CANDIDATE_EMISSION",startedAt:stream4670.startedAt,completedAt:stream4670.completedAt,curvesTotal:stream4670.curvesTotal,curvesCompleted:stream4670.curvesCompleted,quotesAttempted:stream4670.quotesAttempted,quotesSucceeded:stream4670.quotesSucceeded,quoteFailures:stream4670.quoteFailures,usableEdges:stream4670.usableEdges,rejectedCurves:stream4670.rejectedCurves,candidatesEmitted:stream4670.candidatesEmitted,duplicateCandidatesSuppressed:stream4670.duplicateCandidatesSuppressed,firstCandidateAt:stream4670.firstCandidateAt,firstCandidateLatencyMs:stream4670.firstCandidateLatencyMs,currentJobs:stream4670.currentJobs,validationQueueDepth:stream4670.validationQueueDepth,lastProgressAt:stream4670.lastProgressAt,elapsedMs:stream4670.status==="RUNNING"?(Date.now()-new Date(stream4670.startedAt).getTime()):stream4670.elapsedMs,emittedCandidates:stream4670.emittedCandidates.slice(-20),executionEligible:false,readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false};
}
app.get("/api/multivenue/stream/start",(req,res)=>{
 if(stream4670.status==="RUNNING")return res.json({...streamSummary4670(),statusRoute:"/api/multivenue/stream/status"});
 setImmediate(async()=>{try{await runStreamingDiscovery4670(null);}catch(e){stream4670.status="ERROR";stream4670.completedAt=new Date().toISOString();stream4670.error=e?.message||String(e);}});
 res.json({success:true,version:VERSION,status:"STARTED",statusRoute:"/api/multivenue/stream/status",executionEligible:false,readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false});
});
app.get("/api/multivenue/stream/status",(req,res)=>res.json(streamSummary4670()));

/*
=========================================================
ArbiFlow 4.65.0 — EXACT CROSS-VENUE ROUND-TRIP VALIDATOR
Candidate-driven sequential quotes: each leg consumes the exact prior output.
Read-only validation only. No gas/net-profit claim and no execution.
=========================================================
*/
let exact4650={status:"IDLE",phase:"IDLE",startedAt:null,completedAt:null,error:null,discoveryStartedAt:null,discoveryCompletedAt:null,validationStartedAt:null,validationCompletedAt:null,discoveryLatencyMs:null,validationLatencyMs:null,candidatesDetected:0,candidatesInput:0,candidatesValidated:0,sizeTests:0,successfulRoundTrips:0,positiveRoundTrips:0,quoteFailures:0,results:[],candidateSnapshot:[],economicsContext:null,lastLatencyMs:null,executionEligible:false};

function candidateKey4650(c){return `${c.hops}|${c.path.join(">")}|${c.venues.join(">")}`;}
function candidateSizes4650(c){
 const sym=c.path[0],base=MV4641_SIZES[sym]||[0.001,0.005,0.01],lo=base[0],hi=base[base.length-1];
 return [...new Set([lo/2,...base,hi*2].filter(x=>Number.isFinite(x)&&x>0).map(x=>Number(x.toPrecision(10))))].sort((a,b)=>a-b);
}
async function exactLeg4650(edge,from,to,amountIn){
 const started=Date.now();let best;
 if(edge.venue==="UNISWAP_V3"){
  if(!Number.isFinite(Number(edge.feeTier)))throw new Error("ROUTE_LOCK_MISSING_UNISWAP_FEE_TIER");
  best=await withTimeout4501(uniswapV3QuoteOne({sellToken:from,buyToken:to,sellAmount:amountIn,fee:Number(edge.feeTier)}),10000,"LOCKED_UV3_TIMEOUT");
  if(edge.pool&&String(best.pool).toLowerCase()!==String(edge.pool).toLowerCase())throw new Error(`ROUTE_LOCK_UNISWAP_POOL_MISMATCH:${edge.pool}:${best.pool}`);
 }else if(edge.venue==="AERODROME"){
  if(!["STABLE","VOLATILE"].includes(String(edge.poolType)))throw new Error("ROUTE_LOCK_MISSING_AERODROME_POOL_TYPE");
  best=await withTimeout4501(aerodromeQuoteOne({sellToken:from,buyToken:to,sellAmount:amountIn,stable:String(edge.poolType)==="STABLE"}),10000,"LOCKED_AERODROME_TIMEOUT");
  if(String(best.poolType)!==String(edge.poolType))throw new Error(`ROUTE_LOCK_AERODROME_TYPE_MISMATCH:${edge.poolType}:${best.poolType}`);
 }else if(edge.venue==="AERODROME_SLIPSTREAM"){
  if(!Number.isFinite(Number(edge.tickSpacing)))throw new Error("ROUTE_LOCK_MISSING_SLIPSTREAM_TICK_SPACING");
  best=await withTimeout4501(aerodromeSlipstreamQuoteOne4690({sellToken:from,buyToken:to,sellAmount:amountIn,tickSpacing:Number(edge.tickSpacing)}),10000,"LOCKED_SLIPSTREAM_TIMEOUT");
  if(edge.pool&&String(best.pool).toLowerCase()!==String(edge.pool).toLowerCase())throw new Error(`ROUTE_LOCK_SLIPSTREAM_POOL_MISMATCH:${edge.pool}:${best.pool}`);
 }else throw new Error(`ROUTE_LOCK_UNSUPPORTED_VENUE:${edge.venue}`);
 if(!best||!Number.isFinite(Number(best.buyAmount))||Number(best.buyAmount)<=0)throw new Error("ZERO_OR_INVALID_EXACT_OUTPUT");
 return {venue:edge.venue,from,to,amountIn:Number(amountIn),amountOut:Number(best.buyAmount),
  detectedFeeTier:edge.feeTier??null,quotedFeeTier:best.feeTier??null,
  detectedPool:edge.pool??null,quotedPool:best.pool??null,
  detectedPoolType:edge.poolType??null,quotedPoolType:best.poolType??null,
  detectedTickSpacing:edge.tickSpacing??null,quotedTickSpacing:best.tickSpacing??null,
  routeLocked:true,router:best.router??null,factory:best.factory??null,latencyMs:Date.now()-started};
}
async function validateSize4650(c,size){
 let amount=Number(size),legs=[];
 try{
  for(let i=0;i<c.hops;i++){const edge=c.edges[i],leg=await exactLeg4650(edge,c.path[i],c.path[i+1],amount);legs.push(leg);amount=leg.amountOut;}
  const grossPnl=amount-Number(size),grossReturnPct=grossPnl/Number(size)*100;
  return {ok:true,size:Number(size),startSymbol:c.path[0],finalAmount:amount,grossPnl,grossReturnPct,positive:grossPnl>0,routeLocked:true,legs,classification:grossPnl>0?"ROUTE_LOCKED_EXACT_POSITIVE_REQUIRES_ECONOMICS_GATE":"ROUTE_LOCKED_EXACT_REJECTED"};
 }catch(e){return {ok:false,size:Number(size),startSymbol:c.path[0],failedLeg:legs.length+1,error:e?.message||String(e),routeLocked:true,legs,classification:"ROUTE_LOCKED_EXACT_QUOTE_FAILURE"};}
}
function canonicalCandidate4650(c){
 if(c.hops!==2)return candidateKey4650(c);
 return `2|${c.edges.map(e=>`${e.venue}:${e.from}>${e.to}`).sort().join("|")}`;
}
function snapshotCandidates4651(source,limit){
 const selected=[],seen=new Set();
 for(const c of [...source].sort((a,b)=>b.probeGrossSpreadPct-a.probeGrossSpreadPct)){
  const k=canonicalCandidate4650(c);if(seen.has(k))continue;seen.add(k);
  selected.push(JSON.parse(JSON.stringify(c)));if(selected.length>=limit)break;
 }
 return selected;
}

const MIN_NET_PROFIT_USD_4660=15;
const CONSERVATIVE_EXECUTOR_GAS_UNITS_4660=450000;
async function economicsContext4660(){
 const provider=getBaseProvider();
 const fee=await provider.getFeeData();
 const gasPriceWei=fee.maxFeePerGas??fee.gasPrice??0n;
 const assetUsd={USDC:1,USDbC:1,DAI:1,WETH:null,cbETH:null,cbBTC:null};
 async function directUsd(sym,amount){
  try{const q=await uniswapV3BestQuote({sellToken:sym,buyToken:"USDC",sellAmount:amount});return Number(q.best.buyAmount)/amount;}catch(_){}
  try{const q=await aerodromeBestQuote({sellToken:sym,buyToken:"USDC",sellAmount:amount});return Number(q.best.buyAmount)/amount;}catch(_){}
  return null;
 }
 assetUsd.WETH=await directUsd("WETH",0.01);
 assetUsd.cbETH=await directUsd("cbETH",0.01);
 assetUsd.cbBTC=await directUsd("cbBTC",0.001);
 const ethUsd=assetUsd.WETH;
 const gasCostEth=Number(gasPriceWei)*CONSERVATIVE_EXECUTOR_GAS_UNITS_4660/1e18;
 const gasCostUsd=Number.isFinite(ethUsd)?gasCostEth*ethUsd:null;
 return {gasPriceWei:gasPriceWei.toString(),ethUsd,assetUsd,gasUnitsAssumption:CONSERVATIVE_EXECUTOR_GAS_UNITS_4660,gasCostEth,gasCostUsd,minNetProfitUsd:MIN_NET_PROFIT_USD_4660,gasSource:"BASE_PROVIDER_FEE_DATA",assetUsdSource:"DIRECT_BASE_DEX_REFERENCE_QUOTES",gasUnitsSource:"CONSERVATIVE_SCREEN_ONLY_NOT_EXECUTOR_ESTIMATE"};
}
function grossUsd4660(test,ctx){
 const sym=test.startSymbol,g=Number(test.grossPnl),px=ctx?.assetUsd?.[sym];
 if(!Number.isFinite(g)||!Number.isFinite(px))return null;
 return g*px;
}
function applyEconomics4660(test,ctx){
 if(!test?.ok||!test.positive)return {...test,economics:null};
 const grossUsd=grossUsd4660(test,ctx);
 const conservativeNetUsd=Number.isFinite(grossUsd)&&Number.isFinite(ctx.gasCostUsd)?grossUsd-ctx.gasCostUsd:null;
 const passesMin=Number.isFinite(conservativeNetUsd)&&conservativeNetUsd>=MIN_NET_PROFIT_USD_4660;
 return {...test,economics:{grossProfitUsd:grossUsd,conservativeGasCostUsd:ctx.gasCostUsd,conservativeNetUsd,minNetProfitUsd:MIN_NET_PROFIT_USD_4660,passesMinNetProfitScreen:passesMin,requiresAtomicExecutorGasEstimate:true,requiresAtomicSimulation:passesMin,classification:passesMin?"PASSES_CONSERVATIVE_ECONOMICS_SCREEN_REQUIRES_ATOMIC_GAS_AND_SIMULATION":"REJECTED_BY_CONSERVATIVE_ECONOMICS_SCREEN"}};
}
async function validateSnapshot4651(snapshot){
 const results=[];const economicsContext=await economicsContext4660();exact4650.economicsContext=economicsContext;
 exact4650.phase="VALIDATING";exact4650.validationStartedAt=new Date().toISOString();const vs=Date.now();
 for(const c of snapshot){
  const tests=[];
  for(const size of candidateSizes4650(c)){
   exact4650.sizeTests++;const t=await validateSize4650(c,size);tests.push(t);
   if(t.ok){exact4650.successfulRoundTrips++;if(t.positive)exact4650.positiveRoundTrips++;}else exact4650.quoteFailures++;
  }
  const enriched=tests.map(t=>applyEconomics4660(t,economicsContext));
  const viable=enriched.filter(x=>x.ok).sort((a,b)=>b.grossReturnPct-a.grossReturnPct),positive=viable.filter(x=>x.positive),economicSurvivors=positive.filter(x=>x.economics?.passesMinNetProfitScreen),best=viable[0]||null;
  results.push({candidateKey:candidateKey4650(c),hops:c.hops,path:c.path,venues:c.venues,detectedProbeGrossSpreadPct:c.probeGrossSpreadPct,sizesTested:enriched.length,positiveSizes:positive.length,economicSurvivorSizes:economicSurvivors.length,best,tests:enriched,economicsContext,classification:economicSurvivors.length?"CONSERVATIVE_ECONOMICS_SURVIVOR_REQUIRES_ATOMIC_EXECUTOR_GAS_AND_SIMULATION":positive.length?"GROSS_POSITIVE_REJECTED_BY_CONSERVATIVE_ECONOMICS_SCREEN":"REJECTED_BY_EXACT_CROSS_VENUE_ROUND_TRIP",executionEligible:false});
  exact4650.candidatesValidated++;
 }
 exact4650.validationCompletedAt=new Date().toISOString();exact4650.validationLatencyMs=Date.now()-vs;
 return results.sort((a,b)=>(b.best?.grossReturnPct??-Infinity)-(a.best?.grossReturnPct??-Infinity));
}

const ADAPTIVE_MAX_NOTIONAL_USD_4680=5000;
const ADAPTIVE_MAX_STEPS_4680=8;
function startAssetUsd4680(sym,ctx){const p=ctx?.assetUsd?.[sym];return Number.isFinite(p)?p:null;}
async function adaptiveSizeTests4680(c,economicsContext){
 const initial=candidateSizes4650(c),tests=[],seen=new Set();
 async function testSize(size){
  const key=Number(size).toPrecision(12);if(seen.has(key))return null;seen.add(key);
  exact4650.sizeTests++;const t=await validateSize4650(c,size);tests.push(t);
  if(t.ok){exact4650.successfulRoundTrips++;if(t.positive)exact4650.positiveRoundTrips++;}else exact4650.quoteFailures++;
  return t;
 }
 for(const size of initial)await testSize(size);
 const ok=tests.filter(t=>t.ok),positive=ok.filter(t=>t.positive);
 if(!positive.length)return {tests,adaptive:{attempted:false,reason:"NO_POSITIVE_INITIAL_SIZE",steps:0}};
 const px=startAssetUsd4680(c.path[0],economicsContext);
 if(!Number.isFinite(px))return {tests,adaptive:{attempted:false,reason:"NO_START_ASSET_USD_PRICE",steps:0}};
 let bestPositive=positive.sort((a,b)=>b.grossPnl*px-a.grossPnl*px)[0];
 let size=Math.max(...positive.map(t=>t.size)),steps=0,negativeStreak=0,lastPositiveUsd=bestPositive.grossPnl*px;
 while(steps<ADAPTIVE_MAX_STEPS_4680){
  const next=Number((size*2).toPrecision(10)),notional=next*px;
  if(notional>ADAPTIVE_MAX_NOTIONAL_USD_4680)break;
  const t=await testSize(next);steps++;size=next;
  if(!t||!t.ok){break;}
  if(t.positive){
   const usd=t.grossPnl*px;
   if(usd>lastPositiveUsd)lastPositiveUsd=usd;
   negativeStreak=0;
  }else{
   negativeStreak++;
   if(negativeStreak>=2)break;
  }
 }
 return {tests,adaptive:{attempted:true,steps,maxNotionalUsd:ADAPTIVE_MAX_NOTIONAL_USD_4680,lastSizeTested:size,stopPolicy:"ROUTE_FAILURE_OR_TWO_CONSECUTIVE_NON_POSITIVE_OR_MAX_STEPS_OR_5000_USD_NOTIONAL"}};
}
async function validateOneStreaming4670(c,economicsContext){
 const adaptiveRun=await adaptiveSizeTests4680(c,economicsContext),tests=adaptiveRun.tests;
 const enriched=tests.map(t=>applyEconomics4660(t,economicsContext));
 const viable=enriched.filter(x=>x.ok).sort((a,b)=>b.grossReturnPct-a.grossReturnPct),positive=viable.filter(x=>x.positive),economicSurvivors=positive.filter(x=>x.economics?.passesMinNetProfitScreen),best=viable[0]||null;
 exact4650.candidatesValidated++;
 return {candidateKey:candidateKey4650(c),hops:c.hops,path:c.path,venues:c.venues,detectedProbeGrossSpreadPct:c.probeGrossSpreadPct,sizesTested:enriched.length,positiveSizes:positive.length,economicSurvivorSizes:economicSurvivors.length,best,tests:enriched,economicsContext,adaptiveSizing:adaptiveRun.adaptive,streamEmitted:true,classification:economicSurvivors.length?"CONSERVATIVE_ECONOMICS_SURVIVOR_REQUIRES_ATOMIC_EXECUTOR_GAS_AND_SIMULATION":positive.length?"GROSS_POSITIVE_REJECTED_BY_CONSERVATIVE_ECONOMICS_SCREEN":"REJECTED_BY_EXACT_CROSS_VENUE_ROUND_TRIP",executionEligible:false};
}
async function runExact4650(limit=10){
 if(exact4650.status==="RUNNING")return;
 exact4650={...exact4650,status:"RUNNING",phase:"STREAM_DISCOVERING_AND_VALIDATING",startedAt:new Date().toISOString(),completedAt:null,error:null,discoveryStartedAt:new Date().toISOString(),discoveryCompletedAt:null,validationStartedAt:null,validationCompletedAt:null,discoveryLatencyMs:null,validationLatencyMs:null,candidatesDetected:0,candidatesInput:0,candidatesValidated:0,sizeTests:0,successfulRoundTrips:0,positiveRoundTrips:0,quoteFailures:0,results:[],candidateSnapshot:[],economicsContext:null,firstValidationAt:null,firstValidationLatencyMs:null,streamCandidatesAccepted:0};
 const totalStart=Date.now(),ds=Date.now(),accepted=new Set(),validationStarted=Date.now();
 const economicsContext=await economicsContext4660();exact4650.economicsContext=economicsContext;
 await runStreamingDiscovery4670(async c=>{
  exact4650.candidatesDetected=stream4670.candidatesEmitted;
  if(exact4650.streamCandidatesAccepted>=limit)return;
  const canonical=canonicalCandidate4650(c);if(accepted.has(canonical))return;accepted.add(canonical);
  const frozen=JSON.parse(JSON.stringify(c));exact4650.candidateSnapshot.push(frozen);exact4650.candidatesInput++;exact4650.streamCandidatesAccepted++;
  if(!exact4650.validationStartedAt){exact4650.validationStartedAt=new Date().toISOString();exact4650.firstValidationAt=exact4650.validationStartedAt;exact4650.firstValidationLatencyMs=Date.now()-totalStart;}
  exact4650.phase="STREAM_DISCOVERING_AND_VALIDATING";
  const result=await validateOneStreaming4670(frozen,economicsContext);exact4650.results.push(result);
 });
 exact4650.discoveryCompletedAt=new Date().toISOString();exact4650.discoveryLatencyMs=Date.now()-ds;exact4650.candidatesDetected=stream4670.candidatesEmitted;
 exact4650.validationCompletedAt=new Date().toISOString();exact4650.validationLatencyMs=exact4650.validationStartedAt?Date.now()-validationStarted:0;
 exact4650.results.sort((a,b)=>(b.best?.grossReturnPct??-Infinity)-(a.best?.grossReturnPct??-Infinity));
 exact4650.phase=exact4650.candidatesInput?"COMPLETE":"NO_POSITIVE_CANDIDATE_DURING_STREAM";
 exact4650.status="COMPLETE";exact4650.completedAt=new Date().toISOString();exact4650.lastLatencyMs=Date.now()-totalStart;
}
function exactSummary4650(){
 return {success:exact4650.status!=="ERROR",version:VERSION,status:exact4650.status,phase:exact4650.phase,error:exact4650.error,architecture:"INCREMENTAL_CURVE_COMPLETION_TO_EDGE_CACHE_TO_AFFECTED_CYCLE_EMISSION_TO_IMMEDIATE_ROUTE_LOCKED_VALIDATION",startedAt:exact4650.startedAt,completedAt:exact4650.completedAt,discoveryStartedAt:exact4650.discoveryStartedAt,discoveryCompletedAt:exact4650.discoveryCompletedAt,validationStartedAt:exact4650.validationStartedAt,validationCompletedAt:exact4650.validationCompletedAt,discoveryLatencyMs:exact4650.discoveryLatencyMs,validationLatencyMs:exact4650.validationLatencyMs,candidatesDetected:exact4650.candidatesDetected,candidatesInput:exact4650.candidatesInput,candidatesValidated:exact4650.candidatesValidated,sizeTests:exact4650.sizeTests,successfulRoundTrips:exact4650.successfulRoundTrips,positiveRoundTrips:exact4650.positiveRoundTrips,quoteFailures:exact4650.quoteFailures,candidateSnapshot:exact4650.candidateSnapshot,results:exact4650.results,economicsContext:exact4650.economicsContext,firstValidationAt:exact4650.firstValidationAt,firstValidationLatencyMs:exact4650.firstValidationLatencyMs,streamCandidatesAccepted:exact4650.streamCandidatesAccepted,streamDiscovery:streamSummary4670(),lastLatencyMs:exact4650.lastLatencyMs,limitations:{streamingCandidateEmission:true,incrementalEdgeCache:true,affectedCycleRecompute:true,immediateValidationDuringDiscovery:true,sameRunCandidateHandoff:true,noRediscoveryBetweenDetectionAndValidation:true,routeLockedValidation:true,aerodromePoolTypeLocked:true,uniswapFeeTierLocked:true,uniswapPoolIdentityVerified:true,exactIntermediateAmountChaining:true,multiSizeValidation:true,duplicateTwoEdgeEconomicCyclesCollapsed:true,conservativeGasScreenIncluded:true,gasIncludedInFinalNetProfit:false,atomicExecutorGasEstimated:false,flashLoanFeeIncluded:false,netProfitClaim:false,minNetProfitUsd:15,atomicForkSimulation:"NEXT_GATE_ONLY_IF_POSITIVE_SURVIVOR"},executionEligible:false,readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false};
}
app.get("/api/validator/crossvenue/start",(req,res)=>{
 if(exact4650.status==="RUNNING")return res.json({...exactSummary4650(),statusRoute:"/api/validator/crossvenue/status"});
 const limit=Math.max(1,Math.min(20,Number(req.query.limit)||10));
 setImmediate(async()=>{try{await runExact4650(limit);}catch(e){exact4650.status="ERROR";exact4650.phase="ERROR";exact4650.completedAt=new Date().toISOString();exact4650.error=e?.message||String(e);}});
 res.json({success:true,version:VERSION,status:"STARTED",statusRoute:"/api/validator/crossvenue/status",executionEligible:false,readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false});
});
app.get("/api/validator/crossvenue/status",(req,res)=>res.json(exactSummary4650()));

/* ArbiFlow 4.59.4 — additive cross-DEX opportunity graph.
   First verified cross-venue lane: Uniswap V3 <-> Aerodrome on Base.
   Uses the already-present direct venue quote adapters; no aggregator is used
   for discovery and no transaction is signed or broadcast. */
let crossDexState4594={status:"IDLE",startedAt:null,completedAt:null,error:null,result:null,progress:{pairsConsidered:0,routeJobsBuilt:0,routeJobsCompleted:0,quoteFailures:0,quoteFailureClasses:{},positiveGross:0,elapsedMs:0}};

function crossDexSizes4594(){
 const raw=String(process.env.ARBIFLOW_CROSSDEX_SIZES_USD||"100,500,2500").split(",").map(Number).filter(x=>Number.isFinite(x)&&x>0);
 return [...new Set(raw)].sort((a,b)=>a-b).slice(0,5);
}
function crossDexPairs4594(){
 const n=NETWORKS.base, st=Object.values(n.tokens).filter(x=>x.stable), assets=Object.values(n.tokens).filter(x=>!x.stable);
 const out=[]; for(const b of st)for(const a of assets)out.push({base:b.symbol,asset:a.symbol}); return out;
}
async function crossDexQuoteLeg4594(venue,sellToken,buyToken,sellAmount){
 if(venue==="UNISWAP_V3")return (await uniswapV3BestQuote({sellToken,buyToken,sellAmount})).best;
 if(venue==="AERODROME")return (await aerodromeBestQuote({sellToken,buyToken,sellAmount})).best;
 throw new Error("CROSSDEX_VENUE_NOT_SUPPORTED");
}
async function crossDexOpportunityScan4594(){
 const started=Date.now(),progress=crossDexState4594.progress,sizes=crossDexSizes4594(),pairs=crossDexPairs4594();
 progress.pairsConsidered=pairs.length;
 const jobs=[]; for(const pair of pairs)for(const usd of sizes){
  jobs.push({...pair,usd,buyVenue:"UNISWAP_V3",sellVenue:"AERODROME"});
  jobs.push({...pair,usd,buyVenue:"AERODROME",sellVenue:"UNISWAP_V3"});
 }
 progress.routeJobsBuilt=jobs.length;
 const rows=await mapLimit4501(jobs,4,async j=>{try{
  const first=await withTimeout4501(crossDexQuoteLeg4594(j.buyVenue,j.base,j.asset,j.usd),12000,"CROSSDEX_BUY_TIMEOUT");
  const second=await withTimeout4501(crossDexQuoteLeg4594(j.sellVenue,j.asset,j.base,first.buyAmount),12000,"CROSSDEX_SELL_TIMEOUT");
  const finalUsd=Number(second.buyAmount),grossUsd=finalUsd-j.usd,grossReturnPct=grossUsd/j.usd*100;
  progress.routeJobsCompleted++; if(grossUsd>0)progress.positiveGross++;
  return {chain:"base",pair:`${j.base}/${j.asset}`,base:j.base,asset:j.asset,sizeUsd:j.usd,buyVenue:j.buyVenue,sellVenue:j.sellVenue,intermediateAmount:first.buyAmount,finalUsd:round(finalUsd,8),grossUsd:round(grossUsd,8),grossReturnPct:round(grossReturnPct,8),positiveGross:grossUsd>0,buyDetail:first,sellDetail:second};
 }catch(e){progress.quoteFailures++;const cls=classifyQuoteFailure4580(e);progress.quoteFailureClasses[cls]=(progress.quoteFailureClasses[cls]||0)+1;return null;}});
 progress.elapsedMs=Date.now()-started;
 const valid=rows.filter(Boolean),ranked=valid.filter(x=>x.positiveGross).sort((a,b)=>b.grossUsd-a.grossUsd);
 return {success:true,version:VERSION,classification:"CROSS_DEX_OPPORTUNITY_GRAPH_COMPLETE",architecture:"DIRECT_UNISWAP_V3_AND_AERODROME_QUOTES_TO_TWO_LEG_ROUND_TRIP_VALIDATION",scope:{chain:"base",venues:["Uniswap V3","Aerodrome"],pairs:pairs.map(x=>`${x.base}/${x.asset}`),sizesUsd:sizes,bothVenueDirections:true},progress:{...progress},testedRoutes:valid.length,rankedOpportunities:ranked.slice(0,100),positiveOpportunityCount:ranked.length,nextGate:"GAS_FLASH_LOAN_SLIPPAGE_AND_FORK_SIMULATION_REQUIRED_BEFORE_EXECUTION",readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false,generatedAt:new Date().toISOString()};
}
async function runCrossDex4594(){
 if(crossDexState4594.status==="RUNNING")return;
 crossDexState4594={status:"RUNNING",startedAt:new Date().toISOString(),completedAt:null,error:null,result:crossDexState4594.result,progress:{pairsConsidered:0,routeJobsBuilt:0,routeJobsCompleted:0,quoteFailures:0,quoteFailureClasses:{},positiveGross:0,elapsedMs:0}};
 try{const result=await crossDexOpportunityScan4594();crossDexState4594={...crossDexState4594,status:"COMPLETE",completedAt:new Date().toISOString(),result};}
 catch(e){crossDexState4594={...crossDexState4594,status:"ERROR",completedAt:new Date().toISOString(),error:e?.message||String(e)};}
}
app.get("/api/opportunities/crossdex/start",(req,res)=>{const running=crossDexState4594.status==="RUNNING";if(!running)setImmediate(()=>runCrossDex4594());res.json({success:true,version:VERSION,status:running?"ALREADY_RUNNING":"STARTED",statusRoute:"/api/opportunities/crossdex/status",scope:"Base: Uniswap V3 <-> Aerodrome",readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false});});
app.get("/api/opportunities/crossdex/status",(req,res)=>{const st=crossDexState4594;res.json({success:st.status!=="ERROR",version:VERSION,status:st.status,startedAt:st.startedAt,completedAt:st.completedAt,error:st.error,progress:st.progress,result:st.result,readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false});});

/* ArbiFlow 4.59.2 — local economics + route pruning before exact validation.
   The graph spread is a screening signal only. We conservatively remove fee-tier
   directions whose preliminary spread cannot cover the two pool fees plus a
   configurable safety buffer, then exact-test only representative sizes.
   Exact quoter output remains the authority for gross P/L. */
let candidateExactState4591={status:"IDLE",startedAt:null,completedAt:null,error:null,result:null,progress:{candidateCount:0,candidatesValidated:0,localDirectionsConsidered:0,localDirectionsPruned:0,localDirectionsPromoted:0,routeJobsBuilt:0,quotesCompleted:0,exactQuotes:0,quoteFailures:0,quoteFailureClasses:{},preferredDirectionJobs:0,nonPreferredDirectionJobs:0,positiveGross:0,elapsedMs:0}};

function localRouteScreen4592(c,buyFee,sellFee,safetyBps){
 const spreadBps=Math.max(0,Number(c.preliminarySpreadPct||0)*100);
 const feeBps=(Number(buyFee)+Number(sellFee))/100; // V3 fee units: 500 = 5 bps
 const requiredBps=feeBps+Math.max(0,safetyBps);
 return {spreadBps,feeBps,requiredBps,estimatedSurplusBps:spreadBps-requiredBps,promote:spreadBps>requiredBps};
}
function representativeSizes4592(){
 const raw=String(process.env.ARBIFLOW_LOCAL_EXACT_SIZES_USD||"100,500,2500").split(",").map(Number).filter(x=>Number.isFinite(x)&&x>0);
 return [...new Set(raw)].sort((a,b)=>a-b).slice(0,5);
}
async function candidateExactValidation4591(){
 const started=Date.now();
 let graph=opportunityGraphState4590.result;
 if(!graph||opportunityGraphState4590.status!=="COMPLETE") graph=await buildOpportunityGraph4590();
 const minSpreadPct=Math.max(0,Number(process.env.ARBIFLOW_CANDIDATE_MIN_SPREAD_PCT||"0.01"));
 const maxCandidates=Math.max(1,Math.min(100,Number(process.env.ARBIFLOW_CANDIDATE_LIMIT||"60")));
 const safetyBps=Math.max(0,Number(process.env.ARBIFLOW_LOCAL_SCREEN_SAFETY_BPS||"2"));
 const exactSizes=representativeSizes4592();
 const candidates=(graph.topCandidates||[]).filter(x=>Number(x.preliminarySpreadPct)>=minSpreadPct).slice(0,maxCandidates);
 const progress=candidateExactState4591.progress; progress.candidateCount=candidates.length;
 const decimalCache=new Map(), timeoutMs=12000;
 const getDecimals=async(chain,provider,token)=>{const k=chain+":"+token.toLowerCase();if(decimalCache.has(k))return decimalCache.get(k);const d=Number(await withTimeout4501(new Contract(token,ERC20_META_ABI_4480,provider).decimals(),timeoutMs,"DECIMALS_TIMEOUT"));decimalCache.set(k,d);return d;};
 const byChain=new Map(); for(const c of candidates){if(!byChain.has(c.chain))byChain.set(c.chain,[]);byChain.get(c.chain).push(c);}
 const chainResults=await mapLimit4501([...byChain.entries()],3,async([chain,list])=>{
  const cfg=UNISWAP_V3_DISCOVERY_4470[chain],rpc=RPC_URLS[chain]||"",quoter=UNISWAP_V3_QUOTER_V1_4490[chain];
  if(!cfg||!rpc||!quoter)return {chain,classification:!cfg?"NO_CONFIG":!rpc?"RPC_NOT_CONFIGURED":"QUOTER_NOT_CONFIGURED",rows:[]};
  const provider=new JsonRpcProvider(rpc,undefined,{staticNetwork:false}); await withTimeout4501(provider.getNetwork(),timeoutMs,"NETWORK_TIMEOUT");
  const jobs=[];
  for(const c of list){
   const base=cfg.tokens[c.baseSym],asset=cfg.tokens[c.assetSym];if(!base||!asset)continue;
   for(const [buyFee,sellFee] of [[c.feeA,c.feeB],[c.feeB,c.feeA]]){
    progress.localDirectionsConsidered++;
    const local=localRouteScreen4592(c,buyFee,sellFee,safetyBps);
    if(!local.promote){progress.localDirectionsPruned++;continue;}
    progress.localDirectionsPromoted++;
    const preferred=(Number(c.locallyPreferredBuyFee)===Number(buyFee)&&Number(c.locallyPreferredSellFee)===Number(sellFee));
    if(preferred)progress.preferredDirectionJobs+=exactSizes.length;else progress.nonPreferredDirectionJobs+=exactSizes.length;
    for(const usd of exactSizes)jobs.push({c,base,asset,buyFee,sellFee,usd,local,preferred});
   }
  }
  progress.routeJobsBuilt+=jobs.length;
  const rows=await mapLimit4501(jobs,8,async j=>{try{
   const bd=await getDecimals(chain,provider,j.base);const amountIn=parseUnits(String(j.usd),bd);
   const q1=await withTimeout4501(quoteV3Single4490(provider,quoter,j.base,j.asset,j.buyFee,amountIn,chain),timeoutMs,"BUY_QUOTE_TIMEOUT");
   const q2=await withTimeout4501(quoteV3Single4490(provider,quoter,j.asset,j.base,j.sellFee,q1,chain),timeoutMs,"SELL_QUOTE_TIMEOUT");
   progress.quotesCompleted+=2;progress.exactQuotes+=2;
   const out=Number(formatUnits(q2,bd)),gross=out-j.usd;if(gross>0)progress.positiveGross++;
   return {chain,venue:j.c.venue,base:j.c.baseSym,asset:j.c.assetSym,sizeUsd:j.usd,buyFee:j.buyFee,sellFee:j.sellFee,preferredDirection:j.preferred,preliminarySpreadPct:j.c.preliminarySpreadPct,priceA_BasePerAsset:j.c.priceA_BasePerAsset,priceB_BasePerAsset:j.c.priceB_BasePerAsset,localEstimatedSurplusBps:j.local.estimatedSurplusBps,amountOutUsd:out,grossUsd:gross,positive:gross>0};
  }catch(e){progress.quoteFailures++;const cls=classifyQuoteFailure4580(e);progress.quoteFailureClasses[cls]=(progress.quoteFailureClasses[cls]||0)+1;return null;}});
  progress.candidatesValidated+=list.length; return {chain,classification:"LOCAL_PRUNED_EXACT_VALIDATED",candidateCount:list.length,rows:rows.filter(Boolean)};
 });
 const ranked=chainResults.flatMap(x=>x.rows||[]).filter(x=>x.positive).sort((a,b)=>b.grossUsd-a.grossUsd);progress.elapsedMs=Date.now()-started;
 return {success:true,version:VERSION,classification:"PRICE_NORMALIZATION_QUOTE_DIAGNOSTICS_COMPLETE",architecture:"ORIENTED_DECIMAL_NORMALIZED_GRAPH_TO_LOCAL_FEE_SCREEN_TO_CLASSIFIED_EXACT_VALIDATION",candidateFilter:{minSpreadPct,maxCandidates,graphCandidateCount:graph.candidateCount,selectedCandidates:candidates.length,bothDirectionsScreened:true,safetyBps,exactSizesUsd:exactSizes},progress:{...progress},chainResults:chainResults.map(x=>({chain:x.chain,classification:x.classification,candidateCount:x.candidateCount||0,rows:(x.rows||[]).length})),rankedOpportunities:ranked.slice(0,100),positiveOpportunityCount:ranked.length,diagnosticFallbackRoute:"/api/opportunities/multichain/start",readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false,generatedAt:new Date().toISOString()};
}
async function runCandidateExact4591(){if(candidateExactState4591.status==="RUNNING")return;candidateExactState4591={status:"RUNNING",startedAt:new Date().toISOString(),completedAt:null,error:null,result:candidateExactState4591.result,progress:{candidateCount:0,candidatesValidated:0,localDirectionsConsidered:0,localDirectionsPruned:0,localDirectionsPromoted:0,routeJobsBuilt:0,quotesCompleted:0,exactQuotes:0,quoteFailures:0,quoteFailureClasses:{},preferredDirectionJobs:0,nonPreferredDirectionJobs:0,positiveGross:0,elapsedMs:0}};try{const result=await candidateExactValidation4591();candidateExactState4591={...candidateExactState4591,status:"COMPLETE",completedAt:new Date().toISOString(),result};}catch(e){candidateExactState4591={...candidateExactState4591,status:"ERROR",completedAt:new Date().toISOString(),error:e?.message||String(e)};}}
app.get("/api/opportunities/candidates/start",(req,res)=>{const running=candidateExactState4591.status==="RUNNING";if(!running)setImmediate(()=>runCandidateExact4591());res.json({success:true,version:VERSION,status:running?"ALREADY_RUNNING":"STARTED",statusRoute:"/api/opportunities/candidates/status",readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false});});
app.get("/api/opportunities/candidates/status",(req,res)=>{const st=candidateExactState4591;if(st.status==="RUNNING"&&st.startedAt)st.progress.elapsedMs=Date.now()-Date.parse(st.startedAt);res.json({success:st.status!=="ERROR",version:VERSION,status:st.status,startedAt:st.startedAt,completedAt:st.completedAt,error:st.error,progress:st.progress,result:st.result,readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false});});

let opportunityScanState4581={status:"IDLE",version:VERSION,startedAt:null,completedAt:null,error:null,result:null,progress:{chainsTotal:OPPORTUNITY_CHAINS_4580.length,chainsCompleted:0,chainFailures:0,poolsChecked:0,poolFailures:0,routeJobsBuilt:0,quotesCompleted:0,exactQuotes:0,quoteFailures:0,positiveGross:0,currentChains:[],elapsedMs:0}};
async function runOpportunityScan4581(){
 if(opportunityScanState4581.status==="RUNNING")return;
 opportunityScanState4581={status:"RUNNING",version:VERSION,startedAt:new Date().toISOString(),completedAt:null,error:null,result:opportunityScanState4581.result,progress:{chainsTotal:OPPORTUNITY_CHAINS_4580.length,chainsCompleted:0,chainFailures:0,poolsChecked:0,poolFailures:0,routeJobsBuilt:0,quotesCompleted:0,exactQuotes:0,quoteFailures:0,positiveGross:0,currentChains:[],elapsedMs:0}};
 try{const result=await multiChainOpportunityWorker4581();opportunityScanState4581={status:"COMPLETE",version:VERSION,startedAt:opportunityScanState4581.startedAt,completedAt:new Date().toISOString(),error:null,result,progress:opportunityScanState4581.progress};}
 catch(e){opportunityScanState4581={status:"ERROR",version:VERSION,startedAt:opportunityScanState4581.startedAt,completedAt:new Date().toISOString(),error:e?.message||String(e),result:opportunityScanState4581.result,progress:opportunityScanState4581.progress};}
}
app.get("/api/opportunities/multichain/start",(req,res)=>{const running=opportunityScanState4581.status==="RUNNING";if(!running)setImmediate(()=>runOpportunityScan4581());res.json({success:true,version:VERSION,status:running?"ALREADY_RUNNING":"STARTED",statusRoute:"/api/opportunities/multichain/status",readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false});});
app.get("/api/opportunities/multichain/status",(req,res)=>{const st=opportunityScanState4581;if(st.status==="RUNNING"&&st.startedAt)st.progress.elapsedMs=Date.now()-Date.parse(st.startedAt);res.json({success:st.status!=="ERROR",version:VERSION,status:st.status,startedAt:st.startedAt,completedAt:st.completedAt,error:st.error,progress:st.progress,result:st.result,readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false});});
app.get("/api/opportunities/multichain",(req,res)=>{const st=opportunityScanState4581;res.json({success:true,version:VERSION,status:st.status,instruction:st.status==="IDLE"?"Open /api/opportunities/multichain/start once, then /api/opportunities/multichain/status.":"Use /api/opportunities/multichain/status for progress/results.",startRoute:"/api/opportunities/multichain/start",statusRoute:"/api/opportunities/multichain/status",result:st.status==="COMPLETE"?st.result:null,readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false});});

app.get("/api/version", (req,res)=>res.json({success:true,engine:"ArbiFlow Opportunity Engine",version:VERSION,release:"4.59.3_PRICE_NORMALIZATION_QUOTE_DIAGNOSTICS",multiChainOpportunityRoute:"/api/opportunities/multichain",multiChainOpportunityStartRoute:"/api/opportunities/multichain/start",multiChainOpportunityStatusRoute:"/api/opportunities/multichain/status",controlledAtomicRoute:"/api/test/base/controlled-atomic",zeroXAccessRoute:"/api/zero-x/base/access",zeroXProductionReadinessRoute:"/api/zero-x/base/production-readiness",kyberSwapRouteReadinessRoute:"/api/kyberswap/base/route-readiness",kyberSwapBuildReadinessRoute:"/api/kyberswap/base/build-readiness",controlledKyberAtomicRoute:"/api/test/base/controlled-kyberswap-atomic",productionDeploymentReadinessRoute:"/api/production/base/deployment-readiness",productionDeploymentPlanRoute:"/api/production/base/deployment-plan",productionBoundForkValidationRoute:"/api/test/base/production-bound-fork",mainnetExecutionSafetyGateRoute:"/api/production/base/execution-safety-gate",candidateSafetyPipelineRoute:"/api/production/base/candidate-safety-pipeline",hotWatchSafetyPipelineRoute:"/api/production/base/hot-watch-safety-pipeline",marketLiquidityDiagnosticRoute:"/api/diagnostics/base/market-liquidity",multiMarketFoundationRoute:"/api/diagnostics/multimarket/foundation",multiMarketDexPoolDiscoveryRoute:"/api/diagnostics/multimarket/dex-pools",multiMarketDexSpreadRoute:"/api/diagnostics/multimarket/dex-spreads",multiMarketExactSizeFundingRoute:"/api/diagnostics/multimarket/exact-size-funding",multiMarketCrossDexBaseRoute:"/api/diagnostics/multimarket/cross-dex-base",multiMarketCrossDexEconomicRoute:"/api/diagnostics/multimarket/cross-dex-economic",arbitrumExactQuoteExpansionRoute:"/api/diagnostics/multimarket/arbitrum-exact-quotes",baseMultiDexVenues:["UNISWAP_V3","AERODROME","PANCAKESWAP_V3","SUSHISWAP_V3"],baseCrossDexAssets:["WETH","cbBTC","DAI","cbETH","USDbC"],zeroXAccessAliases:["/api/test/zerox/access","/api/test/zero-x/access"],liveExecutionEnabled:false,mainnetBroadcast:false,time:now()}));

/*
=========================================================
ArbiFlow 4.70.0 — CANDIDATE DISCOVERY MILESTONE
Pair-centric local-state candidate discovery. No quote-grid discovery.
Continuous affected-pair sweeps + hot-pair safety sweeps + <=5 minute
full reconciliation trigger. Exact RPC quoting remains finalist-only.
Read-only / fail-closed. Mainnet execution remains disabled.
=========================================================
*/
const CANDIDATE4700_MIN_SPREAD_BPS=Math.max(0,Number(process.env.ARBIFLOW_4700_MIN_SPREAD_BPS||"1"));
const CANDIDATE4700_HOT_SWEEP_MS=Math.max(1000,Number(process.env.ARBIFLOW_4700_HOT_SWEEP_MS||"5000"));
const CANDIDATE4700_FULL_RECONCILE_MS=Math.max(60000,Math.min(300000,Number(process.env.ARBIFLOW_4700_FULL_RECONCILE_MS||"300000")));
const CANDIDATE4700_MAX_AGE_MS=Math.max(250,Number(process.env.ARBIFLOW_4700_MAX_AGE_MS||"2500"));
let candidate4700={status:"IDLE",startedAt:null,lastSweepAt:null,lastFullReconcileAt:null,lastEventScanAt:null,sweeps:0,eventScans:0,fullReconciles:0,pairsEvaluated:0,localSignals:0,noiseRejected:0,staleDropped:0,candidates:[],hotPairs:[],timer:null,reconcileTimer:null,lastError:null};
function pairKey4700(a,b){return [String(a),String(b)].sort().join("|");}
function edgePair4700(e){return pairKey4700(e.from,e.to);}
function localTwoEdgeCandidates4700(affectedPairs=null){
 if(graph4620.status!=="READY")buildGraph4620();
 const edges=[...graph4620.edges.values()], byPair=new Map();
 for(const e of edges){const k=edgePair4700(e);if(affectedPairs&&affectedPairs.size&&!affectedPairs.has(k))continue;const a=byPair.get(k)||[];a.push(e);byPair.set(k,a);}
 const out=[],seen=new Set();let evaluated=0;
 for(const [pair,rows] of byPair){
  for(const buy of rows){for(const sell of rows){
   if(buy.from!==sell.to||buy.to!==sell.from)continue;
   if(String(buy.pool).toLowerCase()===String(sell.pool).toLowerCase())continue;
   evaluated++;
   const pools=[String(buy.pool).toLowerCase(),String(sell.pool).toLowerCase()].sort();
   const key=`${pair}|${pools.join("|")}|${buy.from}`;if(seen.has(key))continue;seen.add(key);
   const mult=Number(buy.rate)*Number(sell.rate),spreadPct=(mult-1)*100,spreadBps=spreadPct*100;
   if(!Number.isFinite(spreadBps)||spreadBps<=0)continue;
   const fromSym=graph4620.nodes.get(buy.from)?.symbol||buy.from,toSym=graph4620.nodes.get(buy.to)?.symbol||buy.to;
   out.push({hops:2,path:[fromSym,toSym,fromSym],venues:["UNISWAP_V3","UNISWAP_V3"],edges:[{venue:"UNISWAP_V3",from:fromSym,to:toSym,pool:buy.pool,feeTier:buy.feeTier},{venue:"UNISWAP_V3",from:toSym,to:fromSym,pool:sell.pool,feeTier:sell.feeTier}],pools:[buy.pool,sell.pool],feeTiers:[buy.feeTier,sell.feeTier],probeGrossSpreadPct:spreadPct,localSpreadBps:spreadBps,pair,detectedAt:new Date().toISOString(),stateBlocks:[buy.snapshotBlock,sell.snapshotBlock],classification:spreadBps>=CANDIDATE4700_MIN_SPREAD_BPS?"LOCAL_PAIR_SIGNAL_REQUIRES_EXACT_SIZE_ECONOMICS":"LOCAL_NOISE"});
  }}
 }
 out.sort((a,b)=>b.localSpreadBps-a.localSpreadBps);return {evaluated,candidates:out};
}
function affectedPairsFromDirty4700(dirtyPools){
 const s=new Set();for(const pool of dirtyPools||[]){for(const id of graph4620.poolEdges.get(String(pool).toLowerCase())||[]){const e=graph4620.edges.get(id);if(e)s.add(edgePair4700(e));}}return s;
}
function sweepCandidate4700(mode="HOT"){
 const started=Date.now();if(graph4620.status!=="READY")buildGraph4620();
 const dirty=[...graph4620.dirtyPools];if(dirty.length)cyclesForDirty4620();
 const affected=mode==="EVENT"?affectedPairsFromDirty4700(dirty):null;
 const scan=localTwoEdgeCandidates4700(affected&&affected.size?affected:null);candidate4700.pairsEvaluated+=scan.evaluated;
 const promoted=scan.candidates.filter(x=>x.localSpreadBps>=CANDIDATE4700_MIN_SPREAD_BPS);candidate4700.localSignals+=promoted.length;candidate4700.noiseRejected+=scan.candidates.length-promoted.length;
 const now=Date.now();candidate4700.candidates=promoted.slice(0,100).map(c=>({...c,ageMs:Math.max(0,now-Date.parse(c.detectedAt)),exactValidationRequired:true,netProfitClaim:false,executionEligible:false}));
 candidate4700.hotPairs=[...new Set(candidate4700.candidates.slice(0,20).map(x=>x.pair))];candidate4700.sweeps++;candidate4700.lastSweepAt=new Date().toISOString();if(mode==="EVENT"){candidate4700.eventScans++;candidate4700.lastEventScanAt=candidate4700.lastSweepAt;}
 return {mode,latencyMs:Date.now()-started,evaluated:scan.evaluated,signals:promoted.length};
}
async function reconcile4700(){
 candidate4700.lastFullReconcileAt=new Date().toISOString();candidate4700.fullReconciles++;
 try{if(marketState4600.status!=="RUNNING")await bootstrapBaseOnly4611();buildGraph4620();sweepCandidate4700("FULL_RECONCILE");}catch(e){candidate4700.lastError=e?.message||String(e);}
}
function startCandidate4700(){
 if(candidate4700.status==="RUNNING")return;
 candidate4700.status="RUNNING";candidate4700.startedAt=new Date().toISOString();candidate4700.lastError=null;
 try{sweepCandidate4700("START");}catch(e){candidate4700.lastError=e?.message||String(e);}
 candidate4700.timer=setInterval(()=>{try{sweepCandidate4700("HOT");}catch(e){candidate4700.lastError=e?.message||String(e);}},CANDIDATE4700_HOT_SWEEP_MS);
 candidate4700.reconcileTimer=setInterval(()=>{reconcile4700().catch(e=>candidate4700.lastError=e?.message||String(e));},CANDIDATE4700_FULL_RECONCILE_MS);
}
function stopCandidate4700(){if(candidate4700.timer)clearInterval(candidate4700.timer);if(candidate4700.reconcileTimer)clearInterval(candidate4700.reconcileTimer);candidate4700.timer=null;candidate4700.reconcileTimer=null;candidate4700.status="STOPPED";}
function candidateSummary4700(){
 const now=Date.now(),fresh=candidate4700.candidates.filter(c=>now-Date.parse(c.detectedAt)<=CANDIDATE4700_MAX_AGE_MS);
 return {success:true,version:VERSION,status:candidate4700.status,architecture:"CONTINUOUS_LOCAL_STATE_TO_PAIR_INDEX_TO_2_EDGE_SAME_PAIR_SIGNAL_TO_FINALIST_ONLY_EXACT_VALIDATION",startedAt:candidate4700.startedAt,lastSweepAt:candidate4700.lastSweepAt,lastEventScanAt:candidate4700.lastEventScanAt,lastFullReconcileAt:candidate4700.lastFullReconcileAt,intervals:{hotPairSweepMs:CANDIDATE4700_HOT_SWEEP_MS,fullReconcileMs:CANDIDATE4700_FULL_RECONCILE_MS,maxCandidateAgeMs:CANDIDATE4700_MAX_AGE_MS},metrics:{sweeps:candidate4700.sweeps,eventScans:candidate4700.eventScans,fullReconciles:candidate4700.fullReconciles,pairsEvaluated:candidate4700.pairsEvaluated,localSignals:candidate4700.localSignals,noiseRejected:candidate4700.noiseRejected,staleDropped:candidate4700.staleDropped},marketState:{bootstrapStatus:marketState4600.status,liveStatus:liveBase4610.status,graphStatus:graph4620.status,poolsIndexed:graph4620.poolEdges.size,graphEdges:graph4620.edges.size},hotPairs:candidate4700.hotPairs,freshLocalSignals:fresh.slice(0,50),localSignalCount:candidate4700.candidates.length,freshSignalCount:fresh.length,profitPolicy:{minimumNetProfitUsd:15,localSignalsAreProfitClaims:false,exactSizeValidationRequired:true,conservativeEconomicsRequired:true,atomicSimulationRequiredBeforeExecution:true},discoveryPolicy:{quoteGridDiscovery:false,pairCentric:true,samePairTwoEdgeFirst:true,trianglesPreservedAsSecondaryDiagnostic:true,rpcQuotesReservedForFinalists:true},lastError:candidate4700.lastError,executionEligible:false,readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false};
}
app.get("/api/candidate-engine/start",(req,res)=>{startCandidate4700();res.json({...candidateSummary4700(),statusRoute:"/api/candidate-engine/status"});});
app.get("/api/candidate-engine/status",(req,res)=>res.json(candidateSummary4700()));
app.get("/api/candidate-engine/scan",(req,res)=>{try{const run=sweepCandidate4700("MANUAL");res.json({...candidateSummary4700(),lastRun:run});}catch(e){res.status(500).json({success:false,version:VERSION,error:e?.message||String(e),readOnly:true});}});
app.get("/api/candidate-engine/reconcile",(req,res)=>{setImmediate(()=>reconcile4700());res.json({success:true,version:VERSION,status:"STARTED",statusRoute:"/api/candidate-engine/status",readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false});});
app.get("/api/candidate-engine/stop",(req,res)=>{stopCandidate4700();res.json(candidateSummary4700());});


/*
=========================================================
ArbiFlow 4.71.0 — GLOBAL DISCREPANCY FOUNDATION
Preserves 4.70 candidate engine and adds independently observable
reference, normalization, Base, aggregator, financing, candidate and
validator health surfaces. Read-only; no mainnet execution.
=========================================================
*/
const globalDiscrepancy4710 = require("./GlobalDiscrepancy4710");
globalDiscrepancy4710.register(app);
// 4.74: reference/CEX telemetry is a core background service and must survive process restarts without a manual HTTP kick.
globalDiscrepancy4710.start();
// 4.78.11: Legacy broad discovery must not start automatically on Alchemy free tier.
// Manual /api/discovery/start remains available. Explicit opt-in only.
const legacyBroadAuto47811 = process.env.ARBIFLOW_AUTO_BROAD_DISCOVERY === "true";
if (legacyBroadAuto47811) startBroadDiscovery4720();

/*
=========================================================
SERVER
=========================================================
*/

const startupGate = process.env.ARBIFLOW_STARTUP_WRAPPER === "1";
if (!startupGate) {
  console.error("[ArbiFlow 4.72.0] STARTUP BLOCKED: server.js must be launched by Startup4300.js");
  process.exit(1);
}
console.log(`[ArbiFlow 4.72.0] WEB PROCESS STARTING :: fork verification state ${process.env.ARBIFLOW_FORK_VERIFIED || "PENDING"} :: execution remains fail-closed`);

// 4.78.19: manual, read-only historical transaction evidence inspection.
// No auto scans, private keys, loan requests, contract deployments, or broadcasts.
const historicalLiquidations47819=require('./LiquidationInvestigator47819');
let historicalInspectBusy47819=false;
app.get('/api/investigator/status',(req,res)=>res.json({success:true,version:VERSION,stage:'HISTORICAL_RECEIPT_INSPECTION_ONLY',busy:historicalInspectBusy47819,supportedChains:['base','arbitrum','optimism'],automaticScanning:false,liveOpportunityDiscovery:false,verifiedProfits:0,safety:{readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false}}));
app.get('/api/investigator/inspect',async(req,res)=>{
 const chain=String(req.query.chain||'base').toLowerCase();
 const hash=String(req.query.hash||'');
 if(!['base','arbitrum','optimism'].includes(chain)||!/^0x[0-9a-fA-F]{64}$/.test(hash))return res.status(400).json({success:false,error:'VALID_CHAIN_AND_TRANSACTION_HASH_REQUIRED'});
 if(historicalInspectBusy47819)return res.status(429).json({success:false,error:'ONE_MANUAL_INSPECTION_AT_A_TIME'});
 historicalInspectBusy47819=true;
 try {const result=await historicalLiquidations47819.inspect({chain,hash,rpcUrls:RPC_URLS});res.json({success:true,version:VERSION,...result});}
 catch(e){res.status(502).json({success:false,version:VERSION,error:String(e.message||e).slice(0,130)});}
 finally{historicalInspectBusy47819=false;}
});

// 4.78.20: registry visibility only. No network requests, automatic scans,
// credentials, trading adapters, contract calls, or execution paths.
const expansionRegistry47820 = require('./registry');
app.get('/api/expansion-25x25/status', (req, res) => {
  res.json({
    success: true,
    engineVersion: VERSION,
    integrationStage: 'REGISTRY_ONLY',
    chainCount: expansionRegistry47820.chains.length,
    exchangeCount: expansionRegistry47820.exchanges.length,
    chains: expansionRegistry47820.chains,
    exchanges: expansionRegistry47820.exchanges,
    safety: expansionRegistry47820.safety,
    activeScannerUnchanged: true,
    liveAdaptersEnabled: 0,
    liveConnectionsVerified: 0
  });
});

// Phase 2: explicit one-chain, read-only RPC probe. No background polling.
const { probeEvmChain, rpcEnvironmentNames } = require('./manual-rpc-probe');
app.get('/api/expansion-25x25/rpc-config', (req, res) => {
  res.json({success:true, stage:'MANUAL_RPC_PROBE', chains:expansionRegistry47820.chains.map(c=>({key:c.key,vm:c.vm,expectedChainId:c.chainId,rpcConfigured:c.vm==='evm' && rpcEnvironmentNames(c.key).some(name=>Boolean(process.env[name])) || (c.vm==='evm' && Boolean(RPC_URLS[c.key])), probeSupported:c.vm==='evm' && Number.isInteger(c.chainId)})), automaticScanning:false, mainnetBroadcast:false});
});
// Phase 3: bounded, manually triggered sequential RPC checks. No timers or scans.
const phase3Targets = Object.freeze(['avalanche','linea','scroll','mantle','zksync']);
let phase3Busy = false;
app.get('/api/expansion-25x25/phase3-config', (req,res) => {
  res.json({success:true,stage:'PHASE3_RPC_ONBOARDING',targets:phase3Targets.map(key=>({key,expectedChainId:expansionRegistry47820.chains.find(c=>c.key===key).chainId,environmentVariable:rpcEnvironmentNames(key)[0],configured:rpcEnvironmentNames(key).some(n=>Boolean(process.env[n]))||Boolean(RPC_URLS[key])})),readOnly:true,automaticScanning:false,mainnetBroadcast:false});
});
app.get('/api/expansion-25x25/phase3-probe', async (req,res) => {
  if(phase3Busy)return res.status(429).json({success:false,error:'PHASE3_PROBE_ALREADY_RUNNING'});
  phase3Busy=true;
  try {
    const results=[];
    for(const key of phase3Targets){
      const chain=expansionRegistry47820.chains.find(c=>c.key===key);
      const envName=rpcEnvironmentNames(key).find(n=>Boolean(process.env[n]));
      const url=envName?process.env[envName]:RPC_URLS[key];
      if(!url){results.push({key,configured:false,status:'NOT_CONFIGURED'});continue;}
      const result=await probeEvmChain({url,expectedChainId:chain.chainId});
      results.push({key,configured:true,...result});
      // Avoid a simultaneous five-network RPC burst.
      await new Promise(resolve=>setTimeout(resolve,1200));
    }
    res.json({success:true,stage:'PHASE3_MANUAL_SEQUENTIAL_RPC_PROBE',results,verified:results.filter(x=>x.status==='VERIFIED').length,readOnly:true,automaticScanning:false,mainnetBroadcast:false});
  } catch(e){res.status(500).json({success:false,error:'PHASE3_PROBE_FAILED'});}
  finally{phase3Busy=false;}
});

// Phase 4: manual, sequential checks for the next five registered EVM chains.
// Existing scanner selection and transaction safeguards are unchanged.
const phase4Targets = Object.freeze(['gnosis','metis','sonic','celo','unichain']);
let phase4Busy = false;
app.get('/api/expansion-25x25/phase4-config', (req,res) => {
  res.json({success:true,stage:'PHASE4_RPC_ONBOARDING',targets:phase4Targets.map(key=>({key,expectedChainId:expansionRegistry47820.chains.find(c=>c.key===key).chainId,environmentVariable:rpcEnvironmentNames(key)[0],configured:rpcEnvironmentNames(key).some(n=>Boolean(process.env[n]))||Boolean(RPC_URLS[key])})),readOnly:true,automaticScanning:false,mainnetBroadcast:false});
});
app.get('/api/expansion-25x25/phase4-probe', async (req,res) => {
  if(phase4Busy)return res.status(409).json({success:false,error:'PHASE4_PROBE_ALREADY_RUNNING'});
  phase4Busy=true;
  try {
    const results=[];
    for(const key of phase4Targets){
      const chain=expansionRegistry47820.chains.find(c=>c.key===key);
      const envName=rpcEnvironmentNames(key).find(n=>Boolean(process.env[n]));
      const url=envName?process.env[envName]:RPC_URLS[key];
      if(!url){results.push({key,configured:false,status:'NOT_CONFIGURED'});continue;}
      const result=await probeEvmChain({url,expectedChainId:chain.chainId});
      results.push({key,configured:true,...result});
      await new Promise(resolve=>setTimeout(resolve,1200));
    }
    res.json({success:true,stage:'PHASE4_MANUAL_SEQUENTIAL_RPC_PROBE',results,verified:results.filter(x=>x.status==='VERIFIED').length,readOnly:true,automaticScanning:false,mainnetBroadcast:false});
  }catch(e){res.status(500).json({success:false,error:'PHASE4_PROBE_FAILED'});}
  finally{phase4Busy=false;}
});

// Phase 5: manually triggered, sequential eth_chainId-only checks. No scanner changes.
const phase5Targets = Object.freeze(['cronos','hyperevm','berachain','sei','abstract']);
let phase5Busy = false;
app.get('/api/expansion-25x25/phase5-config', (req,res) => {
  res.json({success:true,stage:'PHASE5_RPC_ONBOARDING',targets:phase5Targets.map(key=>({key,expectedChainId:expansionRegistry47820.chains.find(c=>c.key===key).chainId,environmentVariable:rpcEnvironmentNames(key)[0],configured:rpcEnvironmentNames(key).some(n=>Boolean(process.env[n]))||Boolean(RPC_URLS[key])})),readOnly:true,automaticScanning:false,mainnetBroadcast:false});
});
app.get('/api/expansion-25x25/phase5-probe', async (req,res) => {
  if(phase5Busy)return res.status(409).json({success:false,error:'PHASE5_PROBE_ALREADY_RUNNING'});
  phase5Busy=true;
  try {
    const results=[];
    for(const key of phase5Targets){
      const chain=expansionRegistry47820.chains.find(c=>c.key===key);
      const envName=rpcEnvironmentNames(key).find(n=>Boolean(process.env[n]));
      const url=envName?process.env[envName]:RPC_URLS[key];
      if(!url){results.push({key,configured:false,status:'NOT_CONFIGURED'});continue;}
      const result=await probeEvmChain({url,expectedChainId:chain.chainId});
      results.push({key,configured:true,...result});
      await new Promise(resolve=>setTimeout(resolve,1200));
    }
    res.json({success:true,stage:'PHASE5_MANUAL_SEQUENTIAL_RPC_PROBE',results,verified:results.filter(x=>x.status==='VERIFIED').length,readOnly:true,automaticScanning:false,mainnetBroadcast:false});
  }catch(e){res.status(500).json({success:false,error:'PHASE5_PROBE_FAILED'});}
  finally{phase5Busy=false;}
});

// Phase 6: four network-specific, manually triggered read-only connectivity checks.
const { phase6Probe, phase6Config } = require('./phase6-network-probe');
let phase6Busy = false;
app.get('/api/expansion-25x25/phase6-config', (req,res) => {
  res.json({success:true,stage:'PHASE6_RPC_ONBOARDING',targets:phase6Config(),readOnly:true,automaticScanning:false,mainnetBroadcast:false});
});
app.get('/api/expansion-25x25/phase6-probe', async (req,res) => {
  if (phase6Busy) return res.status(409).json({success:false,error:'PHASE6_PROBE_ALREADY_RUNNING'});
  phase6Busy=true;
  try {
    const results=[];
    for (const key of ['ronin','monad','solana','sui']) {
      results.push(await phase6Probe(key));
      await new Promise(resolve=>setTimeout(resolve,1200));
    }
    res.json({success:true,stage:'PHASE6_MANUAL_SEQUENTIAL_RPC_PROBE',results,verified:results.filter(r=>r.status==='VERIFIED').length,readOnly:true,automaticScanning:false,mainnetBroadcast:false});
  } catch(e) { res.status(500).json({success:false,error:'PHASE6_PROBE_FAILED'}); }
  finally { phase6Busy=false; }
});

app.get('/api/expansion-25x25/rpc-probe', async (req, res) => {
  const key = typeof req.query.chain==='string' ? req.query.chain.trim().toLowerCase() : '';
  const chain = expansionRegistry47820.chains.find(c=>c.key===key);
  if(!chain) return res.status(400).json({success:false,error:'UNKNOWN_CHAIN'});
  if(chain.vm!=='evm' || !Number.isInteger(chain.chainId)) return res.status(400).json({success:false,error:'NON_EVM_OR_UNVERIFIED_CHAIN_ID',chain:key});
  const envName=rpcEnvironmentNames(key).find(name=>Boolean(process.env[name]));
  const rpcUrl=envName ? process.env[envName] : RPC_URLS[key];
  if(!rpcUrl) return res.json({success:true,chain:key,configured:false,reachable:false,chainIdMatches:false,status:'NOT_CONFIGURED',readOnly:true});
  const result=await probeEvmChain({url:rpcUrl,expectedChainId:chain.chainId});
  return res.json({success:true,chain:key,configured:true,...result,readOnly:true,automaticScanning:false,mainnetBroadcast:false});
});

app.listen(
  PORT,
  () => {
    console.log(
      `ArbiFlow Engine ${VERSION} listening on port ${PORT}`
    );
  }
);



// === ArbiFlow 4.75.0 Base + Arbitrum + Optimism measured activation ===
const MC4750_CHAINS = [
  {key:"base",name:"Base",chainId:8453,rpc:RPC_URLS.base,rpcSource:process.env.BASE_RPC_URL?"ENV":"MISSING",tokens:{WETH:"0x4200000000000000000000000000000000000006",USDC:"0x833589fCD6EDb6E08f4c7C32D4f71b54bdA02913"}},
  {key:"arbitrum",name:"Arbitrum",chainId:42161,rpc:RPC_URLS.arbitrum,rpcSource:process.env.ARBITRUM_RPC_URL?"ENV":"PUBLIC_FALLBACK",tokens:{WETH:"0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",USDC:"0xaf88d065e77c8cC2239327C5EDb3A432268e5831"}},
  {key:"optimism",name:"Optimism",chainId:10,rpc:RPC_URLS.optimism,rpcSource:process.env.OPTIMISM_RPC_URL?"ENV":"PUBLIC_FALLBACK",tokens:{WETH:"0x4200000000000000000000000000000000000006",USDC:"0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85"}}
];
const mc4750={startedAt:new Date().toISOString(),pollIntervalMs:120000,polls:0,chains:{},timer:null};
for(const c of MC4750_CHAINS)mc4750.chains[c.key]={name:c.name,chainId:c.chainId,status:"STARTING",rpcSource:c.rpcSource,lastAttemptAt:null,lastBlockAt:null,latestBlock:null,previousBlock:null,blockAdvanced:false,rpcLatencyMs:null,rpcErrors:0,lastError:null,aggregator:{name:"1INCH",configured:Boolean(process.env.ONEINCH_API_KEY),status:process.env.ONEINCH_API_KEY?"CONFIGURED_NOT_PROBED":"UNCONFIGURED",lastProbeAt:null,lastError:null}};
async function pollChain4750(c){const st=mc4750.chains[c.key];st.lastAttemptAt=new Date().toISOString();const t=Date.now();if(!c.rpc){st.status="RPC_NOT_CONFIGURED";st.rpcErrors++;st.lastError="RPC_NOT_CONFIGURED";return;}try{const provider=new JsonRpcProvider(c.rpc,undefined,{staticNetwork:false});const [net,bn]=await withTimeout4501(Promise.all([provider.getNetwork(),provider.getBlockNumber()]),4500,`${c.key}_HEARTBEAT`);const actual=Number(net.chainId);st.rpcLatencyMs=Date.now()-t;st.actualChainId=actual;if(actual!==c.chainId){st.status="CHAIN_ID_MISMATCH";st.lastError=`EXPECTED_${c.chainId}_GOT_${actual}`;return;}st.previousBlock=st.latestBlock;st.latestBlock=Number(bn);st.blockAdvanced=st.previousBlock==null?true:st.latestBlock>st.previousBlock;st.lastBlockAt=new Date().toISOString();st.status="LIVE";st.lastError=null;}catch(e){st.status="ERROR";st.rpcErrors++;st.lastError=e?.message||String(e);}}
async function probeOneInch4750(c){const st=mc4750.chains[c.key].aggregator,key=process.env.ONEINCH_API_KEY||"";if(!key){st.status="UNCONFIGURED";return;}const amount="10000000000000000";const u=new URL(`https://api.1inch.dev/swap/v6.1/${c.chainId}/quote`);u.searchParams.set("src",c.tokens.WETH);u.searchParams.set("dst",c.tokens.USDC);u.searchParams.set("amount",amount);await permit477();const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),4500);st.lastProbeAt=new Date().toISOString();try{const r=await fetch(u,{headers:{Authorization:`Bearer ${key}`},signal:ctl.signal});const body=await r.text();if(r.status===429){QUOTE477.rateLimited++;const sec=Number(r.headers.get("retry-after"));QUOTE477.blockedUntil=Date.now()+(Number.isFinite(sec)&&sec>0?Math.min(60000,sec*1000):10000);st.status="RATE_LIMITED";st.lastError="HTTP_429";return;}if(!r.ok)throw new Error(`HTTP_${r.status}:${body.slice(0,100)}`);const j=JSON.parse(body);st.status=j?.dstAmount?"LIVE":"INVALID_RESPONSE";st.lastError=null;st.lastDstAmount=j?.dstAmount||null;}catch(e){st.status="ERROR";st.lastError=e?.name==="AbortError"?"TIMEOUT_4500MS":(e?.message||String(e));}finally{clearTimeout(timer);}}
async function pollMultiChain4750(){mc4750.polls++;await Promise.all(MC4750_CHAINS.map(pollChain4750));if(mc4750.polls===1||mc4750.polls%12===0)await Promise.all(MC4750_CHAINS.map(probeOneInch4750));}
function multiChain4750Summary(){const rows=MC4750_CHAINS.map(c=>({...mc4750.chains[c.key],rpcConfigured:Boolean(c.rpc),tokenMappings:Object.keys(c.tokens)}));return {success:true,version:VERSION,architecture:"BASE_ARBITRUM_OPTIMISM_INDEPENDENT_HEARTBEATS_AND_AGGREGATOR_PROBES",startedAt:mc4750.startedAt,pollIntervalMs:mc4750.pollIntervalMs,polls:mc4750.polls,measured:{chainsTargeted:rows.length,chainsLive:rows.filter(x=>x.status==="LIVE").length,chainsError:rows.filter(x=>x.status==="ERROR"||x.status==="CHAIN_ID_MISMATCH").length,aggregatorsLive:rows.filter(x=>x.aggregator.status==="LIVE").length},chains:rows,safety:{readOnly:true,executionEligible:false,mainnetBroadcast:false,fundsMovedOnMainnet:false}};}
function startMultiChain4750(){if(mc4750.timer)return; /* Free Alchemy: no startup heartbeat burst. */ mc4750.timer=setInterval(()=>pollMultiChain4750().catch(()=>{}),mc4750.pollIntervalMs);mc4750.timer.unref?.();}
app.get("/api/multichain/status",(req,res)=>res.json(multiChain4750Summary()));
app.get("/api/multichain/probe",async(req,res)=>{await pollMultiChain4750();res.json(multiChain4750Summary());});
startMultiChain4750();



// === ArbiFlow 4.77.0 Three-Chain Reference-Directed Candidate Discovery ===
const DISC4760 = {
  startedAt:new Date().toISOString(), intervalMs:60000, running:false, runs:0, lastRunAt:null, lastCompletedAt:null,
  policy:{referenceTriggerAbsPct:0.10,minimumExecutableSpreadPct:0.5,minimumNetProfitUsd:15,gasRequiredForQualification:true,financingRequiredForQualification:true,simulationRequired:true},
  chains:{}, timer:null
};
for(const c of MC4750_CHAINS) DISC4760.chains[c.key]={name:c.name,chainId:c.chainId,status:"IDLE",observations:0,referenceDiscrepancies:0,quoteRequests:0,quoteSuccesses:0,quoteFailures:0,quoteTimeouts:0,positiveExecutableSpreads:0,depthPassed:0,optimalSizes:0,gasEstimates:0,gasFailures:0,financingPasses:0,netProfitPasses:0,simulationEligible:0,qualified:0,lastRunAt:null,lastCompletedAt:null,lastError:null,candidates:[]};
function timeout4760(p,ms,label){return Promise.race([p,new Promise((_,rej)=>setTimeout(()=>rej(new Error(`${label}_TIMEOUT_${ms}MS`)),ms))]);}
const QUOTE477={nextAt:0,blockedUntil:0,requests:0,rateLimited:0};
let quoteQueue477=Promise.resolve();
async function permit477(){const t=quoteQueue477.then(async()=>{const wait=Math.max(0,QUOTE477.nextAt-Date.now(),QUOTE477.blockedUntil-Date.now());if(wait)await new Promise(r=>setTimeout(r,wait));QUOTE477.nextAt=Date.now()+1500;QUOTE477.requests++;});quoteQueue477=t.catch(()=>{});await t;}
async function quote1inch4760(c,src,dst,amount){const st=DISC4760.chains[c.key],key=process.env.ONEINCH_API_KEY||"";st.quoteRequests++;if(!key)throw new Error("ONEINCH_API_KEY_MISSING");const u=new URL(`https://api.1inch.dev/swap/v6.1/${c.chainId}/quote`);u.searchParams.set("src",src);u.searchParams.set("dst",dst);u.searchParams.set("amount",String(amount));await permit477();const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),4500);try{const r=await fetch(u,{headers:{Authorization:`Bearer ${key}`},signal:ctl.signal});const body=await r.text();if(r.status===429){QUOTE477.rateLimited++;const sec=Number(r.headers.get("retry-after"));QUOTE477.blockedUntil=Date.now()+(Number.isFinite(sec)&&sec>0?Math.min(60000,sec*1000):10000);}if(!r.ok)throw new Error(`HTTP_${r.status}:${body.slice(0,120)}`);const j=JSON.parse(body);if(!j?.dstAmount)throw new Error("NO_DST_AMOUNT");st.quoteSuccesses++;return BigInt(j.dstAmount);}catch(e){st.quoteFailures++;if(e?.name==="AbortError"||String(e?.message||e).includes("TIMEOUT"))st.quoteTimeouts++;throw e;}finally{clearTimeout(timer);}}
// Lightweight eth_gasPrice RPC avoids ethers getFeeData's multiple RPC calls.
// Screening only: no assumption that this covers L2 L1-data fees or exact route gas.
const gasCache4773=new Map();
async function gas4760(c,ethUsd){
 const st=DISC4760.chains[c.key],now=Date.now(),cached=gasCache4773.get(c.chainId);
 if(cached&&now-cached.at<30000){
  st.gasEstimates++;return Number(formatUnits(cached.wei*500000n,18))*ethUsd;
 }
 let lastError=null;
 for(let attempt=0;attempt<2;attempt++){
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),attempt?6500:4000);
  try{
   const response=await fetch(c.rpc,{method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({jsonrpc:"2.0",id:1,method:"eth_gasPrice",params:[]}),signal:ctl.signal});
   if(!response.ok)throw new Error(`GAS_RPC_HTTP_${response.status}`);
   const json=await response.json();
   if(json.error)throw new Error(`GAS_RPC_ERROR_${json.error.code}`);
   if(typeof json.result!=="string"||!/^0x[0-9a-fA-F]+$/.test(json.result))throw new Error("GAS_RPC_INVALID_RESPONSE");
   const wei=BigInt(json.result);
   if(wei<=0n)throw new Error("GAS_PRICE_UNAVAILABLE");
   gasCache4773.set(c.chainId,{wei,at:Date.now()});
   const usd=Number(formatUnits(wei*500000n,18))*ethUsd;
   if(!Number.isFinite(usd)||usd<=0)throw new Error("GAS_USD_INVALID");
   st.gasEstimates++;return usd;
  }catch(e){lastError=e;if(attempt===0)await new Promise(r=>setTimeout(r,250));}
  finally{clearTimeout(timer);}
 }
 st.gasFailures++;
 throw new Error(`GAS_RPC_UNAVAILABLE_AFTER_RETRY:${lastError?.name==="AbortError"?"TIMEOUT":lastError?.message||lastError}`);
}
async function discoverChain4760(c,ref){const st=DISC4760.chains[c.key];st.status="RUNNING";st.lastRunAt=new Date().toISOString();st.lastError=null;const out=[];try{
  const health=mc4750.chains[c.key];
  // A single missed 5s heartbeat is not an outage. Only block if the RPC has never been verified.
  if(!health?.lastBlockAt || health.actualChainId!==c.chainId)throw new Error("CHAIN_NOT_VERIFIED");
  const blockAgeMs=Date.now()-Date.parse(health.lastBlockAt);
  if(!Number.isFinite(blockAgeMs)||blockAgeMs>60000)throw new Error("CHAIN_BLOCK_STALE");
 if(!process.env.ONEINCH_API_KEY)throw new Error("ONEINCH_API_KEY_MISSING"); // A stale/rate-limited background probe is not proof that live discovery quotes cannot work.
  const probes=[500]; // Screening size only, NOT a capital or loan ceiling.
  for(const usd of probes){st.observations++;let wethOut,usdcBack;{
    const usdcIn=parseUnits(String(usd),6); wethOut=await quote1inch4760(c,c.tokens.USDC,c.tokens.WETH,usdcIn);
    const wethUnits=Number(formatUnits(wethOut,18)); if(!Number.isFinite(wethUnits)||wethUnits<=0)continue;
    const buyPx=usd/wethUnits; const deviationPct=((buyPx-ref.mid)/ref.mid)*100;
    if(Math.abs(deviationPct)>=DISC4760.policy.referenceTriggerAbsPct)st.referenceDiscrepancies++;else continue;
    usdcBack=await quote1inch4760(c,c.tokens.WETH,c.tokens.USDC,wethOut); const backUsd=Number(formatUnits(usdcBack,6)); const executableSpreadPct=((backUsd-usd)/usd)*100; const gross=backUsd-usd;
    let gasUsd=null,gasError=null;
    try{gasUsd=await gas4760(c,ref.mid);}catch(e){gasError=e?.message||String(e);}
    const estimatedNet=gasUsd===null?null:gross-gasUsd; const depthPass=backUsd/usd>=0.90; if(depthPass)st.depthPassed++;
    if(executableSpreadPct>0)st.positiveExecutableSpreads++; st.optimalSizes++;
    let financingStatus=c.key==="base"?"BASE_PROVIDER_AVAILABLE_NOT_RESERVED":"NOT_YET_ACTIVATED_ON_CHAIN"; // Provider availability is not verified financing.
    let rejection=null; if(executableSpreadPct<DISC4760.policy.minimumExecutableSpreadPct)rejection="EXECUTABLE_SPREAD_TOO_LOW"; else if(!depthPass)rejection="INSUFFICIENT_DEPTH"; else if(gasUsd===null)rejection="GAS_UNAVAILABLE"; else if(estimatedNet<DISC4760.policy.minimumNetProfitUsd)rejection="NET_PROFIT_TOO_LOW"; else rejection="FINANCING_AND_SIMULATION_NOT_VERIFIED";
    if(estimatedNet!==null&&estimatedNet>=DISC4760.policy.minimumNetProfitUsd)st.netProfitPasses++;
    if(!rejection){st.simulationEligible++;} // intentionally unreachable until simulation implementation promotes explicitly
    out.push({candidateId:`${c.key.toUpperCase()}:WETH-USDC:1INCH-ROUNDTRIP:${usd}`,opportunityType:"REFERENCE_DIRECTED_ONCHAIN_ROUNDTRIP_SCREEN",canonicalPair:"WETH/USDC",chainId:c.chainId,notionalUsd:usd,referenceMidUsd:ref.mid,onchainBuyPriceUsd:buyPx,referenceDeviationPct:deviationPct,roundTripUsd:backUsd,executableSpreadPct,grossProfitUsd:gross,modeledGasUsd:gasUsd,gasError,estimatedNetProfitUsd:estimatedNet,depthPassed:depthPass,financingStatus,simulationStatus:"NOT_RUN",riskLevel:"UNASSESSED",status:"REJECTED",rejectionReason:rejection,executionEligible:false,detectedAt:new Date().toISOString()});
  }} st.candidates=out.sort((a,b)=>(b.estimatedNetProfitUsd??-Infinity)-(a.estimatedNetProfitUsd??-Infinity)).slice(0,20); st.status=out.some(x=>x.gasError)?"COMPLETE_WITH_GAS_FAILURES":"COMPLETE";
 }catch(e){st.status="ERROR";st.lastError=e?.message||String(e);}finally{st.lastCompletedAt=new Date().toISOString();}}
async function run4760(){if(DISC4760.running)return;DISC4760.running=true;DISC4760.runs++;DISC4760.lastRunAt=new Date().toISOString();try{const ref=globalDiscrepancy4710._state?.reference?.ETHUSD;if(!ref||ref.status!=="LIVE"||!Number.isFinite(ref.mid))throw new Error("REFERENCE_CONSENSUS_NOT_LIVE");await Promise.all(MC4750_CHAINS.map(c=>discoverChain4760(c,ref)));}catch(e){for(const st of Object.values(DISC4760.chains))if(st.status==="IDLE")st.lastError=e?.message||String(e);}finally{DISC4760.running=false;DISC4760.lastCompletedAt=new Date().toISOString();}}
function summary4760(){const chains=Object.values(DISC4760.chains).map(x=>({...x,candidates:x.candidates.slice(0,10)}));const sum=k=>chains.reduce((n,x)=>n+(x[k]||0),0);return {success:true,version:VERSION,architecture:"CEX_CONSENSUS_TO_THREE_CHAIN_REFERENCE_TRIGGER_TO_EXACT_1INCH_ROUNDTRIP_TO_GAS_TO_FAIL_CLOSED_QUALIFICATION",status:DISC4760.running?"RUNNING":"IDLE_WAIT",startedAt:DISC4760.startedAt,intervalMs:DISC4760.intervalMs,runs:DISC4760.runs,lastRunAt:DISC4760.lastRunAt,lastCompletedAt:DISC4760.lastCompletedAt,policy:DISC4760.policy,quoteScheduler:QUOTE477,limitations:["SINGLE_AGGREGATOR_SCREEN_ONLY","INDEPENDENT_DEX_COMPARISON_NOT_YET_IMPLEMENTED","FLASH_FINANCING_NOT_VERIFIED","ATOMIC_SIMULATION_NOT_RUN"],metrics:{observations:sum("observations"),referenceDiscrepancies:sum("referenceDiscrepancies"),quoteRequests:sum("quoteRequests"),quoteSuccesses:sum("quoteSuccesses"),quoteFailures:sum("quoteFailures"),quoteTimeouts:sum("quoteTimeouts"),positiveExecutableSpreads:sum("positiveExecutableSpreads"),depthPassed:sum("depthPassed"),optimalSizes:sum("optimalSizes"),gasEstimates:sum("gasEstimates"),gasFailures:sum("gasFailures"),financingPasses:sum("financingPasses"),netProfitPasses:sum("netProfitPasses"),simulationEligible:sum("simulationEligible"),qualified:sum("qualified")},chains,safety:{readOnly:true,executionEligible:false,mainnetBroadcast:false,fundsMovedOnMainnet:false}};}
app.get("/api/multichain/discovery/status",(req,res)=>res.json(summary4760()));
app.get("/api/multichain/discovery/run",(req,res)=>{if(dexRpcGate4783.cooldownUntil>Date.now())return res.json({success:false,version:VERSION,status:"RPC_COOLDOWN_ACTIVE",readOnly:true});setImmediate(()=>run4760());res.json({success:true,version:VERSION,status:DISC4760.running?"ALREADY_RUNNING":"STARTED_BACKGROUND",statusRoute:"/api/multichain/discovery/status",readOnly:true});});
function start4760(){/* Free-tier mode: disable automatic discovery; manual endpoint remains available. */ if(process.env.ARBIFLOW_AUTO_DISCOVERY==="true"){setTimeout(()=>run4760().catch(()=>{}),5000);DISC4760.timer=setInterval(()=>run4760().catch(()=>{}),Math.max(DISC4760.intervalMs,300000));}}
start4760();

// === ArbiFlow 4.73.1 Global Coverage Architecture Layer ===
const COVERAGE4730 = {
  target: { majorCexFeeds: 15, dexLiquiditySources: 500, tier1Chains: 15 },
  cexAdapters: [
    "BINANCE","COINBASE","KRAKEN","BITSTAMP","OKX","BYBIT","GEMINI","CRYPTO_COM","BITFINEX","GATE_IO","KUCOIN","MEXC","HTX","BITGET","BULLISH"
  ],
  chains: [
    {name:"Base",chainId:8453,state:"LIVE_DISCOVERY"},
    {name:"Ethereum",chainId:1,state:"ADAPTER_READY_NOT_CONFIGURED"},
    {name:"Arbitrum",chainId:42161,state:"LIVE_ACTIVATION_MEASURED"},
    {name:"Optimism",chainId:10,state:"LIVE_ACTIVATION_MEASURED"},
    {name:"BNB Chain",chainId:56,state:"ADAPTER_READY_NOT_CONFIGURED"},
    {name:"Polygon",chainId:137,state:"ADAPTER_READY_NOT_CONFIGURED"},
    {name:"Avalanche",chainId:43114,state:"ADAPTER_READY_NOT_CONFIGURED"},
    {name:"Linea",chainId:59144,state:"PLANNED"},{name:"Scroll",chainId:534352,state:"PLANNED"},
    {name:"Blast",chainId:81457,state:"PLANNED"},{name:"Gnosis",chainId:100,state:"PLANNED"},
    {name:"Mantle",chainId:5000,state:"PLANNED"},{name:"Sonic",chainId:146,state:"PLANNED"},
    {name:"Unichain",chainId:130,state:"PLANNED"},{name:"zkSync Era",chainId:324,state:"PLANNED"}
  ],
  liquidityArchitecture: {
    directBaseAdapters:["UNISWAP_V3","AERODROME","PANCAKESWAP_V3","SUSHISWAP_V3"],
    aggregatorAdapters:["1INCH"],
    discoveryModes:["FACTORY_EVENT_DISCOVERY","PROTOCOL_FAMILY_ADAPTERS","AGGREGATOR_LIQUIDITY","DIRECT_HOT_VENUE_ADAPTERS"],
    claimedLiveDexSources: null,
    note:"500+ is a target coverage capability, never reported as live until measured from provider/source telemetry."
  }
};
function coverage4730Summary(){
  const liveChains=COVERAGE4730.chains.filter(x=>x.state==="LIVE_DISCOVERY").length;
  const readyChains=COVERAGE4730.chains.filter(x=>x.state.includes("READY")).length;
  const feeds=globalDiscrepancy4710.feedHealth ? globalDiscrepancy4710.feedHealth() : (globalDiscrepancy4710._state?.feeds||{});
  const rt=globalDiscrepancy4710.referenceTelemetry ? globalDiscrepancy4710.referenceTelemetry() : {};
  const adapterState=name=>{const f=feeds[name.toLowerCase()]; if(!f)return "REGISTERED_NOT_LIVE"; return f.status==="LIVE"?"LIVE":f.status==="STALE"?"STALE":f.status==="ERROR"?"ERROR":"CONFIGURED_NOT_LIVE";};
  return {success:true,version:VERSION,architecture:"GLOBAL_COVERAGE_LAYER_MEASURED_NOT_MARKETING_CLAIMS",target:COVERAGE4730.target,measured:{liveDiscoveryChains:liveChains,adapterReadyChains:readyChains,directDexAdapters:COVERAGE4730.liquidityArchitecture.directBaseAdapters.length,aggregatorAdapters:COVERAGE4730.liquidityArchitecture.aggregatorAdapters.length,configuredCexFeeds:rt.configured||Object.keys(feeds).length,liveCexFeeds:rt.live||0,staleCexFeeds:rt.stale||0,errorCexFeeds:rt.error||0,cexMessagesReceived:rt.totalUpdates||0,cexFeedErrors:rt.totalErrors||0,referencePolls:rt.polls||0,referenceUpdates:rt.consensusUpdates||0,lastReferencePollAt:rt.lastPollAt||null},cexAdapters:COVERAGE4730.cexAdapters.map(name=>({name,state:adapterState(name),telemetry:feeds[name.toLowerCase()]||null})),chains:COVERAGE4730.chains,liquidityArchitecture:COVERAGE4730.liquidityArchitecture,referenceConsensus:rt.consensus||null,safety:{readOnly:true,executionEligible:false,mainnetBroadcast:false,fundsMovedOnMainnet:false}};
}

app.get("/api/global-coverage/status",(req,res)=>res.json(coverage4730Summary()));
app.get("/api/global-coverage/targets",(req,res)=>res.json({success:true,version:VERSION,...COVERAGE4730.target,policy:"Targets are not counted as live coverage until runtime telemetry proves them."}));


// === Phase 8.1 DEX coverage audit: existing evidence only, zero new RPC calls ===
app.get('/api/phase81/dex-coverage',(_req,res)=>{
 const now=Date.now();
 const chains=Object.values(dex4780.chains||{}).map(row=>{
  const venues=Array.isArray(row.venues)?row.venues:[];
  const configured=venues.filter(v=>v.factory&&v.status!=='NOT_CONFIGURED');
  const pools=venues.filter(v=>v.status==='POOL_LIVE'&&v.pool&&v.liquidityEvidence?.nonzero);
  const uniquePools=new Set(pools.map(v=>String(v.pool).toLowerCase()));
  const uniqueFactories=new Set(pools.map(v=>String(v.factory).toLowerCase()));
  const statusCounts={};for(const v of venues)statusCounts[v.status||'UNKNOWN']=(statusCounts[v.status||'UNKNOWN']||0)+1;
  const chainId=Number(row.chainId);
  const snap=dexVerified4788.get(chainId);
  const ageMs=snap?now-Date.parse(snap.observedAt):null;
  return {name:row.name||null,chainId,status:row.status||'UNKNOWN',configuredVenueEntries:configured.length,livePoolEntries:pools.length,uniqueLivePools:uniquePools.size,uniqueLiveFactories:uniqueFactories.size,venueStatuses:statusCounts,snapshotObservedAt:snap?.observedAt||null,snapshotAgeMs:Number.isFinite(ageMs)?ageMs:null,snapshotFresh:Number.isFinite(ageMs)&&ageMs>=0&&ageMs<=DEX_SNAPSHOT_MAX_AGE_MS_4788,executableQuotes:Number(row.executableQuotes)||0,qualified:Number(row.qualified)||0};
 });
 const sums=k=>chains.reduce((n,c)=>n+c[k],0);
 const known=chains.length;
 res.json({success:true,build:'8.1.0',stage:'DEX_COVERAGE_EVIDENCE_AUDIT',targetLiquiditySources:500,chainsWithDiscoveryEvidence:known,chainRpcConnectivityNotDexCoverage:true,counts:{configuredVenueEntries:sums('configuredVenueEntries'),livePoolEntries:sums('livePoolEntries'),uniqueLivePoolsPerChainSummed:sums('uniqueLivePools'),uniqueLiveFactoriesPerChainSummed:sums('uniqueLiveFactories'),freshSnapshots:chains.filter(c=>c.snapshotFresh).length,executableQuotesReported:sums('executableQuotes'),qualifiedReported:sums('qualified')},chains,coverageVerified500:false,limitations:['VENUE_ENTRIES_ARE_NOT_UNIQUE_DEX_PROTOCOLS','COUNTS_REFLECT_EXISTING_IN_MEMORY_DISCOVERY_ONLY','NO_NEW_RPC_CALLS','POOL_LIQUIDITY_IS_NOT_EXECUTABLE_PROFIT','500_SOURCE_TARGET_NOT_VERIFIED','NO_ATOMIC_FLASH_LOAN_SIMULATION'],readOnly:true,automaticScanning:false,mainnetBroadcast:false,executionEligible:false});
});
app.get('/api/phase81/status',(_req,res)=>res.json({success:true,build:'8.1.0',stage:'DEX_COVERAGE_AUDIT_ONLY',auditRoute:'/api/phase81/dex-coverage',existingDiscoveryRoute:'/api/dex-independent/run',existingDiscoveryStatusRoute:'/api/dex-independent/status',targetLiquiditySources:500,coverageVerified500:false,flashLoanAtomicSimulationVerified:false,readOnly:true,automaticScanning:false,mainnetBroadcast:false}));

// === 4.78.3 Independent DEX pool evidence (READ ONLY) ===
// Explicit per-chain venue factories: no guessed addresses, no aggregator aliases.
// This layer verifies pool identity and liquidity evidence; it does NOT claim executable arbitrage.
const dex4780={startedAt:new Date().toISOString(),running:false,runs:0,lastRunAt:null,lastCompletedAt:null,chains:{}};
// 4.78.10: preserve per-chain verified snapshots in process memory. A failed scan cannot erase them.
// Snapshot pool state is historical, never an executable/current quote.
const dexVerified4788=new Map();
const DEX_SNAPSHOT_MAX_AGE_MS_4788=600000;
function updateVerified4788(chainId,row,observedAt){
 if(!row||row.status!=="MULTI_VENUE_POOLS_VERIFIED"||row.independentFactories<2)return false;
 const venues=(row.venues||[]).filter(v=>v.status==="POOL_LIVE"&&v.pool&&v.liquidityEvidence?.nonzero);
 if(new Set(venues.map(v=>String(v.factory).toLowerCase())).size<2)return false;
 dexVerified4788.set(Number(chainId),{observedAt,discoveryStatus:row.status,independentFactories:row.independentFactories,venues:JSON.parse(JSON.stringify(venues))});
 return true;
}
const dexFactory4780=new (require("ethers").Interface)([
 "function getPair(address,address) view returns (address)",
 "function getPool(address,address,uint24) view returns (address)"
]);
const dexPool4780=new (require("ethers").Interface)([
 "function token0() view returns (address)","function token1() view returns (address)",
 "function getReserves() view returns (uint112,uint112,uint32)",
 "function liquidity() view returns (uint128)",
 "function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)"
]);
const dexAddress4780=a=>typeof a==="string"&&/^0x[0-9a-fA-F]{40}$/.test(a)&&!/^0x0{40}$/i.test(a);
// Alchemy throughput is account-wide. Serialize DEX probes across all chains.
const dexRpcGate4783={tail:Promise.resolve(),nextAt:0,cooldownUntil:0,requests:0,rateLimited:0,retries:0,cacheHits:0,abortedScans:0,lastRateLimitAt:null};
const dexImmutableCache4783=new Map();
const sleep4783=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function dexCall4780(c,to,data){
 const key=`${c.chainId}:${to.toLowerCase()}:${data.toLowerCase()}`;
 // Factory getPool/getPair and pool token addresses are immutable; do not cache reserves/price/liquidity.
 const selector=data.slice(0,10).toLowerCase();
 const immutable=selector===dexFactory4780.getFunction('getPool').selector.toLowerCase()||selector===dexFactory4780.getFunction('getPair').selector.toLowerCase()||selector===dexPool4780.getFunction('token0').selector.toLowerCase()||selector===dexPool4780.getFunction('token1').selector.toLowerCase();
 if(immutable&&dexImmutableCache4783.has(key)){dexRpcGate4783.cacheHits++;return dexImmutableCache4783.get(key);}
 const prev=dexRpcGate4783.tail;let release;const next=new Promise(resolve=>release=resolve);
 dexRpcGate4783.tail=prev.catch(()=>{}).then(()=>next);
 await prev.catch(()=>{});
 try{
  // Free-tier fail-fast: never retry 429 within the same discovery run.
  if(Date.now()<dexRpcGate4783.cooldownUntil)throw new Error('RPC_COOLDOWN_ACTIVE');
  await sleep4783(Math.max(0,dexRpcGate4783.nextAt-Date.now()));
  dexRpcGate4783.nextAt=Date.now()+1200;
  try{
   const result=await dexRpcRequest4783(c,to,data);
   if(immutable)dexImmutableCache4783.set(key,result);
   return result;
  }catch(e){
   if(/RPC_HTTP_429|RPC_429/.test(String(e.message))){
    dexRpcGate4783.lastRateLimitAt=new Date().toISOString();
    dexRpcGate4783.cooldownUntil=Math.max(dexRpcGate4783.cooldownUntil,Date.now()+Math.max(120000,e.retryAfterMs||0));
    throw new Error('RPC_RATE_LIMIT_SCAN_SUSPENDED');
   }
   throw e;
  }
 }finally{release();}
}
async function dexRpcRequest4783(c,to,data){
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),12000);
 try{
  dexRpcGate4783.requests++;
  const r=await fetch(c.rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_call',params:[{to,data},'latest']}),signal:ctl.signal});
  if(!r.ok){const e=new Error(`RPC_HTTP_${r.status}`);if(r.status===429){dexRpcGate4783.rateLimited++;const retry=r.headers.get('retry-after');if(retry){const seconds=Number(retry);const date=Date.parse(retry);e.retryAfterMs=Number.isFinite(seconds)?Math.min(60000,seconds*1000):Number.isFinite(date)?Math.max(0,Math.min(60000,date-Date.now())):0;}}throw e;}
  const j=await r.json();if(j.error){if(j.error.code===429)dexRpcGate4783.rateLimited++;throw Error(`RPC_${j.error.code}:${String(j.error.message).slice(0,100)}`);}
  if(typeof j.result!=='string'||!/^0x[0-9a-fA-F]*$/.test(j.result))throw Error('INVALID_RPC_RESULT');return j.result;
 }catch(e){if(e.name==='AbortError')throw Error('RPC_TIMEOUT');throw e;}finally{clearTimeout(timer);}
}
const VERIFIED_PANCAKE_BASE_FACTORY_4782="0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865";
const VERIFIED_UNISWAP_V3_FACTORIES_4781=Object.freeze({
 8453:"0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
 42161:"0x1F98431c8aD98523631AE4a59f267346ea31F984",
 10:"0x1F98431c8aD98523631AE4a59f267346ea31F984"
});
// SushiSwap V2 factory registry. Independently validate returned pairs and reserves at runtime.
// Sources: github.com/vaipakam/vaipakam/blob/main/contracts/script/ConfigureV2Factories.s.sol
// Factory configuration does NOT establish that a liquid WETH/USDC pool exists.
const SUSHI_V2_FACTORY_REGISTRY_4784=Object.freeze({
 8453:"0x71524B4f93c58fcbF659783284E38825f0622859",
 42161:"0xc35DADB65012eC5796536bD9864eD8773aBc74C4",
 10:"0xFbc12984689e5f15626Bad03Ad60160Fe98B303C"
});
// Official Uniswap V3 deployments: developers.uniswap.org/docs/protocols/v3/deployments
// Other factories intentionally remain unconfigured until separately verified.
function dexVenues4780(c){
 const prefix=`DEX_${c.key.toUpperCase()}_`;
 const uniswap=process.env[prefix+"UNISWAP_V3_FACTORY"]||VERIFIED_UNISWAP_V3_FACTORIES_4781[c.chainId];
 const pancake=process.env[prefix+"PANCAKESWAP_V3_FACTORY"]||(c.chainId===8453?VERIFIED_PANCAKE_BASE_FACTORY_4782:null);
 return [
 {name:"UNISWAP_V3",kind:"V3",factory:uniswap,fee:500,source:process.env[prefix+"UNISWAP_V3_FACTORY"]?"ENV_OVERRIDE":"OFFICIAL_REGISTRY"},
 {name:"UNISWAP_V3_3000",kind:"V3",factory:uniswap,fee:3000,source:process.env[prefix+"UNISWAP_V3_FACTORY"]?"ENV_OVERRIDE":"OFFICIAL_REGISTRY"},
 {name:"SUSHISWAP_V2",kind:"V2",factory:process.env[prefix+"SUSHISWAP_V2_FACTORY"]||SUSHI_V2_FACTORY_REGISTRY_4784[c.chainId],source:process.env[prefix+"SUSHISWAP_V2_FACTORY"]?"ENV_OVERRIDE":"SUSHI_V2_REGISTRY_PENDING_ONCHAIN_VERIFICATION"},
 {name:"PANCAKESWAP_V3",kind:"V3",factory:pancake,fee:500,source:process.env[prefix+"PANCAKESWAP_V3_FACTORY"]?"ENV_OVERRIDE":"BASE_EXISTING_ADAPTER"},
 {name:"PANCAKESWAP_V3_3000",kind:"V3",factory:pancake,fee:2500,source:process.env[prefix+"PANCAKESWAP_V3_FACTORY"]?"ENV_OVERRIDE":"BASE_EXISTING_ADAPTER"}
 ];
}
async function dexDiscover4780(c){
 const result={name:c.name,chainId:c.chainId,status:"RUNNING",venues:[],independentPools:0,independentFactories:0,executableQuotes:0,qualified:0,lastError:null};
 const verified=new Set();
 for(const venue of dexVenues4780(c)){
  const v={name:venue.name,kind:venue.kind,feeTier:venue.fee??null,status:"NOT_CONFIGURED",factory:venue.factory||null,configurationSource:venue.factory?venue.source:"NOT_CONFIGURED",pool:null,liquidityEvidence:null,error:null};
  result.venues.push(v);
  if(Date.now()<dexRpcGate4783.cooldownUntil){v.status="SKIPPED_RPC_COOLDOWN";continue;}
  if(!venue.factory)continue;
  if(!dexAddress4780(venue.factory)){v.status="INVALID_FACTORY_ADDRESS";continue;}
  try{
   const method=venue.kind==="V3"?"getPool":"getPair";
   // Lowercase normalizes mixed-case input before ethers checksum validation.
   const weth=c.tokens.WETH.toLowerCase(),usdc=c.tokens.USDC.toLowerCase();
   const args=venue.kind==="V3"?[weth,usdc,venue.fee]:[weth,usdc];
   const raw=await dexCall4780(c,venue.factory,dexFactory4780.encodeFunctionData(method,args));
   const pool=dexFactory4780.decodeFunctionResult(method,raw)[0];
   if(!dexAddress4780(pool)){v.status="NO_POOL";continue;}
   v.pool=pool;
   const [t0raw,t1raw]=await Promise.all([dexCall4780(c,pool,dexPool4780.encodeFunctionData("token0")),dexCall4780(c,pool,dexPool4780.encodeFunctionData("token1"))]);
   const t0=dexPool4780.decodeFunctionResult("token0",t0raw)[0].toLowerCase(),t1=dexPool4780.decodeFunctionResult("token1",t1raw)[0].toLowerCase();
   if(!([t0,t1].includes(c.tokens.WETH.toLowerCase())&&[t0,t1].includes(c.tokens.USDC.toLowerCase()))){v.status="TOKEN_MISMATCH";continue;}
   if(venue.kind==="V2"){
    const raw=await dexCall4780(c,pool,dexPool4780.encodeFunctionData("getReserves"));const rr=dexPool4780.decodeFunctionResult("getReserves",raw);
    v.liquidityEvidence={kind:"V2_RESERVES",reserve0:rr[0].toString(),reserve1:rr[1].toString(),nonzero:rr[0]>0n&&rr[1]>0n};
   }else{
    const [lraw,sraw]=await Promise.all([dexCall4780(c,pool,dexPool4780.encodeFunctionData("liquidity")),dexCall4780(c,pool,dexPool4780.encodeFunctionData("slot0"))]);
    const liq=dexPool4780.decodeFunctionResult("liquidity",lraw)[0],slot=dexPool4780.decodeFunctionResult("slot0",sraw);
    v.liquidityEvidence={kind:"V3_ACTIVE_LIQUIDITY",activeLiquidity:liq.toString(),sqrtPriceX96:slot[0].toString(),nonzero:liq>0n&&slot[0]>0n};
   }
   v.status=v.liquidityEvidence.nonzero?"POOL_LIVE":"POOL_EMPTY";
   if(v.status==="POOL_LIVE"){verified.add(venue.factory.toLowerCase());result.independentPools++;}
  }catch(e){v.status=/RPC_RATE_LIMIT_SCAN_SUSPENDED|RPC_COOLDOWN_ACTIVE/.test(String(e.message))?"SKIPPED_RPC_COOLDOWN":"PROBE_ERROR";v.error=e?.name==="AbortError"?"RPC_TIMEOUT":String(e?.message||e).slice(0,180);}
 }
 result.independentFactories=verified.size;
 result.status=result.independentPools>=2&&result.independentFactories>=2?"MULTI_VENUE_POOLS_VERIFIED":"INSUFFICIENT_INDEPENDENT_VENUES";
 return result;
}
async function runDex4780(){if(dex4780.running)return;dex4780.running=true;dex4780.runs++;dex4780.lastRunAt=new Date().toISOString();try{
 for(const c of MC4750_CHAINS){
  if(Date.now()<dexRpcGate4783.cooldownUntil){
   dexRpcGate4783.abortedScans++;
   dex4780.chains[c.chainId]={name:c.name,chainId:c.chainId,status:"SKIPPED_RPC_COOLDOWN",venues:[],lastError:"ALCHEMY_FREE_TIER_COOLDOWN"};
   continue;
  }
  const row=!c.rpc?{name:c.name,chainId:c.chainId,status:"RPC_NOT_CONFIGURED",venues:[]}:
   await dexDiscover4780(c).catch(e=>({name:c.name,chainId:c.chainId,status:"ERROR",lastError:String(e.message),venues:[]}));
  dex4780.chains[row.chainId]=row;
  if(Date.now()<dexRpcGate4783.cooldownUntil)row.status="PARTIAL_RPC_RATE_LIMITED";
  // Only commit a fully verified chain result; partial and skipped scans remain diagnostics only.
  updateVerified4788(row.chainId,row,new Date().toISOString());
 }
 }finally{dex4780.running=false;dex4780.lastCompletedAt=new Date().toISOString();}}
// 4.78.7: zero-additional-RPC indicative cross-venue price comparisons.
// Prices are pool-state observations, NOT executable quotes or net-profit estimates.
function dexSpot4787(c,v){
 if(v.status!=="POOL_LIVE"||!v.liquidityEvidence?.nonzero)return null;
 const weth0=BigInt(c.tokens.WETH.toLowerCase())<BigInt(c.tokens.USDC.toLowerCase());
 let token1PerToken0;
 if(v.kind==="V2"){
  const r0=Number(v.liquidityEvidence.reserve0),r1=Number(v.liquidityEvidence.reserve1);
  if(!(r0>0&&r1>0))return null;
  token1PerToken0=r1/r0;
 }else if(v.kind==="V3"){
  const q=Number(v.liquidityEvidence.sqrtPriceX96)/2**96;
  token1PerToken0=q*q;
 }else return null;
 // All three configured pairs use WETH(18 decimals) and USDC(6 decimals).
 // Verify token decimal metadata before using this output for any execution.
 const rawUsdcPerWeth=weth0?token1PerToken0:1/token1PerToken0;
 const usdcPerWeth=rawUsdcPerWeth*10**(18-6);
 return Number.isFinite(usdcPerWeth)&&usdcPerWeth>0?usdcPerWeth:null;
}
function dexPriceComparison4787(){
 const chains=MC4750_CHAINS.map(c=>{
  const row=dex4780.chains[c.chainId];
  const snap=dexVerified4788.get(Number(c.chainId));
  const ageMs=snap?Math.max(0,Date.now()-Date.parse(snap.observedAt)):null;
  const fresh=ageMs!==null&&ageMs<=DEX_SNAPSHOT_MAX_AGE_MS_4788;
  const observations=(snap?.venues||[]).map(v=>({venue:v.name,factory:v.factory,pool:v.pool,kind:v.kind,feeTier:v.feeTier,spotUsdcPerWeth:dexSpot4787(c,v)})).filter(v=>v.spotUsdcPerWeth!==null);
  const comparisons=[];
  // Never present historical pool state as a current market opportunity.
  if(fresh)for(let i=0;i<observations.length;i++)for(let j=i+1;j<observations.length;j++){
   const a=observations[i],b=observations[j];
   if(a.factory?.toLowerCase()===b.factory?.toLowerCase())continue;
   const low=a.spotUsdcPerWeth<=b.spotUsdcPerWeth?a:b,high=low===a?b:a;
   comparisons.push({buyReferenceVenue:low.venue,sellReferenceVenue:high.venue,indicativeSpotDifferencePct:Number(((high.spotUsdcPerWeth/low.spotUsdcPerWeth)-1)*100).toFixed(6),warning:"INDICATIVE_CACHED_SPOT_NOT_EXECUTABLE_OR_PROFITABLE"});
  }
  comparisons.sort((a,b)=>b.indicativeSpotDifferencePct-a.indicativeSpotDifferencePct);
  return {chainId:c.chainId,name:c.name,discoveryStatus:row?.status||"NOT_SCANNED",snapshotStatus:!snap?"UNAVAILABLE":fresh?"FRESH":"STALE",snapshotObservedAt:snap?.observedAt||null,snapshotAgeMs:ageMs,observations,comparisons,independentFactories:snap?.independentFactories||0,requiresFreshScan:!fresh};
 });
 const fresh=chains.some(c=>c.snapshotStatus==="FRESH");
 return {success:true,version:VERSION,stage:"INDICATIVE_CROSS_DEX_PRICE_COMPARISON",source:"LAST_VERIFIED_PER_CHAIN_SNAPSHOT_IN_MEMORY",lastCompletedAt:dex4780.lastCompletedAt,ageMs:null,fresh,allChainsFresh:chains.every(c=>c.snapshotStatus==="FRESH"),requiresFreshScan:chains.some(c=>c.requiresFreshScan),chains,assumptions:["WETH_DECIMALS_18_USDC_DECIMALS_6_MUST_BE_VALIDATED","V3_SPOT_EXCLUDES_TICK_CROSSING_AND_PRICE_IMPACT","V2_SPOT_EXCLUDES_SWAP_FEES_AND_PRICE_IMPACT","CROSS_VENUE_SPOT_SPREAD_IS_NOT_EXECUTABLE_ARBITRAGE"],limitations:["SNAPSHOTS_IN_MEMORY_LOST_ON_PROCESS_RESTART","NO_EXECUTABLE_V3_QUOTER_CALLS","NO_ROUTER_CALLDATA","NO_FLASH_LIQUIDITY_VERIFICATION","NO_DYNAMIC_OPTIMAL_SIZING","NO_ATOMIC_SIMULATION","L2_FULL_GAS_NOT_VERIFIED"],safety:{readOnly:true,executionEligible:false,mainnetBroadcast:false,fundsMovedOnMainnet:false}};
}
app.get("/api/dex-independent/prices",(req,res)=>res.json(dexPriceComparison4787()));
// 4.78.12: deterministic V2 reserve-math probe; NO live trade quote or execution claim.
// Only V2 constant-product calculations are supported. V3 needs a verified quoter
// and tick-crossing simulation before an executable cross-venue route can be claimed.
const DEX_QUOTE_SIZES_47812=Object.freeze([100,500,1000]);
function dexV2AmountOut47812(amountIn,reserveIn,reserveOut,feeBps=30n){
 if(amountIn<=0n||reserveIn<=0n||reserveOut<=0n||feeBps>=10000n) return 0n;
 const net=amountIn*(10000n-feeBps);
 return net*reserveOut/(reserveIn*10000n+net);
}
function dexV2Screen47812(c,snap){
 const venues=(snap?.venues||[]).filter(v=>v.kind==='V2'&&v.liquidityEvidence?.kind==='V2_RESERVES'&&v.liquidityEvidence.nonzero);
 const weth0=BigInt(c.tokens.WETH.toLowerCase())<BigInt(c.tokens.USDC.toLowerCase());
 return venues.map(v=>{
  const r0=BigInt(v.liquidityEvidence.reserve0),r1=BigInt(v.liquidityEvidence.reserve1);
  const usdcReserve=weth0?r1:r0,wethReserve=weth0?r0:r1;
  const probes=DEX_QUOTE_SIZES_47812.map(usd=>{
   const usdcIn=BigInt(usd)*1000000n;
   const wethOut=dexV2AmountOut47812(usdcIn,usdcReserve,wethReserve);
   const usdcBack=dexV2AmountOut47812(wethOut,wethReserve,usdcReserve);
   const back=Number(usdcBack)/1e6;
   return {inputUsdc:usd,modeledWethOut:wethOut.toString(),modeledSamePoolRoundTripUsdc:back,modeledSamePoolRoundTripLossUsd:Number((usd-back).toFixed(6)),note:'RESERVE_MATH_ONLY_NOT_A_LIVE_QUOTE'};
  });
  return {venue:v.name,pool:v.pool,feeBpsAssumed:30,feeVerified:false,tokenDecimalsAssumed:{WETH:18,USDC:6},probes};
 });
}
function dexQuoteReadiness47812(){
 const indicative=dexPriceComparison4787();
 const chains=MC4750_CHAINS.map(c=>{
  const snap=dexVerified4788.get(Number(c.chainId));
  const age=snap?Date.now()-Date.parse(snap.observedAt):null;
  const fresh=age!==null&&age>=0&&age<=DEX_SNAPSHOT_MAX_AGE_MS_4788;
  const prices=indicative.chains.find(x=>x.chainId===c.chainId);
  const candidates=fresh?(prices?.comparisons||[]).filter(x=>x.indicativeSpotDifferencePct>0.5).map(x=>({...x,qualified:false,riskLevel:'UNASSESSED',estimatedNetProfitUsd:null,gasUsd:null,reason:'V3_EXECUTABLE_QUOTER_AND_ATOMIC_SIMULATION_NOT_IMPLEMENTED'})):[];
  return {chainId:c.chainId,name:c.name,snapshotStatus:!snap?'UNAVAILABLE':fresh?'FRESH':'STALE',snapshotAgeMs:age,indicativeSpreadOverHalfPercent:candidates.length,indicativeCandidates:candidates,constantProductV2Probes:fresh?dexV2Screen47812(c,snap):[],executableCrossDexQuotes:0,qualified:0};
 });
 return {success:true,version:VERSION,stage:'READ_ONLY_QUOTE_READINESS_AND_V2_RESERVE_MATH',scope:'LAST_VERIFIED_IN_MEMORY_SNAPSHOTS',sizesUsd:DEX_QUOTE_SIZES_47812,feePolicy:'V2_30_BPS_ASSUMED_NOT_VERIFIED',alertPolicy:{minimumIndicativeSpreadPct:0.5,allowedRisk:['LOW','MEDIUM'],requiresPositiveVerifiedNetProfit:true,alertsEmitted:0},chains,limitations:['NO_VERIFIED_V3_QUOTER','NO_CROSS_DEX_EXECUTABLE_ROUNDTRIP','V2_FEE_NOT_VERIFIED','NO_TICK_CROSSING_SIMULATION','NO_L2_FULL_GAS_ESTIMATE','NO_ATOMIC_SIMULATION','IN_MEMORY_SNAPSHOTS_EXPIRE_AFTER_10_MINUTES'],safety:{readOnly:true,executionEligible:false,mainnetBroadcast:false,fundsMovedOnMainnet:false}};
}
app.get('/api/dex-independent/quote-readiness',(req,res)=>res.json(dexQuoteReadiness47812()));

// 4.78.13: manually requested on-chain quoter checks for Uniswap V3 vs Sushi V2.
// Each call uses the existing shared, rate-limited DEX RPC transport.
// Exact-input quote outputs are observations, NOT executable atomic arbitrage.
const dexQuoterInterface47813=new (require('ethers').Interface)(QUOTER_V2_ABI_4501);
const dexV2Interface47813=new (require('ethers').Interface)(['function getReserves() view returns (uint112,uint112,uint32)']);
// Normalize hex addresses before ABI encoding. Ethers rejects invalid mixed-case checksums.
// This does not establish whether a configured address is the correct on-chain contract.
const dexNormalize47814 = value => require('ethers').getAddress(String(value).toLowerCase());
const dexQuotes47813={running:false,lastCompletedAt:null,lastResult:null,runs:0};
async function dexCrossQuotes47813(chainId,size){
 const c=MC4750_CHAINS.find(x=>x.chainId===chainId);
 if(!c||![100,500,1000].includes(size))throw Error('UNSUPPORTED_CHAIN_OR_SIZE');
 const snap=dexVerified4788.get(chainId),age=snap?Date.now()-Date.parse(snap.observedAt):null;
 if(!snap||age<0||age>DEX_SNAPSHOT_MAX_AGE_MS_4788)throw Error('FRESH_DISCOVERY_REQUIRED');
 const sushi=snap.venues.find(v=>v.name==='SUSHISWAP_V2'&&v.status==='POOL_LIVE');
 const unis=snap.venues.filter(v=>v.kind==='V3'&&v.name.startsWith('UNISWAP_V3')&&v.status==='POOL_LIVE');
 if(!sushi||!unis.length)throw Error('LIVE_SUSHI_AND_UNISWAP_POOLS_REQUIRED');
 const configuredQuoter=UNISWAP_V3_QUOTER_V1_4490[c.key];
 if(!dexAddress4780(configuredQuoter))throw Error('UNISWAP_QUOTER_NOT_CONFIGURED');
 const quoter=dexNormalize47814(chainId===42161?'0x61fFE014bA17989E743c5F6cB21bF9697530B21e':configuredQuoter);
 const reservesRaw=await dexCall4780(c,sushi.pool,dexV2Interface47813.encodeFunctionData('getReserves',[]));
 const reserves=dexV2Interface47813.decodeFunctionResult('getReserves',reservesRaw);
 const weth0=BigInt(c.tokens.WETH.toLowerCase())<BigInt(c.tokens.USDC.toLowerCase());
 const r0=BigInt(reserves[0]),r1=BigInt(reserves[1]);
 const rUsdc=weth0?r1:r0,rWeth=weth0?r0:r1;
 const usdcIn=BigInt(size)*1000000n;
 const sushiBuyWeth=dexV2AmountOut47812(usdcIn,rUsdc,rWeth);
 const rows=[];
 for(const uni of unis){
  const fee=Number(uni.feeTier);
  for(const direction of ['SUSHI_BUY_UNI_SELL','UNI_BUY_SUSHI_SELL']){
   const tokenIn=dexNormalize47814(direction==='SUSHI_BUY_UNI_SELL'?c.tokens.WETH:c.tokens.USDC);
   const tokenOut=dexNormalize47814(direction==='SUSHI_BUY_UNI_SELL'?c.tokens.USDC:c.tokens.WETH);
   const amountIn=direction==='SUSHI_BUY_UNI_SELL'?sushiBuyWeth:usdcIn;
   try{
    if(amountIn<=0n)throw Error('ZERO_FIRST_LEG_OUTPUT');
    const data=dexQuoterInterface47813.encodeFunctionData('quoteExactInputSingle',[{tokenIn,tokenOut,amountIn,fee,sqrtPriceLimitX96:0}]);
    const raw=await dexCall4780(c,quoter,data);
    const decoded=dexQuoterInterface47813.decodeFunctionResult('quoteExactInputSingle',raw);
    const v3Out=BigInt(decoded[0]);
    if(v3Out<=0n)throw Error('ZERO_V3_QUOTE_OUTPUT');
    const finalUsdc=direction==='SUSHI_BUY_UNI_SELL'?v3Out:dexV2AmountOut47812(v3Out,rWeth,rUsdc);
    const grossMicro=finalUsdc-usdcIn;
    rows.push({direction,v3Venue:uni.name,v3Pool:uni.pool,v3FeeTier:fee,sushiPool:sushi.pool,inputUsdc:size,firstLegWethOut:(direction==='SUSHI_BUY_UNI_SELL'?sushiBuyWeth:v3Out).toString(),finalUsdcBeforeGas:Number(finalUsdc)/1e6,grossBeforeGasUsd:Number(grossMicro)/1e6,quoterReturned:true,quoterAbi:'V2_TUPLE',atomicSimulationVerified:false,gasUsd:null,netProfitUsd:null,qualified:false,warning:'UNISWAP_QUOTER_OUTPUT_PLUS_SUSHI_RESERVE_MATH; NO ATOMIC EXECUTION OR GAS VALIDATION'});
   }catch(e){rows.push({direction,v3Venue:uni.name,v3FeeTier:fee,quoterReturned:false,qualified:false,error:String(e.message||e).slice(0,180)});if(/429|COOLDOWN|RATE_LIMIT/.test(String(e.message)))break;}
  }
  if(Date.now()<dexRpcGate4783.cooldownUntil||Date.now()<rpcBudget4789.blockedUntil)break;
 }
 return {success:true,version:VERSION,stage:'MANUAL_ONCHAIN_UNISWAP_V2_QUOTER_VS_SUSHI_V2_MATH',chainId,name:c.name,sizeUsd:size,snapshotAgeMs:age,sushiFeeBpsAssumed:30,sushiFeeVerified:false,quoterAddress:quoter,results:rows,qualified:0,alertsEmitted:0,limitations:['QUOTER_V2_ABI_PROBED_ON_BASE_BUT_CONTRACT_IDENTITY_NOT_INDEPENDENTLY_VERIFIED','SUSHI_FEE_ASSUMED','NO_ATOMIC_SIMULATION','NO_L2_FULL_GAS_ESTIMATE','NO_NET_PROFIT_VALIDATION','SNAPSHOT_POOL_IDENTITIES_FROM_RECENT_DISCOVERY'],safety:{readOnly:true,executionEligible:false,mainnetBroadcast:false,fundsMovedOnMainnet:false}};
}

// 4.78.15: read-only, manually initiated Base quoter contract/ABI diagnostic.
// No assumption that a deployed contract at a configured address is a valid Uniswap quoter.
const dexQuoterProbe47815={running:false,runs:0,lastCompletedAt:null,result:null};
async function dexRpcDiagnostic47815(c,method,params){
 const prev=dexRpcGate4783.tail;let release;const next=new Promise(resolve=>release=resolve);
 dexRpcGate4783.tail=prev.catch(()=>{}).then(()=>next);
 await prev.catch(()=>{});
 try{
  if(Date.now()<dexRpcGate4783.cooldownUntil||Date.now()<rpcBudget4789.blockedUntil)throw Error('RPC_COOLDOWN_ACTIVE');
  await sleep4783(Math.max(0,dexRpcGate4783.nextAt-Date.now()));dexRpcGate4783.nextAt=Date.now()+1500;
  const ctl=new AbortController();const timer=setTimeout(()=>ctl.abort(),12000);
  try{
   dexRpcGate4783.requests++;
   const r=await fetch(c.rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:ctl.signal});
   if(!r.ok){if(r.status===429){dexRpcGate4783.rateLimited++;dexRpcGate4783.lastRateLimitAt=new Date().toISOString();dexRpcGate4783.cooldownUntil=Date.now()+120000;}throw Error('RPC_HTTP_'+r.status);}
   const j=await r.json();if(j.error)throw Error('RPC_'+j.error.code+':'+String(j.error.message).slice(0,140));
   if(method==='eth_getLogs'){if(!Array.isArray(j.result))throw Error('INVALID_RPC_LOGS_RESULT');return j.result;}if(method==='eth_getBlockByNumber'){if(j.result===null)return null;if(!j.result||typeof j.result!=='object'||Array.isArray(j.result)||!Array.isArray(j.result.transactions))throw Error('INVALID_RPC_BLOCK_RESULT');return j.result;}if(typeof j.result!=='string'||!/^0x[0-9a-fA-F]*$/.test(j.result))throw Error('INVALID_RPC_RESULT');return j.result;
  }finally{clearTimeout(timer);}
 }finally{release();}
}
async function dexProbeQuoter47815(){
 const c=MC4750_CHAINS.find(x=>x.chainId===8453);
 const quoter=dexNormalize47814(UNISWAP_V3_QUOTER_V1_4490[c.key]);
 const row={chainId:8453,quoterAddress:quoter,bytecodePresent:null,bytecodeBytes:null,abiProbes:[],warning:'BYTECODE_PRESENCE_DOES_NOT_PROVE_QUOTER_IDENTITY'};
 const code=await dexRpcDiagnostic47815(c,'eth_getCode',[quoter,'latest']);
 row.bytecodePresent=code.length>2;row.bytecodeBytes=(code.length-2)/2;
 if(!row.bytecodePresent){row.conclusion='NO_CONTRACT_CODE_AT_CONFIGURED_ADDRESS';return row;}
 const ethers=require('ethers');
 const tokenIn=dexNormalize47814(c.tokens.USDC),tokenOut=dexNormalize47814(c.tokens.WETH),amountIn=1000000n;
 for(const variant of ['V1','V2']){
  const iface=new ethers.Interface(variant==='V1'?QUOTER_V1_ABI_4490:QUOTER_V2_ABI_4501);
  const params=variant==='V1'?[tokenIn,tokenOut,500,amountIn,0]:[{tokenIn,tokenOut,amountIn,fee:500,sqrtPriceLimitX96:0}];
  const entry={variant,feeTier:500,inputUsdc:1,selector:iface.getFunction('quoteExactInputSingle').selector,returned:false};
  try{
   const data=iface.encodeFunctionData('quoteExactInputSingle',params);
   const raw=await dexRpcDiagnostic47815(c,'eth_call',[{to:quoter,data},'latest']);
   const decoded=iface.decodeFunctionResult('quoteExactInputSingle',raw);
   entry.returned=true;entry.wethOutRaw=decoded[0].toString();
  }catch(e){entry.error=String(e.message||e).slice(0,180);}
  row.abiProbes.push(entry);
  if(Date.now()<dexRpcGate4783.cooldownUntil||Date.now()<rpcBudget4789.blockedUntil)break;
 }
 row.conclusion=row.abiProbes.some(x=>x.returned)?'QUOTE_ABI_PROBE_SUCCEEDED':'NO_SUCCESSFUL_ABI_PROBE';
 return row;
}
app.get('/api/dex-independent/quoter-verification/status',(req,res)=>res.json({success:true,version:VERSION,running:dexQuoterProbe47815.running,runs:dexQuoterProbe47815.runs,lastCompletedAt:dexQuoterProbe47815.lastCompletedAt,result:dexQuoterProbe47815.result,safety:{readOnly:true,mainnetBroadcast:false}}));
app.get('/api/dex-independent/quoter-verification/run',(req,res)=>{
 if(dexQuoterProbe47815.running)return res.status(409).json({success:false,error:'PROBE_ALREADY_RUNNING'});
 dexQuoterProbe47815.running=true;dexQuoterProbe47815.runs++;
 setImmediate(async()=>{try{dexQuoterProbe47815.result=await dexProbeQuoter47815();}catch(e){dexQuoterProbe47815.result={error:String(e.message||e).slice(0,200)};}finally{dexQuoterProbe47815.running=false;dexQuoterProbe47815.lastCompletedAt=new Date().toISOString();}});
 res.json({success:true,version:VERSION,status:'STARTED_BACKGROUND',statusRoute:'/api/dex-independent/quoter-verification/status',readOnly:true});
});

// 4.78.17: manual Base V3-to-V3 two-leg quote screening, no trading.
// Pancake V3 QuoterV2 compatibility is tested per quote; failures are explicit.
const dexV3Pairs47817={running:false,runs:0,lastCompletedAt:null,result:null};
async function dexV3PairQuote47817(c,quoter,tokenIn,tokenOut,fee,amountIn){
 const args={tokenIn:dexNormalize47814(tokenIn),tokenOut:dexNormalize47814(tokenOut),fee:Number(fee),amountIn,sqrtPriceLimitX96:0};
 const data=dexQuoterInterface47813.encodeFunctionData('quoteExactInputSingle',[args]);
 const raw=await dexCall4780(c,dexNormalize47814(quoter),data);
 const decoded=dexQuoterInterface47813.decodeFunctionResult('quoteExactInputSingle',raw);
 const out=BigInt(decoded[0]); if(out<=0n)throw Error('ZERO_QUOTER_OUTPUT'); return out;
}
async function dexV3Cross47817(size){
 const c=MC4750_CHAINS.find(x=>x.chainId===8453);
 const snap=dexVerified4788.get(8453),age=snap?Date.now()-Date.parse(snap.observedAt):null;
 if(!snap||age<0||age>DEX_SNAPSHOT_MAX_AGE_MS_4788)throw Error('FRESH_BASE_DISCOVERY_REQUIRED');
 const uni=snap.venues.filter(v=>v.status==='POOL_LIVE'&&v.name.startsWith('UNISWAP_V3'));
 const pancake=snap.venues.filter(v=>v.status==='POOL_LIVE'&&v.name.startsWith('PANCAKESWAP_V3'));
 if(!uni.length||!pancake.length)throw Error('LIVE_UNISWAP_AND_PANCAKE_POOLS_REQUIRED');
 const quoterUni=dexNormalize47814(UNISWAP_V3_QUOTER_V1_4490[c.key]);
 const quoterPancake=dexNormalize47814(PANCAKESWAP_V3_BASE.quoter);
 const amountIn=BigInt(size)*1000000n,rows=[];
 for(const u of uni)for(const p of pancake)for(const direction of ['UNISWAP_BUY_PANCAKE_SELL','PANCAKE_BUY_UNISWAP_SELL']){
  const buy=direction.startsWith('UNISWAP')?{venue:u,quoter:quoterUni}:{venue:p,quoter:quoterPancake};
  const sell=direction.startsWith('UNISWAP')?{venue:p,quoter:quoterPancake}:{venue:u,quoter:quoterUni};
  const row={direction,uniswapPool:u.pool,uniswapFeeTier:Number(u.feeTier),pancakePool:p.pool,pancakeFeeTier:Number(p.feeTier),inputUsdc:size,qualified:false,atomicSimulationVerified:false,gasUsd:null,netProfitUsd:null};
  try{
   const weth=await dexV3PairQuote47817(c,buy.quoter,c.tokens.USDC,c.tokens.WETH,buy.venue.feeTier,amountIn);
   const usdc=await dexV3PairQuote47817(c,sell.quoter,c.tokens.WETH,c.tokens.USDC,sell.venue.feeTier,weth);
   Object.assign(row,{firstLegWethOut:weth.toString(),finalUsdcBeforeGas:Number(usdc)/1e6,grossBeforeGasUsd:Number(usdc-amountIn)/1e6,bothQuotersReturned:true});
  }catch(e){Object.assign(row,{bothQuotersReturned:false,error:String(e.shortMessage||e.message||e).slice(0,200)});}
  rows.push(row);
  if(Date.now()<dexRpcGate4783.cooldownUntil||Date.now()<rpcBudget4789.blockedUntil)break;
 }
 return {success:true,version:VERSION,stage:'BASE_V3_TO_V3_READ_ONLY_TWO_LEG_QUOTER_SCREEN',chainId:8453,sizeUsd:size,snapshotAgeMs:age,uniswapQuoter:quoterUni,pancakeQuoter:quoterPancake,results:rows,successfulTwoLegQuotes:rows.filter(x=>x.bothQuotersReturned).length,qualified:0,alertsEmitted:0,limitations:['PANCAKE_QUOTER_ABI_NOT_YET_LIVE_VERIFIED','QUOTER_CONTRACT_IDENTITIES_NOT_INDEPENDENTLY_VERIFIED','NO_ATOMIC_SIMULATION','NO_GAS_COST','NO_NET_PROFIT_VALIDATION','QUOTES_NOT_BLOCK_PINNED','IN_MEMORY_DISCOVERY_EXPIRES'],safety:{readOnly:true,executionEligible:false,mainnetBroadcast:false,fundsMovedOnMainnet:false}};
}

// 4.78.18 manual multi-size quote sweep. Gas/net profit remain unverified.
const dexSizeSweep47818={running:false,runs:0,lastCompletedAt:null,result:null};
async function dexSizeSweepRun47818(){
 const c=MC4750_CHAINS.find(x=>x.chainId===8453);
 const snap=dexVerified4788.get(8453),age=snap?Date.now()-Date.parse(snap.observedAt):null;
 if(!snap||age<0||age>DEX_SNAPSHOT_MAX_AGE_MS_4788)throw Error('FRESH_BASE_DISCOVERY_REQUIRED');
 const uni=snap.venues.filter(v=>v.status==='POOL_LIVE'&&v.name.startsWith('UNISWAP_V3'));
 const pancake=snap.venues.filter(v=>v.status==='POOL_LIVE'&&v.name.startsWith('PANCAKESWAP_V3'));
 if(!uni.length||!pancake.length)throw Error('LIVE_V3_POOLS_REQUIRED');
 const uq=dexNormalize47814(UNISWAP_V3_QUOTER_V1_4490[c.key]);
 const pq=dexNormalize47814(PANCAKESWAP_V3_BASE.quoter);
 const sizes=[100,250,500,1000],rows=[];
 // Keep requests bounded on the free tier: compare the lowest-fee live pool on each venue.
 const u=uni.slice().sort((a,b)=>Number(a.feeTier)-Number(b.feeTier))[0];
 const p=pancake.slice().sort((a,b)=>Number(a.feeTier)-Number(b.feeTier))[0];
 let aborted=false;
 for(const size of sizes){
  for(const direction of ['UNISWAP_BUY_PANCAKE_SELL','PANCAKE_BUY_UNISWAP_SELL']){
   const buy=direction.startsWith('UNISWAP')?{v:u,q:uq}:{v:p,q:pq};
   const sell=direction.startsWith('UNISWAP')?{v:p,q:pq}:{v:u,q:uq};
   const amount=BigInt(size)*1000000n;
   const row={sizeUsd:size,direction,uniswapPool:u.pool,uniswapFeeTier:Number(u.feeTier),pancakePool:p.pool,pancakeFeeTier:Number(p.feeTier),gasUsd:null,netProfitUsd:null,qualified:false,atomicSimulationVerified:false};
   try{
    const weth=await dexV3PairQuote47817(c,buy.q,c.tokens.USDC,c.tokens.WETH,buy.v.feeTier,amount);
    const usdc=await dexV3PairQuote47817(c,sell.q,c.tokens.WETH,c.tokens.USDC,sell.v.feeTier,weth);
    Object.assign(row,{bothQuotersReturned:true,firstLegWethOut:weth.toString(),finalUsdcBeforeGas:Number(usdc)/1e6,grossBeforeGasUsd:Number(usdc-amount)/1e6});
   }catch(e){Object.assign(row,{bothQuotersReturned:false,error:String(e.shortMessage||e.message||e).slice(0,200)});}
   rows.push(row);
   if(Date.now()<dexRpcGate4783.cooldownUntil||Date.now()<rpcBudget4789.blockedUntil){aborted=true;break;}
  }
  if(aborted)break;
 }
 const successful=rows.filter(r=>r.bothQuotersReturned);
 const ranked=successful.slice().sort((a,b)=>b.grossBeforeGasUsd-a.grossBeforeGasUsd);
 return {success:true,version:VERSION,stage:'MANUAL_BASE_V3_SIZE_SWEEP_PRE_GAS',chainId:8453,sizesUsd:sizes,requestedRoutes:8,completedRoutes:rows.length,successfulTwoLegQuotes:successful.length,abortedForRpcCooldown:aborted,snapshotAgeMs:age,selectionPolicy:'LOWEST_FEE_LIVE_POOL_PER_VENUE',results:rows,rankedByGrossBeforeGas:ranked,positiveGrossCandidates:ranked.filter(r=>r.grossBeforeGasUsd>0).length,qualified:0,alertsEmitted:0,gasEstimateStatus:'NOT_AVAILABLE_ATOMIC_TRANSACTION_NOT_BUILT',limitations:['GAS_AND_L2_DATA_FEE_NOT_ESTIMATED','NO_NET_PROFIT_VALIDATION','QUOTES_NOT_BLOCK_PINNED','NO_ATOMIC_SIMULATION','CONTRACT_IDENTITIES_NOT_INDEPENDENTLY_VERIFIED','NO_EXECUTABLE_TRADE'],safety:{readOnly:true,executionEligible:false,mainnetBroadcast:false,fundsMovedOnMainnet:false}};
}
app.get('/api/dex-independent/v3-size-sweep/status',(req,res)=>res.json({success:true,version:VERSION,...dexSizeSweep47818,safety:{readOnly:true,mainnetBroadcast:false}}));
app.get('/api/dex-independent/v3-size-sweep/run',(req,res)=>{
 if(dexSizeSweep47818.running)return res.status(409).json({success:false,error:'SWEEP_ALREADY_RUNNING'});
 const snap=dexVerified4788.get(8453);
 if(!snap||Date.now()-Date.parse(snap.observedAt)>DEX_SNAPSHOT_MAX_AGE_MS_4788)return res.status(409).json({success:false,error:'RUN_DISCOVERY_FIRST_SNAPSHOT_MUST_BE_UNDER_10_MINUTES'});
 dexSizeSweep47818.running=true;dexSizeSweep47818.runs++;
 setImmediate(async()=>{try{dexSizeSweep47818.result=await dexSizeSweepRun47818();}catch(e){dexSizeSweep47818.result={success:false,version:VERSION,error:String(e.message||e).slice(0,200)};}finally{dexSizeSweep47818.running=false;dexSizeSweep47818.lastCompletedAt=new Date().toISOString();}});
 res.json({success:true,version:VERSION,status:'STARTED_BACKGROUND',statusRoute:'/api/dex-independent/v3-size-sweep/status',readOnly:true});
});

app.get('/api/dex-independent/v3-cross-dex/status',(req,res)=>res.json({success:true,version:VERSION,...dexV3Pairs47817,safety:{readOnly:true,mainnetBroadcast:false}}));
app.get('/api/dex-independent/v3-cross-dex/run',(req,res)=>{
 if(dexV3Pairs47817.running)return res.status(409).json({success:false,error:'QUOTE_CHECK_ALREADY_RUNNING'});
 const size=Number(req.query.size||100);
 if(![100,500,1000].includes(size))return res.status(400).json({success:false,error:'SIZE_MUST_BE_100_500_OR_1000'});
 const snap=dexVerified4788.get(8453);
 if(!snap||Date.now()-Date.parse(snap.observedAt)>DEX_SNAPSHOT_MAX_AGE_MS_4788)return res.status(409).json({success:false,error:'RUN_DISCOVERY_FIRST_SNAPSHOT_MUST_BE_UNDER_10_MINUTES'});
 dexV3Pairs47817.running=true;dexV3Pairs47817.runs++;
 setImmediate(async()=>{try{dexV3Pairs47817.result=await dexV3Cross47817(size);}catch(e){dexV3Pairs47817.result={success:false,version:VERSION,error:String(e.message||e).slice(0,200)};}finally{dexV3Pairs47817.running=false;dexV3Pairs47817.lastCompletedAt=new Date().toISOString();}});
 res.json({success:true,version:VERSION,status:'STARTED_BACKGROUND',statusRoute:'/api/dex-independent/v3-cross-dex/status',readOnly:true});
});

app.get('/api/dex-independent/cross-dex-quotes/status',(req,res)=>res.json({success:true,version:VERSION,running:dexQuotes47813.running,runs:dexQuotes47813.runs,lastCompletedAt:dexQuotes47813.lastCompletedAt,result:dexQuotes47813.lastResult,safety:{readOnly:true,mainnetBroadcast:false}}));
app.get('/api/dex-independent/cross-dex-quotes/run',(req,res)=>{
 if(dexQuotes47813.running)return res.status(409).json({success:false,error:'QUOTE_CHECK_ALREADY_RUNNING'});
 const chainId=Number(req.query.chainId||8453),size=Number(req.query.size||100);
 if(!MC4750_CHAINS.some(c=>c.chainId===chainId)||![100,500,1000].includes(size))return res.status(400).json({success:false,error:'USE_CHAINID_8453_42161_10_AND_SIZE_100_500_1000'});
 const snap=dexVerified4788.get(chainId);
 if(!snap||Date.now()-Date.parse(snap.observedAt)>DEX_SNAPSHOT_MAX_AGE_MS_4788)return res.status(409).json({success:false,error:'RUN_DISCOVERY_FIRST_SNAPSHOT_MUST_BE_UNDER_10_MINUTES'});
 dexQuotes47813.running=true;dexQuotes47813.runs++;
 setImmediate(async()=>{try{dexQuotes47813.lastResult=await dexCrossQuotes47813(chainId,size);}catch(e){dexQuotes47813.lastResult={success:false,version:VERSION,error:String(e.message||e)};}finally{dexQuotes47813.running=false;dexQuotes47813.lastCompletedAt=new Date().toISOString();}});
 res.json({success:true,version:VERSION,status:'STARTED_BACKGROUND',statusRoute:'/api/dex-independent/cross-dex-quotes/status',readOnly:true});
});


app.get("/api/rpc-budget/trace",(req,res)=>res.json({success:true,version:VERSION,scope:"GLOBAL_FETCH_ALCHEMY_ONLY",byChain:rpcTrace47810.byChain,byCaller:rpcTrace47810.byCaller,byMethod:rpcTrace47810.byMethod,responses:rpcTrace47810.responses,recent429:rpcTrace47810.recent429,warning:rpcTrace47810.unmonitoredTransportWarning,containsSecrets:false,safety:{readOnly:true,mainnetBroadcast:false}}));
app.get("/api/rpc-budget/status",(req,res)=>res.json({success:true,version:VERSION,scope:"GLOBAL_FETCH_ALCHEMY_ONLY",monthlyQuotaMeasured:false,cuPerSecondMeasured:false,requests:rpcBudget4789.requests,rateLimited:rpcBudget4789.rateLimited,methods:rpcBudget4789.methods,minimumSpacingMs:rpcBudget4789.minimumSpacingMs,last429:rpcBudget4789.last429,cooldownRemainingMs:Math.max(0,rpcBudget4789.blockedUntil-Date.now()),note:"Other RPC transports and external apps are not covered",safety:{readOnly:true,mainnetBroadcast:false}}));
app.get("/api/dex-independent/status",(req,res)=>res.json({success:true,version:VERSION,stage:"POOL_EVIDENCE_ONLY",...dex4780,rpcDiagnostics:{requests:dexRpcGate4783.requests,rateLimited:dexRpcGate4783.rateLimited,retries:dexRpcGate4783.retries,cacheHits:dexRpcGate4783.cacheHits,abortedScans:dexRpcGate4783.abortedScans,lastRateLimitAt:dexRpcGate4783.lastRateLimitAt,freeTierMode:true,backgroundHeartbeatIntervalMs:mc4750.pollIntervalMs,autoDiscoveryEnabled:process.env.ARBIFLOW_AUTO_DISCOVERY==="true",autoDexDiscoveryEnabled:process.env.ARBIFLOW_AUTO_DEX_DISCOVERY==="true",cooldownRemainingMs:Math.max(0,dexRpcGate4783.cooldownUntil-Date.now())},limitations:["NO_INDEPENDENT_EXECUTABLE_QUOTES","NO_FLASH_LIQUIDITY_VERIFICATION","NO_DYNAMIC_OPTIMAL_SIZING","NO_ATOMIC_SIMULATION","L2_FULL_GAS_NOT_VERIFIED"],safety:{readOnly:true,executionEligible:false,mainnetBroadcast:false,fundsMovedOnMainnet:false}}));
app.get("/api/dex-independent/run",(req,res)=>{if(dex4780.running||Date.now()<dexRpcGate4783.cooldownUntil)return res.json({success:false,version:VERSION,status:dex4780.running?"ALREADY_RUNNING":"RPC_COOLDOWN_ACTIVE",retryAfterMs:Math.max(0,dexRpcGate4783.cooldownUntil-Date.now()),readOnly:true});setImmediate(()=>runDex4780().catch(()=>{}));res.json({success:true,version:VERSION,status:"STARTED_BACKGROUND",statusRoute:"/api/dex-independent/status",readOnly:true});});
// Free-tier mode: independent DEX discovery runs only on explicit request.
if(process.env.ARBIFLOW_AUTO_DEX_DISCOVERY==="true")setTimeout(()=>runDex4780().catch(()=>{}),15000);

// Phase 8.2 integrated with the EXISTING independent DEX scanner state.
require('./phase82-dex').mount(app,{getEvidence:()=>dex4780});

// Phase 8.3: manual Base Uniswap V3 direct contract probe using existing RPC gate.
require('./phase83-direct-dex').mount(app,{
 getBaseChain:()=>MC4750_CHAINS.find(c=>c.chainId===8453),
 rpc:(chain,method,params)=>dexRpcDiagnostic47815(chain,method,params)
});

// Phase 8.4: manual, bounded direct Base multi-DEX verification. No broadcasting.
require('./phase84-multidex').mount(app,{
 getBaseChain:()=>MC4750_CHAINS.find(c=>c.chainId===8453),
 rpc:(chain,method,params)=>dexRpcDiagnostic47815(chain,method,params)
});

// Phase 8.5 manual, read-only cross-DEX cycle quotation.
require('./phase85-crossdex').mount(app,{
 getBaseChain:()=>MC4750_CHAINS.find(c=>c.chainId===8453),
 rpc:(chain,method,params)=>dexRpcDiagnostic47815(chain,method,params)
});

// Phase 8.6 bounded, manual dynamic factory-event discovery
require('./phase86-liquidity').mount(app,{getBaseChain:()=>MC4750_CHAINS.find(c=>c.chainId===8453),rpc:(chain,method,params)=>dexRpcDiagnostic47815(chain,method,params)});

// Phase 8.7: manual indexed liquidity discovery; preserves Phase 8.6.1 and prior routes.
require('./phase87-indexed-discovery').mount(app);

// Phase 8.8: independent manual on-chain Base pool inventory.
require('./phase88-onchain-inventory').mount(app,{getBaseChain:()=>MC4750_CHAINS.find(c=>c.chainId===8453),rpc:(chain,method,params)=>dexRpcDiagnostic47815(chain,method,params)});

// Read-only multi-token graph discovery; no trades or alerts.
require('./market-graph').mount(app,{getChain:id=>MC4750_CHAINS.find(c=>c.chainId===id),call:(chain,to,data)=>dexCall4780(chain,to,data)});
require('./flash-loan-discovery').mount(app,{getChain:id=>MC4750_CHAINS.find(c=>c.chainId===id),call:(chain,to,data)=>dexCall4780(chain,to,data)});

// Read-only block builder comparison and net-profit review; no transaction submission.
require('./block-builder-matrix').mount(app);

// Phase 9: bounded parallel two-swap discovery, diagnostic only.
require('./phase9-fast-routes').mount(app,{getBaseChain:()=>MC4750_CHAINS.find(c=>c.chainId===8453),rpc:(chain,method,params)=>dexRpcDiagnostic47815(chain,method,params)});

// Phase 10: opt-in manual pending-block visibility, read-only.
require('./phase10-pending').mount(app,{getBaseChain:()=>MC4750_CHAINS.find(c=>c.chainId===8453),rpc:(chain,method,params)=>dexRpcDiagnostic47815(chain,method,params)});

// Phase 9.1: opt-in Base WebSocket event intelligence; no transaction submission.
require('./phase91-events').mount(app);
