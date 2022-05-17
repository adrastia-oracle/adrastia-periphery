//SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

pragma experimental ABIEncoderV2;

import "@pythia-oracle/pythia-core/contracts/accumulators/proto/curve/CurveLiquidityAccumulator.sol";

contract CurveLiquidityAccumulatorStub is CurveLiquidityAccumulator {
    constructor(
        address pool_,
        uint8 nCoins_,
        address poolQuoteToken_,
        address ourQuoteToken_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    )
        CurveLiquidityAccumulator(
            pool_,
            nCoins_,
            poolQuoteToken_,
            ourQuoteToken_,
            updateTheshold_,
            minUpdateDelay_,
            maxUpdateDelay_
        )
    {}

    function harnessFetchLiquidity(address token)
        public
        view
        returns (uint256 tokenLiquidity, uint256 quoteTokenLiquidity)
    {
        return super.fetchLiquidity(token);
    }
}
