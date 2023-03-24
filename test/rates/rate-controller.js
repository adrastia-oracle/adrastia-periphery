const { expect } = require("chai");
const { ethers } = require("hardhat");

const BigNumber = ethers.BigNumber;
const AddressZero = ethers.constants.AddressZero;

const ADMIN_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("ADMIN_ROLE"));
const ORACLE_UPDATER_MANAGER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("UPDATER_ADMIN_ROLE"));
const ORACLE_UPDATER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("ORACLE_UPDATER_ROLE"));
const RATE_ADMIN_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("RATE_ADMIN_ROLE"));
const UPDATE_PAUSE_ADMIN_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("UPDATE_PAUSE_ADMIN_ROLE"));

const GRT = "0xc944E90C64B2c07662A292be6244BDf05Cda44a7";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

const PERIOD = 100;
const INITIAL_BUFFER_CARDINALITY = 2;

// In this example, 1e18 = 100%
const DEFAULT_CONFIG = {
    maxIncrease: ethers.utils.parseUnits("0.02", 18), // 2%
    maxDecrease: ethers.utils.parseUnits("0.01", 18), // 1%
    base: ethers.utils.parseUnits("0.6", 18), // 60%
    componentWeights: [],
    components: [],
};

async function currentBlockTimestamp() {
    const currentBlockNumber = await ethers.provider.getBlockNumber();

    return await blockTimestamp(currentBlockNumber);
}

async function blockTimestamp(blockNum) {
    return (await ethers.provider.getBlock(blockNum)).timestamp;
}

describe("RateController#constructor", function () {
    var factory;

    beforeEach(async () => {
        factory = await ethers.getContractFactory("RateController");
    });

    const tests = [
        {
            period: 1,
            initialBufferCardinality: 1,
        },
        {
            period: 2,
            initialBufferCardinality: 1,
        },
        {
            period: 1,
            initialBufferCardinality: 2,
        },
    ];

    for (const test of tests) {
        it(
            "Should deploy with period " +
                test.period +
                " and initialBufferCardinality " +
                test.initialBufferCardinality,
            async function () {
                const rateController = await factory.deploy(test.period, test.initialBufferCardinality);

                expect(await rateController.period()).to.equal(test.period);
                expect(await rateController.getRatesCapacity(GRT)).to.equal(test.initialBufferCardinality);

                // Granularity should always be 1
                expect(await rateController.granularity()).to.equal(1);
            }
        );
    }
});

describe("RateController#push", function () {
    var controller;

    beforeEach(async () => {
        const controllerFactory = await ethers.getContractFactory("RateControllerStub");

        controller = await controllerFactory.deploy(PERIOD, INITIAL_BUFFER_CARDINALITY);
    });

    it("Should initialize the buffer if it hasn't been initialized", async function () {
        const pushTx = await controller.stubPush(USDC, 1, 1, 1);

        // Check that the buffer initialized event was emitted
        await expect(pushTx).to.emit(controller, "RatesCapacityInitialized").withArgs(USDC, INITIAL_BUFFER_CARDINALITY);
    });
});

describe("RateController#setUpdatesPaused", function () {
    var controller;

    beforeEach(async () => {
        const controllerFactory = await ethers.getContractFactory("RateControllerStub");

        controller = await controllerFactory.deploy(PERIOD, INITIAL_BUFFER_CARDINALITY);

        // Get our signer address
        const [signer] = await ethers.getSigners();

        // Grant all roles to the signer
        await controller.grantRole(ORACLE_UPDATER_MANAGER_ROLE, signer.address);
        await controller.grantRole(ORACLE_UPDATER_ROLE, signer.address);
        await controller.grantRole(RATE_ADMIN_ROLE, signer.address);
        await controller.grantRole(UPDATE_PAUSE_ADMIN_ROLE, signer.address);

        // Set config for GRT
        await controller.setConfig(GRT, DEFAULT_CONFIG);
    });

    it("Should revert if the caller does not have the UPDATE_PAUSE_ADMIN role", async function () {
        // Get the second signer
        const [, signer] = await ethers.getSigners();

        // Assign the signer all of the other roles
        await controller.grantRole(ORACLE_UPDATER_MANAGER_ROLE, signer.address);
        await controller.grantRole(ORACLE_UPDATER_ROLE, signer.address);
        await controller.grantRole(RATE_ADMIN_ROLE, signer.address);
        await controller.grantRole(ADMIN_ROLE, signer.address);

        // Format the signer's address to be lowercase
        const signerAddress = signer.address.toLowerCase();

        await expect(controller.connect(signer).setUpdatesPaused(GRT, true)).to.be.revertedWith(
            "AccessControl: account " + signerAddress + " is missing role " + UPDATE_PAUSE_ADMIN_ROLE
        );

        // Sanity check that we can successfully call the function if we have the role
        await controller.grantRole(UPDATE_PAUSE_ADMIN_ROLE, signer.address);
        await expect(controller.connect(signer).setUpdatesPaused(GRT, true)).to.not.be.reverted;
    });

    it("Should revert if the token is missing a config", async function () {
        await expect(controller.setUpdatesPaused(USDC, true)).to.be.revertedWith('MissingConfig("' + USDC + '")');

        // Sanity check that we can successfully call the function if we have the config
        await controller.setConfig(USDC, DEFAULT_CONFIG);
        await expect(controller.setUpdatesPaused(USDC, true)).to.not.be.reverted;
    });

    it("Should emit an event when the updates are paused", async function () {
        await expect(controller.setUpdatesPaused(GRT, true))
            .to.emit(controller, "PauseStatusChanged")
            .withArgs(GRT, true);

        // Sanity check that the changes were made
        expect(await controller.areUpdatesPaused(GRT)).to.equal(true);
    });

    it("Should emit an event when the updates are unpaused", async function () {
        await controller.setUpdatesPaused(GRT, true);

        await expect(controller.setUpdatesPaused(GRT, false))
            .to.emit(controller, "PauseStatusChanged")
            .withArgs(GRT, false);

        // Sanity check that the changes were made
        expect(await controller.areUpdatesPaused(GRT)).to.equal(false);
    });

    it("Should not emit an event when the update status is unchanged (paused = false)", async function () {
        await expect(controller.setUpdatesPaused(GRT, false)).to.not.emit(controller, "PauseStatusChanged");

        // Sanity check that the status is the same
        expect(await controller.areUpdatesPaused(GRT)).to.equal(false);
    });

    it("Should not emit an event when the update status is unchanged (paused = true)", async function () {
        await controller.setUpdatesPaused(GRT, true);

        // Sanity check that the changes were made
        expect(await controller.areUpdatesPaused(GRT)).to.equal(true);

        await expect(controller.setUpdatesPaused(GRT, true)).to.not.emit(controller, "PauseStatusChanged");

        // Sanity check that the status is the same
        expect(await controller.areUpdatesPaused(GRT)).to.equal(true);
    });
});

