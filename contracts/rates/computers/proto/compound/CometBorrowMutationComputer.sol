// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "../../Erc20MutationComputer.sol";

interface IComet {
    function totalBorrow() external view returns (uint256);
}

/**
 * @title CometBorrowMutationComputer
 * @notice A Erc20MutationComputer implementation that computes mutated values using the total base asset borrowed
 *   amount in the Comet contract.
 */
contract CometBorrowMutationComputer is Erc20MutationComputer {
    address public immutable comet;

    /**
     * @notice Constructs a new CometBorrowMutationComputer instance.
     * @param defaultOneXScalar_ The default scalar value to represent 1x. Recommended value: 1,000,000.
     * @param defaultDecimals_ The default number of decimals for the tokens. Recommended value: 18.
     * @param decimalsOffset_ The offset to apply when scaling the value from the token.
     * @param comet_ The address of the Comet contract.
     */
    constructor(
        uint32 defaultOneXScalar_,
        uint8 defaultDecimals_,
        int8 decimalsOffset_,
        address comet_
    ) Erc20MutationComputer(defaultOneXScalar_, defaultDecimals_, decimalsOffset_) {
        comet = comet_;
    }

    /**
     * @notice Extracts the base asset borrowed amount (plus interest) in the Comet contract.
     * @return The extracted base asset borrowed amount (plus interest).
     */
    function extractValueFromToken(address) internal view virtual override returns (uint256) {
        return IComet(comet).totalBorrow();
    }
}
