// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IComptroller {
    function allMarkets(uint256 index) external view returns (address);

    function cTokensByUnderlying(address) external view returns (address);
}
