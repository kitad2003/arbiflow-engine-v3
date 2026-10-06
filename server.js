"use strict";

require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const ZEROX_API_KEY = process.env.ZEROX_API_KEY || "";

/* =========================================================
   ARBIFLOW ENGINE 3.0
   ---------------------------------------------------------
   PAPER TRADING / DISCOVERY ENGINE

   IMPORTANT:
   - Uses live market quotes when 0x is configured.
   - Does NOT execute real blockchain transactions.
   - Does NOT hold private keys.
   - Does NOT label paper opportunities as LIVE executable.
   ========================================================= */

const VERSION = "3.0.0";

const SETTINGS = {
  defaultCapital: 500,

  discoveryProbeUsd: 25,

  sizePercents: [
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

  absoluteSizes: [
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
  ],

  maxTradeCapitalPercent: 0.50,

  minimumPaperPassUsd: 0.02,

  minimumPaperPassRoiPercent: 0.01,

  watchlistNetFloorUsd: -0.50,

  quoteFreshnessMs: 15000,

  requestDelayMs: 140,

  retryDelayMs: 1800,

  maxRetries: 2,

  gasSafetyMultiplier: 1.15,

  slippageBps: 50,

  autoPaperTrading: false,

  maxAutoRiskScore: 55,

  maxAutoTradesPerCycle: 1
};

/* =========================================================
   NETWORKS / TOKENS
   ========================================================= */

const NETWORKS = {
  base: {
    key: "base",
    name: "Base",
    chainId: 8453,
    gasSymbol: "ETH",
    wrappedNative: "WETH",
    enabled: true,
    tokens: {
      USDC: {
        symbol: "USDC",
        address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        decimals: 6,
        stable: true
      },
      WETH: {
        symbol: "WETH",
        address: "0x4200000000000000000000000000000000000006",
        decimals: 18
      },
      DAI: {
        symbol: "DAI",
        address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
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
    enabled: true,
    tokens: {
      USDC: {
        symbol: "USDC",
        address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
        decimals: 6,
        stable: true
      },
      USDT: {
        symbol: "USDT",
        address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
        decimals: 6,
        stable: true
      },
      WETH: {
        symbol: "WETH",
        address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
        decimals: 18
      },
      ARB: {
        symbol: "ARB",
        address: "0x912CE59144191C1204E64559FE8253a0e49E6548",
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
    enabled: true,
    tokens: {
      USDC: {
        symbol: "USDC",
        address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
        decimals: 6,
        stable: true
      },
      USDT: {
        symbol: "USDT",
        address: "0x94b008aA00579c1307B0EF2c499aD98a8cE58e58",
        decimals: 6,
        stable: true
      },
      WETH: {
        symbol: "WETH",
        address: "0x4200000000000000000000000000000000000006",
        decimals: 18
      },
      OP: {
        symbol: "OP",
        address: "0x4200000000000000000000000000000000000042",
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
    enabled: true,
    tokens: {
      USDC: {
        symbol: "USDC",
        address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
        decimals: 6,
        stable: true
      },
      USDT: {
        symbol: "USDT",
        address: "0xc2132D05D31c914a87C6611C10748AaCBaF9A6b",
        decimals: 6,
        stable: true
      },
      WPOL: {
        symbol: "WPOL",
        address: "0x0d500B1d8E8eD2b9D3a73C1b9bA4C7cC0f4D3C49",
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
    enabled: true,
    tokens: {
      USDC: {
        symbol: "USDC",
        address: "0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        decimals: 6,
        stable: true
      },
      USDT: {
        symbol: "USDT",
        address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
        decimals: 6,
        stable: true
      },
      WETH: {
        symbol: "WETH",
        address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        decimals: 18
      },
      DAI: {
        symbol: "DAI",
        address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
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
    enabled: true,
    tokens: {
      USDC: {
        symbol: "USDC",
        address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
        decimals: 18,
        stable: true
      },
      USDT: {
        symbol: "USDT",
        address: "0x55d398326f99059fF775485246999027B3197955",
        decimals: 18,
        stable: true
      },
      WBNB: {
        symbol: "WBNB",
        address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
        decimals: 18
      }
    }
  }
};

/* =========================================================
   STATE
   ========================================================= */

const state = {
  startedAt: new Date().toISOString(),

  running: false,

  cycle: 0,

  scanPhase: "IDLE",

  currentNetwork: null,

  currentRoute: null,

  progressPercent: 0,

  routesGenerated: 0,

  routesScreened: 0,

  testsPlanned: 0,

  testsAttempted: 0,

  testsCompleted: 0,

  spreadsDetected: 0,

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

  errors: [],

  results: [],

  watchlist: [],

  candidates: [],

  confirmed: [],

  paperPass: [],

  paperExecuted: [],

  history: []
};

const account = {
  startingBalance: SETTINGS.defaultCapital,
  balance: SETTINGS.defaultCapital,
  realizedPnL: 0,
  simulatedTrades: 0
};

let selectedNetworks = [
  "base",
  "arbitrum",
  "optimism",
  "polygon",
  "ethereum",
  "bnb"
];

/* =========================================================
   UTILITIES
   ========================================================= */

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function round(value, decimals = 6) {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return 0;
  }

  const factor = 10 ** decimals;

  return Math.round(n * factor) / factor;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function now() {
  return new Date().toISOString();
}

function unique(values) {
  return [...new Set(values)];
}

function toBaseUnits(amount, decimals) {
  const numeric = Number(amount);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error("Invalid token amount.");
  }

  const text = numeric.toFixed(decimals);

  const parts = text.split(".");

  const whole = parts[0];

  const fraction = (parts[1] || "").padEnd(decimals, "0");

  const combined = `${whole}${fraction}`
    .replace(/^0+/, "") || "0";

  return BigInt(combined).toString();
}

function fromBaseUnits(amount, decimals) {
  const raw = BigInt(amount || "0");

  const divisor = 10n ** BigInt(decimals);

  const whole = raw / divisor;

  const fraction = raw % divisor;

  const fractionString = fraction
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "");

  if (!fractionString) {
    return Number(whole.toString());
  }

  return Number(`${whole.toString()}.${fractionString}`);
}

function getNetwork(key) {
  return NETWORKS[key] || null;
}

function getEnabledNetworks() {
  return selectedNetworks
    .map(getNetwork)
    .filter(Boolean);
}

function networkSummary(network) {
  return {
    key: network.key,
    name: network.name,
    chainId: network.chainId,
    gasSymbol: network.gasSymbol,
    wrappedNative: network.wrappedNative,
    selected: selectedNetworks.includes(network.key),
    tokens: Object.keys(network.tokens)
  };
}

function resetScanCollections() {
  state.results = [];
  state.watchlist = [];
  state.candidates = [];
  state.confirmed = [];
  state.paperPass = [];

  state.routesGenerated = 0;
  state.routesScreened = 0;
  state.testsPlanned = 0;
  state.testsAttempted = 0;
  state.testsCompleted = 0;
  state.spreadsDetected = 0;
  state.watchlistFound = 0;
  state.candidatesFound = 0;
  state.optimizedFound = 0;
  state.confirmedFound = 0;
  state.paperPassFound = 0;

  state.progressPercent = 0;
  state.currentNetwork = null;
  state.currentRoute = null;
  state.errors = [];
  state.lastError = null;
}

/* =========================================================
   0x LIVE PRICE PROVIDER
   ========================================================= */

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

  const sell = network.tokens[sellToken];
  const buy = network.tokens[buyToken];

  if (!sell || !buy) {
    throw new Error(
      `Unsupported token pair ${sellToken}/${buyToken} on ${network.name}.`
    );
  }

  const sellAmountBase = toBaseUnits(
    sellAmount,
    sell.decimals
  );

  const params = new URLSearchParams({
    chainId: String(network.chainId),
    sellToken: sell.address,
    buyToken: buy.address,
    sellAmount: sellAmountBase,
    slippageBps: String(SETTINGS.slippageBps)
  });

  const url =
    `https://api.0x.org/swap/allowance-holder/price?${params.toString()}`;

  let lastError = null;

  for (
    let attempt = 0;
    attempt <= SETTINGS.maxRetries;
    attempt += 1
  ) {
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "0x-api-key": ZEROX_API_KEY,
          "0x-version": "v2",
          "Content-Type": "application/json"
        }
      });

      if (response.status === 429) {
        state.rateLimited = true;

        await sleep(
          SETTINGS.retryDelayMs * (attempt + 1)
        );

        continue;
      }

      const text = await response.text();

      let data = {};

      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = {};
      }

      if (!response.ok) {
        const message =
          data.reason ||
          data.message ||
          data.validationErrors?.[0]?.reason ||
          `0x HTTP ${response.status}`;

        throw new Error(message);
      }

      state.rateLimited = false;

      const buyAmountBase =
        data.buyAmount ||
        data.minBuyAmount ||
        "0";

      const buyAmount = fromBaseUnits(
        buyAmountBase,
        buy.decimals
      );

      const gas = Number(data.gas || 0);

      const gasPrice = Number(data.gasPrice || 0);

      let networkFeeNative = 0;

      if (data.totalNetworkFee) {
        networkFeeNative =
          Number(data.totalNetworkFee) / 1e18;
      } else if (gas && gasPrice) {
        networkFeeNative =
          (gas * gasPrice) / 1e18;
      }

      state.lastSuccessfulQuote = {
        at: now(),
        network: network.name,
        sellToken,
        buyToken,
        sellAmount: round(sellAmount, 8),
        buyAmount: round(buyAmount, 8)
      };

      return {
        provider: "0x",
        venue: "0x Aggregated Liquidity",
        network: network.name,
        chainId: network.chainId,
        sellToken,
        buyToken,
        sellAmount: Number(sellAmount),
        buyAmount,
        networkFeeNative,
        gasSymbol: network.gasSymbol,
        timestamp: Date.now()
      };
    } catch (error) {
      lastError = error;

      if (attempt < SETTINGS.maxRetries) {
        await sleep(
          SETTINGS.retryDelayMs * (attempt + 1)
        );
      }
    }
  }

  throw lastError || new Error("0x quote failed.");
}

/* =========================================================
   GAS ESTIMATION
   ========================================================= */

const nativeUsdCache = new Map();

async function getNativeUsd(network) {
  const cached =
    nativeUsdCache.get(network.key);

  if (
    cached &&
    Date.now() - cached.timestamp < 120000
  ) {
    return cached.price;
  }

  const wrappedSymbol =
    network.wrappedNative;

  if (
    !network.tokens[wrappedSymbol] ||
    !network.tokens.USDC
  ) {
    return 0;
  }

  try {
    const quote = await zeroXPrice({
      network,
      sellToken: wrappedSymbol,
      buyToken: "USDC",
      sellAmount: 1
    });

    const price = quote.buyAmount;

    nativeUsdCache.set(network.key, {
      price,
      timestamp: Date.now()
    });

    return price;
  } catch {
    return 0;
  }
}

async function gasUsdForQuote(
  network,
  quote
) {
  if (!quote.networkFeeNative) {
    return 0;
  }

  const nativeUsd =
    await getNativeUsd(network);

  if (!nativeUsd) {
    return 0;
  }

  return (
    quote.networkFeeNative *
    nativeUsd *
    SETTINGS.gasSafetyMultiplier
  );
}

/* =========================================================
   ROUTE GENERATION
   ========================================================= */

function generateRoutes(network) {
  const routes = [];

  const symbols =
    Object.keys(network.tokens);

  if (!symbols.includes("USDC")) {
    return routes;
  }

  /*
    Direct round trips:
    USDC -> TOKEN -> USDC
  */

  for (const token of symbols) {
    if (token === "USDC") {
      continue;
    }

    routes.push({
      type: "ROUND_TRIP",
      network: network.key,
      legs: [
        ["USDC", token],
        [token, "USDC"]
      ],
      label:
        `USDC → ${token} → USDC`
    });
  }

  /*
    Triangular:
    USDC -> TOKEN A -> TOKEN B -> USDC
  */

  const intermediate =
    symbols.filter(
      symbol => symbol !== "USDC"
    );

  for (
    let i = 0;
    i < intermediate.length;
    i += 1
  ) {
    for (
      let j = 0;
      j < intermediate.length;
      j += 1
    ) {
      if (i === j) {
        continue;
      }

      const a = intermediate[i];
      const b = intermediate[j];

      routes.push({
        type: "TRIANGULAR",
        network: network.key,
        legs: [
          ["USDC", a],
          [a, b],
          [b, "USDC"]
        ],
        label:
          `USDC → ${a} → ${b} → USDC`
      });
    }
  }

  return routes;
}

/* =========================================================
   ROUTE QUOTING
   ========================================================= */

async function quoteRoute({
  network,
  route,
  tradeSize
}) {
  let currentAmount =
    Number(tradeSize);

  let totalGasUsd = 0;

  const legs = [];

  for (
    let i = 0;
    i < route.legs.length;
    i += 1
  ) {
    const [sellToken, buyToken] =
      route.legs[i];

    await sleep(
      SETTINGS.requestDelayMs
    );

    const quote = await zeroXPrice({
      network,
      sellToken,
      buyToken,
      sellAmount: currentAmount
    });

    const gasUsd =
      await gasUsdForQuote(
        network,
        quote
      );

    totalGasUsd += gasUsd;

    legs.push({
      leg: i + 1,
      venue: quote.venue,
      sellToken,
      buyToken,
      sellAmount:
        round(currentAmount, 8),
      buyAmount:
        round(quote.buyAmount, 8),
      estimatedGasUsd:
        round(gasUsd, 6)
    });

    currentAmount =
      quote.buyAmount;
  }

  const finalValue =
    Number(currentAmount);

  const gross =
    finalValue - tradeSize;

  const estimatedGasUsd =
    totalGasUsd;

  const estimatedNet =
    gross - estimatedGasUsd;

  const roiPercent =
    tradeSize > 0
      ? (estimatedNet / tradeSize) * 100
      : 0;

  return {
    network: network.name,
    networkKey: network.key,
    chainId: network.chainId,
    gasSymbol: network.gasSymbol,

    routeType: route.type,
    route: route.label,

    tradeSize:
      round(tradeSize, 6),

    startingValue:
      round(tradeSize, 6),

    finalValue:
      round(finalValue, 6),

    gross:
      round(gross, 6),

    estimatedGasUsd:
      round(estimatedGasUsd, 6),

    estimatedNet:
      round(estimatedNet, 6),

    roiPercent:
      round(roiPercent, 6),

    legs,

    quoteTimestamp:
      Date.now(),

    quoteTime:
      now()
  };
}

/* =========================================================
   QUALITY / RISK
   ========================================================= */

function calculateRisk(result) {
  let score = 15;

  if (
    result.routeType === "TRIANGULAR"
  ) {
    score += 15;
  }

  if (result.legs.length >= 3) {
    score += 10;
  }

  if (result.tradeSize >= 500) {
    score += 10;
  }

  if (
    result.estimatedGasUsd >
    Math.max(
      0.25,
      Math.abs(result.estimatedNet)
    )
  ) {
    score += 15;
  }

  if (result.roiPercent < 0) {
    score += 10;
  }

  score = clamp(score, 0, 100);

  let level = "LOW";

  if (score >= 65) {
    level = "HIGH";
  } else if (score >= 40) {
    level = "MEDIUM";
  }

  return {
    score,
    level
  };
}

function calculateQuality(result) {
  let score = 50;

  if (result.estimatedNet > 0) {
    score += 15;
  }

  if (result.roiPercent > 0.10) {
    score += 10;
  }

  if (result.roiPercent > 0.25) {
    score += 10;
  }

  if (
    result.estimatedGasUsd <
    Math.max(
      0.05,
      result.estimatedNet * 0.25
    )
  ) {
    score += 10;
  }

  if (
    result.routeType === "TRIANGULAR"
  ) {
    score -= 5;
  }

  if (result.estimatedNet < 0) {
    score -= 25;
  }

  return clamp(score, 0, 100);
}

function classifyDiscovery(result) {
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

/* =========================================================
   POSITION SIZE OPTIMIZATION
   ========================================================= */

function generateTradeSizes() {
  const capital =
    account.balance;

  const maxAllowed =
    capital *
    SETTINGS.maxTradeCapitalPercent;

  const percentSizes =
    SETTINGS.sizePercents.map(
      percent =>
        round(capital * percent, 2)
    );

  const absolute =
    SETTINGS.absoluteSizes.filter(
      size => size <= maxAllowed
    );

  return unique([
    ...percentSizes,
    ...absolute
  ])
    .filter(
      size =>
        size > 0 &&
        size <= maxAllowed
    )
    .sort((a, b) => a - b);
}

async function optimizeRoute({
  network,
  route
}) {
  const sizes =
    generateTradeSizes();

  const tests = [];

  for (const size of sizes) {
    state.testsPlanned += 1;
    state.testsAttempted += 1;

    try {
      const result =
        await quoteRoute({
          network,
          route,
          tradeSize: size
        });

      const risk =
        calculateRisk(result);

      const quality =
        calculateQuality(result);

      const status =
        classifyDiscovery(result);

      const enriched = {
        ...result,

        riskScore:
          risk.score,

        riskLevel:
          risk.level,

        qualityScore:
          quality,

        status
      };

      tests.push(enriched);

      state.results.push(enriched);

      state.testsCompleted += 1;
    } catch (error) {
      state.testsCompleted += 1;

      state.errors.push({
        at: now(),
        network: network.name,
        route: route.label,
        size,
        message: error.message
      });
    }
  }

  tests.sort(
    (a, b) =>
      b.estimatedNet -
      a.estimatedNet
  );

  return {
    best: tests[0] || null,
    tests
  };
}

/* =========================================================
   FAST DISCOVERY
   ========================================================= */

async function discoveryProbe({
  network,
  route
}) {
  state.testsPlanned += 1;
  state.testsAttempted += 1;

  try {
    const result =
      await quoteRoute({
        network,
        route,
        tradeSize:
          Math.min(
            SETTINGS.discoveryProbeUsd,
            account.balance *
              SETTINGS.maxTradeCapitalPercent
          )
      });

    const risk =
      calculateRisk(result);

    const quality =
      calculateQuality(result);

    const status =
      classifyDiscovery(result);

    const enriched = {
      ...result,

      riskScore:
        risk.score,

      riskLevel:
        risk.level,

      qualityScore:
        quality,

      status
    };

    state.testsCompleted += 1;
    state.routesScreened += 1;

    return enriched;
  } catch (error) {
    state.testsCompleted += 1;
    state.routesScreened += 1;

    state.errors.push({
      at: now(),
      network: network.name,
      route: route.label,
      message: error.message
    });

    return null;
  }
}

/* =========================================================
   FRESH CONFIRMATION
   ========================================================= */

async function confirmOpportunity(
  candidate
) {
  const network =
    getNetwork(
      candidate.networkKey
    );

  if (!network) {
    return null;
  }

  const allRoutes =
    generateRoutes(network);

  const route =
    allRoutes.find(
      item =>
        item.label ===
        candidate.route
    );

  if (!route) {
    return null;
  }

  try {
    const fresh =
      await quoteRoute({
        network,
        route,
        tradeSize:
          candidate.tradeSize
      });

    const risk =
      calculateRisk(fresh);

    const quality =
      calculateQuality(fresh);

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

      riskScore:
        risk.score,

      riskLevel:
        risk.level,

      qualityScore:
        quality,

      confirmationAgeMs:
        ageMs,

      status:
        passes
          ? "PAPER_PASS"
          : "EXPIRED",

      confirmedAt:
        now()
    };
  } catch (error) {
    state.errors.push({
      at: now(),
      network:
        candidate.network,
      route:
        candidate.route,
      message:
        `Confirmation failed: ${error.message}`
    });

    return null;
  }
}

/* =========================================================
   PAPER EXECUTION
   ========================================================= */

async function simulatePaperTrade(
  opportunity
) {
  const fresh =
    await confirmOpportunity(
      opportunity
    );

  if (
    !fresh ||
    fresh.status !== "PAPER_PASS"
  ) {
    return {
      success: false,
      reason:
        "Opportunity no longer passes fresh confirmation."
    };
  }

  const pnl =
    fresh.estimatedNet;

  account.balance =
    round(
      account.balance + pnl,
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

    mode: "PAPER",

    executionMode: "MANUAL",

    executedAt: now(),

    network:
      fresh.network,

    networkKey:
      fresh.networkKey,

    route:
      fresh.route,

    routeType:
      fresh.routeType,

    tradeSize:
      fresh.tradeSize,

    finalValue:
      fresh.finalValue,

    gasUsd:
      fresh.estimatedGasUsd,

    netProfit:
      fresh.estimatedNet,

    roiPercent:
      fresh.roiPercent,

    riskScore:
      fresh.riskScore,

    riskLevel:
      fresh.riskLevel,

    qualityScore:
      fresh.qualityScore,

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
    account
  };
}

/* =========================================================
   MAIN SCAN CYCLE
   ========================================================= */

async function runScanCycle() {
  if (state.running) {
    return {
      started: false,
      message:
        "A scan is already running."
    };
  }

  state.running = true;
  state.cycle += 1;

  state.scanPhase =
    "PREPARING";

  state.lastScanStarted =
    now();

  resetScanCollections();

  try {
    const networks =
      getEnabledNetworks();

    if (!networks.length) {
      throw new Error(
        "No networks selected."
      );
    }

    const routePlan = [];

    for (const network of networks) {
      const networkRoutes =
        generateRoutes(network);

      for (
        const route of networkRoutes
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
      PHASE 1:
      Broad discovery probes
    */

    state.scanPhase =
      "DISCOVERING";

    const promising = [];

    for (
      let i = 0;
      i < routePlan.length;
      i += 1
    ) {
      const item =
        routePlan[i];

      state.currentNetwork =
        item.network.name;

      state.currentRoute =
        item.route.label;

      state.progressPercent =
        round(
          (i / Math.max(
            routePlan.length,
            1
          )) * 45,
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
        probe.estimatedNet > 0
      ) {
        state.spreadsDetected += 1;
      }

      if (
        probe.status ===
        "WATCHLIST"
      ) {
        state.watchlist.push(
          probe
        );

        state.watchlistFound += 1;

        promising.push(item);
      }

      if (
        probe.status ===
        "CANDIDATE"
      ) {
        state.candidates.push(
          probe
        );

        state.candidatesFound += 1;

        promising.push(item);
      }

      if (
        probe.status ===
        "REJECTED"
      ) {
        state.results.push(
          probe
        );
      }
    }

    /*
      PHASE 2:
      Optimize only promising routes
    */

    state.scanPhase =
      "OPTIMIZING";

    const optimizedCandidates =
      [];

    for (
      let i = 0;
      i < promising.length;
      i += 1
    ) {
      const item =
        promising[i];

      state.currentNetwork =
        item.network.name;

      state.currentRoute =
        item.route.label;

      state.progressPercent =
        round(
          45 +
          (
            i /
            Math.max(
              promising.length,
              1
            )
          ) *
          35,
          2
        );

      const optimized =
        await optimizeRoute(
          item
        );

      if (!optimized.best) {
        continue;
      }

      const best =
        optimized.best;

      if (
        best.status ===
        "CANDIDATE"
      ) {
        optimizedCandidates.push(
          best
        );

        state.optimizedFound += 1;
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
      PHASE 3:
      Fresh confirmation
    */

    state.scanPhase =
      "CONFIRMING";

    optimizedCandidates.sort(
      (a, b) =>
        b.estimatedNet -
        a.estimatedNet
    );

    for (
      let i = 0;
      i <
      optimizedCandidates.length;
      i += 1
    ) {
      const candidate =
        optimizedCandidates[i];

      state.currentNetwork =
        candidate.network;

      state.currentRoute =
        candidate.route;

      state.progressPercent =
        round(
          80 +
          (
            i /
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
      Optional AUTO PAPER.
      OFF by default.
    */

    if (
      SETTINGS.autoPaperTrading &&
      state.paperPass.length
    ) {
      const eligible =
        state.paperPass
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
            SETTINGS.maxAutoTradesPerCycle
          );

      for (
        const opportunity of eligible
      ) {
        const result =
          await simulatePaperTrade(
            opportunity
          );

        if (
          result.success &&
          result.trade
        ) {
          result.trade.executionMode =
            "AUTO";
        }
      }
    }

    state.progressPercent = 100;

    state.scanPhase =
      "COMPLETE";

    state.lastScanCompleted =
      now();

    return {
      started: true,
      completed: true,
      paperPass:
        state.paperPass.length
    };
  } catch (error) {
    state.scanPhase =
      "ERROR";

    state.lastError =
      error.message;

    state.errors.push({
      at: now(),
      message: error.message
    });

    return {
      started: true,
      completed: false,
      error: error.message
    };
  } finally {
    state.running = false;
    state.currentNetwork = null;
    state.currentRoute = null;
  }
}

/* =========================================================
   API
   ========================================================= */

app.get("/", (req, res) => {
  res.json({
    engine:
      "ArbiFlow Opportunity Engine",
    version: VERSION,
    online: true,
    mode: "paper-trading",
    liveExecutionEnabled: false,
    provider:
      "0x Swap API",
    message:
      "ArbiFlow Engine 3.0 is online."
  });
});

/* ---------------- STATUS ---------------- */

app.get(
  "/api/status",
  (req, res) => {
    res.json({
      engine:
        "ArbiFlow Opportunity Engine",

      version: VERSION,

      online: true,

      provider:
        "0x Swap API",

      liveProviderConfigured:
        Boolean(ZEROX_API_KEY),

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

      selectedNetworks,

      networks:
        Object.values(
          NETWORKS
        ).map(
          networkSummary
        )
    });
  }
);

/* ---------------- NETWORKS ---------------- */

app.get(
  "/api/networks",
  (req, res) => {
    res.json({
      selected:
        selectedNetworks,

      networks:
        Object.values(
          NETWORKS
        ).map(
          networkSummary
        )
    });
  }
);

app.post(
  "/api/networks",
  (req, res) => {
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

    if (!valid.length) {
      return res.status(400).json({
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
        Object.values(
          NETWORKS
        ).map(
          networkSummary
        )
    });
  }
);

/* ---------------- ACCOUNT ---------------- */

app.get(
  "/api/account",
  (req, res) => {
    res.json({
      mode: "PAPER",

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
      return res.status(409).json({
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
      !Number.isFinite(capital) ||
      capital <= 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Capital must be greater than zero."
      });
    }

    account.startingBalance =
      round(capital, 2);

    account.balance =
      round(capital, 2);

    account.realizedPnL = 0;

    account.simulatedTrades = 0;

    state.paperExecuted = [];

    state.history = [];

    return res.json({
      success: true,
      account
    });
  }
);

/* ---------------- OPPORTUNITIES ---------------- */

app.get(
  "/api/opportunities",
  (req, res) => {
    const bestResults =
      [...state.results]
        .sort(
          (a, b) =>
            b.estimatedNet -
            a.estimatedNet
        )
        .slice(0, 100);

    res.json({
      engine:
        "ArbiFlow Opportunity Engine",

      version: VERSION,

      mode:
        "paper-trading",

      liveExecutionEnabled:
        false,

      balance:
        account.balance,

      startingBalance:
        account.startingBalance,

      realizedPnL:
        account.realizedPnL,

      simulatedTrades:
        account.simulatedTrades,

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

      selectedNetworks,

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

      spreadsDetected:
        state.spreadsDetected,

      watchlistFound:
        state.watchlistFound,

      candidatesFound:
        state.candidatesFound,

      optimizedFound:
        state.optimizedFound,

      confirmedFound:
        state.confirmedFound,

      paperPassFound:
        state.paperPassFound,

      watchlist:
        state.watchlist,

      candidates:
        state.candidates,

      confirmed:
        state.confirmed,

      paperPass:
        state.paperPass,

      bestTests:
        bestResults,

      paperExecuted:
        state.paperExecuted,

      executableOpportunities: 0,

      errors:
        state.errors.slice(-25)
    });
  }
);

/* ---------------- SCAN ---------------- */

app.post(
  "/api/scan/start",
  async (req, res) => {
    if (state.running) {
      return res.status(409).json({
        success: false,
        message:
          "A scan is already running."
      });
    }

    res.json({
      success: true,
      message:
        "Engine 3.0 scan started.",
      selectedNetworks
    });

    runScanCycle().catch(
      error => {
        state.lastError =
          error.message;

        state.running = false;

        state.scanPhase =
          "ERROR";
      }
    );
  }
);

/* ---------------- PAPER EXECUTE ---------------- */

app.post(
  "/api/paper/execute",
  async (req, res) => {
    const index =
      Number(
        req.body.index
      );

    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >=
        state.paperPass.length
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid PAPER PASS opportunity."
      });
    }

    const opportunity =
      state.paperPass[index];

    const result =
      await simulatePaperTrade(
        opportunity
      );

    if (!result.success) {
      return res.status(409).json(
        result
      );
    }

    return res.json(result);
  }
);

/* ---------------- HISTORY ---------------- */

app.get(
  "/api/history",
  (req, res) => {
    res.json({
      mode: "PAPER",

      count:
        state.history.length,

      history:
        state.history
    });
  }
);

/* ---------------- SETTINGS ---------------- */

app.get(
  "/api/settings",
  (req, res) => {
    res.json({
      version: VERSION,

      paperOnly: true,

      liveExecutionEnabled:
        false,

      minimumPaperPassUsd:
        SETTINGS.minimumPaperPassUsd,

      minimumPaperPassRoiPercent:
        SETTINGS.minimumPaperPassRoiPercent,

      watchlistNetFloorUsd:
        SETTINGS.watchlistNetFloorUsd,

      maxTradeCapitalPercent:
        SETTINGS.maxTradeCapitalPercent,

      slippageBps:
        SETTINGS.slippageBps,

      gasSafetyMultiplier:
        SETTINGS.gasSafetyMultiplier,

      autoPaperTrading:
        SETTINGS.autoPaperTrading
    });
  }
);

/* =========================================================
   HEALTH
   ========================================================= */

app.get(
  "/api/health",
  (req, res) => {
    res.json({
      ok: true,
      engine:
        "ArbiFlow Opportunity Engine",
      version: VERSION,
      time: now()
    });
  }
);

/* =========================================================
   START SERVER
   ========================================================= */

app.listen(
  PORT,
  () => {
    console.log(
      `ArbiFlow Engine ${VERSION} listening on port ${PORT}`
    );
  }
);
