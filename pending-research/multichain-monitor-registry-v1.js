'use strict';
// Read-only chain monitoring registry. A configured chain is NOT an active pending feed.
const CHAINS=Object.freeze([
 ['ethereum',1,'ethereum_pending_hashes'],['arbitrum',42161,'provider_specific'],['optimism',10,'provider_specific'],
 ['base',8453,'flashblocks_provider_required'],['polygon',137,'provider_specific'],['avalanche',43114,'provider_specific'],
 ['bnb',56,'provider_specific'],['gnosis',100,'provider_specific'],['scroll',534352,'provider_specific'],
 ['linea',59144,'provider_specific'],['zksync',324,'nonstandard_evm_monitoring'],
 ['metis',1088,'provider_specific'],['sonic',146,'provider_specific'],['celo',42220,'provider_specific'],
 ['soneium',1868,'provider_specific']
].map(([name,chainId,feedType])=>Object.freeze({name,chainId,feedType})));
const CEX_UNCHANGED=true;
function status(env=process.env){
 return {build:'ARBIFLOW_MULTICHAIN_MONITOR_REGISTRY_V1',readOnly:true,mainnetBroadcast:false,executionEnabled:false,
 chains:CHAINS.map(c=>({...c,configured:c.name==='ethereum'?!!env.ETHEREUM_WSS_URL:false,
 active:false,verifiedLive:false,reason:c.name==='ethereum'?'V3_LIVE_TEST_HISTORICAL_ONLY_RUN_SEPARATELY':'CHAIN_SPECIFIC_FEED_NOT_YET_VERIFIED'})),
 chainCount:CHAINS.length,cexRosterModified:false,notes:['15 network entries are not 15 live monitoring subscriptions','Pending visibility differs by chain and provider','Ethereum V3 has proven bounded observation, not continuous service','Solana is not in the preexisting 15-chain roster; do not silently replace any entry']};
}
if(require.main===module)console.log(JSON.stringify(status(),null,2));
module.exports={CHAINS,status,CEX_UNCHANGED};
