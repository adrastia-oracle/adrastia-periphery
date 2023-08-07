const { expect } = require("chai");
const { BigNumber } = require("ethers");
const { ethers } = require("hardhat");

const GRT = "0xc944E90C64B2c07662A292be6244BDf05Cda44a7";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

const PERIOD = 100;
const INITIAL_BUFFER_CARDINALITY = 2;
const UPDATERS_MUST_BE_EOA = false;
const FOR_SUPPLY_CAPS = true;

const TWO_PERCENT_CHANGE = ethers.utils.parseUnits("0.02", 8);

const KEEP_CURRENT = ethers.constants.MaxUint256.sub(42);

const MAX_UINT_64 = BigNumber.from(2).pow(64).sub(1);

const DEFAULT_CONFIG = {
    max: MAX_UINT_64,
    min: ethers.constants.Zero,
    maxIncrease: MAX_UINT_64,
    maxDecrease: MAX_UINT_64,
    maxPercentIncrease: BigNumber.from(2).pow(32).sub(1),
    maxPercentDecrease: 10000,
    base: ethers.utils.parseUnits("0", 18),
    componentWeights: [],
    components: [],
};

// Credits: https://stackoverflow.com/questions/53311809/all-possible-combinations-of-a-2d-array-in-javascript
function combos(list, n = 0, result = [], current = []) {
    if (n === list.length) result.push(current);
    else list[n].forEach((item) => combos(list, n + 1, result, [...current, item]));

    return result;
}

describe("AaveCapController#constructor", function () {
    var factory;

    var configEngine;
    var aclManager;

    beforeEach(async () => {
        factory = await ethers.getContractFactory("AaveCapController");

        const [owner] = await ethers.getSigners();

        const aclManagerFactory = await ethers.getContractFactory("MockAaveACLManager");
        aclManager = await aclManagerFactory.deploy(owner.address, true);

        const configEngineFactory = await ethers.getContractFactory("MockAaveV3ConfigEngine");
        configEngine = await configEngineFactory.deploy(aclManager.address);

        await aclManager.deployed();
        await configEngine.deployed();
    });

    const testCombinations = [
        [1, 2], // period
        [1, 2], // initialBufferCardinality
        [false, true], // updatersMustBeEoa
        [false, true], // forSupplyCaps
    ];

    for (const test of combos(testCombinations)) {
        const period = test[0];
        const initialBufferCardinality = test[1];
        const updatersMustBeEoa = test[2];
        const forSupplyCaps = test[3];

        it(
            "Should deploy with period=" +
                period +
                ", initialBufferCardinality=" +
                initialBufferCardinality +
                ", updatersMustBeEoa=" +
                updatersMustBeEoa +
                ", forSupplyCaps=" +
                forSupplyCaps,
            async function () {
                const rateController = await factory.deploy(
                    configEngine.address,
                    forSupplyCaps,
                    aclManager.address,
                    period,
                    initialBufferCardinality,
                    updatersMustBeEoa
                );

                expect(await rateController.period()).to.equal(period);
                expect(await rateController.getRatesCapacity(GRT)).to.equal(initialBufferCardinality);
                expect(await rateController.updatersMustBeEoa()).to.equal(updatersMustBeEoa);

                // Granularity should always be 1
                expect(await rateController.granularity()).to.equal(1);

                expect(await rateController.aclManager()).to.equal(aclManager.address);
                expect(await rateController.configEngine()).to.equal(configEngine.address);
                expect(await rateController.forSupplyCaps()).to.equal(forSupplyCaps);
            }
        );
    }
});

