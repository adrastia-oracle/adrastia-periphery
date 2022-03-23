//SPDX-License-Identifier: MIT
pragma solidity =0.8.11;

interface ICompoundPriceOracle {
    function getUnderlyingPrice(address cToken) external view returns (uint256);
}
