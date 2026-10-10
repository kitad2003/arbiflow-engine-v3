'use strict';
// Research-only local Ethereum fork. Artificial Sushi reserve change is not MEV profit.
const hre=require('hardhat'),{ethers,network}=hre;
const {FACTORIES}=require('./verified-pairs-v12');
const V='0xBA12222222228d8Ba445958a75a0704d566BF2C8',W='0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',M='0xec67005c4E498Ec7f55E092bd1d35cbC47C91892';
const U='0x15ab0333985fd1e289adf4fbbe19261454776642',S='0x2F8AC927aa94293461C75406e90Ec0cCFb2748d9';
async function main(){
 if((await ethers.provider.getNetwork()).chainId!==31337n)throw Error('LOCAL_FORK_REQUIRED');
 const [op,other]=await ethers.getSigners();
 const t=new ethers.Contract(W,['function balanceOf(address) view returns(uint256)','function deposit() payable','function transfer(address,uint256) returns(bool)'],op);
 const s=new ethers.Contract(S,['function sync()'],op);
 const f=await ethers.getContractFactory('BalancerEthereumAtomicV26',op);
 const c=await f.deploy(V,W,M,FACTORIES.UNISWAP_V2,FACTORIES.SUSHISWAP_V2);await c.waitForDeployment();
 const a=await c.getAddress(),vaultBefore=await t.balanceOf(V),sushiBefore=await t.balanceOf(S);
 const snap=await network.provider.send('evm_snapshot');
 let baselineReverted=false;
 try{await (await c.makeFlashLoan(U,S,100000000000000n,1n,1n,1n,{gasLimit:4000000})).wait()}catch{baselineReverted=true}
 const added=ethers.parseEther('0.3');
 await (await t.deposit({value:added})).wait();await (await t.transfer(S,added)).wait();await (await s.sync()).wait();
 const loan=await (await c.makeFlashLoan(U,S,100000000000000n,1n,1n,1n,{gasLimit:4000000})).wait();
 const event=loan.logs.map(x=>{try{return c.interface.parseLog(x)}catch{return null}}).find(x=>x?.name==='ForkAtomicResult');
 const surplus=await t.balanceOf(a),vaultAfter=await t.balanceOf(V),before=await t.balanceOf(op.address);
 let outsiderBlocked=false;
 try{await c.connect(other).withdrawSurplus.staticCall(surplus)}catch{outsiderBlocked=true}
 const wd=await (await c.withdrawSurplus(surplus)).wait();
 const received=(await t.balanceOf(op.address))-before,remaining=await t.balanceOf(a);
 const gasLoan=loan.gasUsed*(loan.gasPrice||0n),gasWithdrawal=wd.gasUsed*(wd.gasPrice||0n);
 await network.provider.send('evm_revert',[snap]);
 const restored=(await t.balanceOf(V))===vaultBefore&&(await t.balanceOf(S))===sushiBefore;
 const pass=baselineReverted&&loan.status===1&&Boolean(event)&&vaultAfter===vaultBefore&&surplus===event.args.surplus&&surplus>0n&&outsiderBlocked&&wd.status===1&&received===surplus&&remaining===0n&&restored;
 console.log(JSON.stringify({build:'BALANCER_RESEARCH_V27',mode:'ARTIFICIAL_LOCAL_FORK_LIFECYCLE',baselineReverted,
  loanReceiptStatus:loan.status,repaymentVerified:vaultAfter===vaultBefore,
  surplusRaw:surplus.toString(),loanGasUsed:loan.gasUsed.toString(),
  loanGasCostWei:gasLoan.toString(),withdrawalGasUsed:wd.gasUsed.toString(),
  withdrawalGasCostWei:gasWithdrawal.toString(),outsiderBlocked,
  withdrawnRaw:received.toString(),contractBalanceAfterRaw:remaining.toString(),
  restored,passed:pass,artificialReserveChange:true,realPendingTargetReplayed:false,
  mevSimBundleCalled:false,mainnetBroadcast:false,deploymentReady:false}));
 if(!pass)process.exitCode=1;
}
main().catch(e=>{console.error('V27_FAILED',String(e.shortMessage||e.message).slice(0,180));process.exitCode=1});
