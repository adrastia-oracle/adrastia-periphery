const { ethers } = require("hardhat");
const BigNumber = ethers.BigNumber;

const DEFAULT_CONFIG = {
    max: ethers.utils.parseUnits("1.0", 18), // 100%
    min: ethers.utils.parseUnits("0.0", 18), // 0%
    maxIncrease: ethers.utils.parseUnits("0.02", 18), // 2%
    maxDecrease: ethers.utils.parseUnits("0.01", 18), // 1%
    maxPercentIncrease: 10000, // 100%
    maxPercentDecrease: 10000, // 100%
    base: ethers.utils.parseUnits("0.6", 18), // 60%
    componentWeights: [],
    components: [],
};

const MAX_RATE = BigNumber.from(2).pow(64).sub(1);
const MIN_RATE = BigNumber.from(0);

const MAX_PERCENT_INCREASE = 2 ** 32 - 1;
const MAX_PERCENT_DECREASE = 10000;

const MAX_CONFIG = {
    max: MAX_RATE,
    min: MIN_RATE,
    maxIncrease: MAX_RATE,
    maxDecrease: MAX_RATE,
    maxPercentIncrease: MAX_PERCENT_INCREASE,
    maxPercentDecrease: MAX_PERCENT_DECREASE,
    base: ethers.constants.Zero,
    componentWeights: [],
    components: [],
};

module.exports = {
    DEFAULT_CONFIG,
    MAX_RATE,
    MIN_RATE,
    MAX_PERCENT_INCREASE,
    MAX_PERCENT_DECREASE,
    MAX_CONFIG,
};
