// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "../../ManagedErc20MutationComputer.sol";

interface IComet {
    struct TotalsCollateral {
        uint128 totalSupplyAsset;
        uint128 _reserved;
    }

    function totalsCollateral(address) external view returns (TotalsCollateral memory);
}

/**
 * @title CometCollateralMutationComputer
 * @notice A Erc20MutationComputer implementation that computes mutated values using the total collateral supply of
 *   assets stored in the Comet contract.
 */
contract CometCollateralMutationComputer is ManagedErc20MutationComputer {
    address public immutable comet;

    /**
     * @notice Constructs a new CometCollateralMutationComputer instance.
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
    }

    /**
     * @notice Extracts the total collateral supply of a token stored in the Comet contract.
     * @param token The token to extract the total collateral supply of.
     * @return The extracted total collateral supply of the token.
     */
    function extractValueFromToken(address token) internal view virtual override returns (uint256) {
        return IComet(comet).totalsCollateral(token).totalSupplyAsset;
    }
}