describe("AaveCapController#setRatesCapacity", function () {
    var controller;

    var aclManager;
    var configEngine;

    beforeEach(async () => {
        // Get our signer address
        const [signer] = await ethers.getSigners();

        const aclManagerFactory = await ethers.getContractFactory("MockAaveACLManager");
        aclManager = await aclManagerFactory.deploy(signer.address, true);

        const configEngineFactory = await ethers.getContractFactory("MockAaveV3ConfigEngine");
        configEngine = await configEngineFactory.deploy(aclManager.address);

        await aclManager.deployed();
        await configEngine.deployed();

        const controllerFactory = await ethers.getContractFactory("AaveCapController");
        controller = await controllerFactory.deploy(
            configEngine.address,
            FOR_SUPPLY_CAPS,
            aclManager.address,
            PERIOD,
            INITIAL_BUFFER_CARDINALITY,
            UPDATERS_MUST_BE_EOA
        );

        await controller.setConfig(USDC, DEFAULT_CONFIG);
    });

    it("Should work if the caller has all roles", async function () {
        await expect(controller.setRatesCapacity(USDC, 10)).to.emit(controller, "RatesCapacityIncreased");
    });

    it("Should work if the caller doesn't have any role", async function () {
        const [, other] = await ethers.getSigners();

        await expect(controller.connect(other).setRatesCapacity(USDC, 10)).to.emit(
            controller,
            "RatesCapacityIncreased"
        );
    });
});

describe("AaveCapController#setChangeThreshold", function () {
    var controller;

    var aclManager;
    var configEngine;

    beforeEach(async () => {
        // Get our signer address
        const [signer] = await ethers.getSigners();

        const aclManagerFactory = await ethers.getContractFactory("MockAaveACLManager");
        aclManager = await aclManagerFactory.deploy(signer.address, true);

        const configEngineFactory = await ethers.getContractFactory("MockAaveV3ConfigEngine");
        configEngine = await configEngineFactory.deploy(aclManager.address);

        await aclManager.deployed();
        await configEngine.deployed();

        const controllerFactory = await ethers.getContractFactory("AaveCapController");
        controller = await controllerFactory.deploy(
            configEngine.address,
            FOR_SUPPLY_CAPS,
            aclManager.address,
            PERIOD,
            INITIAL_BUFFER_CARDINALITY,
            UPDATERS_MUST_BE_EOA
        );

        await controller.setConfig(USDC, DEFAULT_CONFIG);
    });

    it("Should work if the caller has all roles", async function () {
        await expect(controller.setChangeThreshold(USDC, TWO_PERCENT_CHANGE))
            .to.emit(controller, "ChangeThresholdUpdated")
            .withArgs(USDC, 0, TWO_PERCENT_CHANGE);

        expect(await controller.getChangeThreshold(USDC)).to.equal(TWO_PERCENT_CHANGE);
    });

    it("Should work if the caller has the pool admin role", async function () {
        const [, other] = await ethers.getSigners();

        await aclManager.addPoolAdmin(other.address);

        await expect(controller.connect(other).setChangeThreshold(USDC, TWO_PERCENT_CHANGE))
            .to.emit(controller, "ChangeThresholdUpdated")
            .withArgs(USDC, 0, TWO_PERCENT_CHANGE);

        expect(await controller.getChangeThreshold(USDC)).to.equal(TWO_PERCENT_CHANGE);
    });

    it("Should revert if the caller doesn't have any role", async function () {
        const [, other] = await ethers.getSigners();

        await expect(controller.connect(other).setChangeThreshold(USDC, TWO_PERCENT_CHANGE)).to.be.revertedWith(
            "NotAuthorized"
        );
    });

    it("Should work when the threshold changes to above zero then to zero", async function () {
        await expect(controller.setChangeThreshold(USDC, TWO_PERCENT_CHANGE))
            .to.emit(controller, "ChangeThresholdUpdated")
            .withArgs(USDC, 0, TWO_PERCENT_CHANGE);

        expect(await controller.getChangeThreshold(USDC)).to.equal(TWO_PERCENT_CHANGE);

        await expect(controller.setChangeThreshold(USDC, 0))
            .to.emit(controller, "ChangeThresholdUpdated")
            .withArgs(USDC, TWO_PERCENT_CHANGE, 0);

        expect(await controller.getChangeThreshold(USDC)).to.equal(0);
    });

    it("Should not emit an event if the threshold doesn't change", async function () {
        await expect(controller.setChangeThreshold(USDC, 0)).to.not.emit(controller, "ChangeThresholdUpdated");

        expect(await controller.getChangeThreshold(USDC)).to.equal(0);
    });
});

