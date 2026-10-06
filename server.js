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

const VERSION = "3.1.0";

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
ARBIFLOW ENGINE 3.1.0

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

THIS BUILD DOES NOT:
- Hold private keys
- Connect MetaMask yet
- Broadcast blockchain transactions
- Claim paper passes are live executable trades
- Claim 0x liquidity sources are independent venue arbitrage
- Broadcast or execute Aerodrome transactions
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
AERODROME DIRECT VENUE
BASE - READ ONLY

This is intentionally isolated from the main scanner.

It proves that ArbiFlow can read an independent DEX
directly through the private Base RPC connection.

It does NOT:
- sign
- approve
- execute
- alter paper capital
- create a PAPER PASS
- create a live executable opportunity
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
    8453,
    {
      staticNetwork: true
    }
  );
}

function getAerodromeRouter() {
  const provider =
    getBaseProvider();

  return new Contract(
    AERODROME_BASE.router,
    AERODROME_ROUTER_ABI,
    provider
  );
}

async function aerodromeRouteQuote({
  sellToken,
  buyToken,
  sellAmount,
  stable
}) {
  const network =
    NETWORKS.base;

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
      `Unsupported Base token pair: ${sellToken}/${buyToken}.`
    );
  }

  if (
    sellToken ===
    buyToken
  ) {
    throw new Error(
      "Sell token and buy token must be different."
    );
  }

  const numericAmount =
    Number(
      sellAmount
    );

  if (
    !Number.isFinite(
      numericAmount
    ) ||
    numericAmount <= 0
  ) {
    throw new Error(
      "Sell amount must be greater than zero."
    );
  }

  const router =
    getAerodromeRouter();

  const amountIn =
    parseUnits(
      String(
        numericAmount
      ),
      sell.decimals
    );

  const route = [
    {
      from:
        sell.address,

      to:
        buy.address,

      stable:
        Boolean(
          stable
        ),

      factory:
        AERODROME_BASE.factory
    }
  ];

  const startedAt =
    Date.now();

  const amounts =
    await router.getAmountsOut(
      amountIn,
      route
    );

  if (
    !amounts ||
    amounts.length < 2
  ) {
    throw new Error(
      "Aerodrome returned no output amount."
    );
  }

  const rawOutput =
    amounts[
      amounts.length - 1
    ];

  const buyAmount =
    Number(
      formatUnits(
        rawOutput,
        buy.decimals
      )
    );

  if (
    !Number.isFinite(
      buyAmount
    ) ||
    buyAmount <= 0
  ) {
    throw new Error(
      "Aerodrome returned an invalid output amount."
    );
  }

  return {
    provider:
      "Aerodrome",

    liquidityModel:
      "DIRECT_VENUE",

    network:
      "Base",

    networkKey:
      "base",

    chainId:
      8453,

    router:
      AERODROME_BASE.router,

    factory:
      AERODROME_BASE.factory,

    poolType:
      stable
        ? "STABLE"
        : "VOLATILE",

    stable:
      Boolean(
        stable
      ),

    sellToken,

    buyToken,

    sellAmount:
      numericAmount,

    buyAmount:
      round(
        buyAmount,
        12
      ),

    latencyMs:
      Date.now() -
      startedAt,

    quoteTimestamp:
      Date.now(),

    readOnly:
      true,

    executable:
      false
  };
}

