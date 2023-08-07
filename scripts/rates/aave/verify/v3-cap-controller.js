const hre = require("hardhat");

const contractAddress = "0xd0F50989e14f022E24398eE13b1833373D452629";

const configEngine = "0x514eD25bBbf51811eBDFa42b150c4d6f0e2255B3";
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
