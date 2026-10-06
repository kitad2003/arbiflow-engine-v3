"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync, spawn } = require("child_process");

const ROOT = __dirname;
const REPORT = path.join(ROOT, "fork-report-4143.json");
const ARTIFACT = path.join(ROOT, "artifacts", "contracts", "ArbiFlowExecutor414.sol", "ArbiFlowExecutor414.json");
const HARDHAT = process.platform === "win32"
  ? path.join(ROOT, "node_modules", ".bin", "hardhat.cmd")
  : path.join(ROOT, "node_modules", ".bin", "hardhat");

function fail(message) {
  console.error(`[ArbiFlow 4.14.3] STARTUP BLOCKED :: ${message}`);
  process.exit(1);
}
function runHardhat(args, label) {
  console.log(`[ArbiFlow 4.14.3] ${label}`);
  const r = spawnSync(HARDHAT, args, { cwd: ROOT, env: process.env, stdio: "inherit", shell: false });
  if (r.error) fail(`${label} could not start: ${r.error.message}`);
  if (r.status !== 0) fail(`${label} exited with code ${r.status}.`);
}

console.log("[ArbiFlow 4.14.3] FORK STARTUP VERIFICATION BEGIN");
if (!process.env.BASE_RPC_URL) fail("BASE_RPC_URL is not configured.");
if (!fs.existsSync(HARDHAT)) fail("Local Hardhat binary is missing. Render must install package.json dependencies before npm start.");
try {
  if (fs.existsSync(REPORT)) fs.unlinkSync(REPORT);
  if (fs.existsSync(ARTIFACT)) fs.unlinkSync(ARTIFACT);
} catch (e) { fail(`Could not clear stale verification files: ${e.message}`); }

// 4.14.3 fix: compile explicitly and prove the expected artifact exists BEFORE the fork harness runs.
runHardhat(["compile", "--force"], "SOLIDITY COMPILE BEGIN");
if (!fs.existsSync(ARTIFACT)) fail(`Solidity compile completed but expected artifact is missing: ${ARTIFACT}`);
let artifact;
try { artifact = JSON.parse(fs.readFileSync(ARTIFACT, "utf8")); }
catch (e) { fail(`Compiled artifact is unreadable: ${e.message}`); }
if (artifact.contractName !== "ArbiFlowExecutor414" || !artifact.bytecode || artifact.bytecode === "0x") {
  fail("Compiled ArbiFlowExecutor414 artifact failed contract-name/bytecode integrity checks.");
}
console.log(`[ArbiFlow 4.14.3] SOLIDITY COMPILE PASS :: ${artifact.contractName} :: bytecode present`);

runHardhat(["run", "--no-compile", "BaseForkTest4143.js"], "EPHEMERAL BASE FORK TEST BEGIN");
if (!fs.existsSync(REPORT)) fail("Fork harness completed without producing fork-report-4143.json.");

let report;
try { report = JSON.parse(fs.readFileSync(REPORT, "utf8")); }
catch (e) { fail(`Fork report is unreadable: ${e.message}`); }
const pass = report?.success === true && report?.chainId === 8453 && report?.forkStarted === true &&
  report?.forkContractDeployed === true && report?.validatePlanEthCallPerformed === true &&
  report?.liveEntryReverted === true && report?.mainnetBroadcast === false && report?.fundsMoved === false;
if (!pass) fail(`Fork report did not satisfy all safety gates: ${JSON.stringify(report)}`);

console.log(`[ArbiFlow 4.14.3] FORK STARTUP VERIFICATION PASS :: fork block ${report.forkBlockNumber} :: validate gas ${report.validatePlanGas} :: deployment gas ${report.deploymentGas}`);
console.log("[ArbiFlow 4.14.3] STARTING WEB SERVICE AFTER VERIFIED FORK PASS");
const child = spawn(process.execPath, ["server.js"], {
  cwd: ROOT,
  env: { ...process.env, ARBIFLOW_FORK_VERIFIED: "1" },
  stdio: "inherit"
});
child.on("error", e => fail(`Web service failed to start: ${e.message}`));
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