async function aerodromeBestQuote({
  sellToken,
  buyToken,
  sellAmount
}) {
  const attempts = [];

  /*
  Aerodrome supports both stable and volatile pools.

  We query both independently.

  A failed route does not cause the entire venue
  test to fail because a pool type may simply not
  exist for that token pair.
  */

  for (
    const stable of [
      false,
      true
    ]
  ) {
    try {
      const quote =
        await aerodromeRouteQuote({
          sellToken,
          buyToken,
          sellAmount,
          stable
        });

      attempts.push({
        success:
          true,

        poolType:
          quote.poolType,

        quote
      });
    } catch (error) {
      attempts.push({
        success:
          false,

        poolType:
          stable
            ? "STABLE"
            : "VOLATILE",

        error:
          error.message
      });
    }
  }

  const successful =
    attempts
      .filter(
        item =>
          item.success &&
          item.quote
      )
      .map(
        item =>
          item.quote
      );

  if (
    successful.length === 0
  ) {
    return {
      success:
        false,

      provider:
        "Aerodrome",

      network:
        "Base",

      sellToken,

      buyToken,

      sellAmount:
        Number(
          sellAmount
        ),

      attempts,

      message:
        "No Aerodrome route returned a usable quote."
    };
  }

  successful.sort(
    (a, b) =>
      b.buyAmount -
      a.buyAmount
  );

  const best =
    successful[0];

  return {
    success:
      true,

    provider:
      "Aerodrome",

    liquidityModel:
      "DIRECT_VENUE",

    independentVenue:
      true,

    network:
      "Base",

    chainId:
      8453,

    sellToken,

    buyToken,

    sellAmount:
      Number(
        sellAmount
      ),

    best,

    attempts,

    quoteTimestamp:
      Date.now(),

    readOnly:
      true,

    executable:
      false
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

  return round(
    quote.networkFeeNative *
      nativeUsd *
      SETTINGS.gasSafetyMultiplier,
    6
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

  /*
  Round trips:
  USDC -> TOKEN -> USDC
  */

  if (
    network.tokens.USDC
  ) {
    for (
      const middle of symbols
    ) {
      if (
        middle === "USDC"
      ) {
        continue;
      }

      routes.push({
        id:
          `${network.key}-round-${middle}`,

        type:
          "ROUND_TRIP",

        label:
          `USDC → ${middle} → USDC`,

        tokens: [
          "USDC",
          middle,
          "USDC"
        ]
      });
    }
  }

  /*
  Triangles:
  USDC -> A -> B -> USDC
  */

  if (
    network.tokens.USDC
  ) {
    const nonUsdc =
      symbols.filter(
        symbol =>
          symbol !==
          "USDC"
      );

    for (
      let i = 0;
      i <
        nonUsdc.length;
      i += 1
    ) {
      for (
        let j = 0;
        j <
          nonUsdc.length;
        j += 1
      ) {
        if (i === j) {
          continue;
        }

        const first =
          nonUsdc[i];

        const second =
          nonUsdc[j];

        routes.push({
          id:
            `${network.key}-triangle-${first}-${second}`,

          type:
            "TRIANGULAR",

          label:
            `USDC → ${first} → ${second} → USDC`,

          tokens: [
            "USDC",
            first,
            second,
            "USDC"
          ]
        });
      }
    }
  }

  return routes;
}

/*
=========================================================
ROUTE QUOTING
=========================================================
*/

async function quoteRoute({
  network,
  route,
  startingAmount
}) {
  let currentAmount =
    Number(
      startingAmount
    );

  let totalGasUsd =
    0;

  const legs = [];

  for (
    let index = 0;
    index <
      route.tokens.length - 1;
    index += 1
  ) {
    const sellToken =
      route.tokens[index];

    const buyToken =
      route.tokens[
        index + 1
      ];

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
        ),

      quoteTimestamp:
        quote.quoteTimestamp
    });

    currentAmount =
      quote.buyAmount;

    await sleep(
      SETTINGS.requestDelayMs
    );
  }

  return {
    startingAmount:
      Number(
        startingAmount
      ),

    finalAmount:
      currentAmount,

    totalGasUsd:
      round(
        totalGasUsd,
        6
      ),

    legs,

    completedAt:
      Date.now()
  };
}

/*
=========================================================
RISK SCORE
=========================================================
*/

