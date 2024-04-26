const { ethers } = require("hardhat");

const BigNumber = ethers.BigNumber;

const DEFAULT_ONE_X_SCALAR = BigNumber.from(10).pow(6);

module.exports = {
    DEFAULT_ONE_X_SCALAR,
};
