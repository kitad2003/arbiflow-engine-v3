const fs = require("fs");
const hre = require("hardhat");
const MORPHO="0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";
const AAVE_POOL="0xA238Dd80C259a72e81d7e4664a9801593F98d1c5";
const ZEROX_ALLOWANCE_HOLDER="0x0000000000001fF3684f28c67538d4D072C22734";
const MARKET_ID="0x54cf9be57fdfa6457a660991907434ff9d295c465a603a50126ff647d50b7354";
async function codeBytes(a){const c=await hre.ethers.provider.getCode(a);return (c.length-2)/2;}
async function main(){
 if(!process.env.BASE_RPC_URL) throw new Error("BASE_RPC_URL is required.");
 const [tester]=await hre.ethers.getSigners(); const network=await hre.ethers.provider.getNetwork();
 if(network.chainId!==8453n) throw new Error(`Expected Base fork chainId 8453, got ${network.chainId}`);
 const forkBlockNumber=await hre.ethers.provider.getBlockNumber();
 const protocolCode={morpho:await codeBytes(MORPHO),aavePool:await codeBytes(AAVE_POOL),zeroXAllowanceHolder:await codeBytes(ZEROX_ALLOWANCE_HOLDER)};
 if(!protocolCode.morpho||!protocolCode.aavePool||!protocolCode.zeroXAllowanceHolder) throw new Error(`Protocol code check failed: ${JSON.stringify(protocolCode)}`);
 const morpho=new hre.ethers.Contract(MORPHO,["function idToMarketParams(bytes32) view returns (address loanToken,address collateralToken,address oracle,address irm,uint256 lltv)"],tester);
 const mp=await morpho.idToMarketParams(MARKET_ID); if(mp.loanToken===hre.ethers.ZeroAddress) throw new Error("Known Morpho market did not resolve on fork.");
 const aave=new hre.ethers.Contract(AAVE_POOL,["function FLASHLOAN_PREMIUM_TOTAL() view returns (uint128)"],tester);
 const flashPremiumBps=Number(await aave.FLASHLOAN_PREMIUM_TOTAL());
 const Factory=await hre.ethers.getContractFactory("ArbiFlowExecutor414"); const deployTx=await Factory.getDeployTransaction(); const deploymentGas=await tester.estimateGas(deployTx);
 const executor=await Factory.deploy(); await executor.waitForDeployment(); const executorAddress=await executor.getAddress(); const code=await hre.ethers.provider.getCode(executorAddress);
 const borrower="0x7dCDb4ad4017F848879d17370aa6F32564E5Cd08", target="0x0000000000000000000000000000000000000001", args=[MARKET_ID,borrower,1n,1n,target,"0x00"];
 const hash=await executor.validatePlan.staticCall(...args); const gas=await executor.validatePlan.estimateGas(...args); let liveEntryReverted=false; try{await executor.executeLiquidationPlan.staticCall(...args);}catch{liveEntryReverted=true;} if(!liveEntryReverted) throw new Error("Safety failure: live entry point did not revert.");
 const report={success:true,compilePerformed:true,forkStarted:true,chainId:Number(network.chainId),forkBlockNumber,executor:executorAddress,forkContractDeployed:true,contractCodeBytes:(code.length-2)/2,validatePlanEthCallPerformed:true,validatePlanHash:hash,validatePlanGas:gas.toString(),deploymentGas:deploymentGas.toString(),liveEntryReverted,protocolIntegration:{morpho:{address:MORPHO,codeBytes:protocolCode.morpho,knownMarketResolved:true,loanToken:mp.loanToken,collateralToken:mp.collateralToken,oracle:mp.oracle,irm:mp.irm,lltv:mp.lltv.toString()},aave:{pool:AAVE_POOL,codeBytes:protocolCode.aavePool,flashLoanPremiumBps},zeroX:{allowanceHolder:ZEROX_ALLOWANCE_HOLDER,codeBytes:protocolCode.zeroXAllowanceHolder}},atomicLiquidationExecuted:false,reason:"NO_LIVE_LIQUIDATION_IS_FORCED_DURING_STARTUP;_RUNTIME_GATE_ONLY_ATTEMPTS_REAL_CANDIDATES",mainnetBroadcast:false,fundsMoved:false,tester:tester.address,generatedAt:new Date().toISOString()};
 fs.writeFileSync("fork-report-4150.json",JSON.stringify(report,null,2)); console.log(JSON.stringify(report,null,2));
}
main().catch(e=>{const report={success:false,error:String(e?.stack||e),mainnetBroadcast:false,fundsMoved:false,generatedAt:new Date().toISOString()};try{fs.writeFileSync("fork-report-4150.json",JSON.stringify(report,null,2));}catch{} console.error(e);process.exitCode=1;});
