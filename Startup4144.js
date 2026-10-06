"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync, spawn } = require("child_process");

const ROOT = __dirname;
const SOURCE_INPUT = path.join(ROOT, "ArbiFlowExecutor414.sol");
const GENERATED_DIR = path.join(ROOT, ".arbiflow-contracts");
const GENERATED_SOURCE = path.join(GENERATED_DIR, "ArbiFlowExecutor414.sol");
const REPORT = path.join(ROOT, "fork-report-4144.json");
const ARTIFACTS = path.join(ROOT, "artifacts");
const CACHE = path.join(ROOT, "cache");
const HARDHAT = process.platform === "win32" ? path.join(ROOT,"node_modules",".bin","hardhat.cmd") : path.join(ROOT,"node_modules",".bin","hardhat");

function fail(message) { console.error(`[ArbiFlow 4.14.4] STARTUP BLOCKED :: ${message}`); process.exit(1); }
function runHardhat(args,label) {
  console.log(`[ArbiFlow 4.14.4] ${label}`);
  const r=spawnSync(HARDHAT,args,{cwd:ROOT,env:process.env,stdio:"inherit",shell:false});
  if(r.error) fail(`${label} could not start: ${r.error.message}`);
  if(r.status!==0) fail(`${label} exited with code ${r.status}.`);
}
function walk(dir,out=[]) {
  if(!fs.existsSync(dir)) return out;
  for(const ent of fs.readdirSync(dir,{withFileTypes:true})) {
    const p=path.join(dir,ent.name);
    if(ent.isDirectory()) walk(p,out); else out.push(p);
  }
  return out;
}
function findExecutorArtifact() {
  for(const p of walk(ARTIFACTS)) {
    if(path.basename(p)!=="ArbiFlowExecutor414.json" || p.endsWith(".dbg.json")) continue;
    try {
      const a=JSON.parse(fs.readFileSync(p,"utf8"));
      if(a.contractName==="ArbiFlowExecutor414" && a.bytecode && a.bytecode!=="0x") return {path:p,artifact:a};
    } catch {}
  }
  return null;
}

console.log("[ArbiFlow 4.14.4] FORK STARTUP VERIFICATION BEGIN");
if(!process.env.BASE_RPC_URL) fail("BASE_RPC_URL is not configured.");
if(!fs.existsSync(HARDHAT)) fail("Local Hardhat binary is missing. Render must install package.json dependencies before npm start.");
console.log(`[ArbiFlow 4.14.4] DEPLOY ROOT :: ${ROOT}`);
console.log(`[ArbiFlow 4.14.4] ROOT SOLIDITY SOURCE :: ${SOURCE_INPUT} :: ${fs.existsSync(SOURCE_INPUT)?"FOUND":"MISSING"}`);
if(!fs.existsSync(SOURCE_INPUT)) {
  const visible=fs.readdirSync(ROOT).sort().join(", ");
  fail(`Required root Solidity source is missing. Root files visible to Render: ${visible}`);
}
let source;
try { source=fs.readFileSync(SOURCE_INPUT,"utf8"); } catch(e) { fail(`Could not read Solidity source: ${e.message}`); }
if(!source.includes("contract ArbiFlowExecutor414") || !source.includes("revert LiveExecutionDisabled()")) fail("Solidity source integrity check failed before compilation.");
try {
  fs.rmSync(GENERATED_DIR,{recursive:true,force:true});
  fs.rmSync(ARTIFACTS,{recursive:true,force:true});
  fs.rmSync(CACHE,{recursive:true,force:true});
  if(fs.existsSync(REPORT)) fs.unlinkSync(REPORT);
  fs.mkdirSync(GENERATED_DIR,{recursive:true});
  fs.writeFileSync(GENERATED_SOURCE,source,"utf8");
} catch(e) { fail(`Could not prepare explicit Hardhat source directory: ${e.message}`); }
console.log(`[ArbiFlow 4.14.4] EXPLICIT HARDHAT SOURCE READY :: ${GENERATED_SOURCE}`);
runHardhat(["compile","--force"],"SOLIDITY COMPILE BEGIN");
const found=findExecutorArtifact();
if(!found) fail(`Solidity compile completed but no valid ArbiFlowExecutor414 artifact with bytecode was found under ${ARTIFACTS}`);
console.log(`[ArbiFlow 4.14.4] SOLIDITY COMPILE PASS :: ${found.path} :: bytecode present`);
runHardhat(["run","--no-compile","BaseForkTest4144.js"],"EPHEMERAL BASE FORK TEST BEGIN");
if(!fs.existsSync(REPORT)) fail("Fork harness completed without producing fork-report-4144.json.");
let report;
try { report=JSON.parse(fs.readFileSync(REPORT,"utf8")); } catch(e) { fail(`Fork report is unreadable: ${e.message}`); }
const pass=report?.success===true && report?.chainId===8453 && report?.forkStarted===true && report?.forkContractDeployed===true && report?.validatePlanEthCallPerformed===true && report?.liveEntryReverted===true && report?.mainnetBroadcast===false && report?.fundsMoved===false;
if(!pass) fail(`Fork report did not satisfy all safety gates: ${JSON.stringify(report)}`);
console.log(`[ArbiFlow 4.14.4] FORK STARTUP VERIFICATION PASS :: fork block ${report.forkBlockNumber} :: validate gas ${report.validatePlanGas} :: deployment gas ${report.deploymentGas}`);
console.log("[ArbiFlow 4.14.4] STARTING WEB SERVICE AFTER VERIFIED FORK PASS");
const child=spawn(process.execPath,["server.js"],{cwd:ROOT,env:{...process.env,ARBIFLOW_FORK_VERIFIED:"1"},stdio:"inherit"});
child.on("error",e=>fail(`Web service failed to start: ${e.message}`));
child.on("exit",(code,signal)=>{if(signal) process.kill(process.pid,signal); else process.exit(code??1);});
