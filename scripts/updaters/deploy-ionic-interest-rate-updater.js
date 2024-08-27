const hre = require("hardhat");

const ethers = hre.ethers;

// COMP trollers
const MODE_COMPTROLLER = "0xfb3323e24743caf4add0fdccfb268565c0685556";

// Controllers
const MODE_CONTROLLER = "0x4B84b0973de669Bc1a9B1cf63bFdFEfD71503063";

async function main() {
    const comptroller = MODE_COMPTROLLER;
    const controller = MODE_CONTROLLER;

    const factory = await ethers.getContractFactory("IonicInterestRateUpdater");
    const updater = await factory.deploy(comptroller, controller);
    await updater.deployed();

    console.log("IonicInterestRateUpdater deployed to:", updater.address);

    // Sleep for 30 seconds.
    console.log("Waiting for 30 seconds...");

    await new Promise((resolve) => setTimeout(resolve, 30000));

    console.log("Verifying contract...");

    await hre.run("verify:verify", {
        contract: "contracts/updaters/IonicInterestRateUpdater.sol:IonicInterestRateUpdater",
        address: updater.address,
        constructorArguments: [comptroller, controller],
    });

    console.log("Done");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