describe("AaveCapController#push", function () {
    var supplyController;
    var borrowController;

    var aclManager;
    var configEngine;

    beforeEach(async () => {
        // Get our signer address
        const [signer] = await ethers.getSigners();

        const aclManagerFactory = await ethers.getContractFactory("MockAaveACLManager");
        aclManager = await aclManagerFactory.deploy(signer.address, true);

        const configEngineFactory = await ethers.getContractFactory("MockAaveV3ConfigEngine");
        configEngine = await configEngineFactory.deploy(aclManager.address);

        await aclManager.deployed();
        await configEngine.deployed();

        const controllerFactory = await ethers.getContractFactory("AaveCapControllerStub");
        supplyController = await controllerFactory.deploy(
            configEngine.address,
            true, // is supply controller
            aclManager.address,
            PERIOD,
            INITIAL_BUFFER_CARDINALITY,
            UPDATERS_MUST_BE_EOA
        );
        borrowController = await controllerFactory.deploy(
            configEngine.address,
            false, // is borrow controller
            aclManager.address,
            PERIOD,
            INITIAL_BUFFER_CARDINALITY,
            UPDATERS_MUST_BE_EOA
        );

        await supplyController.setConfig(USDC, DEFAULT_CONFIG);
        await borrowController.setConfig(USDC, DEFAULT_CONFIG);

        await aclManager.addRiskAdmin(supplyController.address);
        await aclManager.addRiskAdmin(borrowController.address);
    });

    const tests = [BigNumber.from(0), BigNumber.from(1), BigNumber.from(2), ethers.utils.parseUnits("1", 9)];

    for (const test of tests) {
        it("Pushes supply cap of " + test.toString() + " to the config engine", async function () {
            const tx = await supplyController.stubPush(USDC, test, test, 1);

            await expect(tx).to.emit(supplyController, "RateUpdated");
            await expect(tx).to.emit(configEngine, "CapsUpdated").withArgs(USDC, test, KEEP_CURRENT);
        });

        it("Pushes borrow cap of " + test.toString() + " to the config engine", async function () {
            const tx = await borrowController.stubPush(USDC, test, test, 1);

            await expect(tx).to.emit(borrowController, "RateUpdated");
            await expect(tx).to.emit(configEngine, "CapsUpdated").withArgs(USDC, KEEP_CURRENT, test);
        });
    }
});

