'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const hre=require('hardhat');const {ethers}=hre;
async function main(){
 const files=['BalancerEthereumAtomicV26.sol','V48Mocks.sol'],sources={};
 for(const file of files)sources[file]={content:fs.readFileSync(path.join(__dirname,file),'utf8')};
 const solc=require('solc');
 assert.ok(solc.version().startsWith('0.8.24+'));
 const input={language:'Solidity',sources,settings:{optimizer:{enabled:true,runs:200},viaIR:true,evmVersion:'cancun',outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}};
 const out=JSON.parse(solc.compile(JSON.stringify(input)));
 const errors=(out.errors||[]).filter(e=>e.severity==='error');
 assert.equal(errors.length,0,errors.map(e=>e.formattedMessage).join('\n'));
 const [operator,outsider]=await ethers.getSigners();
 async function deploy(file,name,args=[]){const c=out.contracts[file][name];const factory=new ethers.ContractFactory(c.abi,'0x'+c.evm.bytecode.object,operator);const instance=await factory.deploy(...args);await instance.waitForDeployment();return instance}
 const loan=await deploy('V48Mocks.sol','V48TokenMock'),mid=await deploy('V48Mocks.sol','V48TokenMock');
 const vault=await deploy('V48Mocks.sol','V48VaultMock');
 const fa=await deploy('V48Mocks.sol','V48FactoryMock'),fb=await deploy('V48Mocks.sol','V48FactoryMock');
 const p1=await deploy('V48Mocks.sol','V48PairMock',[fa.target,loan.target,mid.target,1000000,2000000]);
 const p2=await deploy('V48Mocks.sol','V48PairMock',[fb.target,mid.target,loan.target,1000000,1000000]);
 await (await fa.setPair(loan.target,mid.target,p1.target)).wait();
 await (await fb.setPair(loan.target,mid.target,p2.target)).wait();
 await (await loan.mint(vault.target,1000000)).wait();
 await (await mid.mint(p1.target,2000000)).wait();
 await (await loan.mint(p2.target,1000000)).wait();
 const ex=await deploy('BalancerEthereumAtomicV26.sol','BalancerEthereumAtomicV26',[vault.target,loan.target,mid.target,fa.target,fb.target]);
 const plan=[p1.target,p2.target,1000,1,1,1];
 const expectRevert=async(p,label)=>{let failed=false;try{await (await p).wait()}catch(e){failed=true}assert.equal(failed,true,label)};
 let passed=0;async function scenario(name,fn){await fn();passed++;console.log(JSON.stringify({scenario:name,result:'PASS'}))}
 await scenario('unauthorized operator',async()=>expectRevert(ex.connect(outsider).makeFlashLoan(...plan),'outsider should revert'));
 await scenario('unauthorized vault callback',async()=>expectRevert(ex.receiveFlashLoan([],[],[],'0x'),'direct callback should revert'));
 await scenario('wrong pool factory',async()=>{const before=await loan.balanceOf(vault.target);await expectRevert(ex.makeFlashLoan(p2.target,p1.target,1000,1,1,1),'reversed venues should revert');assert.equal(await loan.balanceOf(vault.target),before)});
 await scenario('slippage rollback',async()=>{const before=await loan.balanceOf(vault.target);await expectRevert(ex.makeFlashLoan(p1.target,p2.target,1000,999999,1,1),'slippage should revert');assert.equal(await loan.balanceOf(vault.target),before)});
 await scenario('minimum profit rollback',async()=>{const before=await loan.balanceOf(vault.target);await expectRevert(ex.makeFlashLoan(p1.target,p2.target,1000,1,1,999999),'profit should revert');assert.equal(await loan.balanceOf(vault.target),before)});
 await scenario('insufficient repayment rollback',async()=>{await(await vault.setFee(5000)).wait();const before=await loan.balanceOf(vault.target);await expectRevert(ex.makeFlashLoan(...plan),'fee should revert');assert.equal(await loan.balanceOf(vault.target),before);await(await vault.setFee(0)).wait()});
 await scenario('positive synthetic atomic execution',async()=>{await(await ex.makeFlashLoan(...plan)).wait();assert.ok(await loan.balanceOf(ex.target)>0n)});
 await scenario('surplus prevents next trade',async()=>expectRevert(ex.makeFlashLoan(...plan),'retained profit blocks next trade'));
 await scenario('unauthorized withdrawal',async()=>expectRevert(ex.connect(outsider).withdrawSurplus(1),'outsider withdrawal'));
 await scenario('authorized withdrawal',async()=>{const balance=await loan.balanceOf(ex.target);await(await ex.withdrawSurplus(balance)).wait();assert.equal(await loan.balanceOf(ex.target),0n)});
 console.log(JSON.stringify({build:'BALANCER_RESEARCH_V48',scenariosPassed:passed,mode:'LOCAL_SYNTHETIC_EVM_ONLY',ethereumFork:false,realMarketProfit:false,mainnetBroadcast:false,bundlesSubmitted:0}));
}
main().catch(e=>{console.error(e);process.exitCode=1});
