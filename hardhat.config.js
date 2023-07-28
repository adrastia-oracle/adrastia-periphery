require("dotenv").config();
require("@nomiclabs/hardhat-waffle");
require("solidity-coverage");
require("hardhat-gas-reporter");
require("hardhat-tracer");
require("@atixlabs/hardhat-time-n-mine");
require("@nomiclabs/hardhat-etherscan");

const SOLC_8 = {
    version: "0.8.13",
    settings: {
        optimizer: {
            enabled: true,
            runs: 2000,
        },
    },
};

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
    solidity: {
        compilers: [SOLC_8],
    },
    networks: {
        hardhat: {
            forking: {
                url: process.env.ETHEREUM_URL || "",
            },
            mining: {
                auto: true,
                mempool: {
                    order: "fifo",
                },
            },
        },
        polygon: {
            chainId: 137,
            url: process.env.POLYGON_URL || "",
            accounts: [process.env.PRIVATE_KEY_DEPLOYER || ""],
            gasMultiplier: 2,
        },
        polygonZkEVM: {
            chainId: 1101,
            url: process.env.POLYGONZKEVM_URL || "",
            accounts: [process.env.PRIVATE_KEY_DEPLOYER || ""],
        },
        arbitrumOne: {
            chainId: 42161,
            url: process.env.ARBITRUMONE_URL || "",
            accounts: [process.env.PRIVATE_KEY_DEPLOYER || ""],
        },
        optimisticEthereum: {
            chainId: 10,
            url: process.env.OPTIMISM_URL || "",
            accounts: [process.env.PRIVATE_KEY_DEPLOYER || ""],
        },
    },
    etherscan: {
        apiKey: {
            mainnet: process.env.ETHERSCAN_API_KEY,
            polygon: process.env.POLYGONSCAN_API_KEY,
            polygonZkEVM: process.env.POLYGONSCANZKEVM_API_KEY,
            arbitrumOne: process.env.ARBISCAN_API_KEY,
            optimisticEthereum: process.env.OPTIMISTIC_ETHERSCAN_API_KEY,
        },
        customChains: [
            {
                network: "polygonZkEVM",
                chainId: 1101,
                urls: {
                    apiURL: "https://api-zkevm.polygonscan.com/api",
                    browserURL: "https://zkevm.polygonscan.com",
                },
            },
        ],
    },
};
