// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract PredictionMarket is ERC1155 {
    uint256 public constant YES = 0;
    uint256 public constant NO = 1;
    // 임의의 '1센트 가격' 설정.
    uint256 public constant PRICE_PER_SET = 1 * 10**18; // 1 fakeUSDC
    uint256 public yesPrice = 0.6 * 10**18; // YES 토큰 1개의 가격 (60센트)

    IERC20 public immutable fakeUSDCToken;
    address public immutable admin;
    uint256 public immutable endTime;
    
    string public metadataURI;
    uint256 public winningSide;
    bool public isResolved;

    event TokensBet(address indexed user, uint256 indexed targetId, uint256 usdcAmount, uint256 sharesReceived, uint256 priceAtBet);
    event TokensSold(address indexed user, uint256 indexed targetId, uint256 sharesSold, uint256 usdcReceived, uint256 priceAtSell);
    event TokensClaimed(address indexed user, uint256 usdcReceived);
    event MarketResolved(uint256 winningSide);

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
        require(msg.sender == admin, "Only admin can do this.");
        _;
    }

    function bet(uint256 _targetId, uint256 _usdcAmount) external {
        require(!isResolved, "Market already resolved");
        require(block.timestamp < endTime, "Market already ended");
        require(_targetId == YES || _targetId == NO, "Invalid token ID");
        require(_usdcAmount > 0, "Amount must be greater than zero");

        // 1. 현재 가격 결정 (YES인지 NO인지)
        uint256 currentPrice = (_targetId == YES) ? yesPrice : (PRICE_PER_SET - yesPrice);

        // 2. 구매 가능한 토큰 수량 계산: (지불금액 * 1 fUSDC) / 가격
        uint256 tokenAmount = (_usdcAmount * PRICE_PER_SET) / currentPrice;

        require(fakeUSDCToken.transferFrom(msg.sender, address(this), _usdcAmount), "USDC transfer failed.");

        _mint(msg.sender, YES, tokenAmount, "");
        _mint(msg.sender, NO, tokenAmount, "");

        uint256 opponentId = (_targetId == YES) ? NO : YES;
        _burn(msg.sender, opponentId, tokenAmount);

        emit TokensBet(msg.sender, _targetId, _usdcAmount, tokenAmount, currentPrice);
    }

    function mint(uint256 _amount) external {
        require(_amount > 0, "Amount must be greater than zero");
        require(block.timestamp < endTime, "Market already ended");

        uint256 totalCost = _amount * PRICE_PER_SET;

        require(fakeUSDCToken.transferFrom(msg.sender, address(this), totalCost), "fakeUSDC transfer failed.");
        
        _mint(msg.sender, YES, _amount, "");
        _mint(msg.sender, NO, _amount, "");
    }

    // 디버깅용 함수
    function getMyBalances() public view returns (uint256 yesRes, uint256 noRes) {
        return (balanceOf(msg.sender, YES), balanceOf(msg.sender, NO));
    }

    function setResult(uint256 _winner) external onlyAdmin {
        require(!isResolved, "Already Resolved");
        require(_winner == YES || _winner == NO, "Invalid Winner");
        require(block.timestamp >= endTime, "Market not ended yet");

        winningSide = _winner;
        isResolved = true;

        emit MarketResolved(_winner);
    }

    function claim() external {
        require(isResolved, "Market not resolved yet");

        uint256 userBalance = balanceOf(msg.sender, winningSide);
        require(userBalance > 0, "No winning Tokens");

        // 당첨 토큰 소각
        _burn(msg.sender, winningSide, userBalance);

        // 토큰 1개당 PRICE_PER_SET만큼 유저에게 전송 (원래는 1달러)

        uint256 totalPayout = userBalance * PRICE_PER_SET;
        fakeUSDCToken.transfer(msg.sender, totalPayout);

        emit TokensClaimed(msg.sender, totalPayout);
    }

    function sellToken(uint256 _id, uint256 _amount) external {
        require(!isResolved, "Market already resolved");
        require(block.timestamp < endTime, "Market already ended");
        
        uint256 currentPrice;
        if (_id == YES) {
            currentPrice = yesPrice; // YES를 팔면 0.6달러씩 환급
        } else if (_id == NO) {
            currentPrice = (1 * PRICE_PER_SET) - yesPrice; // NO를 팔면 0.4달러씩 환급
        } else {
            revert("Invalid token ID");
        }

        _burn(msg.sender, _id, _amount);

        uint256 payout = (_amount * currentPrice) / PRICE_PER_SET;
        require(fakeUSDCToken.transfer(msg.sender, payout), "USDC transfer failed");

        emit TokensSold(msg.sender, _id, _amount, payout, currentPrice);
    }
}