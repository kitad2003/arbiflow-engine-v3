'use strict';
// Chain-specific allowlist. Never infer identity from a four-byte selector alone.
const ROUTERS=Object.freeze({
 ethereum:Object.freeze({
  '0x7a250d5630b4cf539739df2c5dacb4c659f2488d':Object.freeze({name:'UNISWAP_V2_ROUTER02',family:'UNISWAP_V2',verification:'KNOWN_CANONICAL_DEPLOYMENT'})
 }),
 base:Object.freeze({})
});
const CANDIDATES=Object.freeze({
 ethereum:['0x66a9893cc07d91d95644aedd05d03f95e1dba8af'],
 base:['0xcaf22ce31298cf2bf1d152862f80216478ad7c67']
});
module.exports={ROUTERS,CANDIDATES};
