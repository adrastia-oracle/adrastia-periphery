const hre = require("hardhat");

const RATE_ADMIN_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("RATE_ADMIN_ROLE"));

// Mainnet comet addresses
const cometUSDC = "0xc3d688B66703497DAA19211EEdff47f25384cdc3";
const cometWETH = "0xA17581A9E3356d9A858b789D68B4d866e593aE94";

// Mainnet token addresses
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

// Contract types
const BORROW = "CometBorrowMutationComputer";
const SUPPLY = "CometSupplyMutationComputer";
const COLLATERAL = "CometCollateralMutationComputer";

async function main() {
    // Replace this address with the address of the Comet contract
    const comet = cometUSDC;
    // Replace this address with the address the token you want to compute the rate for
    const token = WETH;
    // 1x scalar
    const oneXScalar = ethers.BigNumber.from(10).pow(6);

    // The config to set for the token
    const maxRate = ethers.BigNumber.from(2).pow(64).sub(1);
    const minRate = ethers.BigNumber.from(0);
    const offset = ethers.BigNumber.from(0);
    const scalar = oneXScalar;

    // Replace this with the contract that you want to deploy
    const contractName = COLLATERAL;

    const [deployer] = await hre.ethers.getSigners();

    console.log("Deploying " + contractName + " with account:", deployer.address);

    const computerFactory = await hre.ethers.getContractFactory(contractName);
    const computer = await computerFactory.deploy(comet, oneXScalar, 18, 0);

    await computer.deployed();

    console.log(contractName + " deployed to:", computer.address);

    console.log("Granting RATE_ADMIN role to deployer...");

    // Grant the deployer the RATE_ADMIN role
    await computer.grantRole(RATE_ADMIN_ROLE, deployer.address);

    console.log("Setting config...");

    // Set the configuration for the token
    await computer.setConfig(token, maxRate, minRate, offset, scalar);

    // Get the current rate
    const rate = await computer.computeRate(token);

    console.log("Current rate for " + token + ":", ethers.utils.commify(rate.toString()));

    console.log("Done");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
