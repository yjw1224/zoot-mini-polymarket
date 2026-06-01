// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract FakeUSDC is ERC20 {
    constructor() ERC20("Fake USDC", "fUSDC") {}

    function faucet(uint128 amount) external {
        _mint(msg.sender, amount * 10**18);
    }
}
