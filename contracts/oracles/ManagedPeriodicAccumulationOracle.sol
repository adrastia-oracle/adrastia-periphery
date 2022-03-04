//SPDX-License-Identifier: MIT
pragma solidity =0.8.11;

import "@pythia-oracle/pythia-core/contracts/oracles/PeriodicAccumulationOracle.sol";

import "@openzeppelin-v4/contracts/access/Ownable.sol";

contract ManagedPeriodicAccumulationOracle is Ownable, PeriodicAccumulationOracle {
    constructor(
        address liquidityAccumulator_,
        address priceAccumulator_,
        address quoteToken_,
        uint256 period_
    ) PeriodicAccumulationOracle(liquidityAccumulator_, priceAccumulator_, quoteToken_, period_) {}

    function _update(address token) internal virtual override onlyOwner returns (bool) {
        return super._update(token);
    }
}
