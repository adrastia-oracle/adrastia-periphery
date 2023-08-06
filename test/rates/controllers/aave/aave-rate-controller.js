const { expect } = require("chai");
const { ethers } = require("hardhat");

const GRT = "0xc944E90C64B2c07662A292be6244BDf05Cda44a7";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

const PERIOD = 100;
const INITIAL_BUFFER_CARDINALITY = 2;
const UPDATERS_MUST_BE_EOA = false;

// In this example, 1e18 = 100%
const DEFAULT_CONFIG = {
    max: ethers.utils.parseUnits("1.0", 18), // 100%
    min: ethers.utils.parseUnits("0.0", 18), // 0%
    maxIncrease: ethers.utils.parseUnits("0.02", 18), // 2%
    maxDecrease: ethers.utils.parseUnits("0.01", 18), // 1%
    maxPercentIncrease: 10000, // 100%
    maxPercentDecrease: 10000, // 100%
    base: ethers.utils.parseUnits("0.6", 18), // 60%
    componentWeights: [],
    components: [],
};

describe("AaveRateController#constructor", function () {
    var factory;

    var aclManager;

    beforeEach(async () => {
        factory = await ethers.getContractFactory("AaveRateController");

        const [owner] = await ethers.getSigners();

        const aclManagerFactory = await ethers.getContractFactory("MockAaveACLManager");
        aclManager = await aclManagerFactory.deploy(owner.address, true);
        await aclManager.deployed();
    });

    const tests = [
        {
            period: 1,
            initialBufferCardinality: 1,
            updaterMustBeEoa: false,
        },
        {
            period: 2,
            initialBufferCardinality: 1,
            updaterMustBeEoa: false,
        },
        {
            period: 1,
            initialBufferCardinality: 2,
            updaterMustBeEoa: false,
        },
        {
            period: 1,
            initialBufferCardinality: 1,
            updaterMustBeEoa: true,
        },
        {
            period: 2,
            initialBufferCardinality: 1,
            updaterMustBeEoa: true,
        },
        {
            period: 1,
            initialBufferCardinality: 2,
            updaterMustBeEoa: true,
        },
    ];

    for (const test of tests) {
        it(
            "Should deploy with period " +
                test.period +
                ", initialBufferCardinality " +
                test.initialBufferCardinality +
                ", and updaterMustBeEoa " +
                test.updaterMustBeEoa,
            async function () {
                const rateController = await factory.deploy(
                    aclManager.address,
                    test.period,
                    test.initialBufferCardinality,
                    test.updaterMustBeEoa
                );

                expect(await rateController.period()).to.equal(test.period);
                expect(await rateController.getRatesCapacity(GRT)).to.equal(test.initialBufferCardinality);
                expect(await rateController.updatersMustBeEoa()).to.equal(test.updaterMustBeEoa);

                // Granularity should always be 1
                expect(await rateController.granularity()).to.equal(1);

                expect(await rateController.aclManager()).to.equal(aclManager.address);
            }
        );
    }
});

describe("AaveRateController#manuallyPushRate", function () {
    var controller;

    var aclManager;

    beforeEach(async () => {
        // Get our signer address
        const [signer] = await ethers.getSigners();

        const aclManagerFactory = await ethers.getContractFactory("MockAaveACLManager");
        aclManager = await aclManagerFactory.deploy(signer.address, true);
        await aclManager.deployed();

        const controllerFactory = await ethers.getContractFactory("AaveRateController");
        controller = await controllerFactory.deploy(
            aclManager.address,
            PERIOD,
            INITIAL_BUFFER_CARDINALITY,
            UPDATERS_MUST_BE_EOA
        );

        await controller.setConfig(USDC, DEFAULT_CONFIG);
    });

    it("Should work if the caller has all roles", async function () {
        await controller.manuallyPushRate(USDC, 1, 1, 1);
    });

    it("Should work if the caller has the pool admin role", async function () {
        const [, other] = await ethers.getSigners();

        await aclManager.addPoolAdmin(other.address);

        await controller.connect(other).manuallyPushRate(USDC, 1, 1, 1);
    });

    it("Should revert if the caller doesn't have any role", async function () {
        const [, other] = await ethers.getSigners();

        await expect(controller.connect(other).manuallyPushRate(USDC, 1, 1, 1)).to.be.revertedWith("NotAuthorized");
    });
});

describe("AaveRateController#setRatesCapacity", function () {
    var controller;

    var aclManager;

    beforeEach(async () => {
        // Get our signer address
        const [signer] = await ethers.getSigners();

        const aclManagerFactory = await ethers.getContractFactory("MockAaveACLManager");
        aclManager = await aclManagerFactory.deploy(signer.address, true);
        await aclManager.deployed();

        const controllerFactory = await ethers.getContractFactory("AaveRateController");
        controller = await controllerFactory.deploy(
            aclManager.address,
            PERIOD,
            INITIAL_BUFFER_CARDINALITY,
            UPDATERS_MUST_BE_EOA
        );

        await controller.setConfig(USDC, DEFAULT_CONFIG);
    });

    it("Should work if the caller has all roles", async function () {
        await controller.setRatesCapacity(USDC, 10);
    });

    it("Should work if the caller has the pool admin role", async function () {
        const [, other] = await ethers.getSigners();

        await aclManager.addPoolAdmin(other.address);

        await controller.connect(other).setRatesCapacity(USDC, 10);
    });

    it("Should revert if the caller doesn't have any role", async function () {
        const [, other] = await ethers.getSigners();

        await expect(controller.connect(other).setRatesCapacity(USDC, 10)).to.be.revertedWith("NotAuthorized");
    });
});