describe("RateController#setConfig", function () {
    var controller;

    var computer;

    beforeEach(async () => {
        const controllerFactory = await ethers.getContractFactory("RateControllerStub");

        controller = await controllerFactory.deploy(PERIOD, INITIAL_BUFFER_CARDINALITY);

        const computerFactory = await ethers.getContractFactory("RateComputerStub");

        computer = await computerFactory.deploy();

        await computer.deployed();

        // Get our signer address
        const [signer] = await ethers.getSigners();

        // Grant all roles to the signer
        await controller.grantRole(ORACLE_UPDATER_MANAGER_ROLE, signer.address);
        await controller.grantRole(ORACLE_UPDATER_ROLE, signer.address);
        await controller.grantRole(RATE_ADMIN_ROLE, signer.address);
        await controller.grantRole(UPDATE_PAUSE_ADMIN_ROLE, signer.address);
    });

    it("Should revert if the caller does not have the RATE_ADMIN role", async function () {
        // Get the second signer
        const [, signer] = await ethers.getSigners();

        // Assign the signer all of the other roles
        await controller.grantRole(ORACLE_UPDATER_MANAGER_ROLE, signer.address);
        await controller.grantRole(ORACLE_UPDATER_ROLE, signer.address);
        await controller.grantRole(UPDATE_PAUSE_ADMIN_ROLE, signer.address);
        await controller.grantRole(ADMIN_ROLE, signer.address);

        // Format the signer's address to be lowercase
        const signerAddress = signer.address.toLowerCase();

        await expect(controller.connect(signer).setConfig(GRT, DEFAULT_CONFIG)).to.be.revertedWith(
            "AccessControl: account " + signerAddress + " is missing role " + RATE_ADMIN_ROLE
        );

        // Sanity check that we can successfully call the function if we have the role
        await controller.grantRole(RATE_ADMIN_ROLE, signer.address);
        await expect(controller.connect(signer).setConfig(GRT, DEFAULT_CONFIG)).to.not.be.reverted;
    });

    it("Should revert if there's a component length mismatch (componentWeights.length = 1, components.length = 0)", async function () {
        const config = {
            maxIncrease: ethers.utils.parseUnits("0.02", 18), // 2%
            maxDecrease: ethers.utils.parseUnits("0.01", 18), // 1%
            base: ethers.utils.parseUnits("0.6", 18), // 60%
            componentWeights: [4000], // 40%
            components: [],
        };

        await expect(controller.setConfig(GRT, config)).to.be.revertedWith('InvalidConfig("' + GRT + '")');
    });

    it("Should revert if there's a component length mismatch (componentWeights.length = 0, components.length = 1)", async function () {
        const config = {
            maxIncrease: ethers.utils.parseUnits("0.02", 18), // 2%
            maxDecrease: ethers.utils.parseUnits("0.01", 18), // 1%
            base: ethers.utils.parseUnits("0.6", 18), // 60%
            componentWeights: [],
            components: [computer.address],
        };

        await expect(controller.setConfig(GRT, config)).to.be.revertedWith('InvalidConfig("' + GRT + '")');
    });

    it("Should revert if the sum of the component weights is greater than 10000 (with one component)", async function () {
        const config = {
            maxIncrease: ethers.utils.parseUnits("0.02", 18), // 2%
            maxDecrease: ethers.utils.parseUnits("0.01", 18), // 1%
            base: ethers.utils.parseUnits("0", 18), // 0%
            componentWeights: [10001],
            components: [computer.address],
        };

        await expect(controller.setConfig(GRT, config)).to.be.revertedWith('InvalidConfig("' + GRT + '")');
    });

    it("Should revert if the sum of the component weights is greater than 10000 (with two components)", async function () {
        const config = {
            maxIncrease: ethers.utils.parseUnits("0.02", 18), // 2%
            maxDecrease: ethers.utils.parseUnits("0.01", 18), // 1%
            base: ethers.utils.parseUnits("0", 18), // 0%
            componentWeights: [5000, 5001],
            components: [computer.address, computer.address],
        };

        await expect(controller.setConfig(GRT, config)).to.be.revertedWith('InvalidConfig("' + GRT + '")');
    });

    it("Should revert if a rate overflow is possible", async function () {
        const config = {
            maxIncrease: ethers.utils.parseUnits("0.02", 18), // 2%
            maxDecrease: ethers.utils.parseUnits("0.01", 18), // 1%
            base: BigNumber.from(1),
            componentWeights: [10000], // 100% of (2^64)-1
            components: [computer.address],
        };

        await expect(controller.setConfig(GRT, config)).to.be.revertedWith('InvalidConfig("' + GRT + '")');
    });

    it("Should revert when a component with the zero address is provided", async function () {
        const config = {
            maxIncrease: ethers.utils.parseUnits("0.02", 18), // 2%
            maxDecrease: ethers.utils.parseUnits("0.01", 18), // 1%
            base: BigNumber.from(1),
            componentWeights: [1],
            components: [AddressZero],
        };

        await expect(controller.setConfig(GRT, config)).to.be.revertedWith('InvalidConfig("' + GRT + '")');
    });

    it("Should revert when a component that doesn't implement ERC165 is provided", async function () {
        // Deploy a mock contract that doesn't implement ERC165
        const badComputer = await ethers.getContractFactory("BadRateComputerStub2");

        const badComputerInstance = await badComputer.deploy();
        await badComputerInstance.deployed();

        const config = {
            maxIncrease: ethers.utils.parseUnits("0.02", 18), // 2%
            maxDecrease: ethers.utils.parseUnits("0.01", 18), // 1%
            base: BigNumber.from(1),
            componentWeights: [1],
            components: [badComputerInstance.address],
        };

        await expect(controller.setConfig(GRT, config)).to.be.revertedWith('InvalidConfig("' + GRT + '")');
    });

    it("Should revert when a component that doesn't implement IRateComputer (ERC165) is provided", async function () {
        // Deploy a mock contract that doesn't implement ERC165
        const badComputer = await ethers.getContractFactory("BadRateComputerStub1");

        const badComputerInstance = await badComputer.deploy();
        await badComputerInstance.deployed();

        const config = {
            maxIncrease: ethers.utils.parseUnits("0.02", 18), // 2%
            maxDecrease: ethers.utils.parseUnits("0.01", 18), // 1%
            base: BigNumber.from(1),
            componentWeights: [1],
            components: [badComputerInstance.address],
        };

        await expect(controller.setConfig(GRT, config)).to.be.revertedWith('InvalidConfig("' + GRT + '")');
    });

    it("Should emit a RateConfigUpdated event if the config is valid", async function () {
        await expect(controller.setConfig(GRT, DEFAULT_CONFIG)).to.emit(controller, "RateConfigUpdated").withArgs(GRT);

        // Sanity check that the new config is set
        const newConfig = await controller.getConfig(GRT);
        expect(newConfig.maxIncrease).to.equal(DEFAULT_CONFIG.maxIncrease);
        expect(newConfig.maxDecrease).to.equal(DEFAULT_CONFIG.maxDecrease);
        expect(newConfig.base).to.equal(DEFAULT_CONFIG.base);
        expect(newConfig.componentWeights).to.deep.equal(DEFAULT_CONFIG.componentWeights);
        expect(newConfig.components).to.deep.equal(DEFAULT_CONFIG.components);
    });

    it("Should emit a RateConfigUpdated event if the config is valid and we call the function multiple times", async function () {
        await expect(controller.setConfig(GRT, DEFAULT_CONFIG)).to.emit(controller, "RateConfigUpdated").withArgs(GRT);
        await expect(controller.setConfig(GRT, DEFAULT_CONFIG)).to.emit(controller, "RateConfigUpdated").withArgs(GRT);

        // Sanity check that the new config is set
        const newConfig = await controller.getConfig(GRT);
        expect(newConfig.maxIncrease).to.equal(DEFAULT_CONFIG.maxIncrease);
        expect(newConfig.maxDecrease).to.equal(DEFAULT_CONFIG.maxDecrease);
        expect(newConfig.base).to.equal(DEFAULT_CONFIG.base);
        expect(newConfig.componentWeights).to.deep.equal(DEFAULT_CONFIG.componentWeights);
        expect(newConfig.components).to.deep.equal(DEFAULT_CONFIG.components);
    });

    it("Should initialize the buffers if the config is valid and it's the first time the config is being set", async function () {
        await expect(controller.setConfig(GRT, DEFAULT_CONFIG))
            .to.emit(controller, "RatesCapacityInitialized")
            .withArgs(GRT, INITIAL_BUFFER_CARDINALITY);

        // Sanity check that the new config is set
        const newConfig = await controller.getConfig(GRT);
        expect(newConfig.maxIncrease).to.equal(DEFAULT_CONFIG.maxIncrease);
        expect(newConfig.maxDecrease).to.equal(DEFAULT_CONFIG.maxDecrease);
        expect(newConfig.base).to.equal(DEFAULT_CONFIG.base);
        expect(newConfig.componentWeights).to.deep.equal(DEFAULT_CONFIG.componentWeights);
        expect(newConfig.components).to.deep.equal(DEFAULT_CONFIG.components);
    });

    it("Should not emit RatesCapacityInitialized if the config is valid but it's called for a second time", async function () {
        // Sanity check that the event is emitted the first time
        await expect(controller.setConfig(GRT, DEFAULT_CONFIG)).to.emit(controller, "RatesCapacityInitialized");

        await expect(controller.setConfig(GRT, DEFAULT_CONFIG)).to.not.emit(controller, "RatesCapacityInitialized");

        // Sanity check that the new config is set
        const newConfig = await controller.getConfig(GRT);
        expect(newConfig.maxIncrease).to.equal(DEFAULT_CONFIG.maxIncrease);
        expect(newConfig.maxDecrease).to.equal(DEFAULT_CONFIG.maxDecrease);
        expect(newConfig.base).to.equal(DEFAULT_CONFIG.base);
        expect(newConfig.componentWeights).to.deep.equal(DEFAULT_CONFIG.componentWeights);
        expect(newConfig.components).to.deep.equal(DEFAULT_CONFIG.components);
    });

    it("Should change the config if a new config is specified after being initially configured", async function () {
        await controller.setConfig(GRT, DEFAULT_CONFIG);

        // Sanity check that the new config is set
        const newConfig = await controller.getConfig(GRT);
        expect(newConfig.maxIncrease).to.equal(DEFAULT_CONFIG.maxIncrease);
        expect(newConfig.maxDecrease).to.equal(DEFAULT_CONFIG.maxDecrease);
        expect(newConfig.base).to.equal(DEFAULT_CONFIG.base);
        expect(newConfig.componentWeights).to.deep.equal(DEFAULT_CONFIG.componentWeights);
        expect(newConfig.components).to.deep.equal(DEFAULT_CONFIG.components);

        const secondConfig = {
            maxIncrease: ethers.utils.parseUnits("0.03", 18), // 3%
            maxDecrease: ethers.utils.parseUnits("0.04", 18), // 4%
            base: ethers.utils.parseUnits("0", 18), // 0%
            componentWeights: [10000],
            components: [computer.address],
        };

        await expect(controller.setConfig(GRT, secondConfig)).to.emit(controller, "RateConfigUpdated").withArgs(GRT);

        // Sanity check that the new config is set
        const newConfig2 = await controller.getConfig(GRT);
        expect(newConfig2.maxIncrease).to.equal(secondConfig.maxIncrease);
        expect(newConfig2.maxDecrease).to.equal(secondConfig.maxDecrease);
        expect(newConfig2.base).to.equal(secondConfig.base);
        expect(newConfig2.componentWeights).to.deep.equal(secondConfig.componentWeights);
        expect(newConfig2.components).to.deep.equal(secondConfig.components);
    });
});

