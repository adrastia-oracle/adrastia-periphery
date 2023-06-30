//SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "../../accumulators/proto/algebra/ManagedAlgebraPriceAccumulator.sol";

contract AlgebraPriceAccumulatorStub is ManagedAlgebraPriceAccumulator {
    constructor(
        IAveragingStrategy averagingStrategy_,
        address poolDeployer_,
        bytes32 initCodeHash_,
        address quoteToken_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    )
        ManagedAlgebraPriceAccumulator(
            averagingStrategy_,
            poolDeployer_,
            initCodeHash_,
            quoteToken_,
            updateTheshold_,
            minUpdateDelay_,
            maxUpdateDelay_
        )
    {}

    /// @inheritdoc PriceAccumulator
    function canUpdate(bytes memory data) public view virtual override returns (bool) {
        // Return false if the message sender is missing the required role
        if (!hasRole(Roles.ORACLE_UPDATER, address(0)) && !hasRole(Roles.ORACLE_UPDATER, msg.sender)) return false;

        address token = abi.decode(data, (address));

        if (token == address(0) || token == quoteToken) {
            // Invalid token
            return false;
        }

        return needsUpdate(data);
    }

    function fetchPrice(bytes memory) internal view virtual override returns (uint112) {
        return 1e18;
    }
}
