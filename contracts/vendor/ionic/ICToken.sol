// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface ICToken {
    function underlying() external view returns (address);

    function totalBorrows() external view returns (uint256);

    function totalReserves() external view returns (uint256);

    function getCash() external view returns (uint256);

    function accrueInterest() external returns (uint256);

    function getTotalUnderlyingSupplied() external view returns (uint256);
}
