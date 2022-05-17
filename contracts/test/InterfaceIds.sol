// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "@openzeppelin-v4/contracts/access/IAccessControl.sol";
import "@openzeppelin-v4/contracts/access/IAccessControlEnumerable.sol";

contract InterfaceIds {
    function iAccessControlEnumerable() external pure returns (bytes4) {
        return type(IAccessControlEnumerable).interfaceId;
    }

    function iAccessControl() external pure returns (bytes4) {
        return type(IAccessControl).interfaceId;
    }
}
