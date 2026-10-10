// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
interface V48Token {function transfer(address,uint256) external returns(bool);function balanceOf(address) external view returns(uint256);}
interface V48Receiver {function receiveFlashLoan(V48Token[] memory,uint256[] memory,uint256[] memory,bytes memory) external;}
contract V48TokenMock {
 mapping(address=>uint256) public balanceOf;
 function mint(address to,uint256 amount) external {balanceOf[to]+=amount;}
 function transfer(address to,uint256 value) external returns(bool){require(balanceOf[msg.sender]>=value,"MOCK_INSUFFICIENT");balanceOf[msg.sender]-=value;balanceOf[to]+=value;return true;}
}
contract V48VaultMock {
 uint256 public fee;
 function setFee(uint256 f) external {fee=f;}
 function flashLoan(address receiver,V48Token[] calldata tokens,uint256[] calldata amounts,bytes calldata data) external {
  uint256 initial=tokens[0].balanceOf(address(this));
  require(tokens[0].transfer(receiver,amounts[0]),"VAULT_TRANSFER_FAILED");
  uint256[] memory fees=new uint256[](1);fees[0]=fee;
  V48Receiver(receiver).receiveFlashLoan(tokens,amounts,fees,data);
  require(tokens[0].balanceOf(address(this))>=initial+fee,"VAULT_NOT_REPAID");
 }
}
contract V48FactoryMock {
 mapping(bytes32=>address) public pairs;
 function getPair(address a,address b) external view returns(address){return pairs[keccak256(abi.encodePacked(a,b))];}
 function setPair(address a,address b,address p) external {pairs[keccak256(abi.encodePacked(a,b))]=p;pairs[keccak256(abi.encodePacked(b,a))]=p;}
}
contract V48PairMock {
 address public factory;address public token0;address public token1;
 uint112 public r0;uint112 public r1;
 constructor(address fac,address a,address b,uint112 x,uint112 y){factory=fac;token0=a;token1=b;r0=x;r1=y;}
 function getReserves() external view returns(uint112,uint112,uint32){return(r0,r1,0);}
 function setReserves(uint112 x,uint112 y) external {r0=x;r1=y;}
 function swap(uint256 a,uint256 b,address to,bytes calldata) external {
  if(a>0)require(V48Token(token0).transfer(to,a),"PAIR_OUT_0");
  if(b>0)require(V48Token(token1).transfer(to,b),"PAIR_OUT_1");
  // Mock's reserves deliberately static for one-shot scenario testing.
 }
}
