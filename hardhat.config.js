require("@nomiclabs/hardhat-waffle");
require("solidity-coverage");
require("hardhat-gas-reporter");
require("hardhat-tracer");
require("@atixlabs/hardhat-time-n-mine");

const SOLC_8 = {
    version: "0.8.11",
    settings: {
        optimizer: {
            enabled: true,
            runs: 20000,
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
            hardfork: "london",
            gasPrice: "auto",
            forking: {
                url: "https://eth-mainnet.alchemyapi.io/v2/VCgYDancQJkTUUroC021s8qizSktMDQJ",
                //blockNumber: 13567142,
            },
            mining: {
                auto: true,
                mempool: {
                    order: "fifo",
                },
            },
        },
    },
};
