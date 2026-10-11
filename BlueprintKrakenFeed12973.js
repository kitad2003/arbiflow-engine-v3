'use strict';
// Read-only Kraken market feed. Prices are indicative top-of-book, not executable depth.
const fs = require('node:fs');
const assert = require('node:assert/strict');
async function api(path) {
  const response = await fetch('https://api.kraken.com/0/public/' + path, {signal: AbortSignal.timeout(20000)});
  if (!response.ok) throw new Error('HTTP_' + response.status);
  const data = await response.json();
  if (!data || !Array.isArray(data.error) || data.error.length || !data.result) throw new Error('KRAKEN_API_ERROR');
  return data.result;
}
function convert(pairs, tickers, observedAt) {
  const rows = [];
  for (const [key, pair] of Object.entries(pairs)) {
    if (pair.status && pair.status !== 'online') continue;
    const ticker = tickers[key] || tickers[pair.altname];
    if (!ticker || typeof pair.wsname !== 'string' || !pair.wsname.includes('/')) continue;
    const bid = String(ticker.b?.[0] ?? '');
    const ask = String(ticker.a?.[0] ?? '');
    if (!/^\d+(\.\d+)?$/.test(bid) || !/^\d+(\.\d+)?$/.test(ask)) continue;
    if (!(Number(bid) > 0 && Number(ask) >= Number(bid))) continue;
    rows.push({sourceType:'CEX_ORDERBOOK',venue:'KRAKEN',symbol:pair.wsname,bid,ask,observedAt});
  }
  return rows;
}
async function main() {
  const [pairs, tickers] = await Promise.all([api('AssetPairs'), api('Ticker')]);
  const rows = convert(pairs, tickers, Date.now());
  if (!rows.length) throw new Error('NO_VALID_KRAKEN_MARKETS');
  fs.writeFileSync('arbiflow-kraken-orderbooks.json', JSON.stringify(rows) + '\n');
  console.log(JSON.stringify({build:'12.9.73',venue:'KRAKEN',markets:rows.length,readOnly:true,depthVerified:false,executionEligible:false}));
}
if (require.main === module) {
  const fixture = convert({PAIR:{wsname:'ABC/USD',status:'online'}},{PAIR:{b:['10'],a:['11']}},1);
  assert.equal(fixture.length,1);
  assert.equal(convert({PAIR:{wsname:'ABC/USD'}},{PAIR:{b:['12'],a:['11']}},1).length,0);
  console.log(JSON.stringify({build:'12.9.73',unitTests:'PASS'}));
  main().catch(error => { console.error(JSON.stringify({status:'KRAKEN_FEED_UNAVAILABLE',error:error.message})); process.exitCode=1; });
}
module.exports = {convert};
