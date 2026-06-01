// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./PredictionMarket.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract MarketFactory is Ownable {
    using SafeERC20 for IERC20;

    address public immutable fakeUSDCToken;
    address[] public markets;

    // 현업 기능을 위한 상태 변수
    uint256 public marketCreationDeposit = 1000 * 10**18; // 시장 개설 시 필요한 최소 보증금 (최소 1000 fUSDC)
    address public feeTo; // 수수료를 쌓을 지갑 주소
    uint256 public platformFeeBps = 10; // 기본 거래 수수료 0.1%

    // 시장 상태 관리
    mapping(address => bool) public isBlacklisted;       // 블랙리스트 여부
    mapping(address => address) public marketToCreator;  // 시장별 개설자 기록
    mapping(address => uint256) public creatorDeposits;  // 개설자가 예치한 보증금 기록

    error EndTimeMustBeInFuture();
    error MarketIndexOutOfBounds();
    error MarketIsBlacklisted();
    error Unauthorized();
    error InsufficientDeposit();
    error MarketNotResolvedYet();

    event MarketCreated(address indexed market, address indexed admin, string metadataURI, uint256 endTime);
    event MarketBlacklisted(address indexed market, bool status);
    event CreatorSlashed(address indexed creator, address indexed market, uint256 amount);

    constructor(address _usdcAddress, address _feeTo) Ownable(msg.sender) {
        fakeUSDCToken = _usdcAddress;
        feeTo = _feeTo;
    }

    function createMarket(
        string calldata metadataURI,
        uint256 endTime,
        uint256 depositAmount // depositAmount >= marketCreationDeposit
    ) external returns (address market) {
        if (endTime <= block.timestamp) revert EndTimeMustBeInFuture();
        if (marketCreationDeposit == 0) revert InsufficientDeposit();
        if (depositAmount < marketCreationDeposit) revert InsufficientDeposit();

        // 1. 개설자로부터 depositAmount의 fUSDC 수취.
        IERC20(fakeUSDCToken).safeTransferFrom(msg.sender, address(this), depositAmount);

        // 2. 마켓 컨트랙트 배포
        PredictionMarket newMarket = new PredictionMarket(
            fakeUSDCToken,
            msg.sender,
            metadataURI,
            endTime
        );
        market = address(newMarket);

        // 3. 팩토리가 보유한 depositAmount를 새로 만든 마켓이 가져갈 수 있도록 승인(Approve)
        IERC20(fakeUSDCToken).safeApprove(market, depositAmount);

        // 4. 마켓의 초기 유동성 함수를 팩토리가 대신 호출하여 AMM 풀 채우기 (K값 확정)
        newMarket.initializeLiquidity(depositAmount);

        markets.push(market);
        marketToCreator[market] = msg.sender;
        creatorDeposits[market] = depositAmount;

        emit MarketCreated(market, msg.sender, metadataURI, endTime);
    }

    function setMarketBlacklist(address _market, bool _status) external onlyOwner {
        isBlacklisted[_market] = _status;
        emit MarketBlacklisted(_market, _status);
    }

    // Penalty(Slashing) 시스템: 악의적인 시장 개설자의 보증금을 플랫폼이 몰수
    function slashCreator(address _market) external onlyOwner {
        address creator = marketToCreator[_market];
        uint256 depositAmount = creatorDeposits[_market];
        if (depositAmount == 0) revert InsufficientDeposit();

        creatorDeposits[_market] = 0;
        // 몰수된 보증금을 플랫폼 수수료 지갑으로 전송
        IERC20(fakeUSDCToken).safeTransfer(feeTo, depositAmount);

        emit CreatorSlashed(creator, _market, depositAmount);
    }

    // 시장이 정상 종료 시 개설자가 보증금을 환급받는 함수
    function refundDeposit(address _market) external {
        if (marketToCreator[_market] != msg.sender) revert Unauthorized();
        if (isBlacklisted[_market]) revert MarketIsBlacklisted();
        
        if (!PredictionMarket(_market).isResolved()) revert MarketNotResolvedYet();

        uint256 depositAmount = creatorDeposits[_market];
        if (depositAmount == 0) revert InsufficientDeposit();

        creatorDeposits[_market] = 0;
        IERC20(fakeUSDCToken).safeTransfer(msg.sender, depositAmount);
    }

    function setFeeTo(address _newFeeTo) external onlyOwner { feeTo = _newFeeTo; }
    function setPlatformFeeBps(uint256 _newFee) external onlyOwner { platformFeeBps = _newFee; }
    function setMarketCreationDeposit(uint256 _amount) external onlyOwner { marketCreationDeposit = _amount; }

    function allMarketsLength() external view returns (uint256) { return markets.length; }
    function getMarket(uint256 index) external view returns (address) {
        if (index >= markets.length) revert MarketIndexOutOfBounds();
        return markets[index];
    }
}
