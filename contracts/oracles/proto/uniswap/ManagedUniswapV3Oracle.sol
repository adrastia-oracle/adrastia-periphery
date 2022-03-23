//SPDX-License-Identifier: MIT
pragma solidity =0.7.6;
pragma experimental ABIEncoderV2;

import "@pythia-oracle/pythia-core/contracts/oracles/proto/uniswap/UniswapV3Oracle.sol";

import "@openzeppelin-v3/contracts/access/AccessControl.sol";

import "../../../access/Roles.sol";

contract ManagedUniswapV3Oracle is AccessControl, UniswapV3Oracle {
    constructor(
        address liquidityAccumulator_,
        address uniswapFactory_,
        bytes32 initCodeHash_,
        uint24[] memory poolFees_,
        address quoteToken_,
        uint256 period_
    ) UniswapV3Oracle(liquidityAccumulator_, uniswapFactory_, initCodeHash_, poolFees_, quoteToken_, period_) {
        initializeRoles();
    }

    /**
     * @notice Modifier to make a function callable only by a certain role. In
     * addition to checking the sender's role, `address(0)` 's role is also
     * considered. Granting a role to `address(0)` is equivalent to enabling
     * this role for everyone.
     */
    modifier onlyRoleOrOpenRole(bytes32 role) {
        if (!hasRole(role, address(0))) {
            require(hasRole(role, msg.sender), "ManagedUniswapV3Oracle: MISSING_ROLE");
        }
        _;
    }

    function initializeRoles() internal virtual {
        // Setup admin role, setting msg.sender as admin
        _setupRole(Roles.ADMIN, msg.sender);
        _setRoleAdmin(Roles.ADMIN, Roles.ADMIN);

        // Set admin of ORACLE_UPDATER as ADMIN
        _setRoleAdmin(Roles.ORACLE_UPDATER, Roles.ADMIN);
    }

    function _update(address token) internal virtual override onlyRoleOrOpenRole(Roles.ORACLE_UPDATER) returns (bool) {
        return super._update(token);
    }
}
