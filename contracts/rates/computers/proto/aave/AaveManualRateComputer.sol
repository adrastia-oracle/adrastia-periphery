// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "../../ManualRateComputer.sol";
import "../../../../vendor/aave/IACLManager.sol";

/**
 * @title AaveManualRateComputer
 * @notice A smart contract that extends ManualRateComputer to implement access control based on Aave's ACL Manager.
 */
contract AaveManualRateComputer is ManualRateComputer {
    /// @notice The Aave ACL Manager instance.
    IACLManager public immutable aclManager;

    /// @notice An error that is thrown if the account is not authorized for the required role.
    /// @param account The account that is not authorized.
    /// @param requiredRole The required role (hash) that the account is missing.
    error NotAuthorized(address account, bytes32 requiredRole);

    /**
     * @notice Constructs the AaveManualRateComputer contract.
     * @param aclManager_ The Aave ACL Manager instance.
     */
    constructor(IACLManager aclManager_) {
        aclManager = aclManager_;
    }

    /**
     * @notice Checks if the sender has the required role to set the rate, namely, the RISK_ADMIN role.
     */
    function checkSetRate() internal view virtual override {
        if (!aclManager.isRiskAdmin(msg.sender)) {
            revert NotAuthorized(msg.sender, aclManager.RISK_ADMIN_ROLE());
        }
    }
}