describe("RateController#getConfig", function () {
    var controller;

    beforeEach(async () => {
        const controllerFactory = await ethers.getContractFactory("RateControllerStub");

        controller = await controllerFactory.deploy(PERIOD, INITIAL_BUFFER_CARDINALITY);

        // Get our signer address
        const [signer] = await ethers.getSigners();

        // Grant all roles to the signer
        await controller.grantRole(ORACLE_UPDATER_MANAGER_ROLE, signer.address);
        await controller.grantRole(ORACLE_UPDATER_ROLE, signer.address);
        await controller.grantRole(RATE_ADMIN_ROLE, signer.address);
        await controller.grantRole(UPDATE_PAUSE_ADMIN_ROLE, signer.address);

        // Set config for GRT
        await controller.setConfig(GRT, DEFAULT_CONFIG);
    });

    it("Should return the config for the specified asset", async function () {
        const config = await controller.getConfig(GRT);

        expect(config.maxIncrease).to.equal(DEFAULT_CONFIG.maxIncrease);
        expect(config.maxDecrease).to.equal(DEFAULT_CONFIG.maxDecrease);
        expect(config.base).to.equal(DEFAULT_CONFIG.base);
        expect(config.componentWeights).to.deep.equal(DEFAULT_CONFIG.componentWeights);
        expect(config.components).to.deep.equal(DEFAULT_CONFIG.components);
    });

    it("Should revert if the config is not set for the specified asset", async function () {
        await expect(controller.getConfig(USDC)).to.be.revertedWith("MissingConfig");
    });
});

describe("RateController#computeRate", function () {
    var controller;

    beforeEach(async () => {
        const controllerFactory = await ethers.getContractFactory("RateControllerStub");

        controller = await controllerFactory.deploy(PERIOD, INITIAL_BUFFER_CARDINALITY);

        // Get our signer address
        const [signer] = await ethers.getSigners();

        // Grant all roles to the signer
        await controller.grantRole(ORACLE_UPDATER_MANAGER_ROLE, signer.address);
        await controller.grantRole(ORACLE_UPDATER_ROLE, signer.address);
        await controller.grantRole(RATE_ADMIN_ROLE, signer.address);
        await controller.grantRole(UPDATE_PAUSE_ADMIN_ROLE, signer.address);

        // Set config for GRT
        await controller.setConfig(GRT, DEFAULT_CONFIG);
    });

    const tests = [
        {
            base: ethers.utils.parseUnits("0.05", 18), // 5%
            components: [ethers.utils.parseUnits("1.0", 18)], // 100%
            componentWeights: [1000], // 10%
        },
        {
            base: ethers.utils.parseUnits("0.05", 18), // 5%
            components: [],
            componentWeights: [],
        },
        {
            base: ethers.utils.parseUnits("1.0", 18), // 100%
            components: [],
            componentWeights: [],
        },
        {
            base: ethers.utils.parseUnits("0", 18), // 0%
            components: [],
            componentWeights: [],
        },
        {
            base: ethers.utils.parseUnits("0.05", 18), // 5%
            components: [ethers.utils.parseUnits("1.0", 18), ethers.utils.parseUnits("1.0", 18)], // 100%, 100%
            componentWeights: [1000, 1000], // 10%, 10%
        },
        {
            base: ethers.utils.parseUnits("0", 18), // 0%
            components: [ethers.utils.parseUnits("1.0", 18), ethers.utils.parseUnits("1.0", 18)], // 100%, 100%
            componentWeights: [1000, 1000], // 10%, 10%
        },
        {
            base: ethers.utils.parseUnits("0.05", 18), // 5%
            components: [ethers.utils.parseUnits("1.0", 18), ethers.utils.parseUnits("1.0", 18)], // 100%, 100%
            componentWeights: [2000, 1000], // 20%, 10%
        },
        {
            base: ethers.utils.parseUnits("0.05", 18), // 5%
            components: [ethers.utils.parseUnits("1.0", 18), ethers.utils.parseUnits("1.0", 18)], // 100%, 100%
            componentWeights: [1000, 2000], // 10%, 20%
        },
        {
            base: ethers.utils.parseUnits("0", 18), // 0%
            components: [ethers.utils.parseUnits("1.0", 18), ethers.utils.parseUnits("1.0", 18)], // 100%, 100%
            componentWeights: [2000, 1000], // 20%, 10%
        },
        {
            base: ethers.utils.parseUnits("0", 18), // 0%
            components: [ethers.utils.parseUnits("1.0", 18), ethers.utils.parseUnits("1.0", 18)], // 100%, 100%
            componentWeights: [1000, 2000], // 10%, 20%
        },
        {
            base: ethers.utils.parseUnits("0.5", 18), // 50%
            components: [ethers.utils.parseUnits("1.0", 18), ethers.utils.parseUnits("1.0", 18)], // 100%, 100%
            componentWeights: [2500, 2500], // 25%, 25%
        }, //

        {
            base: ethers.utils.parseUnits("0.05", 18), // 5%
            components: [ethers.utils.parseUnits("0.5", 18), ethers.utils.parseUnits("0.5", 18)], // 50%, 50%
            componentWeights: [1000, 1000], // 10%, 10%
        },
        {
            base: ethers.utils.parseUnits("0", 18), // 0%
            components: [ethers.utils.parseUnits("0.5", 18), ethers.utils.parseUnits("0.5", 18)], // 50%, 50%
            componentWeights: [1000, 1000], // 10%, 10%
        },
        {
            base: ethers.utils.parseUnits("0.05", 18), // 5%
            components: [ethers.utils.parseUnits("0.5", 18), ethers.utils.parseUnits("0.5", 18)], // 50%, 50%
            componentWeights: [2000, 1000], // 20%, 10%
        },
        {
            base: ethers.utils.parseUnits("0.05", 18), // 5%
            components: [ethers.utils.parseUnits("0.5", 18), ethers.utils.parseUnits("0.5", 18)], // 50%, 50%
            componentWeights: [1000, 2000], // 10%, 20%
        },
        {
            base: ethers.utils.parseUnits("0", 18), // 0%
            components: [ethers.utils.parseUnits("0.5", 18), ethers.utils.parseUnits("0.5", 18)], // 50%, 50%
            componentWeights: [2000, 1000], // 20%, 10%
        },
        {
            base: ethers.utils.parseUnits("0", 18), // 0%
            components: [ethers.utils.parseUnits("0.5", 18), ethers.utils.parseUnits("0.5", 18)], // 50%, 50%
            componentWeights: [1000, 2000], // 10%, 20%
        },
        {
            base: ethers.utils.parseUnits("0.5", 18), // 50%
            components: [ethers.utils.parseUnits("0.5", 18), ethers.utils.parseUnits("0.5", 18)], // 50%, 50%
            componentWeights: [2500, 2500], // 25%, 25%
        }, //
        {
            base: ethers.utils.parseUnits("0.05", 18), // 5%
            components: [ethers.utils.parseUnits("0", 18), ethers.utils.parseUnits("0", 18)], // 0%, 0%
            componentWeights: [1000, 1000], // 10%, 10%
        },
        {
            base: ethers.utils.parseUnits("0", 18), // 0%
            components: [ethers.utils.parseUnits("0", 18), ethers.utils.parseUnits("0", 18)], // 0%, 0%
            componentWeights: [1000, 1000], // 10%, 10%
        },
        {
            base: ethers.utils.parseUnits("0.05", 18), // 5%
            components: [ethers.utils.parseUnits("0", 18), ethers.utils.parseUnits("0", 18)], // 0%, 0%
            componentWeights: [2000, 1000], // 20%, 10%
        },
        {
            base: ethers.utils.parseUnits("0.05", 18), // 5%
            components: [ethers.utils.parseUnits("0", 18), ethers.utils.parseUnits("0", 18)], // 0%, 0%
            componentWeights: [1000, 2000], // 10%, 20%
        },
        {
            base: ethers.utils.parseUnits("0", 18), // 0%
            components: [ethers.utils.parseUnits("0", 18), ethers.utils.parseUnits("0", 18)], // 0%, 0%
            componentWeights: [2000, 1000], // 20%, 10%
        },
        {
            base: ethers.utils.parseUnits("0", 18), // 0%
            components: [ethers.utils.parseUnits("0", 18), ethers.utils.parseUnits("0", 18)], // 0%, 0%
            componentWeights: [1000, 2000], // 10%, 20%
        },
        {
            base: ethers.utils.parseUnits("0.5", 18), // 50%
            components: [ethers.utils.parseUnits("0", 18), ethers.utils.parseUnits("0", 18)], // 0%, 0%
            componentWeights: [2500, 2500], // 25%, 25%
        },
    ];

    function getRate(base, components, componentWeights) {
        var rate = base;
        for (var i = 0; i < components.length; ++i) {
            rate = rate.add(components[i].mul(componentWeights[i]).div(10000));
        }
        return rate;
    }

    for (var i = 0; i < tests.length; ++i) {
        const test = tests[i];

        const expectedRate = getRate(test.base, test.components, test.componentWeights);

        it(
            "Should compute the rate as " + ethers.utils.formatUnits(expectedRate, 18) + " (index " + i + ")",
            async function () {
                // Deploy the components
                const computerFactory = await ethers.getContractFactory("RateComputerStub");
                var componentContracts = [];
                for (var j = 0; j < test.components.length; ++j) {
                    const component = await computerFactory.deploy();

                    // Set the rate
                    await component.stubSetRate(GRT, test.components[j]);

                    componentContracts.push(component);
                }

                // Set the config
                const config = {
                    maxIncrease: ethers.utils.parseUnits("0.03", 18), // 3%
                    maxDecrease: ethers.utils.parseUnits("0.04", 18), // 4%
                    base: test.base,
                    components: componentContracts.map((c) => c.address),
                    componentWeights: test.componentWeights,
                };
                await controller.setConfig(GRT, config);

                // Compute the rate
                const rate = await controller.computeRate(GRT);

                // Check the rate
                expect(rate).to.equal(expectedRate);
            }
        );
    }

    it("Should return the base rate if no components are specified", async function () {
        const config = {
            maxIncrease: ethers.utils.parseUnits("0.03", 18), // 3%
            maxDecrease: ethers.utils.parseUnits("0.04", 18), // 4%
            base: ethers.utils.parseUnits("0.05", 18), // 5%
            componentWeights: [],
            components: [],
        };

        await controller.setConfig(GRT, config);

        const rate = await controller.computeRate(GRT);

        expect(rate).to.equal(config.base);
    });
});