describe("AaveCapController#willAnythingChange", function () {
    var controller;

    var aclManager;
    var configEngine;

    const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [USDC]);

    beforeEach(async () => {
        // Get our signer address
        const [signer] = await ethers.getSigners();

        const aclManagerFactory = await ethers.getContractFactory("MockAaveACLManager");
        aclManager = await aclManagerFactory.deploy(signer.address, true);

        const configEngineFactory = await ethers.getContractFactory("MockAaveV3ConfigEngine");
        configEngine = await configEngineFactory.deploy(aclManager.address);

        await aclManager.deployed();
        await configEngine.deployed();

        const controllerFactory = await ethers.getContractFactory("AaveCapControllerStub");
        controller = await controllerFactory.deploy(
            configEngine.address,
            FOR_SUPPLY_CAPS,
            aclManager.address,
            PERIOD,
            INITIAL_BUFFER_CARDINALITY,
            UPDATERS_MUST_BE_EOA
        );

        await controller.setConfig(USDC, DEFAULT_CONFIG);

        await aclManager.addRiskAdmin(controller.address);
    });

    const tests = [
        {
            lastRate: 0,
            newRate: 1,
            changeThreshold: TWO_PERCENT_CHANGE,
            expected: true,
        },
        {
            lastRate: 1,
            newRate: 0,
            changeThreshold: TWO_PERCENT_CHANGE,
            expected: true,
        },
        {
            lastRate: 0,
            newRate: 0,
            changeThreshold: TWO_PERCENT_CHANGE,
            expected: false,
        },
        {
            lastRate: 1,
            newRate: 1,
            changeThreshold: TWO_PERCENT_CHANGE,
            expected: false,
        },
        {
            lastRate: 100,
            newRate: 101,
            changeThreshold: TWO_PERCENT_CHANGE,
            expected: false,
        },
        {
            lastRate: 101,
            newRate: 100,
            changeThreshold: TWO_PERCENT_CHANGE,
            expected: false,
        },
        {
            lastRate: 100,
            newRate: 102,
            changeThreshold: TWO_PERCENT_CHANGE,
            expected: true,
        },
        {
            lastRate: 102,
            newRate: 100,
            changeThreshold: TWO_PERCENT_CHANGE,
            expected: true,
        },
        {
            lastRate: 100,
            newRate: 103,
            changeThreshold: TWO_PERCENT_CHANGE,
            expected: true,
        },
        {
            lastRate: 103,
            newRate: 100,
            changeThreshold: TWO_PERCENT_CHANGE,
            expected: true,
        },
        {
            lastRate: 0,
            newRate: 0,
            changeThreshold: 0,
            expected: true,
        },
        {
            lastRate: 1,
            newRate: 1,
            changeThreshold: 0,
            expected: true,
        },
    ];

    for (const test of tests) {
        it(
            "Returns " +
                test.expected +
                " when lastRate is " +
                test.lastRate +
                ", newRate is " +
                test.newRate +
                ", and changeThreshold is " +
                ethers.utils.formatUnits(test.changeThreshold, 6) +
                "%",
            async function () {
                await controller.setChangeThreshold(USDC, test.changeThreshold);

                await controller.stubPush(USDC, test.lastRate, test.lastRate, 1);

                const newConfig = {
                    ...DEFAULT_CONFIG,
                    base: test.newRate,
                };

                await controller.setConfig(USDC, newConfig);

                const tx = await controller.stubWillAnythingChange(updateData);

                expect(tx).to.equal(test.expected);
            }
        );
    }

    const initialTests = [
        {
            newRate: 0,
            changeThreshold: TWO_PERCENT_CHANGE,
            expected: true,
        },
        {
            newRate: 1,
            changeThreshold: TWO_PERCENT_CHANGE,
            expected: true,
        },
        {
            newRate: MAX_UINT_64,
            changeThreshold: TWO_PERCENT_CHANGE,
            expected: true,
        },
        {
            newRate: 0,
            changeThreshold: 0,
            expected: true,
        },
        {
            newRate: 1,
            changeThreshold: 0,
            expected: true,
        },
        {
            newRate: MAX_UINT_64,
            changeThreshold: 0,
            expected: true,
        },
    ];

    for (const test of initialTests) {
        it(
            "Returns " +
                test.expected +
                " when the first rate (initial) is " +
                test.newRate +
                " and changeThreshold is " +
                ethers.utils.formatUnits(test.changeThreshold, 6) +
                "%",
            async function () {
                await controller.setChangeThreshold(USDC, test.changeThreshold);

                const newConfig = {
                    ...DEFAULT_CONFIG,
                    base: test.newRate,
                };

                await controller.setConfig(USDC, newConfig);

                const tx = await controller.stubWillAnythingChange(updateData);

                expect(tx).to.equal(test.expected);
            }
        );
    }
});

describe("AaveCapController#changeThresholdSurpassed", function () {
    var controller;

    beforeEach(async () => {
        const controllerFactory = await ethers.getContractFactory("AaveCapControllerStub");
        controller = await controllerFactory.deploy(
            ethers.constants.AddressZero,
            FOR_SUPPLY_CAPS,
            ethers.constants.AddressZero,
            PERIOD,
            INITIAL_BUFFER_CARDINALITY,
            UPDATERS_MUST_BE_EOA
        );
    });

    it("Returns true when the change is enormously large", async function () {
        const tx = await controller.stubChangeThresholdSurpassed(1, ethers.constants.MaxUint256, TWO_PERCENT_CHANGE);

        expect(tx).to.equal(true);
    });
});

describe("AaveCapController#supportsInterface", function () {
    var controller;
    var interfaceIds;

    beforeEach(async () => {
        const controllerFactory = await ethers.getContractFactory("AaveCapController");

        controller = await controllerFactory.deploy(
            ethers.constants.AddressZero,
            FOR_SUPPLY_CAPS,
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
