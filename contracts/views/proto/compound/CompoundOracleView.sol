//SPDX-License-Identifier: MIT
pragma solidity =0.8.11;

import "@openzeppelin-v4/contracts/access/Ownable.sol";
import "@pythia-oracle/pythia-core/contracts/interfaces/IOracle.sol";

import "./ICompoundPriceOracle.sol";

contract CompoundOracleView is ICompoundPriceOracle, Ownable {
    event OracleUpdated(address indexed oldOracle, address indexed newOracle);

    event ConfigurationAdded(
        address indexed cToken,
        address indexed underlying,
        uint8 underlyingDecimals,
        uint256 fixedPrice
    );

    struct CTokenConfig {
        address underlying;
        uint8 underlyingDecimals;
        uint256 fixedPrice;
    }

    struct CTokenConfigInput {
        address cToken;
        CTokenConfig config;
    }

    IOracle public immutable oracle;

    mapping(address => CTokenConfig) public configurations;

    constructor(
        IOracle oracle_,
        CTokenConfigInput[] memory config,
        address owner
    ) {
        oracle = oracle_;

        emit OracleUpdated(address(0), address(oracle_));

        for (uint256 i = 0; i < config.length; ++i) {
            CTokenConfigInput memory configInput = config[i];

            require(configInput.cToken != address(0), "CompoundOracleView: INVALID_CTOKEN");
            require(configInput.config.underlying != address(0), "CompoundOracleView: INVALID_UNDERLYING");
            require(configInput.config.underlyingDecimals <= 36, "CompoundOracleView: TOO_MANY_DECIMALS");

            configurations[configInput.cToken] = configInput.config;

            emit ConfigurationAdded(
                configInput.cToken,
                configInput.config.underlying,
                configInput.config.underlyingDecimals,
                configInput.config.fixedPrice
            );
        }

        if (owner != msg.sender) transferOwnership(owner);
    }

    function getUnderlyingPrice(address cToken) external view virtual override returns (uint256 price) {
        CTokenConfig memory config = configurations[cToken];
        require(config.underlying != address(0), "CompoundOracleView: CONFIG_NOT_FOUND");

        // If the cToken underlying has a fixed price, return it
        if (config.fixedPrice != 0) return config.fixedPrice;

        // Consult with the oracle
        price = oracle.consultPrice(config.underlying);

        require(price != 0, "CompoundOracleView: INVALID_PRICE");

        // Compound uses raw prices scaled by 1e36
        uint256 scaleByDecimals = 36 - config.underlyingDecimals;

        price *= 10**scaleByDecimals;
    }

    function addConfiguraion(
        address cToken,
        address underlying,
        uint8 underlyingDecimals,
        uint256 fixedPrice
    ) external onlyOwner {
        require(configurations[cToken].underlying == address(0), "CompoundOracleView: DUPLICATE_CONFIG");
        require(cToken != address(0), "CompoundOracleView: INVALID_CTOKEN");
        require(underlying != address(0), "CompoundOracleView: INVALID_UNDERLYING");
        require(underlyingDecimals <= 36, "CompoundOracleView: TOO_MANY_DECIMALS");

        configurations[cToken] = CTokenConfig({
            underlying: underlying,
            underlyingDecimals: underlyingDecimals,
            fixedPrice: fixedPrice
        });

        emit ConfigurationAdded(cToken, underlying, underlyingDecimals, fixedPrice);
    }
}
