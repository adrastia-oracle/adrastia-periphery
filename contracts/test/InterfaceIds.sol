// SPDX-License-Identifier: MIT
pragma solidity =0.8.11;

import "@openzeppelin-v4/contracts/access/IAccessControl.sol";

contract InterfaceIds {
    function iAccessControl() external pure returns (bytes4) {
        return type(IAccessControl).interfaceId;
    }
}