describe("AaveRateController#update", function () {
    var controller;

    var aclManager;

    const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [USDC]);

    beforeEach(async () => {
        // Get our signer address
        const [signer] = await ethers.getSigners();

        const aclManagerFactory = await ethers.getContractFactory("MockAaveACLManager");
        aclManager = await aclManagerFactory.deploy(signer.address, true);
        await aclManager.deployed();

        const controllerFactory = await ethers.getContractFactory("AaveRateController");
        controller = await controllerFactory.deploy(
            aclManager.address,
            PERIOD,
            INITIAL_BUFFER_CARDINALITY,
            UPDATERS_MUST_BE_EOA
        );

        await controller.setConfig(USDC, DEFAULT_CONFIG);
    });

    it("Should work if the caller has all roles", async function () {
        await expect(controller.update(updateData)).to.emit(controller, "RateUpdated");
    });

    it("Should work if the caller doesn't have any roles", async function () {
        const [, other] = await ethers.getSigners();

        await expect(controller.connect(other).update(updateData)).to.emit(controller, "RateUpdated");
    });
});

describe("AaveRateController#setUpdatesPaused", function () {
    var controller;

    var aclManager;

    beforeEach(async () => {
        // Get our signer address
        const [signer] = await ethers.getSigners();

        const aclManagerFactory = await ethers.getContractFactory("MockAaveACLManager");
        aclManager = await aclManagerFactory.deploy(signer.address, true);
        await aclManager.deployed();

        const controllerFactory = await ethers.getContractFactory("AaveRateController");
        controller = await controllerFactory.deploy(
            aclManager.address,
            PERIOD,
            INITIAL_BUFFER_CARDINALITY,
            UPDATERS_MUST_BE_EOA
        );

        await controller.setConfig(USDC, DEFAULT_CONFIG);
    });

    it("Should work if the caller has all roles", async function () {
        await expect(controller.setUpdatesPaused(USDC, true)).to.emit(controller, "PauseStatusChanged");
        await expect(controller.setUpdatesPaused(USDC, false)).to.emit(controller, "PauseStatusChanged");
    });

    it("Should work if the caller has the pool admin role", async function () {
        const [, other] = await ethers.getSigners();

        await aclManager.addPoolAdmin(other.address);

        await expect(controller.connect(other).setUpdatesPaused(USDC, true)).to.emit(controller, "PauseStatusChanged");
        await expect(controller.connect(other).setUpdatesPaused(USDC, false)).to.emit(controller, "PauseStatusChanged");
    });

    it("Should work if the caller has the emergency admin role", async function () {
        const [, other] = await ethers.getSigners();

        await aclManager.addEmergencyAdmin(other.address);

        await expect(controller.connect(other).setUpdatesPaused(USDC, true)).to.emit(controller, "PauseStatusChanged");
        await expect(controller.connect(other).setUpdatesPaused(USDC, false)).to.emit(controller, "PauseStatusChanged");
    });

    it("Should revert if the caller does not have any role", async function () {
        const [, other] = await ethers.getSigners();

        await expect(controller.connect(other).setUpdatesPaused(USDC, true)).to.be.revertedWith("NotAuthorized");
        await expect(controller.connect(other).setUpdatesPaused(USDC, false)).to.be.revertedWith("NotAuthorized");
    });
});

describe("AaveRateController#setConfig", function () {
    var controller;

    var aclManager;

    beforeEach(async () => {
        // Get our signer address
        const [signer] = await ethers.getSigners();

        const aclManagerFactory = await ethers.getContractFactory("MockAaveACLManager");
        aclManager = await aclManagerFactory.deploy(signer.address, true);
        await aclManager.deployed();

        const controllerFactory = await ethers.getContractFactory("AaveRateController");
        controller = await controllerFactory.deploy(
            aclManager.address,
            PERIOD,
            INITIAL_BUFFER_CARDINALITY,
            UPDATERS_MUST_BE_EOA
        );
    });

    it("Should work if the caller has all roles", async function () {
        await expect(controller.setConfig(USDC, DEFAULT_CONFIG)).to.emit(controller, "RateConfigUpdated");
    });

    it("Should work if the caller has the pool admin role", async function () {
        const [, other] = await ethers.getSigners();

        await aclManager.addPoolAdmin(other.address);

        await expect(controller.connect(other).setConfig(USDC, DEFAULT_CONFIG)).to.emit(
            controller,
            "RateConfigUpdated"
        );
    });

    it("Should revert if the caller does not have any role", async function () {
        const [, other] = await ethers.getSigners();

        await expect(controller.connect(other).setConfig(USDC, DEFAULT_CONFIG)).to.be.revertedWith("NotAuthorized");
    });
});

describe("AaveRateController#supportsInterface", function () {
    var controller;
    var interfaceIds;

    beforeEach(async () => {
        const controllerFactory = await ethers.getContractFactory("AaveRateController");

        controller = await controllerFactory.deploy(
            ethers.constants.AddressZero,
            PERIOD,
            INITIAL_BUFFER_CARDINALITY,
            UPDATERS_MUST_BE_EOA
        );

        const interfaceIdsFactory = await ethers.getContractFactory("InterfaceIds");
        interfaceIds = await interfaceIdsFactory.deploy();
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
