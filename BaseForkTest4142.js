const fs = require("fs");
const hre = require("hardhat");

async function main() {
  if (!process.env.BASE_RPC_URL) throw new Error("BASE_RPC_URL is required for the Base mainnet fork test.");
  const [tester] = await hre.ethers.getSigners();
  const network = await hre.ethers.provider.getNetwork();
  if (network.chainId !== 8453n) throw new Error(`Expected Base fork chainId 8453, got ${network.chainId}`);
  const forkBlockNumber = await hre.ethers.provider.getBlockNumber();
  const Factory = await hre.ethers.getContractFactory("ArbiFlowExecutor414");
  const deployTx = await Factory.getDeployTransaction();
  const deploymentGas = await tester.estimateGas(deployTx);
  const executor = await Factory.deploy();
  await executor.waitForDeployment();
  const executorAddress = await executor.getAddress();
  const code = await hre.ethers.provider.getCode(executorAddress);
  if (!code || code === "0x") throw new Error("Fork deployment produced no contract bytecode.");
  const marketId = "0x54cf9be57fdfa6457a660991907434ff9d295c465a603a50126ff647d50b7354";
  const borrower = "0x7dCDb4ad4017F848879d17370aa6F32564E5Cd08";
  const target = "0x0000000000000000000000000000000000000001";
  const args = [marketId, borrower, 1n, 1n, target, "0x00"];
  const hash = await executor.validatePlan.staticCall(...args);
  const gas = await executor.validatePlan.estimateGas(...args);
  let liveEntryReverted = false;
  try { await executor.executeLiquidationPlan.staticCall(...args); } catch { liveEntryReverted = true; }
  if (!liveEntryReverted) throw new Error("Safety failure: live entry point did not revert.");
  const report={success:true,compilePerformed:true,forkStarted:true,chainId:Number(network.chainId),forkBlockNumber,executor:executorAddress,forkContractDeployed:true,contractCodeBytes:(code.length-2)/2,validatePlanEthCallPerformed:true,validatePlanHash:hash,validatePlanGas:gas.toString(),deploymentGas:deploymentGas.toString(),liveEntryReverted,mainnetBroadcast:false,fundsMoved:false,tester:tester.address,generatedAt:new Date().toISOString()};
  fs.writeFileSync("fork-report-4142.json",JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}
main().catch(e=>{
  const report={success:false,error:String(e?.stack||e),mainnetBroadcast:false,fundsMoved:false,generatedAt:new Date().toISOString()};
  try{fs.writeFileSync("fork-report-4142.json",JSON.stringify(report,null,2));}catch{}
  console.error(e); process.exitCode=1;
});
