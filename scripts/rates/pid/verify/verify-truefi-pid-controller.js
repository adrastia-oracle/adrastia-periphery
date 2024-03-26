const hre = require("hardhat");

const contractAddress = "0x258F6a00c813B52e8A5fc8E2F5A948b087F61699";

const period = 24 * 60 * 60; // 24 hours
const initialBufferCardinality = 2;
const updatersMustBeEoa = true;
const oracleAddress = "0x0E3612fcD04688f115D06F76848F9D7629F3f019";

async function main() {
    await hre.run("verify:verify", {
        contract: "contracts/rates/controllers/proto/truefi/TrueFiAlocPidController.sol:TrueFiAlocPidController",
        address: contractAddress,
        constructorArguments: [oracleAddress, period, initialBufferCardinality, updatersMustBeEoa],
    });
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
