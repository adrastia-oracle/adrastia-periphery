const hre = require("hardhat");

const ethers = hre.ethers;

// Supply cap controller: 0xcD9B8Db8c0B097B043e8439684e0F3fB65b8b887
// Borrow cap controller: 0x8B2B7321FC5C5EA2d185c6fb2Bf526c043166891

async function main() {
    const configEngine = "0x7Edc9806dB4Cda54681cFe09D31d12341eafb675";
    const forSupplyCaps = true;
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
