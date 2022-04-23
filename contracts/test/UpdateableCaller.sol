//SPDX-License-Identifier: MIT
pragma solidity ^0.8;

import "@pythia-oracle/pythia-core/contracts/interfaces/IUpdateable.sol";

contract UpdateableCaller {
    address updatable;
    bytes updateData;

    constructor(
        address updateable_,
        bool callUpdateInConstructor,
        bytes memory updateData_
    ) {
        updatable = updateable_;
        updateData = updateData_;

        if (callUpdateInConstructor) {
            IUpdateable(updateable_).update(updateData_);
        }
    }

    function callUpdate() external {
        IUpdateable(updatable).update(updateData);
    }
}
