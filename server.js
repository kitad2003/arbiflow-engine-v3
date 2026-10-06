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
  keccak256
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

const VERSION = "4.43.0";

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
          "0x4210000000000000000000000000000000000006",
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
          "0x4210000000000000000000000000000000000006",
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
  try{const [aave,gasModel]=await Promise.all([getAaveBaseFlashState("USDC"),getBaseFlashModeledGasCostUsd()]);const sizes=buildAdaptiveFlashSizes(aave.availableLiquidity),results=[];for(const amount of sizes)try{const t=await quoteMarket42Triangle(amount,seed.route,seed.venues);const premiumUsd=Number(amount)*Number(aave.flashLoanPremiumBps)/10000,net=t.grossPnl-premiumUsd-gasModel.modeledGasUsd,required=flashRequiredNetProfitUsd(Number(amount));results.push({...t,flashLoanAmount:Number(amount),flashPremiumUsd:round(premiumUsd,6),modeledGasUsd:gasModel.modeledGasUsd,estimatedNetProfitUsd:round(net,6),requiredNetProfitUsd:round(required,6),qualifies:net>=required});}catch(error){results.push({flashLoanAmount:Number(amount),qualifies:false,error:error.message});}const flashOptimization={seedRoute:seed.route,sizesTested:sizes.length,results,candidates:results.filter(x=>x.qualifies).sort((a,b)=>b.estimatedNetProfitUsd-a.estimatedNetProfitUsd)};return{bot:"LARGE_OPPORTUNITY_BOT",status:"COMPLETE",seed,flashLiquidityUsd:aave.availableLiquidity,flashOptimization,elapsedMs:Date.now()-startedAt};}catch(error){return{bot:"OPTIMIZER_BOT",status:"ERROR",strategy:"ADAPTIVE_NET_PROFIT_OPTIMIZATION",flashOptimization:null,errors:[{error:error.message}],elapsedMs:Date.now()-startedAt};}
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


// 4.43.0: Exhaustive hot-watch discovery. This is a latency lane, not a replacement
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
      const row={marketId:p.market.marketId,user:p.user.address,healthFactor:round(hf,6),borrowAssetsRaw,collateralAssetsRaw,borrowAssetsUsd:round(debt,2),collateralUsd:round(coll,2),lltv:round(lltv,6),readOnly:true};
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


