'use strict';
// Registry metadata only. Inclusion does not imply live integration or tradability.
const chains = [
 ['ethereum','Ethereum',1,'evm'],['arbitrum','Arbitrum',42161,'evm'],['optimism','Optimism',10,'evm'],['base','Base',8453,'evm'],['polygon','Polygon',137,'evm'],['bnb','BNB Smart Chain',56,'evm'],['avalanche','Avalanche',43114,'evm'],['linea','Linea',59144,'evm'],['scroll','Scroll',534352,'evm'],['mantle','Mantle',5000,'evm'],['zksync','zkSync Era',324,'evm'],['gnosis','Gnosis',100,'evm'],['metis','Metis',1088,'evm'],['sonic','Sonic',146,'evm'],['celo','Celo',42220,'evm'],
 ['solana','Solana',null,'solana'],['monad','Monad',null,'evm'],['unichain','Unichain',130,'evm'],['cronos','Cronos',25,'evm'],['hyperevm','HyperEVM',999,'evm'],['berachain','Berachain',80094,'evm'],['sei','Sei',1329,'evm'],['sui','Sui',null,'move'],['abstract','Abstract',2741,'evm'],['ronin','Ronin',2020,'evm']
].map(([key,name,chainId,vm])=>Object.freeze({key,name,chainId,vm,status:'registry_only',enabled:false}));
const cexNames = ['Binance','Coinbase','Kraken','KuCoin','Bybit','OKX','Gate.io','HTX','Bitfinex','Gemini','Bitstamp','MEXC','Crypto.com','Bitget','Bullish','BingX','BitMart','Bitvavo','CoinEx','Bitrue','LBank','Backpack','Bithumb','bitFlyer','WOO X'];
const exchanges = cexNames.map(name=>Object.freeze({key:name.toLowerCase().replace(/[^a-z0-9]/g,''),name,status:'registry_only',enabled:false}));
module.exports = Object.freeze({schemaVersion:1,chains:Object.freeze(chains),exchanges:Object.freeze(exchanges),safety:Object.freeze({readOnly:true,automaticScanning:false,mainnetBroadcast:false})});
