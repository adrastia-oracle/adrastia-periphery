// SPDX-License-Identifier: MIT
pragma solidity =0.8.13;

import "@openzeppelin-v4/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin-v4/contracts/access/AccessControlEnumerable.sol";

import "../../Erc20MutationComputer.sol";
import "../../../../access/Roles.sol";

/// @title Compound's cToken interface
interface ICToken {
    function totalSupply() external view returns (uint256);

    function totalBorrows() external view returns (uint256);

    function totalReserves() external view returns (uint256);

    function getCash() external view returns (uint256);

    function underlying() external view returns (address);
}

/**
 * @title CTokenMutationComputer
 * @notice Abstract contract for computing mutated values from cTokens.
 * @dev Extend this contract and implement the extractValueFromToken function to use it.
 */
abstract contract CTokenMutationComputer is Erc20MutationComputer, AccessControlEnumerable {
    /**
     * @notice Constructs a new CTokenMutationComputer instance.
     * @param defaultOneXScalar_ The default scalar value to represent 1x. Recommended value: 1,000,000.
     * @param defaultDecimals_ The default number of decimals for the underlying tokens. Recommended value: 18.
     * @param decimalsOffset_ The offset to apply when scaling the value from the token.
     */
    constructor(
        uint32 defaultOneXScalar_,
        uint8 defaultDecimals_,
        int8 decimalsOffset_
    ) Erc20MutationComputer(defaultOneXScalar_, defaultDecimals_, decimalsOffset_) {
        initializeRoles();
    }

    /// @inheritdoc IERC165
    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(AccessControlEnumerable, MutatedValueComputer) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    /**
     * @notice Returns the number of decimals for the underlying token or the default value if decimals cannot be
     *   retrieved.
     * @param cToken The cToken address whose underlying token decimals should be fetched.
     * @return The number of decimals for the underlying token or the default value if decimals cannot be retrieved.
     */
    function getTokenDecimalsOrDefault(address cToken) internal view virtual override returns (uint8) {
        uint8 decimals = defaultDecimals;

        (bool success, bytes memory result) = cToken.staticcall(abi.encodeWithSelector(ICToken.underlying.selector));

        if (success && result.length == 32) {
            address underlyingToken = abi.decode(result, (address));

            (success, result) = underlyingToken.staticcall(abi.encodeWithSelector(IERC20Metadata.decimals.selector));

            if (success && result.length == 32) {
                decimals = abi.decode(result, (uint8));
            }
        }

        return decimals;
    }

    /**
     * @notice Checks if the sender has the required role to set the config, namely, the POOL_ADMIN role.
     */
    function checkSetConfig() internal view virtual override onlyRole(Roles.RATE_ADMIN) {}

    /**
     * @notice Initializes the roles hierarchy.
     * @dev Sets up the roles and their hierarchy:
     *          ADMIN
     *            |
     *        RATE_ADMIN
     * @dev The ADMIN role is set up with msg.sender as the initial admin.
     */
    function initializeRoles() internal virtual {
        // Setup admin role, setting msg.sender as admin
        _setupRole(Roles.ADMIN, msg.sender);
        _setRoleAdmin(Roles.ADMIN, Roles.ADMIN);

        // Set admin of RATE_ADMIN as ADMIN
        _setRoleAdmin(Roles.RATE_ADMIN, Roles.ADMIN);

        // Hierarchy:
        // ADMIN
        //   - RATE_ADMIN
    }
}
