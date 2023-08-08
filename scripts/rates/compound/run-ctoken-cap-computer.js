const hre = require("hardhat");

const RATE_ADMIN_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("RATE_ADMIN_ROLE"));

// Compound v2 cToken addresses
const cAAVE = "0xe65cdB6479BaC1e22340E4E755fAE7E509EcD06c"; // underlying decimals = 18
const cDAI = "0x5d3a536E4D6DbD6114cc1Ead35777bAB948E3643"; // underlying decimals = 18
const cETH = "0x4Ddc2D193948926D02f9B1fE9e1daa0718270ED5"; // underlying decimals = 18 (but doesn't use cERC20)
const cUSDC = "0x39AA39c021dfbaE8faC545936693aC917d5E7563"; // underlying decimals = 6

// Contract types
const BORROW = "CTokenBorrowMutationComputer";
const SUPPLY = "CTokenSupplyMutationComputer";

async function main() {
    // Replace this address with the address the cToken you want to compute the rate for
    const token = cUSDC; // cETH (v2 mainnet)
    // 1x scalar
    const oneXScalar = ethers.BigNumber.from(10).pow(6);

    // The config to set for the token
    const maxRate = ethers.BigNumber.from(2).pow(64).sub(1);
    const minRate = ethers.BigNumber.from(0);
    const offset = ethers.BigNumber.from(0);
    const scalar = oneXScalar;

    // Replace this with the contract that you want to deploy
    const contractName = BORROW;

    const [deployer] = await hre.ethers.getSigners();

    console.log("Deploying " + contractName + " with account:", deployer.address);

    const computerFactory = await hre.ethers.getContractFactory(contractName);
    const computer = await computerFactory.deploy(oneXScalar, 18, 0);

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
