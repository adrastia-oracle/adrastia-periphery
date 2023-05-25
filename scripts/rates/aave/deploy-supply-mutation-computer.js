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

    // Replace this address with the address of the aToken you want to compute the rate for
    const token = "0xe50fA9b3c56FfB159cB0FCA61F5c9D750e8128c8"; // aPolWETH (v3 Polygon PoS)
    // 1x scalar
    const oneXScalar = ethers.BigNumber.from(10).pow(6);

    // The config to set for the token
    const maxRate = ethers.BigNumber.from(2).pow(64).sub(1);
    const minRate = ethers.BigNumber.from(0);
    const offset = ethers.BigNumber.from(100); // Add 100 WETH to the scaled rate
    const scalar = oneXScalar.add(oneXScalar.div(10)); // 1.1x scalar

    const newAdmin = "0xec89a5dd6c179c345EA7996AA879E59cB18c8484"; // Adrastia Admin
    const assignAllRolesToAdmin = true;

    // END OF USER CONFIGURATION

    const [deployer] = await ethers.getSigners();

    console.log("Deploying ATokenSupplyMutationComputer with account:", deployer.address);

    const ATokenSupplyMutationComputer = await ethers.getContractFactory("ATokenSupplyMutationComputer");
    const aTokenSupplyMutationComputer = await ATokenSupplyMutationComputer.deploy(oneXScalar, 18, 0);

    await aTokenSupplyMutationComputer.deployed();

    console.log("ATokenSupplyMutationComputer deployed to:", aTokenSupplyMutationComputer.address);

    console.log("Granting RATE_ADMIN role to deployer...");

    // Grant the deployer the RATE_ADMIN role
    await aTokenSupplyMutationComputer.grantRole(RATE_ADMIN_ROLE, deployer.address);

    console.log("Setting config...");

    // Set the configuration for the token
    await aTokenSupplyMutationComputer.setConfig(token, maxRate, minRate, offset, scalar);

    // Get the current rate
    const rate = await aTokenSupplyMutationComputer.computeRate(token);

    console.log("Current rate for " + token + ":", ethers.utils.commify(rate.toString()));

    if (newAdmin !== "") {
        console.log("Granting roles to the new admin...");

        await tryGrantRole(aTokenSupplyMutationComputer, newAdmin, ADMIN_ROLE);

        // Get our address
        const [deployer] = await ethers.getSigners();

        if (assignAllRolesToAdmin) {
            await tryGrantRole(aTokenSupplyMutationComputer, newAdmin, RATE_ADMIN_ROLE);
        }
        // Revoke the deployer's rate admin role
        await tryRevokeRole(aTokenSupplyMutationComputer, deployer.address, RATE_ADMIN_ROLE);

        // Revoke the deployer's admin role
        await tryRevokeRole(aTokenSupplyMutationComputer, deployer.address, ADMIN_ROLE);
    }

    console.log("Done");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
