// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.30;

import {ERC165} from "@openzeppelin-v4/contracts/utils/introspection/ERC165.sol";

import {IHistoricalRates} from "../../../../IHistoricalRates.sol";
import {IControllerPreUpdateHook} from "../../IControllerPreUpdateHook.sol";
import {RateLibrary} from "../../../../RateLibrary.sol";

interface IComptroller {
    function allMarkets(uint256 index) external view returns (address);
}

interface IVToken {
    function underlying() external view returns (address);

    function accrueInterest() external returns (uint256);
}

/**
 * @title VenusAccrueInterestHook
 * @author Tyler Loewen, TRILEZ SOFTWARE INC. dba. Adrastia
 * @notice A hook that accrues interest for a Venus market before the controller updates the rate.
 */
contract VenusAccrueInterestHook is IControllerPreUpdateHook, ERC165 {
    /**
     * @notice The Comptroller contract address.
     */
    address public immutable comptroller;

    /**
     * @notice The address of the native currency (as Ether, BNB, etc. is not a token, but an address is required).
     */
    address public immutable nativePseudoAddress;

    address[] internal _vTokens;
    mapping(address => address) internal _tokenToVToken;
    mapping(address => address) internal _vTokenToToken;

    /**
     * @notice Emitted when the token mappings are refreshed.
     * @param numAdded The number of tokens added.
     * @param numRemoved The number of tokens removed.
     */
    event TokenMappingsRefreshed(uint256 numAdded, uint256 numRemoved);

    /**
     * @notice Emitted when a new vToken is added to the mapping.
     * @param vToken The vToken address.
     */
    event VTokenAdded(address indexed vToken);

    /**
     * @notice Emitted when a vToken is removed from the mapping.
     * @param vToken The vToken address.
     */
    event VTokenRemoved(address indexed vToken);

    /// @notice Emitted when an unsupported token is encountered.
    error InvalidToken(address token);

    /// @notice Emitted when a token is already mapped to a vToken.
    /// @param token The token address.
    /// @param vToken The vToken address.
    error DuplicateMarket(address token, address vToken);

    /**
     * @notice Emitted when accruing interest for a vToken fails.
     *
     * @param token The address of the token for which interest accrual failed.
     * @param vToken The address of the vToken for which interest accrual failed.
     * @param errorCode The error code returned by the vToken's accrueInterest function.
     */
    error FailedToAccrueInterest(address token, address vToken, uint256 errorCode);

    /**
     * @notice Constructs a new VenusAccrueInterestHook instance.
     * @dev Remember to call `refreshTokenMappings` after deploying this contract.
     *
     * @param comptroller_ The address of the Comptroller contract.
     * @param nativePseudoAddress_ The address of the native currency.
     */
    constructor(address comptroller_, address nativePseudoAddress_) {
        comptroller = comptroller_;
        nativePseudoAddress = nativePseudoAddress_;
    }

    /**
     * @notice Refreshes the token mappings by querying the Comptroller for all markets.
     * @dev This function must be called when the Comptroller's markets change.
     */
    function refreshTokenMappings() external virtual {
        _refreshTokenMappings();
    }

    /**
     * @notice Returns the vToken address for a given token.
     *
     * @param token The address of the token to look up.
     *
     * @return vToken The vToken address associated with the token.
     */
    function tokenToVToken(address token) public view virtual returns (IVToken) {
        address vTokenAddress = _tokenToVToken[token];
        if (vTokenAddress == address(0)) {
            revert InvalidToken(token);
        }

        return IVToken(vTokenAddress);
    }

    /// @inheritdoc IControllerPreUpdateHook
    /// @dev This hook accrues interest for a Venus market before the controller updates the rate.
    function onPreControllerUpdate(address token, RateLibrary.Rate calldata) external override {
        if (IHistoricalRates(msg.sender).getRatesCount(token) == 0) {
            // If the vToken is already using the controller for rates, we can't accrue interest until there's a rate.
            // Return early to avoid possible failure.
            return;
        }

        // Ensure the token is mapped to a vToken
        IVToken vToken = tokenToVToken(token);

        // Accrue interest for the vToken
        uint256 errorCode = vToken.accrueInterest();
        if (errorCode != 0) {
            revert FailedToAccrueInterest(token, address(vToken), errorCode);
        }
    }

    /// @inheritdoc ERC165
    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return
            interfaceId == type(IControllerPreUpdateHook).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    /// @dev Calls to the vToken contracts are limited to 20k gas to avoid issues with CEther fallback.
    function _refreshTokenMappings() internal virtual {
        address[] memory oldVTokens = _vTokens;

        // Delete old mappings
        for (uint256 i = 0; i < oldVTokens.length; ++i) {
            address token = _vTokenToToken[oldVTokens[i]];
            delete _tokenToVToken[token];
            delete _vTokenToToken[oldVTokens[i]];
        }
        delete _vTokens;

        uint256 numTokens = 0;
        for (uint256 i = 0; i < 256; ++i) {
            (bool success1, bytes memory data1) = address(comptroller).staticcall(
                abi.encodeWithSelector(IComptroller.allMarkets.selector, i)
            );
            if (success1 && data1.length == 32) {
                address vToken = abi.decode(data1, (address));
                if (vToken == address(0)) {
                    // Skip past any empty markets (this should never happen, but just in case)
                    continue;
                }

                // Now get the underlying token
                (bool success2, bytes memory data2) = vToken.staticcall{gas: 20000}(
                    abi.encodeWithSelector(IVToken.underlying.selector)
                );
                address token;
                if (success2 && data2.length == 32) {
                    // CErc20
                    token = abi.decode(data2, (address));
                } else {
                    // CEther
                    token = nativePseudoAddress;
                }

                if (address(_tokenToVToken[token]) != address(0)) {
                    revert DuplicateMarket(token, vToken);
                }

                _vTokens.push(vToken);
                _tokenToVToken[token] = vToken;
                _vTokenToToken[vToken] = token;
                ++numTokens;
            } else {
                // We've iterated through all markets
                break;
            }
        }

        // Log the removals
        uint256 numRemoved = 0;
        for (uint256 i = 0; i < oldVTokens.length; ++i) {
            if (address(_vTokenToToken[oldVTokens[i]]) == address(0)) {
                emit VTokenRemoved(oldVTokens[i]);
                ++numRemoved;
            }
        }

        // Log the additions
        uint256 numAdded = 0;
        address[] memory newCTokens = _vTokens;
        for (uint256 i = 0; i < newCTokens.length; ++i) {
            bool isNew = true;

            for (uint256 j = 0; j < oldVTokens.length; ++j) {
                if (oldVTokens[j] == newCTokens[i]) {
                    isNew = false;
                    break;
                }
            }

            if (isNew) {
                emit VTokenAdded(newCTokens[i]);
                ++numAdded;
            }
        }

        emit TokenMappingsRefreshed(numAdded, numRemoved);
    }
}
