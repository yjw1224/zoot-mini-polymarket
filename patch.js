const fs = require('fs');
let code = fs.readFileSync('contracts/PredictionMarket.sol', 'utf8');

// Replace buy function
const buyOld = `    // Buy a specific outcome with USDC in a single call: creates \`sets\` (USDC/PRICE_PER_SET),
    // mints YES/NO to buyer and then immediately sells the opposite side into the pool
    function buy(uint256 outcome, uint256 usdcAmount) external nonReentrant {
        if (isResolved) revert MarketAlreadyResolved();
        if (block.timestamp >= endTime) revert MarketAlreadyEnded();
        if (outcome != YES && outcome != NO) revert InvalidWinner();
        if (usdcAmount < PRICE_PER_SET) revert AmountMustBeGreaterThanZero();

        uint256 sets = usdcAmount / PRICE_PER_SET;
        // collect fUSDC backing for the newly created sets
        uint256 usdcToTransfer = sets * PRICE_PER_SET;
        fakeUSDCToken.safeTransferFrom(msg.sender, address(this), usdcToTransfer);

        // mint sets (YES + NO) to buyer
        _mint(msg.sender, YES, sets, "");
        _mint(msg.sender, NO, sets, "");

        // immediately sell the opposite side into pool for the desired outcome
        uint256 sellOutcome = (outcome == YES) ? NO : YES;
        uint256 tokensOut = _swap(msg.sender, sellOutcome, sets);

        emit Bought(msg.sender, outcome, usdcToTransfer, tokensOut);
    }`;

const buyNew = `    // Buy a specific outcome with USDC in a single call.
    // Mints YES/NO 1:1 with USDC to buyer and then immediately sells the opposite side into the pool.
    function buy(uint256 outcome, uint256 usdcAmount) external nonReentrant {
        if (isResolved) revert MarketAlreadyResolved();
        if (block.timestamp >= endTime) revert MarketAlreadyEnded();
        if (outcome != YES && outcome != NO) revert InvalidWinner();
        if (usdcAmount == 0) revert AmountMustBeGreaterThanZero();

        // collect fUSDC backing
        fakeUSDCToken.safeTransferFrom(msg.sender, address(this), usdcAmount);

        // mint tokens to buyer (1 USDC wei mints 1 YES wei + 1 NO wei)
        _mint(msg.sender, YES, usdcAmount, "");
        _mint(msg.sender, NO, usdcAmount, "");

        // immediately sell the opposite side into pool for the desired outcome
        uint256 sellOutcome = (outcome == YES) ? NO : YES;
        uint256 tokensOut = _swap(msg.sender, sellOutcome, usdcAmount);

        emit Bought(msg.sender, outcome, usdcAmount, tokensOut);
    }`;

code = code.replace(buyOld, buyNew);

fs.writeFileSync('contracts/PredictionMarket.sol', code);
console.log('Done replacement');
