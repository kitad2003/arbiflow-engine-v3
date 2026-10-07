"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync, spawn } = require("child_process");

const ROOT = __dirname;
const SOURCE_INPUT = path.join(ROOT, "ArbiFlowExecutor414.sol");
const ATOMIC_SOURCE_INPUT = path.join(ROOT, "ArbiFlowAtomicExecutor430.sol");
const GENERATED_DIR = path.join(ROOT, ".arbiflow-contracts");
const GENERATED_SOURCE = path.join(GENERATED_DIR, "ArbiFlowExecutor414.sol");
const GENERATED_ATOMIC_SOURCE = path.join(GENERATED_DIR, "ArbiFlowAtomicExecutor430.sol");
const ADAPTER_SOURCE_INPUT = path.join(ROOT, "ControlledForkSwapAdapter431.sol");
const GENERATED_ADAPTER_SOURCE = path.join(GENERATED_DIR, "ControlledForkSwapAdapter431.sol");
const REPORT = path.join(ROOT, "fork-report-4300.json");
const ARTIFACTS = path.join(ROOT, "artifacts");
const CACHE = path.join(ROOT, "cache");
const HARDHAT = process.platform === "win32" ? path.join(ROOT,"node_modules",".bin","hardhat.cmd") : path.join(ROOT,"node_modules",".bin","hardhat");

