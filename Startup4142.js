"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync, spawn } = require("child_process");

const ROOT = __dirname;
const REPORT = path.join(ROOT, "fork-report-4142.json");
const HARDHAT = process.platform === "win32"
  ? path.join(ROOT, "node_modules", ".bin", "hardhat.cmd")
  : path.join(ROOT, "node_modules", ".bin", "hardhat");

function fail(message) {
  console.error(`[ArbiFlow 4.14.2] STARTUP BLOCKED :: ${message}`);
  process.exit(1);
}

console.log("[ArbiFlow 4.14.2] FORK STARTUP VERIFICATION BEGIN");
if (!process.env.BASE_RPC_URL) fail("BASE_RPC_URL is not configured.");
if (!fs.existsSync(HARDHAT)) fail("Local Hardhat binary is missing. Render must install package.json dependencies before npm start.");
try { if (fs.existsSync(REPORT)) fs.unlinkSync(REPORT); } catch (e) { fail(`Could not clear stale fork report: ${e.message}`); }

const test = spawnSync(HARDHAT, ["run", "BaseForkTest4142.js"], {
  cwd: ROOT,
  env: process.env,
  stdio: "inherit",
  shell: false
});
if (test.error) fail(`Fork harness could not start: ${test.error.message}`);
if (test.status !== 0) fail(`Fork harness exited with code ${test.status}.`);
if (!fs.existsSync(REPORT)) fail("Fork harness completed without producing fork-report-4142.json.");

let report;
try { report = JSON.parse(fs.readFileSync(REPORT, "utf8")); }
catch (e) { fail(`Fork report is unreadable: ${e.message}`); }
const pass = report?.success === true && report?.chainId === 8453 && report?.forkStarted === true &&
  report?.forkContractDeployed === true && report?.validatePlanEthCallPerformed === true &&
  report?.liveEntryReverted === true && report?.mainnetBroadcast === false && report?.fundsMoved === false;
if (!pass) fail(`Fork report did not satisfy all safety gates: ${JSON.stringify(report)}`);

console.log(`[ArbiFlow 4.14.2] FORK STARTUP VERIFICATION PASS :: fork block ${report.forkBlockNumber} :: validate gas ${report.validatePlanGas} :: deployment gas ${report.deploymentGas}`);
console.log("[ArbiFlow 4.14.2] STARTING WEB SERVICE AFTER VERIFIED FORK PASS");
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
