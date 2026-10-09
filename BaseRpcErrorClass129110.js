'use strict';
function classify(http,code,message){
 if(http===429||code===429||code===-32005)return 'RATE_LIMIT';
 if(code===-32601)return 'METHOD_NOT_FOUND';
 if(code===-32602)return 'INVALID_PARAMS';
 if(code===-32600)return 'INVALID_REQUEST';
 if(http===401||http===403)return 'AUTH_OR_PLAN_RESTRICTION';
 if(http>=500)return 'PROVIDER_SERVER_ERROR';
 if(http>=400)return 'HTTP_REJECTED';
 return code!==null?'RPC_ERROR':'NO_ERROR';
}
// Only disclose a predefined category: provider errors may echo credentials or URLs.
module.exports={classify};
