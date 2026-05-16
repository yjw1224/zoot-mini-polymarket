// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./PredictionMarket.sol";

contract MarketFactory {
    address public immutable fakeUSDCToken;
    address[] public markets;

    error EndTimeMustBeInFuture();
    error MarketIndexOutOfBounds();

    event MarketCreated(
        address indexed market,
        address indexed admin,
        string metadataURI,
        uint256 endTime
    );

    constructor(address _usdcAddress) {
        fakeUSDCToken = _usdcAddress;
    }

    function createMarket(
        string calldata metadataURI,
        uint256 endTime
    ) external returns (address market) {
        if (endTime <= block.timestamp) revert EndTimeMustBeInFuture();

        PredictionMarket newMarket = new PredictionMarket(
            fakeUSDCToken,
            msg.sender,
            metadataURI,
            endTime
        );
        market = address(newMarket);
        markets.push(market);

        emit MarketCreated(market, msg.sender, metadataURI, endTime);
    }

    function allMarketsLength() external view returns (uint256) {
        return markets.length;
    }

    function getMarket(uint256 index) external view returns (address) {
        if (index >= markets.length) revert MarketIndexOutOfBounds();
        return markets[index];
    }
}