describe("RateController#timeSinceLastUpdate", function () {
    var controller;

    beforeEach(async () => {
        const controllerFactory = await ethers.getContractFactory("RateControllerStub");

        controller = await controllerFactory.deploy(PERIOD, INITIAL_BUFFER_CARDINALITY);

        // Get our signer address
        const [signer] = await ethers.getSigners();

        // Grant all roles to the signer
        await controller.grantRole(ORACLE_UPDATER_MANAGER_ROLE, signer.address);
        await controller.grantRole(ORACLE_UPDATER_ROLE, signer.address);
        await controller.grantRole(RATE_ADMIN_ROLE, signer.address);
        await controller.grantRole(UPDATE_PAUSE_ADMIN_ROLE, signer.address);

        // Set config for GRT
        await controller.setConfig(GRT, DEFAULT_CONFIG);
    });

    it("Should return the current time if the rate has never been updated", async function () {
        const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

        const timeSinceLastUpdate = await controller.timeSinceLastUpdate(updateData);

        // Get the current time
        const now = await currentBlockTimestamp();

        expect(timeSinceLastUpdate).to.equal(now);
    });

    it("Should return the time since the rate was last updated", async function () {
        const updateTime = 10;

        // Push a new update
        await controller.stubPush(GRT, 1, 1, updateTime);

        const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

        // Get the time
        const timeSinceLastUpdate = await controller.timeSinceLastUpdate(updateData);

        // Get the current time
        const now = await currentBlockTimestamp();

        // Check the time
        expect(timeSinceLastUpdate).to.equal(now - updateTime);
    });
});

describe("RateController#lastUpdateTime", function () {
    var controller;

    beforeEach(async () => {
        const controllerFactory = await ethers.getContractFactory("RateControllerStub");

        controller = await controllerFactory.deploy(PERIOD, INITIAL_BUFFER_CARDINALITY);

        // Get our signer address
        const [signer] = await ethers.getSigners();

        // Grant all roles to the signer
        await controller.grantRole(ORACLE_UPDATER_MANAGER_ROLE, signer.address);
        await controller.grantRole(ORACLE_UPDATER_ROLE, signer.address);
        await controller.grantRole(RATE_ADMIN_ROLE, signer.address);
        await controller.grantRole(UPDATE_PAUSE_ADMIN_ROLE, signer.address);

        // Set config for GRT
        await controller.setConfig(GRT, DEFAULT_CONFIG);
    });

    it("Should return 0 if the rate has never been updated", async function () {
        const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

        const lastUpdateTime = await controller.lastUpdateTime(updateData);

        expect(lastUpdateTime).to.equal(0);
    });

    it("Should return the last update time", async function () {
        const updateTime = 10;

        // Push a new update
        await controller.stubPush(GRT, 1, 1, updateTime);

        const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

        const lastUpdateTime = await controller.lastUpdateTime(updateData);

        expect(lastUpdateTime).to.equal(updateTime);
    });
});

describe("RateController#canUpdate", function () {
    var controller;

    beforeEach(async () => {
        const controllerFactory = await ethers.getContractFactory("RateControllerStub");

        controller = await controllerFactory.deploy(PERIOD, INITIAL_BUFFER_CARDINALITY);

        // Get our signer address
        const [signer] = await ethers.getSigners();

        // Grant all roles to the signer
        await controller.grantRole(ORACLE_UPDATER_MANAGER_ROLE, signer.address);
        await controller.grantRole(ORACLE_UPDATER_ROLE, signer.address);
        await controller.grantRole(RATE_ADMIN_ROLE, signer.address);
        await controller.grantRole(UPDATE_PAUSE_ADMIN_ROLE, signer.address);

        // Set config for GRT
        await controller.setConfig(GRT, DEFAULT_CONFIG);
    });

    it("Should return false if it doesn't need an update", async function () {
        // needsUpdate should return false
        await controller.overrideNeedsUpdate(true, false);

        const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

        const canUpdate = await controller.canUpdate(updateData);

        expect(canUpdate).to.be.false;

        // Sanity check that it needs an update if we set needsUpdate to true
        await controller.overrideNeedsUpdate(true, true);
        expect(await controller.canUpdate(updateData)).to.be.true;
    });

    it("Can't update if we don't have the required role and the role is not open", async function () {
        // needsUpdate should return true
        await controller.overrideNeedsUpdate(true, true);

        // Get our signer address
        const [signer] = await ethers.getSigners();

        // Revoke the role from the signer
        await controller.revokeRole(ORACLE_UPDATER_ROLE, signer.address);
        // Revoke the role from everyone
        await controller.revokeRole(ORACLE_UPDATER_ROLE, AddressZero);

        const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

        const canUpdate = await controller.canUpdate(updateData);

        expect(canUpdate).to.be.false;

        // Sanity check that it can update if we have the role
        await controller.grantRole(ORACLE_UPDATER_ROLE, signer.address);
        expect(await controller.canUpdate(updateData)).to.be.true;
    });

    it("Can update if we have the required role and the role is not open", async function () {
        // needsUpdate should return true
        await controller.overrideNeedsUpdate(true, true);

        // Revoke the role from everyone
        await controller.revokeRole(ORACLE_UPDATER_ROLE, AddressZero);

        const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

        const canUpdate = await controller.canUpdate(updateData);

        expect(canUpdate).to.be.true;
    });

    it("Can update if we don't have the required role but the role is open", async function () {
        // needsUpdate should return true
        await controller.overrideNeedsUpdate(true, true);

        // Get our signer address
        const [signer] = await ethers.getSigners();

        // Revoke the role from the signer
        await controller.revokeRole(ORACLE_UPDATER_ROLE, signer.address);
        // Grant the role to everyone
        await controller.grantRole(ORACLE_UPDATER_ROLE, AddressZero);

        const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

        const canUpdate = await controller.canUpdate(updateData);

        expect(canUpdate).to.be.true;
    });
});

describe("RateController#needsUpdate", function () {
    var controller;

    beforeEach(async () => {
        const controllerFactory = await ethers.getContractFactory("RateControllerStub");

        controller = await controllerFactory.deploy(PERIOD, INITIAL_BUFFER_CARDINALITY);

        // Get our signer address
        const [signer] = await ethers.getSigners();

        // Grant all roles to the signer
        await controller.grantRole(ORACLE_UPDATER_MANAGER_ROLE, signer.address);
        await controller.grantRole(ORACLE_UPDATER_ROLE, signer.address);
        await controller.grantRole(RATE_ADMIN_ROLE, signer.address);
        await controller.grantRole(UPDATE_PAUSE_ADMIN_ROLE, signer.address);

        // Set config for GRT
        await controller.setConfig(GRT, DEFAULT_CONFIG);
    });

    it("Should return false if the rate buffer is uninitialized", async function () {
        const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [USDC]);

        const needsUpdate = await controller.needsUpdate(updateData);

        expect(needsUpdate).to.be.false;
    });

    it("Should return false if the update period hasn't passed", async function () {
        const currentTime = await currentBlockTimestamp();

        // Push a new update
        await controller.stubPush(GRT, 1, 1, currentTime);

        const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

        const needsUpdate = await controller.needsUpdate(updateData);

        expect(needsUpdate).to.be.false;
    });

    it("Should return false if updates are paused", async function () {
        // Pause updates
        await controller.setUpdatesPaused(GRT, true);

        const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

        const needsUpdate = await controller.needsUpdate(updateData);

        expect(needsUpdate).to.be.false;
    });

    it("Should return false if the update period has been passed but nothing will change", async function () {
        // Get the current rate
        const currentRate = await controller.computeRate(GRT);

        // Push INITIAL_BUFFER_CARDINALITY updates
        for (let i = 0; i < INITIAL_BUFFER_CARDINALITY; i++) {
            await controller.stubPush(GRT, currentRate, currentRate, 1);
        }

        const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

        const needsUpdate = await controller.needsUpdate(updateData);

        expect(needsUpdate).to.be.false;

        // Sanity check that it needs an update if the rate changes
        await controller.setConfig(GRT, { ...DEFAULT_CONFIG, base: DEFAULT_CONFIG.base + 1 });
        expect(await controller.needsUpdate(updateData)).to.be.true;
    });

    it("Should return true if it is ready for its first update", async function () {
        const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

        const needsUpdate = await controller.needsUpdate(updateData);

        expect(needsUpdate).to.be.true;
    });

    it("Should return true if the update period has been passed and the rate will change", async function () {
        // Get the current rate
        const currentRate = await controller.computeRate(GRT);

        // Push INITIAL_BUFFER_CARDINALITY updates
        for (let i = 0; i < INITIAL_BUFFER_CARDINALITY; i++) {
            await controller.stubPush(GRT, currentRate, currentRate, 1);
        }

        // Change the base
        await controller.setConfig(GRT, { ...DEFAULT_CONFIG, base: DEFAULT_CONFIG.base + 1 });

        const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

        const needsUpdate = await controller.needsUpdate(updateData);

        expect(needsUpdate).to.be.true;
    });

    it("Should return true if the update period has been passed and the target rate doesn't match the current rate", async function () {
        // Get the current rate
        const currentRate = await controller.computeRate(GRT);

        // Push INITIAL_BUFFER_CARDINALITY updates
        for (let i = 0; i < INITIAL_BUFFER_CARDINALITY; i++) {
            await controller.stubPush(GRT, currentRate + 1, currentRate, 1);
        }

        // Change the target
        await controller.setConfig(GRT, { ...DEFAULT_CONFIG, base: DEFAULT_CONFIG.base + 1 });

        const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

        const needsUpdate = await controller.needsUpdate(updateData);

        expect(needsUpdate).to.be.true;
    });
});

