'use strict';
// Evidence-driven classification of the topics observed in the V7 Base pendingLogs output.
// Hash recognition is NOT equivalent to verified pool identity, transaction ordering, or executable quotes.
const TOPICS=Object.freeze({
 V2_SWAP:'0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822',
 V3_SWAP:'0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67',
 V3_MINT:'0x7a53080ba414158be7ec69b987b5fb7d07dee101fe85488f0853ae16239d0bde',
 V3_BURN:'0x0c396cd989a39f4459b5fa1aed6a9a8dcdbc45908acfd67e028cd568da98982c',
 V3_COLLECT:'0x70935338e69775456a85ddef226c395fb668b63fa0115f5f20610b388e6ca9c0'
});
const kindByTopic=new Map(Object.entries(TOPICS).map(([kind,hash])=>[hash,kind]));
function classifyTopic(topic) {return kindByTopic.get(String(topic||'').toLowerCase())||'UNRECOGNIZED';}
function classifyHint(hint){
 const kind=classifyTopic(hint?.logs?.[0]?.topics?.[0]);
 return {kind,swapHint:kind==='V2_SWAP'||kind==='V3_SWAP',
  poolIdentityVerified:false,amountsDecoded:false,txStateProven:false,executionEligible:false};
}
module.exports={TOPICS,classifyTopic,classifyHint};
