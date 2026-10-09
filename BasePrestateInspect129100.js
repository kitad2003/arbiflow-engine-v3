'use strict';
function inspect(value){const valid=value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length>0;return {available:!!valid,fullCheckpoint:false,verifiedAgainstFork:false,reason:valid?'PARTIAL_PRESTATE_ONLY':'INVALID_PRESTATE'};}
module.exports={inspect};
