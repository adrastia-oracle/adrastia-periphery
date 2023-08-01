const hre = require("hardhat");

const ethers = hre.ethers;

// Supply cap controller: 0x76cD9e71cdbDbd96A9D34cAa20790e06dDE8a170
// Borrow cap controller: 0xd0F50989e14f022E24398eE13b1833373D452629

async function main() {
    const configEngine = "0x514eD25bBbf51811eBDFa42b150c4d6f0e2255B3";
    const forSupplyCaps = false;
    const aclManager = "0x5f77FceAB2fdf1839f00453Ede3E884810F51146";
    const period = 24 * 60 * 60; // 24 hours
    const initialBufferCardinality = 1;
    const updatersMustBeEoa = true;

    const contractName = "AaveCapController";

    const factory = await ethers.getContractFactory(contractName);
    const rateController = await factory.deploy(
        configEngine,
        forSupplyCaps,
        aclManager,
        period,
        initialBufferCardinality,
        updatersMustBeEoa
    );
    await rateController.deployed();

    console.log(contractName + " deployed to:", rateController.address);

    console.log("Done");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
