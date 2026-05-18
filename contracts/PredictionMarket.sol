// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract PredictionMarket is ERC1155, EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant YES = 0;
    uint256 public constant NO = 1;
    uint256 public constant PRICE_PER_SET = 1 * 10**18; // 1 fakeUSDC

    bytes32 public constant ORDER_TYPEHASH = keccak256(
        "Order(address maker,uint256 targetId,bool isBuy,uint256 price,uint256 amount,uint256 expiry,uint256 nonce)"
    );

    IERC20 public immutable fakeUSDCToken;
    address public immutable admin;
    uint256 public immutable endTime;
    
    string public metadataURI;
    uint8 public winningSide;
    bool public isResolved;

    mapping(address => uint256) public minOrderNonce;
    mapping(bytes32 => uint256) public orderFilledAmount;

    error OnlyAdmin();
    error MarketAlreadyResolved();
    error MarketAlreadyEnded();
    error MarketNotEndedYet();
    error MarketNotResolvedYet();
    error InvalidTokenId();
    error InvalidWinner();
    error AmountMustBeGreaterThanZero();
    error NoWinningTokens();
    error InvalidMaker();
    error InvalidPrice();
    error OrderExpired();
    error OrderCancelled();
    error InvalidSignature();
    error OrderFullyFilled();
    error FillExceedsRemainingAmount();
    error FillTooSmall();
    error ArrayLengthMismatch();

    struct Order {
        address maker;
        uint256 targetId;
        bool isBuy;
        uint256 price;
        uint256 amount;
        uint256 expiry;
        uint256 nonce;
    }

    event TokensClaimed(address indexed user, uint256 usdcReceived);
    event MarketResolved(uint256 winningSide);
    event OrderFilled(bytes32 indexed orderHash, address indexed maker, address indexed taker, uint256 targetId, bool isBuy, uint256 price, uint256 amount, uint256 usdcAmount);
    event OrdersCancelled(address indexed maker, uint256 minNonce);

    constructor(
        address _usdcAddress,
        address _admin,
        string memory _metadataURI,
        uint256 _endTime
    ) ERC1155("") EIP712("PredictionMarket", "1") {
        fakeUSDCToken = IERC20(_usdcAddress);
        admin = _admin;
        metadataURI = _metadataURI;
        endTime = _endTime;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can do this.");
        _;
    }

    function setResult(uint256 _winner) external onlyAdmin {
        if (isResolved) revert MarketAlreadyResolved();
        if (_winner != YES && _winner != NO) revert InvalidWinner();
        if (block.timestamp < endTime) revert MarketNotEndedYet();

        winningSide = uint8(_winner);
        isResolved = true;

        emit MarketResolved(_winner);
    }

    function claim() external nonReentrant {
        if (!isResolved) revert MarketNotResolvedYet();

        uint256 userBalance = balanceOf(msg.sender, uint256(winningSide));
        if (userBalance == 0) revert NoWinningTokens();

        _burn(msg.sender, uint256(winningSide), userBalance);

        uint256 totalPayout = userBalance * PRICE_PER_SET;
        fakeUSDCToken.safeTransfer(msg.sender, totalPayout);

        emit TokensClaimed(msg.sender, totalPayout);
    }

    function hashOrder(Order calldata order) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    ORDER_TYPEHASH,
                    order.maker,
                    order.targetId,
                    order.isBuy,
                    order.price,
                    order.amount,
                    order.expiry,
                    order.nonce
                )
            )
        );
    }

    function cancelOrdersUpTo(uint256 newMinNonce) external {
        if (newMinNonce <= minOrderNonce[msg.sender]) revert OrderCancelled();
        minOrderNonce[msg.sender] = newMinNonce;
        emit OrdersCancelled(msg.sender, newMinNonce);
    }

    function fillOrder(Order calldata order, bytes calldata signature, uint256 fillAmount) external nonReentrant {
        _fillOrder(order, signature, fillAmount, msg.sender);
    }

    function fillOrders(
        Order[] calldata orders,
        bytes[] calldata signatures,
        uint256[] calldata fillAmounts
    ) external nonReentrant {
        uint256 length = orders.length;
        if (signatures.length != length || fillAmounts.length != length) revert ArrayLengthMismatch();

        address taker = msg.sender;
        for (uint256 i = 0; i < length; ) {
            _fillOrder(orders[i], signatures[i], fillAmounts[i], taker);
            unchecked {
                ++i;
            }
        }
    }

    function _fillOrder(Order calldata order, bytes calldata signature, uint256 fillAmount, address taker) internal {
        if (isResolved) revert MarketAlreadyResolved();
        if (block.timestamp >= endTime) revert MarketAlreadyEnded();
        if (order.maker == address(0)) revert InvalidMaker();
        if (order.targetId != YES && order.targetId != NO) revert InvalidTokenId();
        if (fillAmount == 0 || order.amount == 0) revert AmountMustBeGreaterThanZero();
        if (order.price == 0 || order.price >= PRICE_PER_SET) revert InvalidPrice();
        if (block.timestamp > order.expiry) revert OrderExpired();
        if (order.nonce < minOrderNonce[order.maker]) revert OrderCancelled();

        bytes32 orderHash = hashOrder(order);
        address recoveredSigner = ECDSA.recover(orderHash, signature);
        if (recoveredSigner != order.maker) revert InvalidSignature();

        uint256 filledAmount = orderFilledAmount[orderHash];
        if (filledAmount >= order.amount) revert OrderFullyFilled();
        uint256 remainingAmount = order.amount - filledAmount;
        if (fillAmount > remainingAmount) revert FillExceedsRemainingAmount();

        uint256 makerUsdcAmount = (fillAmount * order.price) / PRICE_PER_SET;
        if (makerUsdcAmount == 0) revert FillTooSmall();

        uint256 takerPrice = PRICE_PER_SET - order.price;
        uint256 takerUsdcAmount = (fillAmount * takerPrice) / PRICE_PER_SET;
        if (takerUsdcAmount == 0) revert FillTooSmall();

        orderFilledAmount[orderHash] = filledAmount + fillAmount;

        if (order.isBuy) {
            fakeUSDCToken.safeTransferFrom(order.maker, address(this), makerUsdcAmount);
            fakeUSDCToken.safeTransferFrom(taker, address(this), takerUsdcAmount);

            _mint(order.maker, order.targetId, fillAmount, "");
            
            uint256 oppositeId = (order.targetId == YES) ? NO : YES;
            _mint(taker, oppositeId, fillAmount, "");
        } else {
            uint256 oppositeId = (order.targetId == YES) ? NO : YES;
            
            _burn(order.maker, order.targetId, fillAmount);
            _burn(taker, oppositeId, fillAmount);

            fakeUSDCToken.safeTransfer(order.maker, makerUsdcAmount);
            fakeUSDCToken.safeTransfer(taker, takerUsdcAmount);
        }

        emit OrderFilled(orderHash, order.maker, taker, order.targetId, order.isBuy, order.price, fillAmount, makerUsdcAmount);
    }
}