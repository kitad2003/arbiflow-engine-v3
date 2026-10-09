'use strict';
// Build 12.9.1: isolated scenario math, never represents an executable gas estimate.
const safety={readOnly:true,mainnetBroadcast:false,fundsMovedOnMainnet:false,executionEligible:false};
function whole(v,name,max){
 if(typeof v!=='string'|| !/^(0|[1-9]\d{0,17})$/.test(v))throw Error('INVALID_'+name);
 const n=BigInt(v);if(n>max)throw Error('OUT_OF_RANGE_'+name);return n;
}
function decimal(v,name,decimals,maxWhole){
 if(typeof v!=='string'||!new RegExp('^(0|[1-9][0-9]{0,11})(\\.[0-9]{1,'+decimals+'})?$').test(v))throw Error('INVALID_'+name);
 const [i,f='']=v.split('.');const n=BigInt(i)*10n**BigInt(decimals)+BigInt(f.padEnd(decimals,'0'));if(n>BigInt(maxWhole)*10n**BigInt(decimals))throw Error('OUT_OF_RANGE_'+name);return n;
}
function usd(raw){let neg=raw<0n;let x=neg?-raw:raw;return (neg?'-':'')+(x/1000000n)+'.'+(x%1000000n).toString().padStart(6,'0')}
function calculate(q){
 const units=whole(q.gasUnits,'GAS_UNITS',100000000n);
 const gasPrice=whole(q.gasPriceWei,'GAS_PRICE_WEI',1000000000000000n);
 const l1=whole(q.l1FeeWei,'L1_FEE_WEI',1000000000000000000n);
 const ethUsd=decimal(q.ethUsd,'ETH_USD',6,1000000);
 const slippageBps=whole(q.slippageBps,'SLIPPAGE_BPS',10000n);
 const loan=decimal(q.loanUsdc,'LOAN_USDC',6,1000000000000);
 const received=decimal(q.returnUsdc,'RETURN_USDC',6,1000000000000);
 const feeBps=whole(q.loanFeeBps,'LOAN_FEE_BPS',10000n);
 if(loan===0n||ethUsd===0n)throw Error('ZERO_LOAN_OR_PRICE');
 const networkWei=units*gasPrice+l1;
 const gasUsd=(networkWei*ethUsd+10n**18n-1n)/10n**18n;
 const fee=(loan*feeBps+9999n)/10000n;
 const slippage=(loan*slippageBps+9999n)/10000n;
 const gross=received-loan;
 const modeledNet=gross-fee-slippage-gasUsd;
 return {build:'12.9.1',mode:'USER_INPUT_SCENARIO_NOT_LIVE',grossUsdc:usd(gross),loanPremiumUsdc:usd(fee),slippageReserveUsdc:usd(slippage),networkGasUsdc:usd(gasUsd),scenarioNetUsdc:usd(modeledNet),spreadStrictlyAbovePointFivePercent:gross*10000n>loan*50n,gasUnitsSource:'USER_SUPPLIED',l1FeeSource:'USER_SUPPLIED',ethUsdSource:'USER_SUPPLIED',slippageSource:'USER_SUPPLIED',netProfitVerified:false,qualifiedForDashboard:false,executionEligible:false,safety};
}
function mount(app){
 app.get('/api/phase12/cost/status',(_req,res)=>res.json({success:true,build:'12.9.1',model:'READ_ONLY_USER_SUPPLIED_SCENARIO',onChainExecutorGasMeasured:false,l1DataFeeMeasured:false,ethUsdOracleVerified:false,netProfitVerified:false,requiredFields:['gasUnits','gasPriceWei','l1FeeWei','ethUsd','slippageBps','loanUsdc','returnUsdc','loanFeeBps'],safety}));
 app.post('/api/phase12/cost/scenario',(req,res)=>{try{res.json({success:true,...calculate(req.body||{})})}catch(e){res.status(400).json({success:false,error:String(e.message||e).slice(0,90),safety})}});
}
module.exports={calculate,mount};
