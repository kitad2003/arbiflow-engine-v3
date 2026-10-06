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

const VERSION = "3.8.0";

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
  const blockCount = clampInt(blocks, AAVE_LIQUIDATION_DEFAULT_BLOCKS, 1000, AAVE_LIQUIDATION_MAX_BLOCKS);
  const userLimit = clampInt(maxUsers, AAVE_LIQUIDATION_DEFAULT_USERS, 10, AAVE_LIQUIDATION_MAX_USERS);
  const fromBlock = Math.max(0, latestBlock - blockCount + 1);

  const logs = [];
  const chunkSize = 2000;
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