function calculateRisk({
  route,
  tradeSize,
  estimatedGasUsd,
  estimatedNet,
  quoteAgeMs
}) {
  let score = 0;

  if (
    route.type ===
    "TRIANGULAR"
  ) {
    score += 20;
  } else {
    score += 10;
  }

  if (
    tradeSize >= 500
  ) {
    score += 10;
  }

  if (
    tradeSize >= 1000
  ) {
    score += 10;
  }

  if (
    estimatedGasUsd > 0 &&
    estimatedNet > 0
  ) {
    const gasRatio =
      estimatedGasUsd /
      estimatedNet;

    if (
      gasRatio > 0.25
    ) {
      score += 15;
    }

    if (
      gasRatio > 0.50
    ) {
      score += 15;
    }
  }

  if (
    quoteAgeMs >
    SETTINGS.quoteFreshnessMs *
      0.50
  ) {
    score += 10;
  }

  if (
    quoteAgeMs >
    SETTINGS.quoteFreshnessMs
  ) {
    score += 20;
  }

  score =
    clamp(
      score,
      0,
      100
    );

  let level =
    "LOW";

  if (
    score >= 70
  ) {
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

function calculateQuality({
  estimatedNet,
  roiPercent,
  riskScore,
  quoteAgeMs
}) {
  let score = 50;

  if (
    estimatedNet > 0
  ) {
    score +=
      Math.min(
        20,
        estimatedNet * 5
      );
  } else {
    score -=
      Math.min(
        20,
        Math.abs(
          estimatedNet
        ) * 5
      );
  }

  if (
    roiPercent > 0
  ) {
    score +=
      Math.min(
        20,
        roiPercent * 10
      );
  } else {
    score -=
      Math.min(
        20,
        Math.abs(
          roiPercent
        ) * 10
      );
  }

  score -=
    riskScore * 0.25;

  if (
    quoteAgeMs >
    SETTINGS.quoteFreshnessMs
  ) {
    score -= 15;
  }

  return round(
    clamp(
      score,
      0,
      100
    ),
    2
  );
}

/*
=========================================================
EVALUATE ROUTE
=========================================================
*/

async function evaluateRoute({
  network,
  route,
  tradeSize,
  phase
}) {
  state.testsAttempted += 1;

  try {
    const quoted =
      await quoteRoute({
        network,
        route,
        startingAmount:
          tradeSize
      });

    state.testsCompleted += 1;

    const startingValue =
      Number(
        tradeSize
      );

    const finalValue =
      quoted.finalAmount;

    const gross =
      finalValue -
      startingValue;

    const estimatedNet =
      gross -
      quoted.totalGasUsd;

    const roiPercent =
      startingValue > 0
        ? (
            estimatedNet /
            startingValue
          ) *
          100
        : 0;

    const newestQuote =
      Math.max(
        ...quoted.legs.map(
          leg =>
            leg.quoteTimestamp
        )
      );

    const quoteAgeMs =
      Date.now() -
      newestQuote;

    const risk =
      calculateRisk({
        route,
        tradeSize:
          startingValue,
        estimatedGasUsd:
          quoted.totalGasUsd,
        estimatedNet,
        quoteAgeMs
      });

    const qualityScore =
      calculateQuality({
        estimatedNet,
        roiPercent,
        riskScore:
          risk.score,
        quoteAgeMs
      });

    if (
      gross > 0
    ) {
      state.positiveGrossDetected += 1;
    }

    let status =
      "REJECTED";

    if (
      estimatedNet >=
        SETTINGS.minimumPaperPassUsd &&
      roiPercent >=
        SETTINGS.minimumPaperPassRoiPercent
    ) {
      status =
        "CANDIDATE";
    } else if (
      estimatedNet >=
      SETTINGS.watchlistNetFloorUsd
    ) {
      status =
        "WATCHLIST";
    }

    return {
      phase,

      network:
        network.name,

      networkKey:
        network.key,

      chainId:
        network.chainId,

      route:
        route.label,

      routeId:
        route.id,

      routeType:
        route.type,

      tradeSize:
        round(
          startingValue,
          6
        ),

      startingValue:
        round(
          startingValue,
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
          quoted.totalGasUsd,
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

      riskScore:
        risk.score,

      riskLevel:
        risk.level,

      qualityScore,

      quoteAgeMs,

      status,

      legs:
        quoted.legs,

      testedAt:
        now()
    };
  } catch (error) {
    state.errors.push({
      at:
        now(),

      phase,

      network:
        network.name,

      route:
        route.label,

      tradeSize,

      message:
        error.message
    });

    return null;
  }
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
  state.routesScreened += 1;

  const result =
    await evaluateRoute({
      network,
      route,
      tradeSize:
        SETTINGS.discoveryProbeUsd,
      phase:
        "DISCOVERY"
    });

  if (result) {
    state.discovery.push(
      result
    );
  }

  return result;
}

/*
=========================================================
ADAPTIVE POSITION SIZES
=========================================================
*/

function getOptimizationSizes() {
  const maximum =
    account.balance *
    SETTINGS.maxTradeCapitalPercent;

  const percentSizes =
    SETTINGS.optimizationPercents
      .map(
        percent =>
          account.balance *
          percent
      );

  const combined =
    [
      ...SETTINGS
        .optimizationFixedSizes,
      ...percentSizes
    ]
      .filter(
        amount =>
          amount > 0 &&
          amount <= maximum
      )
      .map(
        amount =>
          round(
            amount,
            2
          )
      );

  return unique(
    combined
  )
    .sort(
      (a, b) =>
        a - b
    );
}

/*
=========================================================
OPTIMIZE ROUTE
=========================================================
*/

async function optimizeRoute({
  network,
  route
}) {
  const sizes =
    getOptimizationSizes();

  state.testsPlanned +=
    sizes.length;

  const results = [];

  for (
    const tradeSize of sizes
  ) {
    const result =
      await evaluateRoute({
        network,
        route,
        tradeSize,
        phase:
          "OPTIMIZATION"
      });

    if (result) {
      results.push(
        result
      );
    }
  }

  if (
    results.length === 0
  ) {
    return {
      best: null,
      tests: []
    };
  }

  results.sort(
    (a, b) => {
      if (
        b.estimatedNet !==
        a.estimatedNet
      ) {
        return (
          b.estimatedNet -
          a.estimatedNet
        );
      }

      return (
        b.qualityScore -
        a.qualityScore
      );
    }
  );

  return {
    best:
      results[0],

    tests:
      results
  };
}
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
        "ArbiFlow Engine 3.1.0 scan started.",

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

      directVenueLayer: {
        enabled:
          true,

        venue:
          "Aerodrome",

        network:
          "Base",

        independentVenue:
          true,

        readOnly:
          true,

        integratedIntoScanner:
          false,

        executable:
          false
      },

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

      directVenueLayer: {
        enabled:
          true,

        venue:
          "Aerodrome",

        network:
          "Base",

        liquidityModel:
          "DIRECT_VENUE",

        independentVenue:
          true,

        readOnly:
          true,

        integratedIntoScanner:
          false,

        executable:
          false
      },

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
