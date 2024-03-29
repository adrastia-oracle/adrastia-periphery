// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "../../ManagedErc20MutationComputer.sol";

interface IComet {
    function totalBorrow() external view returns (uint256);

    function baseToken() external view returns (address);
}

/**
 * @title CometBorrowMutationComputer
 * @notice A Erc20MutationComputer implementation that computes mutated values using the total base asset borrowed
 *   amount in the Comet contract.
 */
contract CometBorrowMutationComputer is ManagedErc20MutationComputer {
    address public immutable comet;

    address public immutable baseToken;

    /**
     * @notice Constructs a new CometBorrowMutationComputer instance.
     * @param defaultOneXScalar_ The default scalar value to represent 1x. Recommended value: 1,000,000.
     * @param defaultDecimals_ The default number of decimals for the tokens. Recommended value: 18.
     * @param decimalsOffset_ The offset to apply when scaling the value from the token.
     * @param comet_ The address of the Comet contract.
     */
    constructor(
        address comet_,
        uint32 defaultOneXScalar_,
        uint8 defaultDecimals_,
        int8 decimalsOffset_
    ) ManagedErc20MutationComputer(defaultOneXScalar_, defaultDecimals_, decimalsOffset_) {
        comet = comet_;
        baseToken = IComet(comet_).baseToken();
    }

    /**
     * @notice Extracts the base asset borrowed amount (plus interest) in the Comet contract.
     * @return The extracted base asset borrowed amount (plus interest).
     */
    function extractValueFromToken(address token) internal view virtual override returns (uint256) {
        if (token != baseToken) {
            // It can be misleading to return a value for a token that doesn't match the base token, so we revert.
            revert InvalidInput(token);
        }

        return IComet(comet).totalBorrow();
    }
}
