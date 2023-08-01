const hre = require("hardhat");

const contractAddress = "0x5f77FceAB2fdf1839f00453Ede3E884810F51146";

const admin = "0xec89a5dd6c179c345EA7996AA879E59cB18c8484"; // Adrastia Admin

const grantAdminAllRoles = true;

async function main() {
    await hre.run("verify:verify", {
        contract: "contracts/test/aave/MockAaveACLManager.sol:MockAaveACLManager",
        address: contractAddress,
        constructorArguments: [admin, grantAdminAllRoles],
    });
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
