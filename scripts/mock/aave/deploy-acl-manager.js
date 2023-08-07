const hre = require("hardhat");

const ethers = hre.ethers;

async function main() {
    const admin = "0xec89a5dd6c179c345EA7996AA879E59cB18c8484"; // Adrastia Admin

    const factory = await ethers.getContractFactory("MockAaveACLManager");

    console.log("Deploying MockAaveACLManager...");

    const aclManager = await factory.deploy(admin, true);
    await aclManager.deployed();

    console.log("MockAaveACLManager deployed to:", aclManager.address);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
