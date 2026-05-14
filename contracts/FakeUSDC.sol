// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract FakeUSDC is ERC20 {
    constructor() ERC20("Fake USDC", "fUSDC") {}

    // 누구나 이 함수를 누르면 1,000 fUSDC(1,000달러)를 받습니다.
    // ERC20은 소수점이 18자리이므로 10^18을 곱해줍니다.
    function faucet() external {
        _mint(msg.sender, 1000 * 10**18);
    }
}