describe("RateController#update", function () {
    var controller;

    beforeEach(async () => {
        const controllerFactory = await ethers.getContractFactory("RateControllerStub");

        controller = await controllerFactory.deploy(PERIOD, INITIAL_BUFFER_CARDINALITY);

        // Get our signer address
        const [signer] = await ethers.getSigners();

        // Grant all roles to the signer
        await controller.grantRole(ORACLE_UPDATER_MANAGER_ROLE, signer.address);
        await controller.grantRole(ORACLE_UPDATER_ROLE, signer.address);
        await controller.grantRole(RATE_ADMIN_ROLE, signer.address);
        await controller.grantRole(UPDATE_PAUSE_ADMIN_ROLE, signer.address);

        // Set config for GRT
        await controller.setConfig(GRT, DEFAULT_CONFIG);
    });

    it("Reverts if the caller doesn't have the ORACLE_UPDATER_ROLE", async function () {
        // Get our signer address
        const [signer] = await ethers.getSigners();

        // Revoke the role from the signer
        await controller.revokeRole(ORACLE_UPDATER_ROLE, signer.address);
        // Revoke the role from everyone
        await controller.revokeRole(ORACLE_UPDATER_ROLE, AddressZero);

        const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

        await expect(controller.update(updateData)).to.be.revertedWith('MissingRole("' + ORACLE_UPDATER_ROLE + '")');
    });

    it("Works if the caller has the ORACLE_UPDATER_ROLE", async function () {
        // Get our signer address
        const [signer] = await ethers.getSigners();

        // Grant the role to the signer
        await controller.grantRole(ORACLE_UPDATER_ROLE, signer.address);
        // Revoke the role from everyone
        await controller.revokeRole(ORACLE_UPDATER_ROLE, AddressZero);

        const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

        await expect(controller.update(updateData)).to.not.be.reverted;
    });

    it("Works if the ORACLE_UPDATER_ROLE is open", async function () {
        // Get our signer address
        const [signer] = await ethers.getSigners();

        // Revoke the role from the signer
        await controller.revokeRole(ORACLE_UPDATER_ROLE, signer.address);
        // Grant the role to everyone
        await controller.grantRole(ORACLE_UPDATER_ROLE, AddressZero);

        const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

        await expect(controller.update(updateData)).to.not.be.reverted;
    });

    it("Returns false and doesn't update if it doesn't need an update", async function () {
        // needsUpdate should return false
        await controller.overrideNeedsUpdate(true, false);

        const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

        const updated = await controller.callStatic.update(updateData);
        expect(updated).to.be.false;

        await expect(controller.update(updateData)).to.not.emit(controller, "RateUpdated");

        expect(await controller.lastUpdateTime(updateData)).to.equal(0);
    });

    it("Returns true and updates if it needs an update", async function () {
        const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

        const updated = await controller.callStatic.update(updateData);
        expect(updated).to.be.true;

        // Sanity check that an update was performed
        await expect(controller.update(updateData)).to.emit(controller, "RateUpdated");
    });

    it("Sets the last update time to the current block timestamp", async function () {
        const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

        await controller.update(updateData);

        const currentTime = await currentBlockTimestamp();

        expect(await controller.lastUpdateTime(updateData)).to.equal(currentTime);
    });

    it("Immediately sets the rate to the target rate if the buffer is empty", async function () {
        const targetRate = await controller.computeRate(GRT);

        const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

        const updateTx = await controller.update(updateData);

        const currentTime = await currentBlockTimestamp();

        await expect(updateTx).to.emit(controller, "RateUpdated").withArgs(GRT, targetRate, targetRate, currentTime);

        const latestRate = await controller.getRateAt(GRT, 0);

        expect(latestRate.target).to.equal(targetRate);
        expect(latestRate.current).to.equal(targetRate);
        expect(latestRate.timestamp).to.equal(currentTime);
    });

    it("Rate increases are limited by the max rate increase", async function () {
        // Get the current rate
        const currentRate = await controller.computeRate(GRT);

        // Push INITIAL_BUFFER_CARDINALITY updates
        for (let i = 0; i < INITIAL_BUFFER_CARDINALITY; i++) {
            await controller.stubPush(GRT, currentRate, currentRate, 1);
        }

        const targetRate = DEFAULT_CONFIG.base.add(DEFAULT_CONFIG.maxIncrease.mul(3));

        // Change the target rate
        await controller.setConfig(GRT, {
            ...DEFAULT_CONFIG,
            base: targetRate,
        });

        const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

        const updateTx = await controller.update(updateData);

        const currentTime = await currentBlockTimestamp();

        const expectedCurrentRate = currentRate.add(DEFAULT_CONFIG.maxIncrease);

        await expect(updateTx)
            .to.emit(controller, "RateUpdated")
            .withArgs(GRT, targetRate, expectedCurrentRate, currentTime);

        const latestRate = await controller.getRateAt(GRT, 0);

        expect(latestRate.target).to.equal(targetRate);
        expect(latestRate.current).to.equal(expectedCurrentRate);
        expect(latestRate.timestamp).to.equal(currentTime);
    });

    it("Rate decreases are limited by the max rate decrease", async function () {
        // Get the current rate
        const currentRate = await controller.computeRate(GRT);

        // Push INITIAL_BUFFER_CARDINALITY updates
        for (let i = 0; i < INITIAL_BUFFER_CARDINALITY; i++) {
            await controller.stubPush(GRT, currentRate, currentRate, 1);
        }

        const targetRate = DEFAULT_CONFIG.base.sub(DEFAULT_CONFIG.maxDecrease.mul(3));

        // Change the target rate
        await controller.setConfig(GRT, {
            ...DEFAULT_CONFIG,
            base: targetRate,
        });

        const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

        const updateTx = await controller.update(updateData);

        const currentTime = await currentBlockTimestamp();

        const expectedCurrentRate = currentRate.sub(DEFAULT_CONFIG.maxDecrease);

        await expect(updateTx)
            .to.emit(controller, "RateUpdated")
            .withArgs(GRT, targetRate, expectedCurrentRate, currentTime);

        const latestRate = await controller.getRateAt(GRT, 0);

        expect(latestRate.target).to.equal(targetRate);
        expect(latestRate.current).to.equal(expectedCurrentRate);
        expect(latestRate.timestamp).to.equal(currentTime);
    });

    it("Rate increases by less than the max increase are okay", async function () {
        // Get the current rate
        const currentRate = await controller.computeRate(GRT);

        // Push INITIAL_BUFFER_CARDINALITY updates
        for (let i = 0; i < INITIAL_BUFFER_CARDINALITY; i++) {
            await controller.stubPush(GRT, currentRate, currentRate, 1);
        }

        const targetRate = DEFAULT_CONFIG.base.add(DEFAULT_CONFIG.maxIncrease.div(2));

        // Change the target rate
        await controller.setConfig(GRT, {
            ...DEFAULT_CONFIG,
            base: targetRate,
        });

        const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

        const updateTx = await controller.update(updateData);

        const currentTime = await currentBlockTimestamp();

        const expectedCurrentRate = targetRate;

        await expect(updateTx)
            .to.emit(controller, "RateUpdated")
            .withArgs(GRT, targetRate, expectedCurrentRate, currentTime);

        const latestRate = await controller.getRateAt(GRT, 0);

        expect(latestRate.target).to.equal(targetRate);
        expect(latestRate.current).to.equal(expectedCurrentRate);
        expect(latestRate.timestamp).to.equal(currentTime);
    });

    it("Rate decreases by less than the max decrease are okay", async function () {
        // Get the current rate
        const currentRate = await controller.computeRate(GRT);

        // Push INITIAL_BUFFER_CARDINALITY updates
        for (let i = 0; i < INITIAL_BUFFER_CARDINALITY; i++) {
            await controller.stubPush(GRT, currentRate, currentRate, 1);
        }

        const targetRate = DEFAULT_CONFIG.base.sub(DEFAULT_CONFIG.maxDecrease.div(2));

        // Change the target rate
        await controller.setConfig(GRT, {
            ...DEFAULT_CONFIG,
            base: targetRate,
        });

        const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

        const updateTx = await controller.update(updateData);

        const currentTime = await currentBlockTimestamp();

        const expectedCurrentRate = targetRate;

        await expect(updateTx)
            .to.emit(controller, "RateUpdated")
            .withArgs(GRT, targetRate, expectedCurrentRate, currentTime);

        const latestRate = await controller.getRateAt(GRT, 0);

        expect(latestRate.target).to.equal(targetRate);
        expect(latestRate.current).to.equal(expectedCurrentRate);
        expect(latestRate.timestamp).to.equal(currentTime);
    });

    it("Updates if the target rate equals the current rate and there are empty slots in the buffer", async function () {
        // Get the current rate
        const currentRate = await controller.computeRate(GRT);

        // Push only one rate so that there are more slots to fill
        await controller.stubPush(GRT, currentRate, currentRate, 1);
        // Sanity check that INITIAL_BUFFER_CARDINALITY is greater than 1
        expect(INITIAL_BUFFER_CARDINALITY).to.be.greaterThan(1);

        const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

        const updateTx = await controller.update(updateData);

        const currentTime = await currentBlockTimestamp();

        await expect(updateTx).to.emit(controller, "RateUpdated").withArgs(GRT, currentRate, currentRate, currentTime);

        const latestRate = await controller.getRateAt(GRT, 0);

        expect(latestRate.target).to.equal(currentRate);
        expect(latestRate.current).to.equal(currentRate);
        expect(latestRate.timestamp).to.equal(currentTime);
    });
});

