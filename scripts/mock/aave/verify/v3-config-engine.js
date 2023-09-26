const hre = require("hardhat");

const contractAddress = "0x7Edc9806dB4Cda54681cFe09D31d12341eafb675";

const aclManager = "0x5f77FceAB2fdf1839f00453Ede3E884810F51146";

async function main() {
    await hre.run("verify:verify", {
        contract: "contracts/test/aave/MockAaveV3ConfigEngine.sol:MockAaveV3ConfigEngine",
        address: contractAddress,
        constructorArguments: [aclManager],
    });
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
