// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20_431 {
    function transferFrom(address,address,uint256) external returns (bool);
    function transfer(address,uint256) external returns (bool);
}

contract ControlledForkSwapAdapter431 {
    error TransferFailed();
    function swap(address sellToken,address buyToken,uint256 sellAmount,uint256 buyAmount,address recipient) external {
        if(!IERC20_431(sellToken).transferFrom(msg.sender,address(this),sellAmount)) revert TransferFailed();
        if(!IERC20_431(buyToken).transfer(recipient,buyAmount)) revert TransferFailed();
    }
}