describe("RateController - IHistoricalRates implementation", function () {
    var controller;

    beforeEach(async () => {
        const controllerFactory = await ethers.getContractFactory("RateControllerStub");

        controller = await controllerFactory.deploy(PERIOD, INITIAL_BUFFER_CARDINALITY);

        // Get our signer address
        const [signer] = await ethers.getSigners();

        // Grant all roles to the signer
        await controller.grantRole(ORACLE_UPDATER_MANAGER_ROLE, signer.address);
        await controller.grantRole(ORACLE_UPDATER_ROLE, signer.address);
        await controller.grantRole(RATE_ADMIN_ROLE, signer.address);
        await controller.grantRole(UPDATE_PAUSE_ADMIN_ROLE, signer.address);

        // Set config for GRT
        await controller.setConfig(GRT, DEFAULT_CONFIG);
    });

    describe("RateController#initializeBuffers", function () {
        it("Can't be called twice", async function () {
            await controller.stubInitializeBuffers(USDC);

            await expect(controller.stubInitializeBuffers(USDC)).to.be.revertedWith(
                'BufferAlreadyInitialized("' + USDC + '")'
            );
        });

        it("Emits the correct event", async function () {
            await expect(controller.stubInitializeBuffers(USDC))
                .to.emit(controller, "RatesCapacityInitialized")
                .withArgs(USDC, INITIAL_BUFFER_CARDINALITY);
        });
    });

    describe("RateController#setRatesCapacity", function () {
        it("Should revert if the caller does not have the ADMIN role", async function () {
            // Get the second signer
            const [, signer] = await ethers.getSigners();

            // Assign the signer all of the other roles
            await controller.grantRole(ORACLE_UPDATER_MANAGER_ROLE, signer.address);
            await controller.grantRole(ORACLE_UPDATER_ROLE, signer.address);
            await controller.grantRole(RATE_ADMIN_ROLE, signer.address);
            await controller.grantRole(UPDATE_PAUSE_ADMIN_ROLE, signer.address);

            // Format the signer's address to be lowercase
            const signerAddress = signer.address.toLowerCase();

            await expect(controller.connect(signer).setRatesCapacity(GRT, 2)).to.be.revertedWith(
                "AccessControl: account " + signerAddress + " is missing role " + ADMIN_ROLE
            );
        });

        it("Should revert if the token is missing a config", async function () {
            await expect(controller.setRatesCapacity(USDC, 2)).to.be.revertedWith('MissingConfig("' + USDC + '")');
        });

        it("Should revert if the amount is less than the existing capacity", async function () {
            await controller.setRatesCapacity(GRT, 4);

            await expect(controller.setRatesCapacity(GRT, 2)).to.be.revertedWith("CapacityCannotBeDecreased");
        });

        it("Should revert if the amount is 0", async function () {
            await expect(controller.setRatesCapacity(GRT, 0)).to.be.revertedWith("CapacityCannotBeDecreased");
        });

        it("Should revert if the amount is larger than the maximum capacity", async function () {
            await expect(controller.setRatesCapacity(GRT, 65536)).to.be.revertedWith("CapacityTooLarge");
        });

        it("Should emit an event when the capacity is changed", async function () {
            const amount = 20;

            const initialAmount = await controller.getRatesCapacity(GRT);

            // Sanity check that the new amount is greater than the initial amount
            expect(amount).to.be.greaterThan(initialAmount.toNumber());

            await expect(controller.setRatesCapacity(GRT, amount))
                .to.emit(controller, "RatesCapacityIncreased")
                .withArgs(GRT, initialAmount, amount);
        });

        it("Should not emit an event when the capacity is not changed (with default capacity)", async function () {
            const initialAmount = await controller.getRatesCapacity(GRT);

            await expect(controller.setRatesCapacity(GRT, initialAmount)).to.not.emit(
                controller,
                "RatesCapacityIncreased"
            );
        });

        it("Should not emit an event when the capacity is not changed (with non-default capacity)", async function () {
            const initialAmount = await controller.getRatesCapacity(GRT);
            const amount = 20;

            // Sanity check that the new amount is greater than the initial amount
            expect(amount).to.be.greaterThan(initialAmount.toNumber());

            await controller.setRatesCapacity(GRT, amount);

            // Sanity check that the capacity is now the new amount
            expect(await controller.getRatesCapacity(GRT)).to.equal(amount);

            // Try again to set it to the same amount
            await expect(controller.setRatesCapacity(GRT, amount)).to.not.emit(controller, "RatesCapacityIncreased");
        });

        it("Should update the capacity", async function () {
            const amount = 20;

            // Sanity check that the new amount is greater than the initial amount
            expect(amount).to.be.greaterThan((await controller.getRatesCapacity(GRT)).toNumber());

            await controller.setRatesCapacity(GRT, amount);

            expect(await controller.getRatesCapacity(GRT)).to.equal(amount);
        });

        it("Added capacity should not be filled until our latest rate is beside an uninitialized rate", async function () {
            const workingCapacity = 6;

            // Set the capacity to the working capacity
            await controller.setRatesCapacity(GRT, workingCapacity);

            // Push workingCapacity + 1 rates so that the buffer is full and the latest rate is at the start of the buffer
            for (let i = 0; i < workingCapacity + 1; ++i) {
                await controller.stubPush(GRT, 1, 1, 1);
            }

            // Sanity check that the buffer is full
            expect(await controller.getRatesCount(GRT)).to.equal(workingCapacity);

            // Increase the capacity by 1
            await controller.setRatesCapacity(GRT, workingCapacity + 1);

            // We should need to push workingCapacity rates before the new capacity is filled
            for (let i = 0; i < workingCapacity - 1; ++i) {
                await controller.stubPush(GRT, 1, 1, 1);

                // Sanity check that the buffer is still not full
                expect(await controller.getRatesCount(GRT)).to.equal(workingCapacity);
            }

            // Push one more rate. This should fill the new capacity
            await controller.stubPush(GRT, 1, 1, 1);

            // Check that the buffer is now full
            expect(await controller.getRatesCount(GRT)).to.equal(workingCapacity + 1);
        });
    });

    describe("RateController#getRatesCapacity", function () {
        it("Should return the default capacity when the buffer is uninitialized", async function () {
            const initialCapacity = await controller.stubInitialCardinality();

            expect(await controller.getRatesCapacity(USDC)).to.equal(initialCapacity);
        });

        it("Should return the capacity when the buffer is initialized", async function () {
            await controller.stubInitializeBuffers(USDC);

            const initialCapacity = await controller.stubInitialCardinality();

            expect(await controller.getRatesCapacity(USDC)).to.equal(initialCapacity);
        });

        it("Should return the capacity after the buffer has been resized", async function () {
            const amount = 20;

            // Sanity check that the new amount is greater than the initial amount
            expect(amount).to.be.greaterThan((await controller.getRatesCapacity(GRT)).toNumber());

            await controller.setRatesCapacity(GRT, amount);

            expect(await controller.getRatesCapacity(GRT)).to.equal(amount);
        });
    });

    describe("RateController#getRatesCount", function () {
        it("Should return 0 when the buffer is uninitialized", async function () {
            expect(await controller.getRatesCount(USDC)).to.equal(0);
        });

        it("Should return 0 when the buffer is initialized but empty", async function () {
            await controller.stubInitializeBuffers(USDC);

            expect(await controller.getRatesCount(USDC)).to.equal(0);
        });

        it("Increasing capacity should not change the rates count", async function () {
            const initialAmount = 4;

            await controller.setRatesCapacity(GRT, initialAmount);

            // Push 2 rates
            await controller.stubPush(GRT, 1, 1, 1);
            await controller.stubPush(GRT, 1, 1, 1);

            // Sanity check that the rates count is 2
            expect(await controller.getRatesCount(GRT)).to.equal(2);

            // Increase the capacity by 1
            await controller.setRatesCapacity(GRT, initialAmount + 1);

            // The rates count should still be 2
            expect(await controller.getRatesCount(GRT)).to.equal(2);
        });

        it("Should be limited by the capacity", async function () {
            const capacity = 6;

            await controller.setRatesCapacity(GRT, capacity);

            // Push capacity + 1 rates
            for (let i = 0; i < capacity + 1; ++i) {
                await controller.stubPush(GRT, 1, 1, 1);
            }

            // The rates count should be limited by the capacity
            expect(await controller.getRatesCount(GRT)).to.equal(capacity);
        });
    });

    describe("RateController#getRates(token, amount, offset, increment)", function () {
        it("Should return an empty array when amount is 0", async function () {
            // Push 1 rate
            await controller.stubPush(GRT, 1, 1, 1);

            const rates = await controller["getRates(address,uint256,uint256,uint256)"](GRT, 0, 0, 1);

            expect(rates.length).to.equal(0);
        });

        it("Should revert if the offset equals the number of rates", async function () {
            // Push 1 rate
            await controller.stubPush(GRT, 1, 1, 1);

            await expect(controller["getRates(address,uint256,uint256,uint256)"](GRT, 1, 1, 1)).to.be.revertedWith(
                "InsufficientData"
            );
        });

        it("Should revert if the offset equals the number of rates but is less than the capacity", async function () {
            const capacity = 6;

            await controller.setRatesCapacity(GRT, capacity);

            // Sanity check the capacity
            expect(await controller.getRatesCapacity(GRT)).to.equal(capacity);

            // Push 1 rate
            await controller.stubPush(GRT, 1, 1, 1);

            await expect(controller["getRates(address,uint256,uint256,uint256)"](GRT, 1, 1, 1)).to.be.revertedWith(
                "InsufficientData"
            );
        });

        it("Should revert if the amount exceeds the number of rates", async function () {
            // Push 1 rate
            await controller.stubPush(GRT, 1, 1, 1);

            await expect(controller["getRates(address,uint256,uint256,uint256)"](GRT, 2, 0, 1)).to.be.revertedWith(
                "InsufficientData"
            );
        });

        it("Should revert if the amount exceeds the number of rates but is less than the capacity", async function () {
            const capacity = 6;
            const amountToGet = 2;

            await controller.setRatesCapacity(GRT, capacity);

            // Sanity check the capacity
            expect(await controller.getRatesCapacity(GRT)).to.equal(capacity);

            // Push 1 rate
            await controller.stubPush(GRT, 1, 1, 1);

            // Sanity check that the amount to get is less than the capacity
            expect(amountToGet).to.be.lessThan(capacity);

            await expect(
                controller["getRates(address,uint256,uint256,uint256)"](GRT, amountToGet, 0, 1)
            ).to.be.revertedWith("InsufficientData");
        });

        it("Should revert if the amount and offset exceed the number of rates", async function () {
            const capacity = 2;
            const amountToGet = 2;

            await controller.setRatesCapacity(GRT, capacity);

            // Sanity check the capacity
            expect(await controller.getRatesCapacity(GRT)).to.equal(capacity);

            // Push 2 rate
            await controller.stubPush(GRT, 1, 1, 1);
            await controller.stubPush(GRT, 1, 1, 1);

            await expect(
                controller["getRates(address,uint256,uint256,uint256)"](GRT, amountToGet, 1, 1)
            ).to.be.revertedWith("InsufficientData");
        });

        it("Should revert if the amount and offset exceed the number of rates but is less than the capacity", async function () {
            const capacity = 6;
            const amountToGet = 2;

            await controller.setRatesCapacity(GRT, capacity);

            // Sanity check the capacity
            expect(await controller.getRatesCapacity(GRT)).to.equal(capacity);

            // Push 2 rate
            await controller.stubPush(GRT, 1, 1, 1);
            await controller.stubPush(GRT, 1, 1, 1);

            await expect(
                controller["getRates(address,uint256,uint256,uint256)"](GRT, amountToGet, 1, 1)
            ).to.be.revertedWith("InsufficientData");
        });

        it("Should revert if the increment and amount exceeds the number of rates", async function () {
            const capacity = 2;
            const amountToGet = 2;
            const offset = 0;
            const increment = 2;

            await controller.setRatesCapacity(GRT, capacity);

            // Sanity check the capacity
            expect(await controller.getRatesCapacity(GRT)).to.equal(capacity);

            // Push 2 rate
            await controller.stubPush(GRT, 1, 1, 1);
            await controller.stubPush(GRT, 1, 1, 1);

            await expect(
                controller["getRates(address,uint256,uint256,uint256)"](GRT, amountToGet, offset, increment)
            ).to.be.revertedWith("InsufficientData");
        });

        it("Should revert if the increment and amount exceeds the number of rates but is less than the capacity", async function () {
            const capacity = 6;
            const amountToGet = 2;
            const offset = 0;
            const increment = 2;

            await controller.setRatesCapacity(GRT, capacity);

            // Sanity check the capacity
            expect(await controller.getRatesCapacity(GRT)).to.equal(capacity);

            // Push 2 rate
            await controller.stubPush(GRT, 1, 1, 1);
            await controller.stubPush(GRT, 1, 1, 1);

            await expect(
                controller["getRates(address,uint256,uint256,uint256)"](GRT, amountToGet, offset, increment)
            ).to.be.revertedWith("InsufficientData");
        });

        it("Should revert if the increment, amount, and offset exceeds the number of rates", async function () {
            const capacity = 2;
            const amountToGet = 2;
            const offset = 1;
            const increment = 2;

            await controller.setRatesCapacity(GRT, capacity);

            // Sanity check the capacity
            expect(await controller.getRatesCapacity(GRT)).to.equal(capacity);

            // Push 3 rate
            await controller.stubPush(GRT, 1, 1, 1);
            await controller.stubPush(GRT, 1, 1, 1);
            await controller.stubPush(GRT, 1, 1, 1);

            await expect(
                controller["getRates(address,uint256,uint256,uint256)"](GRT, amountToGet, offset, increment)
            ).to.be.revertedWith("InsufficientData");
        });

        it("Should revert if the increment, amount, and offset exceeds the number of rates but is less than the capacity", async function () {
            const capacity = 6;
            const amountToGet = 2;
            const offset = 1;
            const increment = 2;

            await controller.setRatesCapacity(GRT, capacity);

            // Sanity check the capacity
            expect(await controller.getRatesCapacity(GRT)).to.equal(capacity);

            // Push 3 rate
            await controller.stubPush(GRT, 1, 1, 1);
            await controller.stubPush(GRT, 1, 1, 1);
            await controller.stubPush(GRT, 1, 1, 1);

            await expect(
                controller["getRates(address,uint256,uint256,uint256)"](GRT, amountToGet, offset, increment)
            ).to.be.revertedWith("InsufficientData");
        });

        it("Should return the latest rate many times when increment is 0", async function () {
            const capacity = 2;
            const amountToGet = 2;
            const offset = 0;
            const increment = 0;

            await controller.setRatesCapacity(GRT, capacity);

            // Sanity check the capacity
            expect(await controller.getRatesCapacity(GRT)).to.equal(capacity);

            // Push 2 rate
            await controller.stubPush(GRT, 1, 1, 1);
            await controller.stubPush(GRT, 2, 2, 2);

            const rates = await controller["getRates(address,uint256,uint256,uint256)"](
                GRT,
                amountToGet,
                offset,
                increment
            );

            expect(rates.length).to.equal(amountToGet);

            for (let i = 0; i < amountToGet; ++i) {
                expect(rates[i].target).to.equal(2);
                expect(rates[i].current).to.equal(2);
                expect(rates[i].timestamp).to.equal(2);
            }
        });

        async function pushAndCheckRates(capacity, amountToGet, offset, increment, ratesToPush) {
            await controller.setRatesCapacity(GRT, capacity);

            // Sanity check the capacity
            expect(await controller.getRatesCapacity(GRT)).to.equal(capacity);

            for (let i = 0; i < ratesToPush; i++) {
                await controller.stubPush(GRT, i, i, i);
            }

            // Sanity check the count
            expect(await controller.getRatesCount(GRT)).to.equal(Math.min(ratesToPush, capacity));

            const rates = await controller["getRates(address,uint256,uint256,uint256)"](
                GRT,
                amountToGet,
                offset,
                increment
            );

            expect(rates.length).to.equal(amountToGet);

            for (let i = 0; i < amountToGet; ++i) {
                // The latest rate is at index 0 and will have the highest expected values
                // The following rates will have the expected values decrementing by 1
                const expected = ratesToPush - i * increment - 1 - offset;

                expect(rates[i].target).to.equal(expected);
                expect(rates[i].current).to.equal(expected);
                expect(rates[i].timestamp).to.equal(expected);
            }
        }

        describe("An increment of 1", function () {
            describe("An offset of 0", function () {
                describe("The latest rate is at index 0", function () {
                    it("Should return the rates in order", async function () {
                        const capacity = 6;
                        const amountToGet = 6;
                        const offset = 0;
                        const increment = 1;

                        // Push capacity + 1 rates so that the latest rate is at index 0
                        const ratesToPush = capacity + 1;

                        await pushAndCheckRates(capacity, amountToGet, offset, increment, ratesToPush);
                    });
                });

                describe("The latest rate is at index n-1", function () {
                    it("Should return the rates in order", async function () {
                        const capacity = 6;
                        const amountToGet = 6;
                        const offset = 0;
                        const increment = 1;

                        // Push capacity rates so that the latest rate is at index n-1
                        const ratesToPush = capacity;

                        await pushAndCheckRates(capacity, amountToGet, offset, increment, ratesToPush);
                    });
                });
            });

            describe("An offset of 1", function () {
                describe("The latest rate is at index 0", function () {
                    it("Should return the rates in order", async function () {
                        const capacity = 6;
                        const amountToGet = 5;
                        const offset = 1;
                        const increment = 1;

                        // Push capacity + 1 rates so that the latest rate is at index 0
                        const ratesToPush = capacity + 1;

                        await pushAndCheckRates(capacity, amountToGet, offset, increment, ratesToPush);
                    });
                });

                describe("The latest rate is at index n-1", function () {
                    it("Should return the rates in order", async function () {
                        const capacity = 6;
                        const amountToGet = 5;
                        const offset = 1;
                        const increment = 1;

                        // Push capacity rates so that the latest rate is at index n-1
                        const ratesToPush = capacity;

                        await pushAndCheckRates(capacity, amountToGet, offset, increment, ratesToPush);
                    });
                });
            });
        });

        describe("An increment of 2", function () {
            describe("An offset of 0", function () {
                describe("The latest rate is at index 0", function () {
                    it("Should return the rates in order", async function () {
                        const capacity = 6;
                        const amountToGet = 3;
                        const offset = 0;
                        const increment = 2;

                        // Push capacity + 1 rates so that the latest rate is at index 0
                        const ratesToPush = capacity + 1;

                        await pushAndCheckRates(capacity, amountToGet, offset, increment, ratesToPush);
                    });
                });

                describe("The latest rate is at index n-1", function () {
                    it("Should return the rates in order", async function () {
                        const capacity = 6;
                        const amountToGet = 3;
                        const offset = 0;
                        const increment = 2;

                        // Push capacity rates so that the latest rate is at index n-1
                        const ratesToPush = capacity;

                        await pushAndCheckRates(capacity, amountToGet, offset, increment, ratesToPush);
                    });
                });
            });

            describe("An offset of 1", function () {
                describe("The latest rate is at index 0", function () {
                    it("Should return the rates in order", async function () {
                        const capacity = 6;
                        const amountToGet = 2;
                        const offset = 1;
                        const increment = 2;

                        // Push capacity + 1 rates so that the latest rate is at index 0
                        const ratesToPush = capacity + 1;

                        await pushAndCheckRates(capacity, amountToGet, offset, increment, ratesToPush);
                    });
                });

                describe("The latest rate is at index n-1", function () {
                    it("Should return the rates in order", async function () {
                        const capacity = 6;
                        const amountToGet = 2;
                        const offset = 1;
                        const increment = 2;

                        // Push capacity rates so that the latest rate is at index n-1
                        const ratesToPush = capacity;

                        await pushAndCheckRates(capacity, amountToGet, offset, increment, ratesToPush);
                    });
                });
            });
        });
    });

    describe("RateController#getRates(token, amount)", function () {
        async function pushAndCheckRates(capacity, amountToGet, offset, increment, ratesToPush) {
            await controller.setRatesCapacity(GRT, capacity);

            // Sanity check the capacity
            expect(await controller.getRatesCapacity(GRT)).to.equal(capacity);

            for (let i = 0; i < ratesToPush; i++) {
                await controller.stubPush(GRT, i, i, i);
            }

            // Sanity check the count
            expect(await controller.getRatesCount(GRT)).to.equal(Math.min(ratesToPush, capacity));

            const rates = await controller["getRates(address,uint256)"](GRT, amountToGet);

            expect(rates.length).to.equal(amountToGet);

            for (let i = 0; i < amountToGet; ++i) {
                // The latest rate is at index 0 and will have the highest expected values
                // The following rates will have the expected values decrementing by 1
                const expected = ratesToPush - i * increment - 1 - offset;

                expect(rates[i].target).to.equal(expected);
                expect(rates[i].current).to.equal(expected);
                expect(rates[i].timestamp).to.equal(expected);
            }
        }

        it("Default offset is 0 and increment is 1", async function () {
            const capacity = 6;
            const amountToGet = 6;

            // Push capacity rates so that the latest rate is at index n-1
            const ratesToPush = capacity;

            await pushAndCheckRates(capacity, amountToGet, 0, 1, ratesToPush);
        });
    });

    describe("RateController#getRateAt", function () {
        it("Should revert if the buffer is uninitialized", async function () {
            // Sanity check the rates count
            expect(await controller.getRatesCount(USDC)).to.equal(0);

            await expect(controller.getRateAt(USDC, 0)).to.be.revertedWith("InvalidIndex");
        });

        it("Should revert if the buffer is initialized but empty", async function () {
            await controller.stubInitializeBuffers(USDC);

            // Sanity check the rates count
            expect(await controller.getRatesCount(USDC)).to.equal(0);

            await expect(controller.getRateAt(USDC, 0)).to.be.revertedWith("InvalidIndex");
        });

        it("Should revert if the index exceeds the number of rates with a full buffer", async function () {
            const capacity = 6;

            await controller.setRatesCapacity(GRT, capacity);

            // Push capacity rates
            for (let i = 0; i < capacity; ++i) {
                await controller.stubPush(GRT, 1, 1, 1);
            }

            // Sanity check the rates count
            expect(await controller.getRatesCount(GRT)).to.equal(capacity);

            await expect(controller.getRateAt(GRT, capacity)).to.be.revertedWith("InvalidIndex");
        });

        it("Should revert if the index exceeds the number of rates but is within the capacity", async function () {
            const capacity = 6;

            await controller.setRatesCapacity(GRT, capacity);

            // Push capacity - 1 rates
            for (let i = 0; i < capacity - 1; ++i) {
                await controller.stubPush(GRT, 1, 1, 1);
            }

            // Sanity check the rates count
            expect(await controller.getRatesCount(GRT)).to.equal(capacity - 1);

            await expect(controller.getRateAt(GRT, capacity - 1)).to.be.revertedWith("InvalidIndex");
        });

        it("Should return the latest rate when index = 0", async function () {
            await controller.setRatesCapacity(GRT, 2);

            // Push capacity rates
            await controller.stubPush(GRT, 1, 1, 1);
            await controller.stubPush(GRT, 2, 2, 2);

            // Sanity check the rates count
            expect(await controller.getRatesCount(GRT)).to.equal(2);

            const rate = await controller.getRateAt(GRT, 0);

            expect(rate.target).to.equal(2);
            expect(rate.current).to.equal(2);
            expect(rate.timestamp).to.equal(2);
        });

        it("Should return the latest rate when index = 0 and the start was just overwritten", async function () {
            await controller.setRatesCapacity(GRT, 2);

            // Push capacity + 1 rates
            await controller.stubPush(GRT, 1, 1, 1);
            await controller.stubPush(GRT, 2, 2, 2);
            await controller.stubPush(GRT, 3, 3, 3);

            // Sanity check the rates count
            expect(await controller.getRatesCount(GRT)).to.equal(2);

            const rate = await controller.getRateAt(GRT, 0);

            expect(rate.target).to.equal(3);
            expect(rate.current).to.equal(3);
            expect(rate.timestamp).to.equal(3);
        });

        it("Should return the correct rate when index = 1 and the latest rate is at the start of the buffer", async function () {
            await controller.setRatesCapacity(GRT, 2);

            // Push capacity + 1 rates
            await controller.stubPush(GRT, 1, 1, 1);
            await controller.stubPush(GRT, 2, 2, 2);
            await controller.stubPush(GRT, 3, 3, 3);

            // Sanity check the rates count
            expect(await controller.getRatesCount(GRT)).to.equal(2);

            const rate = await controller.getRateAt(GRT, 1);

            expect(rate.target).to.equal(2);
            expect(rate.current).to.equal(2);
            expect(rate.timestamp).to.equal(2);
        });

        it("Should return the correct rate when index = 1 and the latest rate is at the end of the buffer", async function () {
            await controller.setRatesCapacity(GRT, 2);

            // Push capacity rates
            await controller.stubPush(GRT, 1, 1, 1);
            await controller.stubPush(GRT, 2, 2, 2);

            // Sanity check the rates count
            expect(await controller.getRatesCount(GRT)).to.equal(2);

            const rate = await controller.getRateAt(GRT, 1);

            expect(rate.target).to.equal(1);
            expect(rate.current).to.equal(1);
            expect(rate.timestamp).to.equal(1);
        });
    });
});

