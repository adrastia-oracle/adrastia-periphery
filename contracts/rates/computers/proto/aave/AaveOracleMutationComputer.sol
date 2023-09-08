// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "../../OracleMutationComputer.sol";
import "../../../../vendor/aave/IACLManager.sol";

/**
 * @title AaveOracleMutationComputer
 * @notice An OracleMutationComputer implementation that uses Aave's ACL Manager for role management.
 */
contract AaveOracleMutationComputer is OracleMutationComputer {
    /// @notice The Aave ACL Manager instance.
    IACLManager public immutable aclManager;

    /// @notice An error that is thrown if the account is not authorized for the required role.
    /// @param account The account that is not authorized.
    /// @param requiredRole The required role (hash) that the account is missing.
    error NotAuthorized(address account, bytes32 requiredRole);

    /**
     * @notice Constructs a new AaveOracleMutationComputer instance.
     * @param aclManager_ The address of the Aave ACL Manager.
     * @param oracle_ The address of the oracle contract.
     * @param dataSlot_ The data slot to use when consulting the oracle.
     * @param defaultOneXScalar_ The default scalar value to represent 1x. Recommended value: 1,000,000.
     * @param decimalsOffset_ The offset to apply when scaling the value from the aToken.
     */
    constructor(
        IACLManager aclManager_,
        IOracle oracle_,
        uint256 dataSlot_,
        uint32 defaultOneXScalar_,
        int8 decimalsOffset_
    ) OracleMutationComputer(oracle_, dataSlot_, defaultOneXScalar_, decimalsOffset_) {
        aclManager = aclManager_;
    }

    /**
     * @notice Checks if the sender has the required role to set the config, namely, the POOL_ADMIN role.
     */
    function checkSetConfig() internal view virtual override {
        if (!aclManager.isPoolAdmin(msg.sender)) {
            revert NotAuthorized(msg.sender, aclManager.POOL_ADMIN_ROLE());
        }
    }
}
