// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "@adrastia-oracle/adrastia-core/contracts/interfaces/IOracle.sol";

import "./Erc20MutationComputer.sol";

abstract contract OracleMutationComputer is Erc20MutationComputer {
    uint256 public constant DATA_SLOT_PRICE = 1;
    uint256 public constant DATA_SLOT_LIQUIDITY_TOKEN = 2;
    uint256 public constant DATA_SLOT_LIQUIDITY_QUOTETOKEN = 3;

    IOracle public immutable oracle;

    uint256 public immutable dataSlot;

    uint8 internal immutable liquidityDecimals;
    uint8 internal immutable priceDecimals;

    error InvalidDataSlot(uint256 slot);

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

    function getTokenDecimalsOrDefault(address) internal view virtual override returns (uint8) {
        if (dataSlot == DATA_SLOT_PRICE) {
            return priceDecimals;
        } else {
            return liquidityDecimals;
        }
    }

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
