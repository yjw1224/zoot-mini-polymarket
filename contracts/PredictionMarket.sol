// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract PredictionMarket is ERC1155, ERC1155Holder, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant YES = 0;
    uint256 public constant NO = 1;
    uint256 public constant PRICE_PER_SET = 1 * 10**18;

    IERC20 public immutable fakeUSDCToken;
    address public immutable admin;
    uint256 public immutable endTime;
    string public metadataURI;

    // 가상 유동성 풀 리저브 (wei 단위)
    uint256 public reserveYes;
    uint256 public reserveNo;

    uint8 public winningSide;
    bool public isResolved;

    error OnlyAdmin();
    error MarketAlreadyResolved();
    error MarketAlreadyEnded();
    error MarketNotEndedYet();
    error MarketNotResolvedYet();
    error InvalidWinner();
    error AmountMustBeGreaterThanZero();
    error NoLiquidity();
    error NoWinningTokens();

    event TokensClaimed(address indexed user, uint256 usdcReceived);
    event MarketResolved(uint256 winningSide);
    event LiquiditySeeded(address indexed admin, uint256 amount);
    event Bought(address indexed buyer, uint256 outcome, uint256 usdcIn, uint256 tokensOut);
    event Swapped(address indexed user, uint256 sellOutcome, uint256 amountIn, uint256 amountOut);

    constructor(
        address _usdcAddress,
        address _admin,
        string memory _metadataURI,
        uint256 _endTime
    ) ERC1155("") {
        fakeUSDCToken = IERC20(_usdcAddress);
        admin = _admin;
        metadataURI = _metadataURI;
        endTime = _endTime;
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert OnlyAdmin();
        _;
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC1155, ERC1155Holder)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    // 팩토리 보증금 전송 및 초기 K값 생성
    function initializeLiquidity(uint256 fUsdcAmount) external nonReentrant {
        if (fUsdcAmount == 0) revert AmountMustBeGreaterThanZero();
        if (reserveYes != 0 || reserveNo != 0) revert NoLiquidity();

        fakeUSDCToken.safeTransferFrom(msg.sender, address(this), fUsdcAmount);

        _mint(address(this), YES, fUsdcAmount, "");
        _mint(address(this), NO, fUsdcAmount, "");

        reserveYes = fUsdcAmount;
        reserveNo = fUsdcAmount;

        emit LiquiditySeeded(msg.sender, fUsdcAmount);
    }

    // 자금 투입 기반 매수: complete set을 민팅한 뒤 반대편 토큰을 실제 풀로 스왑
    function buy(uint256 outcome, uint256 fUsdcAmount) external nonReentrant {
        if (isResolved) revert MarketAlreadyResolved();
        if (block.timestamp >= endTime) revert MarketAlreadyEnded();
        if (outcome != YES && outcome != NO) revert InvalidWinner();
        if (fUsdcAmount == 0) revert AmountMustBeGreaterThanZero();

        fakeUSDCToken.safeTransferFrom(msg.sender, address(this), fUsdcAmount);

        _mint(msg.sender, YES, fUsdcAmount, "");
        _mint(msg.sender, NO, fUsdcAmount, "");

        uint256 sellOutcome = (outcome == YES) ? NO : YES;
        uint256 tokensOut = _swap(msg.sender, sellOutcome, fUsdcAmount);

        emit Bought(msg.sender, outcome, fUsdcAmount, tokensOut);
    }

    // 상수 곱 공식 기반 핵심 내부 연산
    function _swap(address user, uint256 sellOutcome, uint256 amountIn) internal returns (uint256 amountOut) {
        if (reserveYes == 0 || reserveNo == 0) revert NoLiquidity();

        uint256 reserveIn = (sellOutcome == YES) ? reserveYes : reserveNo;
        uint256 reserveOut = (sellOutcome == YES) ? reserveNo : reserveYes;

        uint256 k = reserveYes * reserveNo;
        uint256 newReserveIn = reserveIn + amountIn;
        uint256 newReserveOut = k / newReserveIn;

        amountOut = reserveOut - newReserveOut;
        if (amountOut == 0) revert AmountMustBeGreaterThanZero();

        uint256 buyOutcome = (sellOutcome == YES) ? NO : YES;

        _safeTransferFrom(user, address(this), sellOutcome, amountIn, "");
        _safeTransferFrom(address(this), user, buyOutcome, amountOut, "");

        if (sellOutcome == YES) {
            reserveYes = newReserveIn;
            reserveNo = newReserveOut;
        } else {
            reserveNo = newReserveIn;
            reserveYes = newReserveOut;
        }

        return amountOut;
    }

    // YES 실시간 가치 조회 (반대편 풀 비율을 기준으로 가격 정렬)
    function priceYes() public view returns (uint256) {
        uint256 s = reserveYes + reserveNo;
        if (s == 0) return PRICE_PER_SET / 2;
        return (reserveNo * PRICE_PER_SET) / s;
    }

    // NO 실시간 가치 조회 (합산 1 USDC 보장)
    function priceNo() public view returns (uint256) {
        return PRICE_PER_SET - priceYes();
    }

    function setResult(uint256 _winner) external onlyAdmin {
        if (isResolved) revert MarketAlreadyResolved();
        if (_winner != YES && _winner != NO) revert InvalidWinner();
        if (block.timestamp < endTime) revert MarketNotEndedYet();

        winningSide = uint8(_winner);
        isResolved = true;

        emit MarketResolved(_winner);
    }

    // 우승 토큰 전량 소멸 후 1:1 자금 인출
    function claim() external nonReentrant {
        if (!isResolved) revert MarketNotResolvedYet();

        uint256 userBalance = balanceOf(msg.sender, uint256(winningSide));
        if (userBalance == 0) revert NoWinningTokens();

        _burn(msg.sender, uint256(winningSide), userBalance);

        uint256 totalPayout = userBalance;
        fakeUSDCToken.safeTransfer(msg.sender, totalPayout);

        emit TokensClaimed(msg.sender, totalPayout);
    }
}
