// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IAutomatedLineOfCredit {
    function updateAndPayFee() external;

    function interestRate() external view returns (uint256);
}
