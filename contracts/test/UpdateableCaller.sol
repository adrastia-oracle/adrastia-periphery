//SPDX-License-Identifier: MIT
pragma solidity ^0.8;

import "@pythia-oracle/pythia-core/contracts/interfaces/IUpdateByToken.sol";

contract UpdateableCaller {
    address updatable;
    address token;

    constructor(
        address updateable_,
        bool callUpdateInConstructor,
        address token_
    ) {
        updatable = updateable_;
        token = token_;

        if (callUpdateInConstructor) {
            IUpdateByToken(updateable_).update(token_);
        }
    }

    function callUpdate() external {
        IUpdateByToken(updatable).update(token);
    }
}
