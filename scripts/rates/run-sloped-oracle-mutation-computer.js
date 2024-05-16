const { ethers } = require("hardhat");
const { BigNumber } = ethers;

const AddressZero = ethers.constants.AddressZero;
const DATA_SLOT_LIQUIDITY_TOKEN = 2;
const RATE_ADMIN_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("RATE_ADMIN_ROLE"));
const MAX_RATE = BigNumber.from(2).pow(64).sub(1);

const token = "0x0000000000000000000000000000000000000100";

const oracleDecimals = 8;
const rateCalculationDecimals = oracleDecimals + 4;
const dataSlot = DATA_SLOT_LIQUIDITY_TOKEN;
const utilization = ethers.utils.parseUnits("1.0", oracleDecimals);

const rateDecimals = 4;
const rateAt100 = "0.1133";

// MutatedValueComputer - Config
const ONE_X_SCALAR = BigNumber.from(10).pow(9);
const max = MAX_RATE;
const min = ethers.constants.Zero;
const offset = ethers.constants.Zero;
const scalar = ONE_X_SCALAR.div(BigNumber.from(10).pow(rateCalculationDecimals - rateDecimals));

// SlopedOracleMutationComputer - SlopeConfig
const base = ethers.constants.Zero;
const baseSlope = ethers.constants.Zero;
const kink = ethers.utils.parseUnits("0.99", oracleDecimals);
const kinkSlope = ethers.utils
    .parseUnits(rateAt100, rateCalculationDecimals)
    .div(ethers.utils.parseUnits("1.0", oracleDecimals) - kink);

async function deployOracle() {
    const oracleFactory = await ethers.getContractFactory("MockOracle");
    const oracle = await oracleFactory.deploy(AddressZero, oracleDecimals);
    await oracle.deployed();

    return oracle;
}

async function deployComputer(oracle) {
    const computerFactory = await ethers.getContractFactory("ManagedSlopedOracleMutationComputer");
    const computer = await computerFactory.deploy(oracle.address, dataSlot, ONE_X_SCALAR, oracleDecimals);
    await computer.deployed();

    return computer;
}

async function configureOracle(oracle) {
    const timestamp = 1; // Ignored

    const price = ethers.constants.Zero;
    const tokenLiquidity = utilization;
    const quoteTokenLiquidity = ethers.constants.Zero;

    await oracle.stubSetObservation(token, price, tokenLiquidity, quoteTokenLiquidity, timestamp);
}

async function configureComputer(computer) {
    const [owner] = await ethers.getSigners();

    await computer.grantRole(RATE_ADMIN_ROLE, owner.address);

    console.log("Setting config");

    console.log(" - Max: " + max.toString());
    console.log(" - Min: " + min.toString());
    console.log(" - Offset: " + offset.toString());
    console.log(" - Scalar: " + scalar.toString());

    await computer.setConfig(token, max, min, offset, scalar);

    console.log("Config set");

    console.log("Setting slope config");

    console.log(" - Base: " + base.toString());
    console.log(" - Base Slope: " + baseSlope.toString());
    console.log(" - Kink: " + kink.toString());
    console.log(" - Kink Slope: " + kinkSlope.toString());

    await computer.setSlopeConfig(token, base, baseSlope, kink, kinkSlope);

    console.log("Slope config set");
}

async function main() {
    const oracle = await deployOracle();
    const computer = await deployComputer(oracle);

    await configureOracle(oracle);
    await configureComputer(computer);

    const rate = await computer.computeRate(token);

    const rateFormatted = ethers.utils.formatUnits(rate, rateDecimals - 2);
    const utilizationFormatted = ethers.utils.formatUnits(utilization, oracleDecimals - 2);

    console.log("Rate at " + utilizationFormatted + "% utilization: " + rateFormatted + "%");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
