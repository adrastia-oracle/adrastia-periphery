// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "@adrastia-oracle/adrastia-core/contracts/interfaces/IOracle.sol";

import "./Erc20MutationComputer.sol";

/**
 * @title OracleMutationComputer
 * @notice An abstract contract for computing mutated values from an Adrastia oracle contract.
 * @dev Extend this contract and implement the checkSetConfig function to use it.
 */
abstract contract OracleMutationComputer is Erc20MutationComputer {
    /// @notice Represents the `price` data slot of an oracle observation.
    uint256 public constant DATA_SLOT_PRICE = 1;

    /// @notice Represents the `tokenLiquidity` data slot of an oracle observation.
    uint256 public constant DATA_SLOT_LIQUIDITY_TOKEN = 2;

    /// @notice Represents the `quoteTokenLiquidity` data slot of an oracle observation.
    uint256 public constant DATA_SLOT_LIQUIDITY_QUOTETOKEN = 3;

    /// @notice The oracle contract to read from.
    IOracle public immutable oracle;

    /// @notice The data slot to use when consulting the oracle.
    uint256 public immutable dataSlot;

    uint8 internal immutable liquidityDecimals;
    uint8 internal immutable priceDecimals;

    /**
     * @notice An error thrown when the data slot is invalid.
     * @param slot The invalid data slot.
     */
    error InvalidDataSlot(uint256 slot);

    /**
     * @notice Constructs a new OracleMutationComputer instance.
     * @param oracle_ The address of the oracle contract.
     * @param dataSlot_  The data slot to use when consulting the oracle. See the DATA_SLOT_* constants.
     * @param defaultOneXScalar_ The default scalar value to represent 1x. Recommended value: 1,000,000.
     * @param decimalsOffset_ The decimal offset to apply when scaling the value from the token. Positive values scale
     *   up, negative values scale down. Measured in numbers of decimals places (powers of 10).
     */
    constructor(
        IOracle oracle_,
        uint256 dataSlot_,
        uint32 defaultOneXScalar_,
        int8 decimalsOffset_
    ) Erc20MutationComputer(defaultOneXScalar_, 0, decimalsOffset_) {
        if (
            dataSlot_ != DATA_SLOT_PRICE &&
            dataSlot_ != DATA_SLOT_LIQUIDITY_TOKEN &&
            dataSlot_ != DATA_SLOT_LIQUIDITY_QUOTETOKEN
        ) {
            revert InvalidDataSlot(dataSlot_);
        }

        oracle = oracle_;
        dataSlot = dataSlot_;

        liquidityDecimals = dataSlot_ == DATA_SLOT_PRICE ? 0 : oracle_.liquidityDecimals();
        priceDecimals = dataSlot_ == DATA_SLOT_PRICE ? oracle_.quoteTokenDecimals() : 0;
    }

    /// @dev Returns the number of decimals the oracle contract uses.
    /// @inheritdoc Erc20MutationComputer
    function getTokenDecimalsOrDefault(address) internal view virtual override returns (uint8) {
        if (dataSlot == DATA_SLOT_PRICE) {
            return priceDecimals;
        } else {
            return liquidityDecimals;
        }
    }

    /// @dev Extracts the value for the specified token from the oracle contract.
    /// @inheritdoc Erc20MutationComputer
    function extractValueFromToken(address token) internal view virtual override returns (uint256 result) {
        if (dataSlot == DATA_SLOT_PRICE) {
            // Fetch price
            (result) = oracle.consultPrice(token);
        } else if (dataSlot == DATA_SLOT_LIQUIDITY_TOKEN) {
            // Fetch tokenLiquidity
            (result, ) = oracle.consultLiquidity(token);
        } else {
            // Assume this case is for DATA_SLOT_LIQUIDITY_QUOTETOKEN b/c the constructor enforces this
            // Fetch quoteTokenLiquidity
            (, result) = oracle.consultLiquidity(token);
        }
    }
}
