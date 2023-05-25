const hre = require("hardhat");

const ethers = hre.ethers;

const ADMIN_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("ADMIN_ROLE"));
const RATE_ADMIN_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("RATE_ADMIN_ROLE"));

async function tryGrantRole(contract, account, role) {
    console.log("Granting role", role, "to", account, "on", contract.address);

    const tx = await contract.grantRole(role, account);

    console.log("  - Tx hash", tx.hash);

    const receipt = await tx.wait();

    if (receipt.status === 0) {
        console.error("Failed to grant role", role, "to", account, "on", contract.address);
    }
}

async function tryRevokeRole(contract, account, role) {
    console.log("Revoking role", role, "to", account, "on", contract.address);

    const tx = await contract.revokeRole(role, account);

    console.log("  - Tx hash", tx.hash);

    const receipt = await tx.wait();

    if (receipt.status === 0) {
        console.error("Failed to revoke role", role, "to", account, "on", contract.address);
    }
}

async function main() {
    // START OF USER CONFIGURATION

    // Replace this address with the address of the Compound III Lending Pool on your desired network
    const lendingPoolAddress = "0xF25212E676D1F7F89Cd72fFEe66158f541246445"; // cUSDCv3 (Polygon PoS)
    // Replace this address with the address the token you want to compute the rate for
    const token = "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619"; // WETH (Polygon PoS)
    // 1x scalar
    const oneXScalar = ethers.BigNumber.from(10).pow(6);

    // The config to set for the token
    const maxRate = ethers.BigNumber.from(2).pow(64).sub(1);
    const minRate = ethers.BigNumber.from(0);
    const offset = ethers.BigNumber.from(100); // Add 100 WETH to the scaled rate
    const scalar = oneXScalar.add(oneXScalar.div(10)); // 1.1x scalar

    const availableContracts = [
        "CometSupplyMutationComputer", // [0]
        "CometBorrowMutationComputer", // [1]
        "CometCollateralMutationComputer", // [2]
    ];

    // Replace this with the contract that you want to deploy
    const contractName = availableContracts[2]; // CometCollateralMutationComputer

    const newAdmin = "0xec89a5dd6c179c345EA7996AA879E59cB18c8484"; // Adrastia Admin
    const assignAllRolesToAdmin = true;

    // END OF USER CONFIGURATION

    const [deployer] = await ethers.getSigners();

    console.log("Deploying " + contractName + " with account:", deployer.address);

    const computerFactory = await ethers.getContractFactory(contractName);
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

    if (newAdmin !== "") {
        console.log("Granting roles to the new admin...");

        await tryGrantRole(computer, newAdmin, ADMIN_ROLE);

        // Get our address
        const [deployer] = await ethers.getSigners();

        if (assignAllRolesToAdmin) {
            await tryGrantRole(computer, newAdmin, RATE_ADMIN_ROLE);
        }
        // Revoke the deployer's rate admin role
        await tryRevokeRole(computer, deployer.address, RATE_ADMIN_ROLE);

        // Revoke the deployer's admin role
        await tryRevokeRole(computer, deployer.address, ADMIN_ROLE);
    }

    console.log("Done");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
