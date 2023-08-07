const hre = require("hardhat");

const ethers = hre.ethers;

async function main() {
    const aclManager = "0x5f77FceAB2fdf1839f00453Ede3E884810F51146"; // Adrastia Admin

    const factory = await ethers.getContractFactory("MockAaveV3ConfigEngine");

    console.log("Deploying MockAaveV3ConfigEngine...");

    const configEngine = await factory.deploy(aclManager);
    await configEngine.deployed();

    console.log("MockAaveV3ConfigEngine deployed to:", configEngine.address);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
