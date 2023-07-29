const hre = require("hardhat");

const RATE_ADMIN_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("RATE_ADMIN_ROLE"));

// The type of market to compute the rate for
const BORROW = "Borrow";
const SUPPLY = "Supply";

async function main() {
    // Replace this address with the address of the Aave Lending Pool on your desired network
    const lendingPoolAddress = "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2"; // v3 mainnet
    // Replace this address with the address of the token you want to compute the rate for
    const token = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"; // WETH
    // 1x scalar
    const oneXScalar = ethers.BigNumber.from(10).pow(6);
    // Aave version
    const aaveVersion = 3;
    // The type of market to compute the rate for (BORROW or SUPPLY)
    const type = SUPPLY;

    // The config to set for the token
    const maxRate = ethers.BigNumber.from(2).pow(64).sub(1);
    const minRate = ethers.BigNumber.from(0);
    const offset = ethers.BigNumber.from(0);
    const scalar = oneXScalar;

    const [deployer] = await hre.ethers.getSigners();

    const contractName = "AaveV" + aaveVersion + type + "MutationComputer";

    console.log("Deploying " + contractName + " with account:", deployer.address);

    const computerFactory = await hre.ethers.getContractFactory(contractName);
    const computer = await computerFactory.deploy(oneXScalar, 18, 0, lendingPoolAddress);

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
