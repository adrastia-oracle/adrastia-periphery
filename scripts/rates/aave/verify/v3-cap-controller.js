const hre = require("hardhat");

const contractAddress = "0x8B2B7321FC5C5EA2d185c6fb2Bf526c043166891";

const configEngine = "0x7Edc9806dB4Cda54681cFe09D31d12341eafb675";
const forSupplyCaps = false;
const aclManager = "0x5f77FceAB2fdf1839f00453Ede3E884810F51146";
const period = 24 * 60 * 60; // 24 hours
const initialBufferCardinality = 1;
const updatersMustBeEoa = true;

async function main() {
    await hre.run("verify:verify", {
        contract: "contracts/rates/controllers/proto/aave/AaveCapController.sol:AaveCapController",
        address: contractAddress,
        constructorArguments: [
            configEngine,
            forSupplyCaps,
            aclManager,
            period,
            initialBufferCardinality,
            updatersMustBeEoa,
        ],
    });
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
