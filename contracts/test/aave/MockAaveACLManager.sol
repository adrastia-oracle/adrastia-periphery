// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "@openzeppelin-v4/contracts/access/AccessControlEnumerable.sol";

import "../../vendor/aave/IACLManager.sol";

contract MockAaveACLManager is AccessControlEnumerable, IACLManager {
    bytes32 public constant override POOL_ADMIN_ROLE = keccak256("POOL_ADMIN");
    bytes32 public constant override EMERGENCY_ADMIN_ROLE = keccak256("EMERGENCY_ADMIN");
    bytes32 public constant override RISK_ADMIN_ROLE = keccak256("RISK_ADMIN");
    bytes32 public constant override FLASH_BORROWER_ROLE = keccak256("FLASH_BORROWER");
    bytes32 public constant override BRIDGE_ROLE = keccak256("BRIDGE");
    bytes32 public constant override ASSET_LISTING_ADMIN_ROLE = keccak256("ASSET_LISTING_ADMIN");

    address public immutable ADDRESSES_PROVIDER;

    constructor() {
        ADDRESSES_PROVIDER = address(0);
        address aclAdmin = msg.sender; //provider.getACLAdmin();
        // require(aclAdmin != address(0), Errors.ACL_ADMIN_CANNOT_BE_ZERO);
        _setupRole(DEFAULT_ADMIN_ROLE, aclAdmin);
    }

    /// @inheritdoc IACLManager
    function setRoleAdmin(bytes32 role, bytes32 adminRole) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        _setRoleAdmin(role, adminRole);
    }

    /// @inheritdoc IACLManager
    function addPoolAdmin(address admin) external override {
        grantRole(POOL_ADMIN_ROLE, admin);
    }

    /// @inheritdoc IACLManager
    function removePoolAdmin(address admin) external override {
        revokeRole(POOL_ADMIN_ROLE, admin);
    }

    /// @inheritdoc IACLManager
    function isPoolAdmin(address admin) external view override returns (bool) {
        return hasRole(POOL_ADMIN_ROLE, admin);
    }

    /// @inheritdoc IACLManager
    function addEmergencyAdmin(address admin) external override {
        grantRole(EMERGENCY_ADMIN_ROLE, admin);
    }

    /// @inheritdoc IACLManager
    function removeEmergencyAdmin(address admin) external override {
        revokeRole(EMERGENCY_ADMIN_ROLE, admin);
    }

    /// @inheritdoc IACLManager
    function isEmergencyAdmin(address admin) external view override returns (bool) {
        return hasRole(EMERGENCY_ADMIN_ROLE, admin);
    }

    /// @inheritdoc IACLManager
    function addRiskAdmin(address admin) external override {
        grantRole(RISK_ADMIN_ROLE, admin);
    }

    /// @inheritdoc IACLManager
    function removeRiskAdmin(address admin) external override {
        revokeRole(RISK_ADMIN_ROLE, admin);
    }

    /// @inheritdoc IACLManager
    function isRiskAdmin(address admin) external view override returns (bool) {
        return hasRole(RISK_ADMIN_ROLE, admin);
    }

    /// @inheritdoc IACLManager
    function addFlashBorrower(address borrower) external override {
        grantRole(FLASH_BORROWER_ROLE, borrower);
    }

    /// @inheritdoc IACLManager
    function removeFlashBorrower(address borrower) external override {
        revokeRole(FLASH_BORROWER_ROLE, borrower);
    }

    /// @inheritdoc IACLManager
    function isFlashBorrower(address borrower) external view override returns (bool) {
        return hasRole(FLASH_BORROWER_ROLE, borrower);
    }

    /// @inheritdoc IACLManager
    function addBridge(address bridge) external override {
        grantRole(BRIDGE_ROLE, bridge);
    }

    /// @inheritdoc IACLManager
    function removeBridge(address bridge) external override {
        revokeRole(BRIDGE_ROLE, bridge);
    }

    /// @inheritdoc IACLManager
    function isBridge(address bridge) external view override returns (bool) {
        return hasRole(BRIDGE_ROLE, bridge);
    }

    /// @inheritdoc IACLManager
    function addAssetListingAdmin(address admin) external override {
        grantRole(ASSET_LISTING_ADMIN_ROLE, admin);
    }

    /// @inheritdoc IACLManager
    function removeAssetListingAdmin(address admin) external override {
        revokeRole(ASSET_LISTING_ADMIN_ROLE, admin);
    }

    /// @inheritdoc IACLManager
    function isAssetListingAdmin(address admin) external view override returns (bool) {
        return hasRole(ASSET_LISTING_ADMIN_ROLE, admin);
    }
}