function fail(message) { console.error(`[ArbiFlow 4.61.1] STARTUP BLOCKED :: ${message}`); process.exit(1); }
function runHardhat(args,label) {
  console.log(`[ArbiFlow 4.61.1] ${label}`);
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

console.log("[ArbiFlow 4.61.1] PROTOCOL FORK STARTUP VERIFICATION BEGIN");
if(!process.env.BASE_RPC_URL) fail("BASE_RPC_URL is not configured.");
if(!fs.existsSync(HARDHAT)) fail("Local Hardhat binary is missing. Render must install package.json dependencies before npm start.");
console.log(`[ArbiFlow 4.61.1] DEPLOY ROOT :: ${ROOT}`);
console.log(`[ArbiFlow 4.61.1] ROOT HARNESS SOLIDITY SOURCE :: ${SOURCE_INPUT} :: ${fs.existsSync(SOURCE_INPUT)?"FOUND":"MISSING"}`);
console.log(`[ArbiFlow 4.61.1] ROOT ATOMIC SOLIDITY SOURCE :: ${ATOMIC_SOURCE_INPUT} :: ${fs.existsSync(ATOMIC_SOURCE_INPUT)?"FOUND":"MISSING"}`);
if(!fs.existsSync(SOURCE_INPUT) || !fs.existsSync(ATOMIC_SOURCE_INPUT) || !fs.existsSync(ADAPTER_SOURCE_INPUT)) {
  const visible=fs.readdirSync(ROOT).sort().join(", ");
  fail(`Required root Solidity source is missing. Root files visible to Render: ${visible}`);
}
let source, atomicSource, adapterSource;
try { source=fs.readFileSync(SOURCE_INPUT,"utf8"); atomicSource=fs.readFileSync(ATOMIC_SOURCE_INPUT,"utf8"); adapterSource=fs.readFileSync(ADAPTER_SOURCE_INPUT,"utf8"); } catch(e) { fail(`Could not read Solidity source: ${e.message}`); }
if(!source.includes("contract ArbiFlowExecutor414") || !source.includes("revert LiveExecutionDisabled()")) fail("Harness Solidity source integrity check failed before compilation.");
if(!atomicSource.includes("contract ArbiFlowAtomicExecutor430") || !atomicSource.includes("flashLoanSimple") || !atomicSource.includes("onMorphoLiquidate")) fail("Atomic Solidity source integrity check failed before compilation.");
try {
  fs.rmSync(GENERATED_DIR,{recursive:true,force:true});
  fs.rmSync(ARTIFACTS,{recursive:true,force:true});
  fs.rmSync(CACHE,{recursive:true,force:true});
  if(fs.existsSync(REPORT)) fs.unlinkSync(REPORT);
  fs.mkdirSync(GENERATED_DIR,{recursive:true});
  fs.writeFileSync(GENERATED_SOURCE,source,"utf8");
  fs.writeFileSync(GENERATED_ATOMIC_SOURCE,atomicSource,"utf8");
  fs.writeFileSync(GENERATED_ADAPTER_SOURCE,adapterSource,"utf8");
} catch(e) { fail(`Could not prepare explicit Hardhat source directory: ${e.message}`); }
console.log(`[ArbiFlow 4.61.1] EXPLICIT HARDHAT SOURCES READY :: ${GENERATED_SOURCE} :: ${GENERATED_ATOMIC_SOURCE}`);
runHardhat(["compile","--force"],"SOLIDITY COMPILE BEGIN");
const found=findExecutorArtifact();
if(!found) fail(`Solidity compile completed but no valid ArbiFlowExecutor414 artifact with bytecode was found under ${ARTIFACTS}`);
console.log(`[ArbiFlow 4.61.1] SOLIDITY COMPILE PASS :: ${found.path} :: bytecode present`);
console.log("[ArbiFlow 4.61.1] STARTING WEB SERVICE BEFORE NON-BLOCKING FORK VERIFICATION");
const child=spawn(process.execPath,["server.js"],{cwd:ROOT,env:{...process.env,ARBIFLOW_STARTUP_WRAPPER:"1",ARBIFLOW_FORK_VERIFIED:"0"},stdio:"inherit"});
child.on("error",e=>fail(`Web service failed to start: ${e.message}`));
child.on("exit",(code,signal)=>{if(signal) process.kill(process.pid,signal); else process.exit(code??1);});

// Run the expensive fork verification asynchronously AFTER the HTTP service binds.
// Live execution remains hard-disabled in server.js; the fork report is the dynamic readiness gate.
console.log("[ArbiFlow 4.61.1] EPHEMERAL BASE FORK TEST BEGIN (NON-BLOCKING WEB START)");
const fork=spawn(HARDHAT,["run","--no-compile","BaseForkTest4300.js"],{cwd:ROOT,env:process.env,stdio:"inherit",shell:false});
fork.on("error",e=>console.error(`[ArbiFlow 4.61.1] FORK VERIFICATION ERROR :: ${e.message}`));
fork.on("exit",(code,signal)=>{
 if(signal){console.error(`[ArbiFlow 4.61.1] FORK VERIFICATION INTERRUPTED :: ${signal}`);return;}
 if(code!==0){console.error(`[ArbiFlow 4.61.1] FORK VERIFICATION FAILED :: exit ${code} :: service remains fail-closed`);return;}
 try{
  if(!fs.existsSync(REPORT)) throw new Error("fork-report-4300.json missing");
  const report=JSON.parse(fs.readFileSync(REPORT,"utf8"));
  const pass=report?.success===true && report?.directBaseRpcReadPassed===true && report?.baseChainId===8453 && report?.chainId===8453 && report?.forkStarted===true && report?.forkContractDeployed===true && report?.validatePlanEthCallPerformed===true && report?.liveEntryReverted===true && report?.mainnetBroadcast===false && report?.fundsMoved===false && report?.atomicExecutor?.deployed===true && report?.atomicExecutor?.forkOnly===true && report?.atomicExecutor?.callbackGuardsConfirmed===true && report?.atomicExecutor?.fullAtomicSimulationPerformed===false && report?.liquidationCandidateGate?.source==="DIRECT_BASE_RPC_READ_ONLY" && typeof report?.liquidationCandidateGate?.preliminaryLiquidatable==="boolean" && report?.liquidationCandidateGate?.exactExecutionEligibilityConfirmed===false && report?.morphoForkAccrual?.accrueInterestTransactionSucceeded===true && report?.morphoForkAccrual?.exactAccruedStateConfirmed===true && typeof report?.morphoForkAccrual?.exactAccruedLiquidatable==="boolean" && report?.morphoForkAccrual?.mainnetStateChanged===false;
  if(!pass) throw new Error("fork report did not satisfy all safety gates");
  console.log(`[ArbiFlow 4.61.1] PROTOCOL FORK VERIFICATION PASS :: fork block ${report.forkBlockNumber} :: validate gas ${report.validatePlanGas} :: deployment gas ${report.deploymentGas}`);
 }catch(e){console.error(`[ArbiFlow 4.61.1] FORK REPORT VALIDATION FAILED :: ${e.message} :: service remains fail-closed`);}
});
