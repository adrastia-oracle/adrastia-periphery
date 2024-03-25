// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.13;

import "../../rates/IRateComputer.sol";

interface IAutomatedLineOfCredit {
    function updateAndPayFee() external;
}

contract AlocStub is IAutomatedLineOfCredit {
    event FeesPaid(uint64 rate);

    function updateAndPayFee() external override {
        // Extract the rate from the message sender
        uint64 rate = IRateComputer(msg.sender).computeRate(address(this));

        // Emit an event
        emit FeesPaid(rate);
    }
}
