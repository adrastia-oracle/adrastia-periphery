//SPDX-License-Identifier: MIT
pragma solidity =0.8.11;

import "@pythia-oracle/pythia-core/contracts/accumulators/proto/uniswap/UniswapV2PriceAccumulator.sol";

import "@openzeppelin-v4/contracts/access/AccessControl.sol";

import "../../../access/Roles.sol";

contract ManagedUniswapV2PriceAccumulator is AccessControl, UniswapV2PriceAccumulator {
    constructor(
        address uniswapFactory_,
        bytes32 initCodeHash_,
        address quoteToken_,
        uint256 updateTheshold_,
        uint256 minUpdateDelay_,
        uint256 maxUpdateDelay_
    )
        UniswapV2PriceAccumulator(
            uniswapFactory_,
            initCodeHash_,
            quoteToken_,
            updateTheshold_,
            minUpdateDelay_,
            maxUpdateDelay_
        )
    {
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
            require(hasRole(role, msg.sender), "ManagedUniswapV2PriceAccumulator: MISSING_ROLE");
        }
        _;
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(AccessControl, PriceAccumulator)
        returns (bool)
    {
        return interfaceId == type(IAccessControl).interfaceId || PriceAccumulator.supportsInterface(interfaceId);
    }

    function initializeRoles() internal virtual {
        // Setup admin role, setting msg.sender as admin
        _setupRole(Roles.ADMIN, msg.sender);
        _setRoleAdmin(Roles.ADMIN, Roles.ADMIN);

        // Set admin of ORACLE_UPDATER as ADMIN
        _setRoleAdmin(Roles.ORACLE_UPDATER, Roles.ADMIN);
    }

    function update(bytes memory data) public virtual override onlyRoleOrOpenRole(Roles.ORACLE_UPDATER) returns (bool) {
        return super.update(data);
    }
}