describe("RateController#supportsInterface", function () {
    var controller;
    var interfaceIds;

    beforeEach(async () => {
        const controllerFactory = await ethers.getContractFactory("RateControllerStub");

        controller = await controllerFactory.deploy(PERIOD, INITIAL_BUFFER_CARDINALITY);

        const interfaceIdsFactory = await ethers.getContractFactory("InterfaceIds");
        interfaceIds = await interfaceIdsFactory.deploy();
    });

    it("Should support IAccessControl", async () => {
        const interfaceId = await interfaceIds.iAccessControl();
        expect(await controller["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
    });

    it("Should support IAccessControlEnumerable", async () => {
        const interfaceId = await interfaceIds.iAccessControlEnumerable();
        expect(await controller["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
    });

    it("Should support IERC165", async () => {
        const interfaceId = await interfaceIds.iERC165();
        expect(await controller["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
    });

    it("Should support IUpdateable", async () => {
        const interfaceId = await interfaceIds.iUpdateable();
        expect(await controller["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
    });

    it("Should support IPeriodic", async () => {
        const interfaceId = await interfaceIds.iPeriodic();
        expect(await controller["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
    });

    it("Should support IHistoricalRates", async () => {
        const interfaceId = await interfaceIds.iHistoricalRates();
        expect(await controller["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
    });

    it("Should support IRateComputer", async () => {
        const interfaceId = await interfaceIds.iRateComputer();
        expect(await controller["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
    });
});