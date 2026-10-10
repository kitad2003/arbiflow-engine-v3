'use strict';
// V47 offline source security review: assertions about literal source, not proof of security.
const fs=require('node:fs');
const path=require('node:path');
const {ethers}=require('ethers');
const {compileTwice}=require('./reproducible-v26-v43');
const {sources}=require('./deployment-plan-v42');
const FILE=path.join(__dirname,'BalancerEthereumAtomicV26.sol');
function review({source=fs.readFileSync(FILE,'utf8')}={}){
 const checks={
  onlyOperatorInitiates:/require\(msg\.sender==operator&&!active&&!withdrawalLock/.test(source),
  callbackVaultAndActive:/require\(msg\.sender==vault&&active/.test(source),
  callbackArrayLengthsChecked:/tokens\.length==1&&amounts\.length==1&&feeAmounts\.length==1/.test(source),
  loanPrincipalValidated:/address\(tokens\[0\]\)==loanToken&&amounts\[0\]==principal/.test(source),
  firstFactoryPairChecked:/getPair\(t0,t1\)==pool/.test(source),
  transferRepaymentRequired:/require\(tokens\[0\]\.transfer\(vault,due\)/.test(source),
  minimumProfitChecked:/balanceOf\(address\(this\)\)>=due\+minProfit/.test(source),
  withdrawalRestricted:/require\(msg\.sender==operator,"NOT_OPERATOR"\)/.test(source),
  preTradeLoanBalanceMustBeZero:/balanceOf\(address\(this\)\)==0,"EXISTING_LOAN_FUNDS"/.test(source),
  priceBasedOnPreSwapReserves:/getReserves\(\)/.test(source)&&/amountInWithFee=inAmount\*997/.test(source),
  postTradeGasCostGate:/gasleft\(/.test(source),
  deploymentExpiryGate:/block\.timestamp/.test(source),
  sourceExternalAuditEvidence:false
 };
 const findings=[
  {id:'SOURCE_LEVEL_ONLY',severity:'HIGH',detail:'Textual guards are not a substitute for adversarial tests or external audit'},
  {id:'NO_ONCHAIN_GAS_NET_PROFIT_GATE',severity:'HIGH',detail:'minProfit is token surplus; executor does not deduct ETH gas or builder fees'},
  {id:'PREEXISTING_BALANCE_BLOCKS_REENTRY',severity:'MEDIUM',detail:'A successful trade retaining loanToken surplus prevents the next makeFlashLoan until surplus is withdrawn'},
  {id:'NO_TRANSACTION_DEADLINE',severity:'MEDIUM',detail:'Contract does not enforce deadline; offchain submission must enforce expiry'},
  {id:'ERC20_COMPATIBILITY_ASSUMPTIONS',severity:'MEDIUM',detail:'Raw ERC20 transfer(bool) assumes standard tokens; fee-on-transfer or nonstandard tokens are not supported'},
  {id:'FORK_ADVERSARIAL_TESTS_REQUIRED',severity:'HIGH',detail:'Need tests of callback spoofing, factory mismatch, reserve movement, slippage, minProfit, repayment and withdrawals'}
 ];
 return {build:'BALANCER_RESEARCH_V47',mode:'SOURCE_SECURITY_REVIEW_NO_EXECUTION',
  sourcesTracked:sources.length,checks,findings,readyForMainnet:false,
  auditedExternally:false,signing:false,contractDeployed:false,bundlesSubmitted:0};
}
module.exports={review};
if(require.main===module){
 const r=review();console.log(JSON.stringify(r));
 if(!r.checks.onlyOperatorInitiates||!r.checks.callbackVaultAndActive||!r.checks.transferRepaymentRequired||r.sourcesTracked!==6)process.exitCode=1;
}