// 4.43.0 fast lane: exhaustive <=1.01 refresh plus the same exact fork-accrual
// safety gate for any API signal below 1.0. No signing or mainnet broadcast.
let hotWatchSafety4430Active=false;
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
    if(!discovered.length) return res.json({success:true,version:VERSION,classification:"HOT_WATCH_SAFETY_PIPELINE_WAIT",readyForExplicitExecutionApproval:false,reason:"NO_HOT_WATCH_LIQUIDATABLE_SIGNAL",hotWatch:{positionsScanned:hot.positionsScanned,marketsRepresented:hot.marketsRepresented,pagesFetched:hot.pagesFetched,totalPositionCap:null,paginationExhausted:hot.paginationExhausted,healthFactorLte:hot.healthFactorLte,liquidatableSignals:0,closest:hot.candidates[0]||null},readOnly:true,liveExecutionEnabled:false,mainnetBroadcast:false,mainnetStateChanged:false,fundsMovedOnMainnet:false,elapsedMs:Date.now()-startedAt});
    const hardhatBin=path.join(__dirname,"node_modules",".bin",process.platform==="win32"?"hardhat.cmd":"hardhat"),maxCandidates=Math.max(1,Math.min(3,Number(process.env.ARBIFLOW_SAFETY_PIPELINE_MAX_CANDIDATES||3))),evaluated=[];
    for(const candidate of discovered.slice(0,maxCandidates)){
      const reportPath=path.join(__dirname,`hot-watch-safety-4430-${String(candidate.user).slice(2,10)}.json`); try{if(fs.existsSync(reportPath))fs.unlinkSync(reportPath)}catch{}
      const child=spawnSync(hardhatBin,["run","--no-compile","MainnetSafetyGate4390.js"],{cwd:__dirname,env:{...process.env,ARBIFLOW_MAINNET_SAFETY_CANDIDATE_JSON:JSON.stringify({marketId:candidate.marketId,user:candidate.user}),ARBIFLOW_MAINNET_SAFETY_REPORT:reportPath},encoding:"utf8",timeout:180000,maxBuffer:4*1024*1024});
      let report=null; try{if(fs.existsSync(reportPath))report=JSON.parse(fs.readFileSync(reportPath,"utf8"))}catch{}
      if(child.status!==0||!report?.success){evaluated.push({marketId:candidate.marketId,user:candidate.user,discoveryHealthFactor:candidate.healthFactor,classification:"SAFETY_GATE_FAILED_CLOSED",readyForExplicitExecutionApproval:false,error:(child.stderr||child.stdout||"SAFETY_GATE_FAILED").slice(-2000)});continue;}
      evaluated.push({...report,candidateDiscoveryHealthFactor:candidate.healthFactor,readyForExplicitExecutionApproval:report.classification==="MAINNET_EXECUTION_SAFETY_GATE_PASSED"});
      if(report.classification==="MAINNET_EXECUTION_SAFETY_GATE_PASSED") break;
    }
    const passed=evaluated.find(x=>x.readyForExplicitExecutionApproval===true);
    return res.json({success:true,version:VERSION,classification:passed?"HOT_WATCH_SAFETY_PIPELINE_PASSED":"HOT_WATCH_SAFETY_PIPELINE_WAIT",readyForExplicitExecutionApproval:Boolean(passed),candidate:passed||null,evaluated,hotWatch:{positionsScanned:hot.positionsScanned,marketsRepresented:hot.marketsRepresented,pagesFetched:hot.pagesFetched,totalPositionCap:null,paginationExhausted:hot.paginationExhausted,healthFactorLte:hot.healthFactorLte,liquidatableSignals:discovered.length},readOnly:true,liveExecutionEnabled:false,mainnetBroadcast:false,mainnetStateChanged:false,fundsMovedOnMainnet:false,nextGate:passed?"SEPARATE_EXPLICIT_USER_APPROVAL_REQUIRED_BEFORE_ANY_MAINNET_TRANSACTION":"CONTINUE_MONITORING",elapsedMs:Date.now()-startedAt});
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
app.get("/api/production/base/candidate-safety-pipeline",runCandidateSafetyPipeline4400);
app.post("/api/production/base/candidate-safety-pipeline",runCandidateSafetyPipeline4400);
app.get("/api/version", (req,res)=>res.json({success:true,engine:"ArbiFlow Opportunity Engine",version:VERSION,release:"4.43.0_EXHAUSTIVE_DISCOVERY_PLUS_HOT_WATCH_FAST_LANE",controlledAtomicRoute:"/api/test/base/controlled-atomic",zeroXAccessRoute:"/api/zero-x/base/access",zeroXProductionReadinessRoute:"/api/zero-x/base/production-readiness",kyberSwapRouteReadinessRoute:"/api/kyberswap/base/route-readiness",kyberSwapBuildReadinessRoute:"/api/kyberswap/base/build-readiness",controlledKyberAtomicRoute:"/api/test/base/controlled-kyberswap-atomic",productionDeploymentReadinessRoute:"/api/production/base/deployment-readiness",productionDeploymentPlanRoute:"/api/production/base/deployment-plan",productionBoundForkValidationRoute:"/api/test/base/production-bound-fork",mainnetExecutionSafetyGateRoute:"/api/production/base/execution-safety-gate",candidateSafetyPipelineRoute:"/api/production/base/candidate-safety-pipeline",hotWatchSafetyPipelineRoute:"/api/production/base/hot-watch-safety-pipeline",zeroXAccessAliases:["/api/test/zerox/access","/api/test/zero-x/access"],liveExecutionEnabled:false,mainnetBroadcast:false,time:now()}));

/*
=========================================================
SERVER
=========================================================
*/

if (process.env.ARBIFLOW_FORK_VERIFIED !== "1") {
  console.error("[ArbiFlow 4.40.0] STARTUP BLOCKED: fork verification wrapper was bypassed. Ensure package.json start is: node Startup4300.js");
  process.exit(1);
}

app.listen(
  PORT,
  () => {
    console.log(
      `ArbiFlow Engine ${VERSION} listening on port ${PORT}`
    );
  }
);