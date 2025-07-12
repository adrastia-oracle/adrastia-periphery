const { expect } = require("chai");
const { keccak256, toUtf8Bytes, defaultAbiCoder } = require("ethers/lib/utils");
const { ethers, timeAndMine } = require("hardhat");
const { wrapHardhatProvider } = require("hardhat-tracer");

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
const UPDATERS_MUST_BE_EOA = false;
const COMPUTE_AHEAD = true;

const MAX_RATE = BigNumber.from(2).pow(64).sub(1);
const MIN_RATE = BigNumber.from(0);

const MAX_PERCENT_INCREASE = 2 ** 32 - 1;
const MAX_PERCENT_DECREASE = 10000;

const HOOK_TYPE_PRE_UPDATE = 0;
const HOOK_TYPE_POST_UPDATE = 1;

const CHANGE_THRESHOLD_DECIMALS = 8;

const TWO_PERCENT_CHANGE = ethers.utils.parseUnits("0.02", CHANGE_THRESHOLD_DECIMALS);

const MAX_UINT_64 = BigNumber.from(2).pow(64).sub(1);

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

const UNBOUNDED_CHANGE_CONFIG = {
    max: MAX_RATE,
    min: MIN_RATE,
    maxIncrease: MAX_RATE,
    maxDecrease: MAX_RATE,
    maxPercentIncrease: MAX_PERCENT_INCREASE,
    maxPercentDecrease: MAX_PERCENT_DECREASE,
    base: ethers.utils.parseUnits("0.6", 18), // 60%
    componentWeights: [],
    components: [],
};

const ZERO_CONFIG = {
    max: BigNumber.from(0),
    min: BigNumber.from(0),
    maxIncrease: BigNumber.from(0),
    maxDecrease: BigNumber.from(0),
    maxPercentIncrease: 0,
    maxPercentDecrease: 0,
    base: BigNumber.from(0),
    componentWeights: [],
    components: [],
};

const DEFAULT_PID_CONFIG = {
    inputAndErrorOracle: AddressZero,
    kPNumerator: -100,
    kPDenominator: 10_000,
    kINumerator: -100,
    kIDenominator: 10_000,
    kDNumerator: 0,
    kDDenominator: 10_000,
    transformer: AddressZero,
    proportionalOnMeasurement: false,
    derivativeOnMeasurement: false,
};

const DISABLED_HOOK_CONFIG = {
    allowHookFailure: false,
    hookGasLimit: BigNumber.from(0),
    hookAddress: AddressZero,
};

async function currentBlockTimestamp() {
    const currentBlockNumber = await ethers.provider.getBlockNumber();

    return await blockTimestamp(currentBlockNumber);
}

async function blockTimestamp(blockNum) {
    return (await ethers.provider.getBlock(blockNum)).timestamp;
}

async function deployStandardController(overrides, contractName = "RateControllerStub") {
    const controllerFactory = await ethers.getContractFactory(contractName);

    const period = overrides?.period ?? PERIOD;
    const initialBufferCardinality = overrides?.initialBufferCardinality ?? INITIAL_BUFFER_CARDINALITY;
    const updaterMustBeEoa = overrides?.updaterMustBeEoa ?? UPDATERS_MUST_BE_EOA;
    const computeAhead = overrides?.computeAhead ?? COMPUTE_AHEAD;

    controller = await controllerFactory.deploy(computeAhead, period, initialBufferCardinality, updaterMustBeEoa);

    return {
        controller: controller,
    };
}

async function deployPidController(overrides, contractName = "PidControllerStub") {
    const controllerFactory = await ethers.getContractFactory(contractName);

    const period = overrides?.period ?? PERIOD;
    const initialBufferCardinality = overrides?.initialBufferCardinality ?? INITIAL_BUFFER_CARDINALITY;
    const updaterMustBeEoa = overrides?.updaterMustBeEoa ?? UPDATERS_MUST_BE_EOA;
    const computeAhead = overrides?.computeAhead ?? false;

    controller = await controllerFactory.deploy(computeAhead, period, initialBufferCardinality, updaterMustBeEoa);

    return {
        controller: controller,
    };
}

describe("PidController#constructor", function () {
    var factory;
    var oracle;

    beforeEach(async function () {
        factory = await ethers.getContractFactory("ManagedPidController");

        const oracleFactory = await ethers.getContractFactory("InputAndErrorAccumulatorStub");
        oracle = await oracleFactory.deploy();
        await oracle.deployed();
    });

    it("Correctly sets the input and error oracle address", async function () {
        const controller = await factory.deploy(oracle.address, false, 1, 1, false);

        expect(await controller.getInputAndErrorOracle(GRT)).to.equal(oracle.address);
    });

    it("Deploys without compute ahead", async function () {
        const controller = await factory.deploy(oracle.address, false, 1, 1, false);

        expect(await controller.computeAhead()).to.equal(false);
    });

    it("Deploys with compute ahead", async function () {
        const controller = await factory.deploy(oracle.address, true, 1, 1, false);

        expect(await controller.computeAhead()).to.equal(true);
    });

    it("Reverts if the period is zero", async function () {
        await expect(factory.deploy(oracle.address, false, 0, 1, false)).to.be.revertedWith("InvalidPeriod");
    });

    it("Reverts if the oracle address is zero", async function () {
        await expect(factory.deploy(AddressZero, false, 1, 1, false)).to.be.revertedWith("InvalidInputAndErrorOracle");
    });
});

describe("PidController#setPidConfig", function () {
    var controller;
    var oracle;

    beforeEach(async function () {
        factory = await ethers.getContractFactory("ManagedPidController");

        const oracleFactory = await ethers.getContractFactory("InputAndErrorAccumulatorStub");
        oracle = await oracleFactory.deploy();
        await oracle.deployed();

        controller = await factory.deploy(oracle.address, false, 1, 1, false);
        await controller.deployed();
    });

    async function grantRoles(account = undefined) {
        // Get our signer address
        const [signer] = await ethers.getSigners();

        if (account === undefined) {
            account = signer.address;
        }

        // Grant all roles to the signer
        await controller.grantRole(ORACLE_UPDATER_MANAGER_ROLE, signer.address);
        await controller.grantRole(ORACLE_UPDATER_ROLE, account);
        await controller.grantRole(RATE_ADMIN_ROLE, account);
        await controller.grantRole(UPDATE_PAUSE_ADMIN_ROLE, account);
    }

    it("Reverts if we're missing a rate config", async function () {
        await grantRoles();

        await expect(controller.setPidConfig(GRT, DEFAULT_PID_CONFIG)).to.be.revertedWith("MissingConfig");
    });

    it("Reverts if the kPDenominator is zero", async function () {
        await grantRoles();

        await controller.setConfig(GRT, DEFAULT_CONFIG);

        const pidConfig = {
            ...DEFAULT_PID_CONFIG,
            kPDenominator: 0,
        };

        await expect(controller.setPidConfig(GRT, pidConfig)).to.be.revertedWith("InvalidConfig");
    });

    it("Reverts if the kIDenominator is zero", async function () {
        await grantRoles();

        await controller.setConfig(GRT, DEFAULT_CONFIG);

        const pidConfig = {
            ...DEFAULT_PID_CONFIG,
            kIDenominator: 0,
        };

        await expect(controller.setPidConfig(GRT, pidConfig)).to.be.revertedWith("InvalidConfig");
    });

    it("Reverts if the kDDenominator is zero", async function () {
        await grantRoles();

        await controller.setConfig(GRT, DEFAULT_CONFIG);

        const pidConfig = {
            ...DEFAULT_PID_CONFIG,
            kDDenominator: 0,
        };

        await expect(controller.setPidConfig(GRT, pidConfig)).to.be.revertedWith("InvalidConfig");
    });

    it("Reverts if all denominators are zero", async function () {
        await grantRoles();

        await controller.setConfig(GRT, DEFAULT_CONFIG);

        const pidConfig = {
            ...DEFAULT_PID_CONFIG,
            kPDenominator: 0,
            kIDenominator: 0,
            kDDenominator: 0,
        };

        await expect(controller.setPidConfig(GRT, pidConfig)).to.be.revertedWith("InvalidConfig");
    });

    it("Reverts if we don't have the RATE_ADMIN_ROLE", async function () {
        const [signer1, signer2] = await ethers.getSigners();

        await grantRoles(signer1.address);

        // Format the signer's address to be lowercase
        const signerAddress = signer2.address.toLowerCase();

        await expect(controller.connect(signer2).setPidConfig(GRT, DEFAULT_PID_CONFIG)).to.be.revertedWith(
            "AccessControl: account " + signerAddress + " is missing role " + RATE_ADMIN_ROLE
        );
    });

    it("Initializes the PID config", async function () {
        await grantRoles();

        const input = ethers.utils.parseUnits("1.0", 8);
        const target = ethers.utils.parseUnits("0.9", 8);

        await oracle.setInput(GRT, input);
        await oracle.setTarget(GRT, target);

        await controller.setConfig(GRT, DEFAULT_CONFIG);

        const pidConfig = {
            ...DEFAULT_PID_CONFIG,
        };

        await controller.setPidConfig(GRT, pidConfig);

        const pidData = await controller.pidData(GRT);

        // The last input should equal the latest input
        expect(pidData.state.lastInput).to.equal(input);
    });

    it("Emits a PidConfigUpdated event", async function () {
        await grantRoles();

        await controller.setConfig(GRT, DEFAULT_CONFIG);

        const pidConfig = {
            ...DEFAULT_PID_CONFIG,
        };

        await expect(controller.setPidConfig(GRT, pidConfig)).to.emit(controller, "PidConfigUpdated");
    });

    it("Updates the PID config", async function () {
        await grantRoles();

        await controller.setConfig(GRT, DEFAULT_CONFIG);

        await controller.setPidConfig(GRT, DEFAULT_PID_CONFIG);

        const pidData = await controller.pidData(GRT);

        expect(pidData.config.inputAndErrorOracle).to.equal(DEFAULT_PID_CONFIG.inputAndErrorOracle);
        expect(pidData.config.kPNumerator).to.eq(DEFAULT_PID_CONFIG.kPNumerator);
        expect(pidData.config.kPDenominator).to.eq(DEFAULT_PID_CONFIG.kPDenominator);
        expect(pidData.config.kINumerator).to.eq(DEFAULT_PID_CONFIG.kINumerator);
        expect(pidData.config.kIDenominator).to.eq(DEFAULT_PID_CONFIG.kIDenominator);
        expect(pidData.config.kDNumerator).to.eq(DEFAULT_PID_CONFIG.kDNumerator);
        expect(pidData.config.kDDenominator).to.eq(DEFAULT_PID_CONFIG.kDDenominator);
        expect(pidData.config.transformer).to.equal(DEFAULT_PID_CONFIG.transformer);
    });

    it("Setting a new PID config does not reinitialize the PID state", async function () {
        await grantRoles();

        const input = ethers.utils.parseUnits("1.0", 8);
        const target = ethers.utils.parseUnits("0.9", 8);

        await oracle.setInput(GRT, input);
        await oracle.setTarget(GRT, target);

        await controller.setConfig(GRT, DEFAULT_CONFIG);

        await controller.setPidConfig(GRT, DEFAULT_PID_CONFIG);

        const newInput = ethers.utils.parseUnits("1.1", 8);
        await oracle.setInput(GRT, newInput);

        // Set a new config
        await controller.setPidConfig(GRT, {
            ...DEFAULT_PID_CONFIG,
            kPNumerator: -201,
        });

        const pidDataAfter = await controller.pidData(GRT);

        // The last input should equal the latest input
        expect(pidDataAfter.state.lastInput).to.equal(input);
    });

    it("Setting a non-zero oracle address overrides the default", async function () {
        const oracleFactory = await ethers.getContractFactory("InputAndErrorAccumulatorStub");
        const newOracle = await oracleFactory.deploy();
        await newOracle.deployed();

        await grantRoles();

        await controller.setConfig(GRT, DEFAULT_CONFIG);

        const pidConfig = {
            ...DEFAULT_PID_CONFIG,
            inputAndErrorOracle: newOracle.address,
        };

        await controller.setPidConfig(GRT, pidConfig);

        const newOracleAddress = await controller.getInputAndErrorOracle(GRT);
        const defaultOracleAddress = await controller.defaultInputAndErrorOracle();

        // Sanity check that the new oracle address is being used
        expect(newOracleAddress).to.equal(newOracle.address);

        // Validate that the new oracle address is different from the default
        expect(defaultOracleAddress).to.not.equal(newOracleAddress);
    });
});

describe("PidController#setDefaultInputAndErrorOracle", function () {
    var controller;
    var oracle;
    var newOracle;

    beforeEach(async function () {
        factory = await ethers.getContractFactory("ManagedPidController");

        const oracleFactory = await ethers.getContractFactory("InputAndErrorAccumulatorStub");
        oracle = await oracleFactory.deploy();
        await oracle.deployed();

        newOracle = await oracleFactory.deploy();
        await newOracle.deployed();

        controller = await factory.deploy(oracle.address, false, 1, 1, false);
        await controller.deployed();
    });

    async function grantRoles(account = undefined) {
        // Get our signer address
        const [signer] = await ethers.getSigners();

        if (account === undefined) {
            account = signer.address;
        }

        // Grant all roles to the signer
        await controller.grantRole(ORACLE_UPDATER_MANAGER_ROLE, signer.address);
        await controller.grantRole(ORACLE_UPDATER_ROLE, account);
        await controller.grantRole(RATE_ADMIN_ROLE, account);
        await controller.grantRole(UPDATE_PAUSE_ADMIN_ROLE, account);
    }

    it("Reverts if we don't have the RATE_ADMIN_ROLE", async function () {
        const [signer1, signer2] = await ethers.getSigners();

        await grantRoles(signer1.address);

        // Format the signer's address to be lowercase
        const signerAddress = signer2.address.toLowerCase();

        await expect(controller.connect(signer2).setDefaultInputAndErrorOracle(newOracle.address)).to.be.revertedWith(
            "AccessControl: account " + signerAddress + " is missing role " + RATE_ADMIN_ROLE
        );
    });

    it("Reverts when setting the oracle address to the zero address", async function () {
        await grantRoles();

        await expect(controller.setDefaultInputAndErrorOracle(AddressZero)).to.be.revertedWith(
            "InvalidInputAndErrorOracle"
        );
    });

    it("Reverts when setting the oracle address to the current address", async function () {
        await grantRoles();

        await expect(controller.setDefaultInputAndErrorOracle(oracle.address)).to.be.revertedWith(
            "DefaultInputAndErrorOracleUnchanged"
        );
    });

    it("Emits a DefaultInputAndErrorOracleUpdated event and changes the oracle address", async function () {
        await grantRoles();

        await expect(controller.setDefaultInputAndErrorOracle(newOracle.address)).to.emit(
            controller,
            "DefaultInputAndErrorOracleUpdated"
        );

        const newOracleAddress = await controller.defaultInputAndErrorOracle();
        expect(newOracleAddress).to.equal(newOracle.address);
    });
});

describe("PidController#onPaused", function () {
    var controller;
    var oracle;

    beforeEach(async function () {
        factory = await ethers.getContractFactory("ManagedPidController");

        const oracleFactory = await ethers.getContractFactory("InputAndErrorAccumulatorStub");
        oracle = await oracleFactory.deploy();
        await oracle.deployed();

        controller = await factory.deploy(oracle.address, false, 1, 1, false);
        await controller.deployed();
    });

    async function grantRoles(account = undefined) {
        // Get our signer address
        const [signer] = await ethers.getSigners();

        if (account === undefined) {
            account = signer.address;
        }

        // Grant all roles to the signer
        await controller.grantRole(ORACLE_UPDATER_MANAGER_ROLE, signer.address);
        await controller.grantRole(ORACLE_UPDATER_ROLE, account);
        await controller.grantRole(RATE_ADMIN_ROLE, account);
        await controller.grantRole(UPDATE_PAUSE_ADMIN_ROLE, account);
    }

    it("Unpausing reinitializes the PID state", async function () {
        await grantRoles();

        const input = ethers.utils.parseUnits("1.0", 8);
        const target = ethers.utils.parseUnits("0.9", 8);

        await oracle.setInput(GRT, input);
        await oracle.setTarget(GRT, target);

        await controller.setConfig(GRT, DEFAULT_CONFIG);

        await controller.setPidConfig(GRT, DEFAULT_PID_CONFIG);

        const newInput = ethers.utils.parseUnits("1.1", 8);
        await oracle.setInput(GRT, newInput);

        // Pause updates
        await controller.setUpdatesPaused(GRT, true);

        const pidDataBefore = await controller.pidData(GRT);

        // Ensure the pausing does not reinitalize the PID state
        expect(pidDataBefore.state.lastInput).to.equal(input);

        // Unpause updates
        await controller.setUpdatesPaused(GRT, false);

        const pidDataAfter = await controller.pidData(GRT);

        expect(pidDataAfter.state.lastInput).to.equal(newInput);
    });
});

function describeStandardControllerComputeRateTests(contractName, deployFunc) {
    describe(contractName + "#computeRate (computeAhead = false)", function () {
        var controller;

        beforeEach(async () => {
            const deployment = await deployFunc({ computeAhead: false });
            controller = deployment.controller;

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

        it("Reverts if we've never updated the rate", async function () {
            await expect(controller.computeRate(GRT)).to.be.revertedWith("InsufficientData");
        });

        it("Returns the latest current rate (n=1)", async function () {
            const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);
            await controller.update(updateData);

            // Change the base so that the next rate should change
            await controller.setConfig(GRT, {
                ...DEFAULT_CONFIG,
                base: DEFAULT_CONFIG.base.div(2),
            });

            // Get the historical rate
            const historicalRate = await controller.getRateAt(GRT, 0);

            const rate = await controller.computeRate(GRT);

            expect(rate).to.equal(historicalRate.current);

            // Sanity check that the next rate is not the same
            const period = await controller.period();
            await timeAndMine.increaseTime(period.toNumber());
            await controller.update(updateData);
            const nextRate = await controller.computeRate(GRT);
            expect(nextRate).to.not.equal(rate);
        });
    });

    describe(contractName + "#computeRate (computeAhead = true)", function () {
        var controller;

        beforeEach(async () => {
            const deployment = await deployFunc({ computeAhead: true });
            controller = deployment.controller;

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
            {
                base: ethers.utils.parseUnits("0", 18), // 0%
                components: [BigNumber.from(1), BigNumber.from(1), BigNumber.from(1), BigNumber.from(1)],
                componentWeights: [2500, 2500, 2500, 2500], // 25%, 25%, 25%, 25%
            },
            {
                // index 26
                base: ethers.utils.parseUnits("0", 18), // 0%
                components: [BigNumber.from(0), BigNumber.from(0)],
                componentWeights: [10000, 10000], // 100%, 100%
                expectedRate: BigNumber.from(0),
            },
            {
                // index 27
                base: BigNumber.from(1),
                components: [BigNumber.from(0), BigNumber.from(0)],
                componentWeights: [10000, 10000], // 100%, 100%
                expectedRate: BigNumber.from(1),
            },
            {
                // index 28
                base: ethers.utils.parseUnits("0", 18), // 0%
                components: [BigNumber.from(1), BigNumber.from(1)],
                componentWeights: [10000, 10000], // 100%, 100%
                expectedRate: BigNumber.from(2),
            },
            {
                // index 29
                base: BigNumber.from(1),
                components: [BigNumber.from(1), BigNumber.from(1)],
                componentWeights: [10000, 10000], // 100%, 100%
                expectedRate: BigNumber.from(3),
            },
            {
                // index 30
                base: ethers.utils.parseUnits("0", 18), // 0%
                components: [MAX_RATE, MAX_RATE],
                componentWeights: [10000, 10000], // 100%, 100%
                expectedRate: MAX_RATE,
                min: ethers.constants.Zero,
                max: MAX_RATE,
            },
            {
                // index 31
                base: BigNumber.from(1),
                components: [MAX_RATE, MAX_RATE],
                componentWeights: [10000, 10000], // 100%, 100%
                expectedRate: MAX_RATE,
                min: ethers.constants.Zero,
                max: MAX_RATE,
            },
            {
                // index 32
                base: MAX_RATE,
                components: [MAX_RATE, MAX_RATE],
                componentWeights: [10000, 10000], // 100%, 100%
                expectedRate: MAX_RATE,
                min: ethers.constants.Zero,
                max: MAX_RATE,
            },
            {
                // index 33
                base: MAX_RATE,
                components: [MAX_RATE, MAX_RATE],
                componentWeights: [10000, 10000], // 100%, 100%
                expectedRate: ethers.utils.parseUnits("1.0", 18),
                min: ethers.constants.Zero,
                max: ethers.utils.parseUnits("1.0", 18),
            },
            {
                // index 34
                base: BigNumber.from(0),
                components: [BigNumber.from(0), BigNumber.from(0)],
                componentWeights: [10000, 10000], // 100%, 100%
                expectedRate: BigNumber.from(20),
                min: BigNumber.from(20),
            },
            {
                // index 35
                base: BigNumber.from(0),
                components: [BigNumber.from(1), BigNumber.from(1)],
                componentWeights: [20000, 20000], // 200%, 200%
                expectedRate: BigNumber.from(4),
            },
            {
                // index 36
                base: BigNumber.from(1),
                components: [BigNumber.from(1), BigNumber.from(1)],
                componentWeights: [20000, 20000], // 200%, 200%
                expectedRate: BigNumber.from(5),
            },
        ];

        function getRate(base, components, componentWeights, min, max) {
            var rateNum = BigNumber.from(0);
            for (var i = 0; i < components.length; ++i) {
                rateNum = rateNum.add(components[i].mul(componentWeights[i]));
            }
            const computedRate = base.add(rateNum.div(10000));

            if (min != null && computedRate.lte(min)) {
                return min;
            }

            if (max != null && computedRate.gte(max)) {
                return max;
            }

            if (computedRate.gte(MAX_RATE)) {
                return MAX_RATE;
            }

            return computedRate;
        }

        for (var i = 0; i < tests.length; ++i) {
            const test = tests[i];

            const expectedRate = getRate(test.base, test.components, test.componentWeights, test.min, test.max);

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
                        min: test.min ?? ethers.constants.Zero,
                        max: test.max ?? MAX_RATE,
                        maxIncrease: MAX_RATE,
                        maxDecrease: MAX_RATE,
                        maxPercentIncrease: MAX_PERCENT_INCREASE,
                        maxPercentDecrease: MAX_PERCENT_DECREASE,
                        base: test.base,
                        components: componentContracts.map((c) => c.address),
                        componentWeights: test.componentWeights,
                    };
                    await controller.setConfig(GRT, config);

                    // Compute the rate
                    const rate = await controller.computeRate(GRT);

                    // Check the rate
                    expect(rate).to.equal(expectedRate);

                    if (test.expectedRate != null) {
                        // We have an explicit expected rate, so check that
                        expect(rate).to.equal(test.expectedRate);
                    }
                }
            );
        }

        it("Should return the base rate if no components are specified", async function () {
            const config = {
                ...DEFAULT_CONFIG,
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

        it("Should clamp the computed rate based on the last stored rate (upwards)", async function () {
            const config = {
                ...DEFAULT_CONFIG,
                maxIncrease: ethers.utils.parseUnits("0.03", 18), // 3%
                maxDecrease: ethers.utils.parseUnits("0.04", 18), // 4%
                base: ethers.utils.parseUnits("0.05", 18), // 5%
                componentWeights: [],
                components: [],
            };

            // Set the config
            await controller.setConfig(GRT, config);

            // Update. Current rate = 5%
            const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);
            await controller.update(updateData);

            // Change the rate from 5% to 50%
            const newConfig = {
                ...config,
                base: ethers.utils.parseUnits("0.5", 18), // 50%
            };
            await controller.setConfig(GRT, newConfig);

            // Compute the rate
            const rate = await controller.computeRate(GRT);

            // The rate should be clamped to 5% + 3% = 8%
            const expectedRate = config.base.add(config.maxIncrease);

            // Check the rate
            expect(rate).to.equal(expectedRate);

            // Sanity check that the expected rate and the new target rate are different
            expect(expectedRate).to.not.equal(newConfig.base);
        });

        it("Should clamp the computed rate based on the last stored rate (upwards, from zero)", async function () {
            const config = {
                ...DEFAULT_CONFIG,
                maxIncrease: ethers.utils.parseUnits("0.03", 18), // 3%
                maxDecrease: ethers.utils.parseUnits("0.04", 18), // 4%
                base: ethers.utils.parseUnits("0", 18), // 0%
                componentWeights: [],
                components: [],
            };

            // Set the config
            await controller.setConfig(GRT, config);

            // Update. Current rate = 0%
            const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);
            await controller.update(updateData);

            // Change the rate from 0% to 50%
            const newConfig = {
                ...config,
                base: ethers.utils.parseUnits("0.5", 18), // 50%
            };
            await controller.setConfig(GRT, newConfig);

            // Compute the rate
            const rate = await controller.computeRate(GRT);

            // The rate should be clamped to 0% + 3% = 3%
            const expectedRate = config.base.add(config.maxIncrease);

            // Check the rate
            expect(rate).to.equal(expectedRate);

            // Sanity check that the expected rate and the new target rate are different
            expect(expectedRate).to.not.equal(newConfig.base);
        });

        it("Should clamp the computed rate based on the last stored rate (downwards)", async function () {
            const config = {
                ...DEFAULT_CONFIG,
                maxIncrease: ethers.utils.parseUnits("0.03", 18), // 3%
                maxDecrease: ethers.utils.parseUnits("0.04", 18), // 4%
                base: ethers.utils.parseUnits("0.05", 18), // 5%
                componentWeights: [],
                components: [],
            };

            // Set the config
            await controller.setConfig(GRT, config);

            // Update. Current rate = 5%
            const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);
            await controller.update(updateData);

            // Change the rate from 5% to 0.5%
            const newConfig = {
                ...config,
                base: ethers.utils.parseUnits("0.005", 18), // 0.5%
            };
            await controller.setConfig(GRT, newConfig);

            // Compute the rate
            const rate = await controller.computeRate(GRT);

            // The rate should be clamped to 5% - 4% = 1%
            const expectedRate = config.base.sub(config.maxDecrease);

            // Check the rate
            expect(rate).to.equal(expectedRate);

            // Sanity check that the expected rate and the new target rate are different
            expect(expectedRate).to.not.equal(newConfig.base);
        });

        it("Reverts if we haven't set a config", async function () {
            const token = USDC;

            await expect(controller.computeRate(token)).to.be.revertedWith("MissingConfig");

            // Sanity check that it doesn't revert if we set a config
            await controller.setConfig(token, DEFAULT_CONFIG);
            await expect(controller.computeRate(token)).to.not.be.reverted;
        });
    });
}

function describePidControllerComputeRateTests(contractName, deployFunc) {
    describe(contractName + "#computeRate (computeAhead = false)", function () {
        var controller;

        beforeEach(async () => {
            const deployment = await deployFunc({ computeAhead: false });
            controller = deployment.controller;

            // Get our signer address
            const [signer] = await ethers.getSigners();

            // Grant all roles to the signer
            await controller.grantRole(ORACLE_UPDATER_MANAGER_ROLE, signer.address);
            await controller.grantRole(ORACLE_UPDATER_ROLE, signer.address);
            await controller.grantRole(RATE_ADMIN_ROLE, signer.address);
            await controller.grantRole(UPDATE_PAUSE_ADMIN_ROLE, signer.address);

            // Set config for GRT
            await controller.setConfig(GRT, DEFAULT_CONFIG);

            // Set PID config for GRT
            await controller.setPidConfig(GRT, DEFAULT_PID_CONFIG);

            await controller.setTarget(GRT, ethers.utils.parseUnits("0.9", 8));
            await controller.setInput(GRT, ethers.utils.parseUnits("1.0", 8));
        });

        it("Reverts if we've never updated the rate", async function () {
            await expect(controller.computeRate(GRT)).to.be.revertedWith("InsufficientData");
        });

        it("Returns the latest current rate (n=1)", async function () {
            const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);
            await controller.update(updateData);

            // Get the historical rate
            const historicalRate = await controller.getRateAt(GRT, 0);

            const rate = await controller.computeRate(GRT);

            expect(rate).to.equal(historicalRate.current);
        });

        it("Returns the latest current rate (n=2)", async function () {
            const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);
            await controller.update(updateData);

            const period = await controller.period();

            // Advance to the next period
            await timeAndMine.increaseTime(period.toNumber());

            await controller.update(updateData);

            const ratesCount = await controller.getRatesCount(GRT);
            expect(ratesCount).to.equal(2);

            // Get the latest historical rate
            const historicalRate = await controller.getRateAt(GRT, 0);
            // Get the previous historical rate
            const previousHistoricalRate = await controller.getRateAt(GRT, 1);
            // Ensure the rates are different
            expect(historicalRate.current).to.not.equal(previousHistoricalRate.current);

            const rate = await controller.computeRate(GRT);

            expect(rate).to.equal(historicalRate.current);
        });
    });

    describe(contractName + "#computeRate (computeAhead = true)", function () {
        var controller;

        beforeEach(async () => {
            const deployment = await deployFunc({ computeAhead: true });
            controller = deployment.controller;

            // Get our signer address
            const [signer] = await ethers.getSigners();

            // Grant all roles to the signer
            await controller.grantRole(ORACLE_UPDATER_MANAGER_ROLE, signer.address);
            await controller.grantRole(ORACLE_UPDATER_ROLE, signer.address);
            await controller.grantRole(RATE_ADMIN_ROLE, signer.address);
            await controller.grantRole(UPDATE_PAUSE_ADMIN_ROLE, signer.address);

            // Set config for GRT
            await controller.setConfig(GRT, DEFAULT_CONFIG);

            // Set PID config for GRT
            await controller.setPidConfig(GRT, DEFAULT_PID_CONFIG);

            await controller.setTarget(GRT, ethers.utils.parseUnits("0.9", 8));
            await controller.setInput(GRT, ethers.utils.parseUnits("1.0", 8));
        });

        it("Doesn't revert if we've never computed a rate before", async function () {
            await expect(controller.computeRate(GRT)).to.not.be.reverted;
        });

        it("Doesn't return the last stored rate", async function () {
            const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);
            await controller.update(updateData);

            // Get the historical rate
            const historicalRate = await controller.getRateAt(GRT, 0);

            const rate = await controller.computeRate(GRT);

            expect(rate).to.not.equal(historicalRate.current);
        });

        it("Applies clamping based on the last stored rate", async function () {
            // Manually push a rate
            const rate = ethers.utils.parseUnits("0.50", 8);
            await controller.stubPush(GRT, rate, rate, 1);

            // Set the config s.t. the rate only decreases by 0.01%
            const config = {
                ...DEFAULT_CONFIG,
                maxDecrease: ethers.utils.parseUnits("0.0001", 8),
                maxPercentDecrease: MAX_PERCENT_DECREASE,
            };
            await controller.setConfig(GRT, config);

            // Set the input to 100% and the target to 1% so the rate decreases
            await controller.setInput(GRT, ethers.utils.parseUnits("1.0", 8));
            await controller.setTarget(GRT, ethers.utils.parseUnits("0.01", 8));

            const expectedRate = rate.sub(config.maxDecrease);

            const reportedRate = await controller.computeRate(GRT);

            expect(reportedRate).to.equal(expectedRate);

            // Sanity check that the rate is clamped
            await controller.setConfig(GRT, {
                ...config,
                maxDecrease: MAX_RATE,
                maxPercentDecrease: MAX_PERCENT_DECREASE,
            });

            const unclampedRate = await controller.computeRate(GRT);

            expect(unclampedRate).to.be.lt(reportedRate);
        });
    });
}

function describePidControllerNeedsUpdateTests(deployFunc, getController) {
    it("Should return false if the PID config hasn't been set", async function () {
        const controller = getController();

        // Set config for a new token - USDC
        await controller.setConfig(USDC, DEFAULT_CONFIG);

        const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [USDC]);

        const needsUpdate = await controller.needsUpdate(updateData);

        expect(needsUpdate).to.be.false;

        // Sanity check that it needs an update if the PID config is set
        await controller.setPidConfig(USDC, DEFAULT_PID_CONFIG);
        expect(await controller.needsUpdate(updateData)).to.be.true;
    });
}

function createDescribeStandardControllerNeedsUpdateTests(
    supportsChangeThresholds,
    beforeEachCallback,
    describeAdditionalTests
) {
    return function describeStandardControllerNeedsUpdateTests(contractName, deployFunc) {
        describe(contractName + "#needsUpdate", function () {
            var controller;
            var currentRate;

            beforeEach(async () => {
                const deployment = await deployFunc();
                controller = deployment.controller;

                // Get our signer address
                const [signer] = await ethers.getSigners();

                // Grant all roles to the signer
                await controller.grantRole(ORACLE_UPDATER_MANAGER_ROLE, signer.address);
                await controller.grantRole(ORACLE_UPDATER_ROLE, signer.address);
                await controller.grantRole(RATE_ADMIN_ROLE, signer.address);
                await controller.grantRole(UPDATE_PAUSE_ADMIN_ROLE, signer.address);

                // Set config for GRT
                await controller.setConfig(GRT, DEFAULT_CONFIG);

                currentRate = DEFAULT_CONFIG.base;

                if (beforeEachCallback) {
                    await beforeEachCallback(controller);
                }
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

            it("Should return true if it is ready for its first update", async function () {
                const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

                const needsUpdate = await controller.needsUpdate(updateData);

                expect(needsUpdate).to.be.true;
            });

            it("Should return true if the update period has been passed and the rate will change", async function () {
                // Push INITIAL_BUFFER_CARDINALITY updates
                for (let i = 0; i < INITIAL_BUFFER_CARDINALITY; i++) {
                    await controller.stubPush(GRT, currentRate, currentRate, 1);
                }

                // Change the base
                await controller.setConfig(GRT, { ...DEFAULT_CONFIG, base: DEFAULT_CONFIG.base.add(1) });

                const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

                const needsUpdate = await controller.needsUpdate(updateData);

                expect(needsUpdate).to.be.true;
            });

            it("Should return true if the update period has been passed and the target rate doesn't match the current rate", async function () {
                // Push INITIAL_BUFFER_CARDINALITY updates
                for (let i = 0; i < INITIAL_BUFFER_CARDINALITY; i++) {
                    await controller.stubPush(GRT, currentRate + 1, currentRate, 1);
                }

                // Change the target
                await controller.setConfig(GRT, { ...DEFAULT_CONFIG, base: DEFAULT_CONFIG.base.add(1) });

                const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

                const needsUpdate = await controller.needsUpdate(updateData);

                expect(needsUpdate).to.be.true;
            });

            it("Should return true if the current and next rates are capped, but there's still a different current rate in the buffer", async function () {
                const capacity = 10;

                await controller.setRatesCapacity(GRT, capacity);

                // Push capacity updates
                for (let i = 0; i < capacity - 1; i++) {
                    await controller.stubPush(GRT, currentRate, currentRate, 1);
                }

                const targetRate = currentRate + 2;
                const cappedRate = currentRate + 1;

                // Push the new capped rate
                await controller.stubPush(GRT, targetRate, cappedRate, 1);

                // Change the target
                await controller.setConfig(GRT, { ...DEFAULT_CONFIG, maxIncrease: 0, base: targetRate });

                const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

                const needsUpdate = await controller.needsUpdate(updateData);

                expect(needsUpdate).to.be.true;
            });

            if (supportsChangeThresholds) {
                it("Should return false if the rate change is less than the change threshold (upwards change)", async function () {
                    // Push the initial rate
                    await controller.stubPush(GRT, currentRate, currentRate, 1);

                    // Set the change threshold to 1%
                    const changeThreshold = ethers.utils.parseUnits("0.01", CHANGE_THRESHOLD_DECIMALS);
                    await controller.setChangeThreshold(GRT, changeThreshold);

                    // Set the new rate to the current rate + 1% - 1
                    const newRate = currentRate.add(currentRate.mul(1).div(100)).sub(1);

                    // Change the base
                    await controller.setConfig(GRT, { ...UNBOUNDED_CHANGE_CONFIG, base: newRate });

                    const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

                    const needsUpdate = await controller.needsUpdate(updateData);

                    expect(needsUpdate).to.be.false;
                });

                it("Should return true if the rate change is meets the change threshold (upwards change)", async function () {
                    // Push the initial rate
                    await controller.stubPush(GRT, currentRate, currentRate, 1);

                    // Set the change threshold to 1%
                    const changeThreshold = ethers.utils.parseUnits("0.01", CHANGE_THRESHOLD_DECIMALS);
                    await controller.setChangeThreshold(GRT, changeThreshold);

                    // Set the new rate to the current rate + 1%
                    const newRate = currentRate.add(currentRate.mul(1).div(100));

                    // Change the base
                    await controller.setConfig(GRT, { ...UNBOUNDED_CHANGE_CONFIG, base: newRate });

                    const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

                    const needsUpdate = await controller.needsUpdate(updateData);

                    expect(needsUpdate).to.be.true;
                });

                it("Should return true if the rate change is exceeds the change threshold (upwards change)", async function () {
                    // Push the initial rate
                    await controller.stubPush(GRT, currentRate, currentRate, 1);

                    // Set the change threshold to 1%
                    const changeThreshold = ethers.utils.parseUnits("0.01", CHANGE_THRESHOLD_DECIMALS);
                    await controller.setChangeThreshold(GRT, changeThreshold);

                    // Set the new rate to the current rate + 1% + 1
                    const newRate = currentRate.add(currentRate.mul(1).div(100)).add(1);

                    // Change the base
                    await controller.setConfig(GRT, { ...UNBOUNDED_CHANGE_CONFIG, base: newRate });

                    const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

                    const needsUpdate = await controller.needsUpdate(updateData);

                    expect(needsUpdate).to.be.true;
                });

                it("Should return false if the rate change is less than the change threshold (downwards change)", async function () {
                    // Push the initial rate
                    await controller.stubPush(GRT, currentRate, currentRate, 1);

                    // Set the change threshold to 25%
                    const changeThreshold = ethers.utils.parseUnits("0.25", CHANGE_THRESHOLD_DECIMALS);
                    await controller.setChangeThreshold(GRT, changeThreshold);

                    // A 20% change threshold is normalized to a 20% downwards change
                    const upwardsChange = currentRate.mul(20_00).div(100_00);
                    const newRate = currentRate.sub(upwardsChange).add(1);

                    // Change the base
                    await controller.setConfig(GRT, { ...UNBOUNDED_CHANGE_CONFIG, base: newRate });

                    const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

                    const needsUpdate = await controller.needsUpdate(updateData);

                    expect(needsUpdate).to.be.false;
                });

                it("Should return true if the rate change is meets the change threshold (downwards change)", async function () {
                    // Push the initial rate
                    await controller.stubPush(GRT, currentRate, currentRate, 1);

                    // Set the change threshold to 1%
                    const changeThreshold = ethers.utils.parseUnits("0.01", CHANGE_THRESHOLD_DECIMALS);
                    await controller.setChangeThreshold(GRT, changeThreshold);

                    // A 20% change threshold is normalized to a 20% downwards change
                    const upwardsChange = currentRate.mul(20_00).div(100_00);
                    const newRate = currentRate.sub(upwardsChange);

                    // Change the base
                    await controller.setConfig(GRT, { ...UNBOUNDED_CHANGE_CONFIG, base: newRate });

                    const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

                    const needsUpdate = await controller.needsUpdate(updateData);

                    expect(needsUpdate).to.be.true;
                });

                it("Should return true if the rate change is exceeds the change threshold (downwards change)", async function () {
                    // Push the initial rate
                    await controller.stubPush(GRT, currentRate, currentRate, 1);

                    // Set the change threshold to 1%
                    const changeThreshold = ethers.utils.parseUnits("0.01", CHANGE_THRESHOLD_DECIMALS);
                    await controller.setChangeThreshold(GRT, changeThreshold);

                    // A 20% change threshold is normalized to a 20% downwards change
                    const upwardsChange = currentRate.mul(20_00).div(100_00);
                    const newRate = currentRate.sub(upwardsChange).sub(1);

                    // Change the base
                    await controller.setConfig(GRT, { ...UNBOUNDED_CHANGE_CONFIG, base: newRate });

                    const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

                    const needsUpdate = await controller.needsUpdate(updateData);

                    expect(needsUpdate).to.be.true;
                });

                it("Should return true moving from 0 to 1", async function () {
                    // Push the initial rate, which is 0
                    await controller.stubPush(GRT, 0, 0, 1);

                    // Set the change threshold to 10%
                    const changeThreshold = ethers.utils.parseUnits("0.10", CHANGE_THRESHOLD_DECIMALS);
                    await controller.setChangeThreshold(GRT, changeThreshold);

                    // Change the base from 0 to 1
                    const newRate = BigNumber.from(1);
                    await controller.setConfig(GRT, { ...UNBOUNDED_CHANGE_CONFIG, base: newRate });

                    const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

                    const needsUpdate = await controller.needsUpdate(updateData);

                    expect(needsUpdate).to.be.true;
                });

                it("Should return true moving from 1 to 0", async function () {
                    // Push the initial rate, which is 1
                    await controller.stubPush(GRT, 1, 1, 1);

                    // Set the change threshold to 10%
                    const changeThreshold = ethers.utils.parseUnits("0.10", CHANGE_THRESHOLD_DECIMALS);
                    await controller.setChangeThreshold(GRT, changeThreshold);

                    // Change the base from 1 to 0
                    const newRate = BigNumber.from(0);
                    await controller.setConfig(GRT, { ...UNBOUNDED_CHANGE_CONFIG, base: newRate });

                    const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

                    const needsUpdate = await controller.needsUpdate(updateData);

                    expect(needsUpdate).to.be.true;
                });

                it("Should return false moving from 0 to 0", async function () {
                    // Push the initial rate, which is 0
                    await controller.stubPush(GRT, 0, 0, 1);

                    // Set the change threshold to 10%
                    const changeThreshold = ethers.utils.parseUnits("0.10", CHANGE_THRESHOLD_DECIMALS);
                    await controller.setChangeThreshold(GRT, changeThreshold);

                    // Change the base from 0 to 0
                    const newRate = BigNumber.from(0);
                    await controller.setConfig(GRT, { ...UNBOUNDED_CHANGE_CONFIG, base: newRate });

                    const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

                    const needsUpdate = await controller.needsUpdate(updateData);

                    expect(needsUpdate).to.be.false;
                });

                it("Should return false moving from currentRate to currentRate", async function () {
                    // Push the initial rate, which is currentRate
                    await controller.stubPush(GRT, currentRate, currentRate, 1);

                    // Set the change threshold to 10%
                    const changeThreshold = ethers.utils.parseUnits("0.10", CHANGE_THRESHOLD_DECIMALS);
                    await controller.setChangeThreshold(GRT, changeThreshold);

                    // Change the base from currentRate to currentRate
                    const newRate = currentRate;
                    await controller.setConfig(GRT, { ...UNBOUNDED_CHANGE_CONFIG, base: newRate });

                    const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

                    const needsUpdate = await controller.needsUpdate(updateData);

                    expect(needsUpdate).to.be.false;
                });
            }

            if (describeAdditionalTests) {
                describeAdditionalTests(deployFunc, () => controller);
            }
        });
    };
}

function createDescribeStandardControllerUpdateTests(
    beforeEachCallback,
    testRateSetting,
    describeAdditionalTests,
    supportsChangeThresholds
) {
    return function describeStandardControllerUpdateTests(contractName, deployFunc) {
        describe(contractName + "#update", function () {
            var controller;

            async function deploy(updatersMustBeEoa) {
                const deployment = await deployFunc({
                    updaterMustBeEoa: updatersMustBeEoa,
                });
                controller = deployment.controller;

                // Get our signer address
                const [signer] = await ethers.getSigners();

                // Grant all roles to the signer
                await controller.grantRole(ORACLE_UPDATER_MANAGER_ROLE, signer.address);
                await controller.grantRole(ORACLE_UPDATER_ROLE, signer.address);
                await controller.grantRole(RATE_ADMIN_ROLE, signer.address);
                await controller.grantRole(UPDATE_PAUSE_ADMIN_ROLE, signer.address);

                // Set config for GRT
                await controller.setConfig(GRT, DEFAULT_CONFIG);

                if (beforeEachCallback) {
                    await beforeEachCallback(controller);
                }
            }

            beforeEach(async () => {
                await deploy(false);
            });

            it("Reverts if the caller is a smart contract and updatersMustBeEoa is true, with the caller contract having the required role", async function () {
                // Deploy a new controller with updatersMustBeEoa set to true
                await deploy(true);

                // Deploy the caller contract
                const callerFactory = await ethers.getContractFactory("RateControllerStubCaller");
                const caller = await callerFactory.deploy(controller.address);
                await caller.deployed();

                // Get our signer address
                const [signer] = await ethers.getSigners();

                // Grant the role to the signer
                await controller.grantRole(ORACLE_UPDATER_ROLE, signer.address);
                // Grant the role to the caller contract
                await controller.grantRole(ORACLE_UPDATER_ROLE, caller.address);
                // Revoke the role from everyone
                await controller.revokeRole(ORACLE_UPDATER_ROLE, AddressZero);

                const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

                await expect(caller.update(updateData)).to.be.revertedWith("UpdaterMustBeEoa");

                // Sanity check that the signer can update
                await expect(controller.update(updateData)).to.not.be.reverted;
            });

            if (supportsChangeThresholds) {
                it("Updates when pushing a second rate with a change threshold specified and the change threshold is exceeded (upwards change)", async function () {
                    // Push the initial rate
                    await controller.stubPush(GRT, DEFAULT_CONFIG.base, DEFAULT_CONFIG.base, 1);

                    // Set the change threshold to 1%
                    const changeThreshold = ethers.utils.parseUnits("0.01", CHANGE_THRESHOLD_DECIMALS);
                    await controller.setChangeThreshold(GRT, changeThreshold);

                    const newRate = DEFAULT_CONFIG.base.add(DEFAULT_CONFIG.base.mul(1).div(100)).add(1);

                    // Change the base
                    await controller.setConfig(GRT, { ...UNBOUNDED_CHANGE_CONFIG, base: newRate });

                    const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

                    const updated = await controller.callStatic.update(updateData);
                    expect(updated).to.be.true;

                    const updateTx = await controller.update(updateData);

                    const timestamp = await blockTimestamp(updateTx.blockNumber);

                    await expect(updateTx)
                        .to.emit(controller, "RateUpdated")
                        .withArgs(GRT, newRate, newRate, timestamp);
                });

                it("Updates when pushing a second rate with a change threshold specified and the change threshold is just met (upwards change)", async function () {
                    // Push the initial rate
                    await controller.stubPush(GRT, DEFAULT_CONFIG.base, DEFAULT_CONFIG.base, 1);

                    // Set the change threshold to 1%
                    const changeThreshold = ethers.utils.parseUnits("0.01", CHANGE_THRESHOLD_DECIMALS);
                    await controller.setChangeThreshold(GRT, changeThreshold);

                    const newRate = DEFAULT_CONFIG.base.add(DEFAULT_CONFIG.base.mul(1).div(100));

                    // Change the base
                    await controller.setConfig(GRT, { ...UNBOUNDED_CHANGE_CONFIG, base: newRate });

                    const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

                    const updated = await controller.callStatic.update(updateData);
                    expect(updated).to.be.true;

                    const updateTx = await controller.update(updateData);

                    const timestamp = await blockTimestamp(updateTx.blockNumber);

                    await expect(updateTx)
                        .to.emit(controller, "RateUpdated")
                        .withArgs(GRT, newRate, newRate, timestamp);
                });

                it("Doesn't update when pushing a second rate with a change threshold specified and the change threshold is not met (upwards change)", async function () {
                    // Push the initial rate
                    await controller.stubPush(GRT, DEFAULT_CONFIG.base, DEFAULT_CONFIG.base, 1);

                    // Set the change threshold to 1%
                    const changeThreshold = ethers.utils.parseUnits("0.01", CHANGE_THRESHOLD_DECIMALS);
                    await controller.setChangeThreshold(GRT, changeThreshold);

                    const newRate = DEFAULT_CONFIG.base.add(DEFAULT_CONFIG.base.mul(1).div(100)).sub(1);

                    // Change the base
                    await controller.setConfig(GRT, { ...UNBOUNDED_CHANGE_CONFIG, base: newRate });

                    const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

                    const updated = await controller.callStatic.update(updateData);
                    expect(updated).to.be.false;

                    await expect(controller.update(updateData)).to.not.emit(controller, "RateUpdated");
                });

                it("Updates when pushing a second rate with a change threshold specified and the change threshold is exceeded (downwards change)", async function () {
                    // Push the initial rate
                    await controller.stubPush(GRT, DEFAULT_CONFIG.base, DEFAULT_CONFIG.base, 1);

                    // Set the change threshold to 25%
                    const changeThreshold = ethers.utils.parseUnits("0.25", CHANGE_THRESHOLD_DECIMALS);
                    await controller.setChangeThreshold(GRT, changeThreshold);

                    // A 20% change threshold is normalized to a 20% downwards change
                    const upwardsChange = DEFAULT_CONFIG.base.mul(20_00).div(100_00);
                    const newRate = DEFAULT_CONFIG.base.sub(upwardsChange).sub(1);

                    // Change the base
                    await controller.setConfig(GRT, { ...UNBOUNDED_CHANGE_CONFIG, base: newRate });

                    const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

                    const updated = await controller.callStatic.update(updateData);
                    expect(updated).to.be.true;

                    const updateTx = await controller.update(updateData);

                    const timestamp = await blockTimestamp(updateTx.blockNumber);

                    await expect(updateTx)
                        .to.emit(controller, "RateUpdated")
                        .withArgs(GRT, newRate, newRate, timestamp);
                });

                it("Updates when pushing a second rate with a change threshold specified and the change threshold is just met (downwards change)", async function () {
                    // Push the initial rate
                    await controller.stubPush(GRT, DEFAULT_CONFIG.base, DEFAULT_CONFIG.base, 1);

                    // Set the change threshold to 25%
                    const changeThreshold = ethers.utils.parseUnits("0.25", CHANGE_THRESHOLD_DECIMALS);
                    await controller.setChangeThreshold(GRT, changeThreshold);

                    // A 20% change threshold is normalized to a 20% downwards change
                    const upwardsChange = DEFAULT_CONFIG.base.mul(20_00).div(100_00);
                    const newRate = DEFAULT_CONFIG.base.sub(upwardsChange);

                    // Change the base
                    await controller.setConfig(GRT, { ...UNBOUNDED_CHANGE_CONFIG, base: newRate });

                    const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

                    const updated = await controller.callStatic.update(updateData);
                    expect(updated).to.be.true;

                    const updateTx = await controller.update(updateData);

                    const timestamp = await blockTimestamp(updateTx.blockNumber);

                    await expect(updateTx)
                        .to.emit(controller, "RateUpdated")
                        .withArgs(GRT, newRate, newRate, timestamp);
                });

                it("Doesn't update when pushing a second rate with a change threshold specified and the change threshold is not met (downwards change)", async function () {
                    // Push the initial rate
                    await controller.stubPush(GRT, DEFAULT_CONFIG.base, DEFAULT_CONFIG.base, 1);

                    // Set the change threshold to 25%
                    const changeThreshold = ethers.utils.parseUnits("0.25", CHANGE_THRESHOLD_DECIMALS);
                    await controller.setChangeThreshold(GRT, changeThreshold);

                    // A 20% change threshold is normalized to a 20% downwards change
                    const upwardsChange = DEFAULT_CONFIG.base.mul(20_00).div(100_00);
                    const newRate = DEFAULT_CONFIG.base.sub(upwardsChange).add(1);

                    // Change the base
                    await controller.setConfig(GRT, { ...UNBOUNDED_CHANGE_CONFIG, base: newRate });

                    const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

                    const updated = await controller.callStatic.update(updateData);
                    expect(updated).to.be.false;

                    await expect(controller.update(updateData)).to.not.emit(controller, "RateUpdated");
                });

                it("[TT1] Performs an initial update okay when the change threshold is set", async function () {
                    // Set the change threshold to 1%
                    const changeThreshold = ethers.utils.parseUnits("0.01", CHANGE_THRESHOLD_DECIMALS);
                    await controller.setChangeThreshold(GRT, changeThreshold);

                    const newRate = DEFAULT_CONFIG.base;

                    // Change the base
                    await controller.setConfig(GRT, { ...UNBOUNDED_CHANGE_CONFIG, base: newRate });

                    const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

                    const updated = await controller.callStatic.update(updateData);
                    expect(updated).to.be.true;

                    const updateTx = await controller.update(updateData);

                    const timestamp = await blockTimestamp(updateTx.blockNumber);

                    await expect(updateTx)
                        .to.emit(controller, "RateUpdated")
                        .withArgs(GRT, newRate, newRate, timestamp);
                });
            }

            it("Reverts if the caller is a smart contract and updatersMustBeEoa is true, with the required role being open", async function () {
                // Deploy a new controller with updatersMustBeEoa set to true
                await deploy(true);

                // Deploy the caller contract
                const callerFactory = await ethers.getContractFactory("RateControllerStubCaller");
                const caller = await callerFactory.deploy(controller.address);
                await caller.deployed();

                // Get our signer address
                const [signer] = await ethers.getSigners();

                // Revoke the role from the signer
                await controller.revokeRole(ORACLE_UPDATER_ROLE, signer.address);
                // Grant the role to everyone
                await controller.grantRole(ORACLE_UPDATER_ROLE, AddressZero);

                const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

                await expect(caller.update(updateData)).to.be.revertedWith("UpdaterMustBeEoa");

                // Sanity check that the signer can update
                await expect(controller.update(updateData)).to.not.be.reverted;
            });

            it("Works if the caller is a smart contract and updatersMustBeEoa is false, with the caller contract having the required role", async function () {
                // Deploy a new controller with updatersMustBeEoa set to false
                await deploy(false);

                // Deploy the caller contract
                const callerFactory = await ethers.getContractFactory("RateControllerStubCaller");
                const caller = await callerFactory.deploy(controller.address);
                await caller.deployed();

                // Get our signer address
                const [signer] = await ethers.getSigners();

                // Grant the role to the signer
                await controller.grantRole(ORACLE_UPDATER_ROLE, signer.address);
                // Grant the role to the caller contract
                await controller.grantRole(ORACLE_UPDATER_ROLE, caller.address);
                // Revoke the role from everyone
                await controller.revokeRole(ORACLE_UPDATER_ROLE, AddressZero);

                const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

                await expect(caller.update(updateData)).to.not.be.reverted;
            });

            it("Works if the caller is a smart contract and updatersMustBeEoa is false, with the required role being open", async function () {
                // Deploy a new controller with updatersMustBeEoa set to false
                await deploy(false);

                // Deploy the caller contract
                const callerFactory = await ethers.getContractFactory("RateControllerStubCaller");
                const caller = await callerFactory.deploy(controller.address);
                await caller.deployed();

                // Get our signer address
                const [signer] = await ethers.getSigners();

                // Revoke the role from the signer
                await controller.revokeRole(ORACLE_UPDATER_ROLE, signer.address);
                // Grant the role to everyone
                await controller.grantRole(ORACLE_UPDATER_ROLE, AddressZero);

                const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

                await expect(caller.update(updateData)).to.not.be.reverted;
            });

            it("Reverts if the caller doesn't have the ORACLE_UPDATER_ROLE", async function () {
                // Get our signer address
                const [signer] = await ethers.getSigners();

                // Revoke the role from the signer
                await controller.revokeRole(ORACLE_UPDATER_ROLE, signer.address);
                // Revoke the role from everyone
                await controller.revokeRole(ORACLE_UPDATER_ROLE, AddressZero);

                const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

                await expect(controller.update(updateData))
                    .to.be.revertedWith("MissingRole")
                    .withArgs(ORACLE_UPDATER_ROLE);
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

            if (testRateSetting) {
                it("Immediately sets the rate to the target rate if the buffer is empty", async function () {
                    const targetRate = await controller.computeRate(GRT);

                    const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

                    const updateTx = await controller.update(updateData);

                    const currentTime = await currentBlockTimestamp();

                    await expect(updateTx)
                        .to.emit(controller, "RateUpdated")
                        .withArgs(GRT, targetRate, targetRate, currentTime);

                    const latestRate = await controller.getRateAt(GRT, 0);

                    expect(latestRate.target).to.equal(targetRate);
                    expect(latestRate.current).to.equal(targetRate);
                    expect(latestRate.timestamp).to.equal(currentTime);
                });

                it("Initial setting of the rate is capped by the min rate", async function () {
                    const config = {
                        ...DEFAULT_CONFIG,
                        min: ethers.utils.parseUnits("0.5", 18),
                        base: ethers.utils.parseUnits("0.4", 18),
                    };
                    await controller.setConfig(GRT, config);

                    const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);
                    const updateTx = await controller.update(updateData);
                    const currentTime = await currentBlockTimestamp();

                    const targetRate = config.base;
                    const expectedCurrentRate = config.min;

                    await expect(updateTx)
                        .to.emit(controller, "RateUpdated")
                        .withArgs(GRT, targetRate, expectedCurrentRate, currentTime);

                    const latestRate = await controller.getRateAt(GRT, 0);

                    expect(latestRate.target).to.equal(targetRate);
                    expect(latestRate.current).to.equal(expectedCurrentRate);
                    expect(latestRate.timestamp).to.equal(currentTime);
                });

                it("Initial setting of the rate is capped by the max rate", async function () {
                    const config = {
                        ...DEFAULT_CONFIG,
                        max: ethers.utils.parseUnits("0.5", 18),
                        base: ethers.utils.parseUnits("0.6", 18),
                    };
                    await controller.setConfig(GRT, config);

                    const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);
                    const updateTx = await controller.update(updateData);
                    const currentTime = await currentBlockTimestamp();

                    const targetRate = config.base;
                    const expectedCurrentRate = config.max;

                    await expect(updateTx)
                        .to.emit(controller, "RateUpdated")
                        .withArgs(GRT, targetRate, expectedCurrentRate, currentTime);

                    const latestRate = await controller.getRateAt(GRT, 0);

                    expect(latestRate.target).to.equal(targetRate);
                    expect(latestRate.current).to.equal(expectedCurrentRate);
                    expect(latestRate.timestamp).to.equal(currentTime);
                });

                it("Further setting of the rate is capped by the min rate", async function () {
                    const minRate = ethers.utils.parseUnits("0.5", 18);
                    const targetRate = ethers.utils.parseUnits("0.4", 18);

                    await controller.stubPush(GRT, minRate, minRate, 1);

                    const config = {
                        ...DEFAULT_CONFIG,
                        min: minRate,
                        base: targetRate,
                    };
                    await controller.setConfig(GRT, config);

                    const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);
                    const updateTx = await controller.update(updateData);
                    const currentTime = await currentBlockTimestamp();

                    const expectedCurrentRate = config.min;

                    await expect(updateTx)
                        .to.emit(controller, "RateUpdated")
                        .withArgs(GRT, targetRate, expectedCurrentRate, currentTime);

                    const latestRate = await controller.getRateAt(GRT, 0);

                    expect(latestRate.target).to.equal(targetRate);
                    expect(latestRate.current).to.equal(expectedCurrentRate);
                    expect(latestRate.timestamp).to.equal(currentTime);
                });

                it("Further setting of the rate is capped by the max rate", async function () {
                    const maxRate = ethers.utils.parseUnits("0.5", 18);
                    const targetRate = ethers.utils.parseUnits("0.6", 18);

                    await controller.stubPush(GRT, maxRate, maxRate, 1);

                    const config = {
                        ...DEFAULT_CONFIG,
                        max: maxRate,
                        base: targetRate,
                    };
                    await controller.setConfig(GRT, config);

                    const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);
                    const updateTx = await controller.update(updateData);
                    const currentTime = await currentBlockTimestamp();

                    const expectedCurrentRate = config.max;

                    await expect(updateTx)
                        .to.emit(controller, "RateUpdated")
                        .withArgs(GRT, targetRate, expectedCurrentRate, currentTime);

                    const latestRate = await controller.getRateAt(GRT, 0);

                    expect(latestRate.target).to.equal(targetRate);
                    expect(latestRate.current).to.equal(expectedCurrentRate);
                    expect(latestRate.timestamp).to.equal(currentTime);
                });

                it("The current rate jumps to the min rate if the target is less than the min rate and change is unrestricted", async function () {
                    const initialRate = ethers.utils.parseUnits("0.5", 18);
                    const minRate = ethers.utils.parseUnits("0.15", 18);
                    const targetRate = ethers.utils.parseUnits("0.1", 18);

                    await controller.stubPush(GRT, initialRate, initialRate, 1);

                    const config = {
                        ...DEFAULT_CONFIG,
                        max: MAX_RATE,
                        min: minRate,
                        base: targetRate,
                        maxIncrease: MAX_RATE,
                        maxDecrease: MAX_RATE,
                        maxPercentIncrease: MAX_PERCENT_INCREASE,
                        maxPercentDecrease: MAX_PERCENT_DECREASE,
                    };
                    await controller.setConfig(GRT, config);

                    const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);
                    const updateTx = await controller.update(updateData);
                    const currentTime = await currentBlockTimestamp();

                    const expectedCurrentRate = config.min;

                    await expect(updateTx)
                        .to.emit(controller, "RateUpdated")
                        .withArgs(GRT, targetRate, expectedCurrentRate, currentTime);

                    const latestRate = await controller.getRateAt(GRT, 0);

                    expect(latestRate.target).to.equal(targetRate);
                    expect(latestRate.current).to.equal(expectedCurrentRate);
                    expect(latestRate.timestamp).to.equal(currentTime);
                });

                it("The current rate jumps to the max rate if the target is greater than the max rate and change is unrestricted", async function () {
                    const initialRate = ethers.utils.parseUnits("0.5", 18);
                    const maxRate = ethers.utils.parseUnits("0.85", 18);
                    const targetRate = ethers.utils.parseUnits("0.9", 18);

                    await controller.stubPush(GRT, initialRate, initialRate, 1);

                    const config = {
                        ...DEFAULT_CONFIG,
                        max: maxRate,
                        min: MIN_RATE,
                        base: targetRate,
                        maxIncrease: MAX_RATE,
                        maxDecrease: MAX_RATE,
                        maxPercentIncrease: MAX_PERCENT_INCREASE,
                        maxPercentDecrease: MAX_PERCENT_DECREASE,
                    };
                    await controller.setConfig(GRT, config);

                    const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);
                    const updateTx = await controller.update(updateData);
                    const currentTime = await currentBlockTimestamp();

                    const expectedCurrentRate = config.max;

                    await expect(updateTx)
                        .to.emit(controller, "RateUpdated")
                        .withArgs(GRT, targetRate, expectedCurrentRate, currentTime);

                    const latestRate = await controller.getRateAt(GRT, 0);

                    expect(latestRate.target).to.equal(targetRate);
                    expect(latestRate.current).to.equal(expectedCurrentRate);
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

                    // Sanity check that that max increase cap is more strict than the max percent increase cap
                    const targetRateCappedByMaxIncrease = currentRate.add(DEFAULT_CONFIG.maxIncrease);
                    const targetRateCappedByMaxPercentIncrease = currentRate.add(
                        currentRate.mul(DEFAULT_CONFIG.maxPercentIncrease).div(10000)
                    );
                    expect(targetRateCappedByMaxIncrease).to.be.lt(targetRateCappedByMaxPercentIncrease);

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

                    // Sanity check that that max decrease cap is more strict than the max percent decrease cap
                    const targetRateCappedByMaxDecrease = currentRate.sub(DEFAULT_CONFIG.maxDecrease);
                    const targetRateCappedByMaxPercentDecrease = currentRate.sub(
                        currentRate.mul(DEFAULT_CONFIG.maxPercentDecrease).div(10000)
                    );
                    expect(targetRateCappedByMaxDecrease).to.be.gt(targetRateCappedByMaxPercentDecrease);

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

                it("Rate increases are limited by the max rate increase, even when the minimum rate is equal to the target rate", async function () {
                    // Get the current rate
                    const currentRate = await controller.computeRate(GRT);

                    // Push INITIAL_BUFFER_CARDINALITY updates
                    for (let i = 0; i < INITIAL_BUFFER_CARDINALITY; i++) {
                        await controller.stubPush(GRT, currentRate, currentRate, 1);
                    }

                    const targetRate = DEFAULT_CONFIG.base.add(DEFAULT_CONFIG.maxIncrease.mul(3));

                    // Sanity check that that max increase cap is more strict than the max percent increase cap
                    const targetRateCappedByMaxIncrease = currentRate.add(DEFAULT_CONFIG.maxIncrease);
                    const targetRateCappedByMaxPercentIncrease = currentRate.add(
                        currentRate.mul(DEFAULT_CONFIG.maxPercentIncrease).div(10000)
                    );
                    expect(targetRateCappedByMaxIncrease).to.be.lt(targetRateCappedByMaxPercentIncrease);

                    // Change the target rate
                    await controller.setConfig(GRT, {
                        ...DEFAULT_CONFIG,
                        min: targetRate,
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

                it("Rate decreases are limited by the max rate decrease, even when the maximum rate is equal to the target rate", async function () {
                    // Get the current rate
                    const currentRate = await controller.computeRate(GRT);

                    // Push INITIAL_BUFFER_CARDINALITY updates
                    for (let i = 0; i < INITIAL_BUFFER_CARDINALITY; i++) {
                        await controller.stubPush(GRT, currentRate, currentRate, 1);
                    }

                    const targetRate = DEFAULT_CONFIG.base.sub(DEFAULT_CONFIG.maxDecrease.mul(3));

                    // Sanity check that that max decrease cap is more strict than the max percent decrease cap
                    const targetRateCappedByMaxDecrease = currentRate.sub(DEFAULT_CONFIG.maxDecrease);
                    const targetRateCappedByMaxPercentDecrease = currentRate.sub(
                        currentRate.mul(DEFAULT_CONFIG.maxPercentDecrease).div(10000)
                    );
                    expect(targetRateCappedByMaxDecrease).to.be.gt(targetRateCappedByMaxPercentDecrease);

                    // Change the target rate
                    await controller.setConfig(GRT, {
                        ...DEFAULT_CONFIG,
                        max: targetRate,
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

                it("Rate increases are limited by the max rate percent increase", async function () {
                    // Get the current rate
                    const currentRate = await controller.computeRate(GRT);

                    // Push INITIAL_BUFFER_CARDINALITY updates
                    for (let i = 0; i < INITIAL_BUFFER_CARDINALITY; i++) {
                        await controller.stubPush(GRT, currentRate, currentRate, 1);
                    }

                    const maxIncrease = ethers.utils.parseUnits("1.0", 18);
                    const maxPercentIncrease = 10; // 0.1%

                    const cappedRate = currentRate.add(currentRate.mul(maxPercentIncrease).div(10000));
                    const targetRate = cappedRate.add(1);

                    // Sanity check that max percent increase cap is more strict than the max increase cap
                    expect(cappedRate).to.be.lt(DEFAULT_CONFIG.base.add(maxIncrease));

                    // Change the target rate
                    await controller.setConfig(GRT, {
                        ...DEFAULT_CONFIG,
                        maxIncrease: maxIncrease,
                        maxPercentIncrease: maxPercentIncrease,
                        base: targetRate,
                    });

                    const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

                    const updateTx = await controller.update(updateData);

                    const currentTime = await currentBlockTimestamp();

                    await expect(updateTx)
                        .to.emit(controller, "RateUpdated")
                        .withArgs(GRT, targetRate, cappedRate, currentTime);

                    const latestRate = await controller.getRateAt(GRT, 0);

                    expect(latestRate.target).to.equal(targetRate);
                    expect(latestRate.current).to.equal(cappedRate);
                    expect(latestRate.timestamp).to.equal(currentTime);
                });

                it("Rate decreases are limited by the max rate percent decrease", async function () {
                    // Get the current rate
                    const currentRate = await controller.computeRate(GRT);

                    // Push INITIAL_BUFFER_CARDINALITY updates
                    for (let i = 0; i < INITIAL_BUFFER_CARDINALITY; i++) {
                        await controller.stubPush(GRT, currentRate, currentRate, 1);
                    }

                    const maxDecrease = ethers.utils.parseUnits("1.0", 18);
                    const maxPercentDecrease = BigNumber.from(10); // 0.1%

                    const cappedRate = currentRate.sub(currentRate.mul(maxPercentDecrease).div(10000));
                    const targetRate = cappedRate.sub(1);

                    // Sanity check that max percent increase cap is more strict than the max increase cap
                    expect(cappedRate).to.be.gt(currentRate.sub(maxDecrease));

                    // Change the target rate
                    await controller.setConfig(GRT, {
                        ...DEFAULT_CONFIG,
                        maxDecrease: maxDecrease,
                        maxPercentDecrease: maxPercentDecrease,
                        base: targetRate,
                    });

                    const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

                    const updateTx = await controller.update(updateData);

                    const currentTime = await currentBlockTimestamp();

                    await expect(updateTx)
                        .to.emit(controller, "RateUpdated")
                        .withArgs(GRT, targetRate, cappedRate, currentTime);

                    const latestRate = await controller.getRateAt(GRT, 0);

                    expect(latestRate.target).to.equal(targetRate);
                    expect(latestRate.current).to.equal(cappedRate);
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

                    await expect(updateTx)
                        .to.emit(controller, "RateUpdated")
                        .withArgs(GRT, currentRate, currentRate, currentTime);

                    const latestRate = await controller.getRateAt(GRT, 0);

                    expect(latestRate.target).to.equal(currentRate);
                    expect(latestRate.current).to.equal(currentRate);
                    expect(latestRate.timestamp).to.equal(currentTime);
                });
            }

            describe("Update hooks", function () {
                let hookFactory;

                let hook;

                before(async function () {
                    hookFactory = await ethers.getContractFactory("HookStub");
                });

                beforeEach(async function () {
                    hook = await hookFactory.deploy();
                    await hook.deployed();
                });

                it("Calls only the pre update hook", async function () {
                    await controller.setHookConfig(HOOK_TYPE_PRE_UPDATE, {
                        allowHookFailure: false,
                        hookGasLimit: 1_000_000,
                        hookAddress: hook.address,
                    });

                    const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

                    const updateTxPromise = controller.update(updateData);

                    await expect(updateTxPromise).to.emit(controller, "RateUpdated");

                    expect(await hook.preUpdateCallCount()).to.equal(1);
                    expect(await hook.postUpdateCallCount()).to.equal(0);
                });

                it("Calls only the post update hook", async function () {
                    await controller.setHookConfig(HOOK_TYPE_POST_UPDATE, {
                        allowHookFailure: false,
                        hookGasLimit: 1_000_000,
                        hookAddress: hook.address,
                    });

                    const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

                    const updateTxPromise = controller.update(updateData);

                    await expect(updateTxPromise).to.emit(controller, "RateUpdated");

                    expect(await hook.preUpdateCallCount()).to.equal(0);
                    expect(await hook.postUpdateCallCount()).to.equal(1);
                });

                it("Reverts when the pre update hook fails (allowHookFailure = false)", async function () {
                    await controller.setHookConfig(HOOK_TYPE_PRE_UPDATE, {
                        allowHookFailure: false,
                        hookGasLimit: 1_000_000,
                        hookAddress: hook.address,
                    });

                    // Make the pre update hook fail
                    await hook.stubSetRevertPreUpdate(true);

                    const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

                    const expectedInnerError = new ethers.utils.Interface([
                        "error PreUpdateHookFailed(address token)",
                    ]).encodeErrorResult("PreUpdateHookFailed", [GRT]);

                    await expect(controller.update(updateData))
                        .to.be.revertedWith("HookFailedError")
                        .withArgs(HOOK_TYPE_PRE_UPDATE, hook.address, GRT, expectedInnerError);
                });

                it("Reverts when the post update hook fails (allowHookFailure = false)", async function () {
                    await controller.setHookConfig(HOOK_TYPE_POST_UPDATE, {
                        allowHookFailure: false,
                        hookGasLimit: 1_000_000,
                        hookAddress: hook.address,
                    });

                    // Make the post update hook fail
                    await hook.stubSetRevertPostUpdate(true);

                    const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

                    const expectedInnerError = new ethers.utils.Interface([
                        "error PostUpdateHookFailed(address token)",
                    ]).encodeErrorResult("PostUpdateHookFailed", [GRT]);

                    await expect(controller.update(updateData))
                        .to.be.revertedWith("HookFailedError")
                        .withArgs(HOOK_TYPE_POST_UPDATE, hook.address, GRT, expectedInnerError);
                });

                it("Emits a failure event when the pre update hook fails (allowHookFailure = true)", async function () {
                    await controller.setHookConfig(HOOK_TYPE_PRE_UPDATE, {
                        allowHookFailure: true,
                        hookGasLimit: 1_000_000,
                        hookAddress: hook.address,
                    });

                    // Make the pre update hook fail
                    await hook.stubSetRevertPreUpdate(true);

                    const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

                    const updateTx = await controller.update(updateData);

                    const timestamp = await currentBlockTimestamp();

                    const expectedInnerError = new ethers.utils.Interface([
                        "error PreUpdateHookFailed(address token)",
                    ]).encodeErrorResult("PreUpdateHookFailed", [GRT]);

                    await expect(updateTx)
                        .to.emit(controller, "HookFailed")
                        .withArgs(HOOK_TYPE_PRE_UPDATE, hook.address, GRT, expectedInnerError, timestamp);
                });

                it("Emits a failure event when the post update hook fails (allowHookFailure = true)", async function () {
                    await controller.setHookConfig(HOOK_TYPE_POST_UPDATE, {
                        allowHookFailure: true,
                        hookGasLimit: 1_000_000,
                        hookAddress: hook.address,
                    });

                    // Make the post update hook fail
                    await hook.stubSetRevertPostUpdate(true);

                    const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

                    const updateTx = await controller.update(updateData);

                    const timestamp = await currentBlockTimestamp();

                    const expectedInnerError = new ethers.utils.Interface([
                        "error PostUpdateHookFailed(address token)",
                    ]).encodeErrorResult("PostUpdateHookFailed", [GRT]);

                    await expect(updateTx)
                        .to.emit(controller, "HookFailed")
                        .withArgs(HOOK_TYPE_POST_UPDATE, hook.address, GRT, expectedInnerError, timestamp);
                });

                it("Reverts when the pre update hook runs out of gas (allowHookFailure = false)", async function () {
                    await controller.setHookConfig(HOOK_TYPE_PRE_UPDATE, {
                        allowHookFailure: false,
                        hookGasLimit: 1,
                        hookAddress: hook.address,
                    });

                    const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

                    await expect(controller.update(updateData))
                        .to.be.revertedWith("HookFailedError")
                        .withArgs(HOOK_TYPE_PRE_UPDATE, hook.address, GRT, "0x");
                });

                it("Reverts when the post update hook runs out of gas (allowHookFailure = false)", async function () {
                    await controller.setHookConfig(HOOK_TYPE_POST_UPDATE, {
                        allowHookFailure: false,
                        hookGasLimit: 1,
                        hookAddress: hook.address,
                    });

                    const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

                    await expect(controller.update(updateData))
                        .to.be.revertedWith("HookFailedError")
                        .withArgs(HOOK_TYPE_POST_UPDATE, hook.address, GRT, "0x");
                });

                it("Emits a failure event when the pre update hook runs out of gas (allowHookFailure = true)", async function () {
                    await controller.setHookConfig(HOOK_TYPE_PRE_UPDATE, {
                        allowHookFailure: true,
                        hookGasLimit: 1,
                        hookAddress: hook.address,
                    });

                    const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

                    const updateTx = await controller.update(updateData);

                    const timestamp = await currentBlockTimestamp();

                    await expect(updateTx)
                        .to.emit(controller, "HookFailed")
                        .withArgs(HOOK_TYPE_PRE_UPDATE, hook.address, GRT, "0x", timestamp);
                });

                it("Emits a failure event when the post update hook runs out of gas (allowHookFailure = true)", async function () {
                    await controller.setHookConfig(HOOK_TYPE_POST_UPDATE, {
                        allowHookFailure: true,
                        hookGasLimit: 1,
                        hookAddress: hook.address,
                    });

                    const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

                    const updateTx = await controller.update(updateData);

                    const timestamp = await currentBlockTimestamp();

                    await expect(updateTx)
                        .to.emit(controller, "HookFailed")
                        .withArgs(HOOK_TYPE_POST_UPDATE, hook.address, GRT, "0x", timestamp);
                });
            });

            it("Updating is non-reentrant (with pre update hook)", async function () {
                const hookFactory = await ethers.getContractFactory("ReentrantHook");

                const reentrantHook = await hookFactory.deploy(/* callUpdate */ true);
                await reentrantHook.deployed();

                await controller.setHookConfig(HOOK_TYPE_PRE_UPDATE, {
                    allowHookFailure: false,
                    hookGasLimit: 1_000_000,
                    hookAddress: reentrantHook.address,
                });

                const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

                // The selector for Error(string) is the first 4 bytes of the hash of "Error(string)"
                const selector = keccak256(toUtf8Bytes("Error(string)")).slice(0, 10); // 0x08c379a0
                const encodedReason = defaultAbiCoder.encode(["string"], ["ReentrancyGuard: reentrant call"]);
                // Full revert data = selector + encoded string (without 0x prefix)
                const expectedInnerError = selector + encodedReason.slice(2);

                await expect(controller.update(updateData))
                    .to.be.revertedWith("HookFailedError")
                    .withArgs(HOOK_TYPE_PRE_UPDATE, reentrantHook.address, GRT, expectedInnerError);
            });

            it("Updating is non-reentrant (with post update hook)", async function () {
                const hookFactory = await ethers.getContractFactory("ReentrantHook");

                const reentrantHook = await hookFactory.deploy(/* callUpdate */ true);
                await reentrantHook.deployed();

                await controller.setHookConfig(HOOK_TYPE_POST_UPDATE, {
                    allowHookFailure: false,
                    hookGasLimit: 1_000_000,
                    hookAddress: reentrantHook.address,
                });

                const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

                // The selector for Error(string) is the first 4 bytes of the hash of "Error(string)"
                const selector = keccak256(toUtf8Bytes("Error(string)")).slice(0, 10); // 0x08c379a0
                const encodedReason = defaultAbiCoder.encode(["string"], ["ReentrancyGuard: reentrant call"]);
                // Full revert data = selector + encoded string (without 0x prefix)
                const expectedInnerError = selector + encodedReason.slice(2);

                await expect(controller.update(updateData))
                    .to.be.revertedWith("HookFailedError")
                    .withArgs(HOOK_TYPE_POST_UPDATE, reentrantHook.address, GRT, expectedInnerError);
            });

            it("Manually pushing a rate is non-reentrant (with pre update hook)", async function () {
                const hookFactory = await ethers.getContractFactory("ReentrantHook");

                const reentrantHook = await hookFactory.deploy(/* callUpdate */ false);
                await reentrantHook.deployed();

                // Grant the hook the ADMIN role so that it can call manuallyPushRate
                await controller.grantRole(ADMIN_ROLE, reentrantHook.address);

                await controller.setHookConfig(HOOK_TYPE_PRE_UPDATE, {
                    allowHookFailure: false,
                    hookGasLimit: 1_000_000,
                    hookAddress: reentrantHook.address,
                });

                const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

                // The selector for Error(string) is the first 4 bytes of the hash of "Error(string)"
                const selector = keccak256(toUtf8Bytes("Error(string)")).slice(0, 10); // 0x08c379a0
                const encodedReason = defaultAbiCoder.encode(["string"], ["ReentrancyGuard: reentrant call"]);
                // Full revert data = selector + encoded string (without 0x prefix)
                const expectedInnerError = selector + encodedReason.slice(2);

                await expect(controller.update(updateData))
                    .to.be.revertedWith("HookFailedError")
                    .withArgs(HOOK_TYPE_PRE_UPDATE, reentrantHook.address, GRT, expectedInnerError);
            });

            it("Manually pushing a rate is non-reentrant (with post update hook)", async function () {
                const hookFactory = await ethers.getContractFactory("ReentrantHook");

                const reentrantHook = await hookFactory.deploy(/* callUpdate */ false);
                await reentrantHook.deployed();

                // Grant the hook the ADMIN role so that it can call manuallyPushRate
                await controller.grantRole(ADMIN_ROLE, reentrantHook.address);

                await controller.setHookConfig(HOOK_TYPE_POST_UPDATE, {
                    allowHookFailure: false,
                    hookGasLimit: 1_000_000,
                    hookAddress: reentrantHook.address,
                });

                const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

                // The selector for Error(string) is the first 4 bytes of the hash of "Error(string)"
                const selector = keccak256(toUtf8Bytes("Error(string)")).slice(0, 10); // 0x08c379a0
                const encodedReason = defaultAbiCoder.encode(["string"], ["ReentrancyGuard: reentrant call"]);
                // Full revert data = selector + encoded string (without 0x prefix)
                const expectedInnerError = selector + encodedReason.slice(2);

                await expect(controller.update(updateData))
                    .to.be.revertedWith("HookFailedError")
                    .withArgs(HOOK_TYPE_POST_UPDATE, reentrantHook.address, GRT, expectedInnerError);
            });

            if (describeAdditionalTests) {
                describeAdditionalTests(deployFunc, () => controller);
            }
        });
    };
}

function describePidControllerUpdateTests(deployFunc, getController) {
    it("The current rate jumps to the min rate if the target (0%) is less than the min rate and change is unrestricted", async function () {
        const controller = await getController();

        const period = await controller.period();

        const minRate = ethers.utils.parseUnits("0.4", 8);
        const maxRate = ethers.utils.parseUnits("0.6", 8);

        await controller.setConfig(GRT, {
            ...DEFAULT_CONFIG,
            min: minRate,
            max: maxRate,
            maxDecrease: MAX_RATE,
            maxIncrease: MAX_RATE,
            maxPercentDecrease: MAX_PERCENT_DECREASE,
            maxPercentIncrease: MAX_PERCENT_INCREASE,
        });

        // Push a starting rate of 0%
        const startingRate = ethers.utils.parseUnits("0", 8);

        await controller.manuallyPushRate(GRT, startingRate, startingRate, 1);

        // Set input and target to be the same 90% utilization
        const input = ethers.utils.parseUnits("0.90", 8);
        await controller.setTarget(GRT, input);
        await controller.setInput(GRT, input);

        // Advance the block time by the period
        await timeAndMine.increaseTime(period.toNumber());

        // Update the rate
        await controller.update(ethers.utils.defaultAbiCoder.encode(["address"], [GRT]));

        // Get the current rate
        const currentRate = await controller.computeRate(GRT);

        // The rate should be at the min rate
        expect(currentRate).to.equal(minRate);
    });

    it("The current rate jumps to the min rate if the target (1%) is less than the min rate and change is unrestricted", async function () {
        const controller = await getController();

        const period = await controller.period();

        const minRate = ethers.utils.parseUnits("0.4", 8);
        const maxRate = ethers.utils.parseUnits("0.6", 8);

        await controller.setConfig(GRT, {
            ...DEFAULT_CONFIG,
            min: minRate,
            max: maxRate,
            maxDecrease: MAX_RATE,
            maxIncrease: MAX_RATE,
            maxPercentDecrease: MAX_PERCENT_DECREASE,
            maxPercentIncrease: MAX_PERCENT_INCREASE,
        });

        // Push a starting rate of 1%
        const startingRate = ethers.utils.parseUnits("0.01", 8);

        await controller.manuallyPushRate(GRT, startingRate, startingRate, 1);

        // Set input and target to be the same 90% utilization
        const input = ethers.utils.parseUnits("0.90", 8);
        await controller.setTarget(GRT, input);
        await controller.setInput(GRT, input);

        // Advance the block time by the period
        await timeAndMine.increaseTime(period.toNumber());

        // Update the rate
        await controller.update(ethers.utils.defaultAbiCoder.encode(["address"], [GRT]));

        // Get the current rate
        const currentRate = await controller.computeRate(GRT);

        // The rate should be at the min rate
        expect(currentRate).to.equal(minRate);
    });

    it("The current rate jumps to the max rate if the target is greater than the max rate and change is unrestricted", async function () {
        const controller = await getController();

        const period = await controller.period();

        const minRate = ethers.utils.parseUnits("0.4", 8);
        const maxRate = ethers.utils.parseUnits("0.6", 8);

        await controller.setConfig(GRT, {
            ...DEFAULT_CONFIG,
            min: minRate,
            max: maxRate,
            maxDecrease: MAX_RATE,
            maxIncrease: MAX_RATE,
            maxPercentDecrease: MAX_PERCENT_DECREASE,
            maxPercentIncrease: MAX_PERCENT_INCREASE,
        });

        // Push a starting rate of 100%
        const startingRate = ethers.utils.parseUnits("1", 8);

        await controller.manuallyPushRate(GRT, startingRate, startingRate, 1);

        // Set input and target to be the same 90% utilization
        const input = ethers.utils.parseUnits("0.90", 8);
        await controller.setTarget(GRT, input);
        await controller.setInput(GRT, input);

        // Advance the block time by the period
        await timeAndMine.increaseTime(period.toNumber());

        // Update the rate
        await controller.update(ethers.utils.defaultAbiCoder.encode(["address"], [GRT]));

        // Get the current rate
        const currentRate = await controller.computeRate(GRT);

        // The rate should be at the min rate
        expect(currentRate).to.equal(maxRate);
    });

    it("Rate increases are limited by the max rate increase (within the bounds of min and max)", async function () {
        const controller = await getController();

        const period = await controller.period();

        const minRate = ethers.utils.parseUnits("0.4", 8);
        const maxRate = ethers.utils.parseUnits("0.6", 8);

        const maxIncrease = ethers.utils.parseUnits("0.01", 8);

        await controller.setConfig(GRT, {
            ...DEFAULT_CONFIG,
            min: minRate,
            max: maxRate,
            maxDecrease: MAX_RATE,
            maxIncrease: maxIncrease,
            maxPercentDecrease: MAX_PERCENT_DECREASE,
            maxPercentIncrease: MAX_PERCENT_INCREASE,
        });

        // Push a starting rate of 50%
        const startingRate = ethers.utils.parseUnits("0.5", 8);

        await controller.manuallyPushRate(GRT, startingRate, startingRate, 1);

        // Set input larger than the target to make the rate increase
        const input = ethers.utils.parseUnits("0.9", 8);
        await controller.setInput(GRT, input);
        const target = ethers.utils.parseUnits("0.1", 8);
        await controller.setTarget(GRT, target);

        // Advance the block time by the period
        await timeAndMine.increaseTime(period.toNumber());

        // Update the rate
        await controller.update(ethers.utils.defaultAbiCoder.encode(["address"], [GRT]));

        // Get the current rate
        const latestRate = await controller.getRateAt(GRT, 0);

        const expectedRate = startingRate.add(maxIncrease);

        // The rate should be at the min rate
        expect(latestRate.current).to.equal(expectedRate);

        // Sanity check that the target rate is greater than the current rate to ensure that the rate limiting is being used
        expect(latestRate.target).to.be.gt(latestRate.current);
    });

    it("Rate decreases are limited by the max rate decrease (within the bounds of min and max)", async function () {
        const controller = await getController();

        const period = await controller.period();

        const minRate = ethers.utils.parseUnits("0.4", 8);
        const maxRate = ethers.utils.parseUnits("0.6", 8);

        const maxDecrease = ethers.utils.parseUnits("0.01", 8);

        await controller.setConfig(GRT, {
            ...DEFAULT_CONFIG,
            min: minRate,
            max: maxRate,
            maxDecrease: maxDecrease,
            maxIncrease: MAX_RATE,
            maxPercentDecrease: MAX_PERCENT_DECREASE,
            maxPercentIncrease: MAX_PERCENT_INCREASE,
        });

        // Push a starting rate of 50%
        const startingRate = ethers.utils.parseUnits("0.5", 8);

        await controller.manuallyPushRate(GRT, startingRate, startingRate, 1);

        // Set input smaller than the target to make the rate decrease
        const input = ethers.utils.parseUnits("0.1", 8);
        await controller.setInput(GRT, input);
        const target = ethers.utils.parseUnits("0.9", 8);
        await controller.setTarget(GRT, target);

        // Advance the block time by the period
        await timeAndMine.increaseTime(period.toNumber());

        // Update the rate
        await controller.update(ethers.utils.defaultAbiCoder.encode(["address"], [GRT]));

        // Get the current rate
        const latestRate = await controller.getRateAt(GRT, 0);

        const expectedRate = startingRate.sub(maxDecrease);

        // The rate should be at the min rate
        expect(latestRate.current).to.equal(expectedRate);

        // Sanity check that the target rate is greater than the current rate to ensure that the rate limiting is being used
        expect(latestRate.target).to.be.lt(latestRate.current);
    });

    it("Rate increases are limited by the max rate increase (even when below the min)", async function () {
        const controller = await getController();

        const period = await controller.period();

        const minRate = ethers.utils.parseUnits("0.4", 8);
        const maxRate = ethers.utils.parseUnits("0.6", 8);

        const maxIncrease = ethers.utils.parseUnits("0.01", 8);

        await controller.setConfig(GRT, {
            ...DEFAULT_CONFIG,
            min: minRate,
            max: maxRate,
            maxDecrease: MAX_RATE,
            maxIncrease: maxIncrease,
            maxPercentDecrease: MAX_PERCENT_DECREASE,
            maxPercentIncrease: MAX_PERCENT_INCREASE,
        });

        // Push a starting rate of 0%
        const startingRate = ethers.utils.parseUnits("0", 8);

        await controller.manuallyPushRate(GRT, startingRate, startingRate, 1);

        // Set input larger than the target to make the rate increase
        const input = ethers.utils.parseUnits("0.9", 8);
        await controller.setInput(GRT, input);
        const target = ethers.utils.parseUnits("0.1", 8);
        await controller.setTarget(GRT, target);

        // Advance the block time by the period
        await timeAndMine.increaseTime(period.toNumber());

        // Update the rate
        await controller.update(ethers.utils.defaultAbiCoder.encode(["address"], [GRT]));

        // Get the current rate
        const latestRate = await controller.getRateAt(GRT, 0);

        const expectedRate = startingRate.add(maxIncrease);

        // The rate should be at the min rate
        expect(latestRate.current).to.equal(expectedRate);

        // Sanity check that the target rate is greater than the current rate to ensure that the rate limiting is being used
        expect(latestRate.target).to.be.gt(latestRate.current);
    });

    it("Rate decreases are limited by the max rate decrease (even when above the max)", async function () {
        const controller = await getController();

        const period = await controller.period();

        const minRate = ethers.utils.parseUnits("0.4", 8);
        const maxRate = ethers.utils.parseUnits("0.6", 8);

        const maxDecrease = ethers.utils.parseUnits("0.01", 8);

        await controller.setConfig(GRT, {
            ...DEFAULT_CONFIG,
            min: minRate,
            max: maxRate,
            maxDecrease: maxDecrease,
            maxIncrease: MAX_RATE,
            maxPercentDecrease: MAX_PERCENT_DECREASE,
            maxPercentIncrease: MAX_PERCENT_INCREASE,
        });

        // Push a starting rate of 100%
        const startingRate = ethers.utils.parseUnits("1", 8);

        await controller.manuallyPushRate(GRT, startingRate, startingRate, 1);

        // Set input smaller than the target to make the rate decrease
        const input = ethers.utils.parseUnits("0.1", 8);
        await controller.setInput(GRT, input);
        const target = ethers.utils.parseUnits("0.9", 8);
        await controller.setTarget(GRT, target);

        // Advance the block time by the period
        await timeAndMine.increaseTime(period.toNumber());

        // Update the rate
        await controller.update(ethers.utils.defaultAbiCoder.encode(["address"], [GRT]));

        // Get the current rate
        const latestRate = await controller.getRateAt(GRT, 0);

        const expectedRate = startingRate.sub(maxDecrease);

        // The rate should be at the min rate
        expect(latestRate.current).to.equal(expectedRate);

        // Sanity check that the target rate is greater than the current rate to ensure that the rate limiting is being used
        expect(latestRate.target).to.be.lt(latestRate.current);
    });

    it("Rate increases are limited by the max rate percent increase (within the bounds of min and max)", async function () {
        const controller = await getController();

        const period = await controller.period();

        const minRate = ethers.utils.parseUnits("0.4", 8);
        const maxRate = ethers.utils.parseUnits("0.6", 8);

        const maxPercentIncrease = BigNumber.from(10); // 10/10000 = 0.1%

        await controller.setConfig(GRT, {
            ...DEFAULT_CONFIG,
            min: minRate,
            max: maxRate,
            maxDecrease: MAX_RATE,
            maxIncrease: MAX_RATE,
            maxPercentDecrease: MAX_PERCENT_DECREASE,
            maxPercentIncrease: maxPercentIncrease,
        });

        // Push a starting rate of 50%
        const startingRate = ethers.utils.parseUnits("0.5", 8);

        await controller.manuallyPushRate(GRT, startingRate, startingRate, 1);

        // Set input larger than the target to make the rate increase
        const input = ethers.utils.parseUnits("0.9", 8);
        await controller.setInput(GRT, input);
        const target = ethers.utils.parseUnits("0.1", 8);
        await controller.setTarget(GRT, target);

        // Advance the block time by the period
        await timeAndMine.increaseTime(period.toNumber());

        // Update the rate
        await controller.update(ethers.utils.defaultAbiCoder.encode(["address"], [GRT]));

        // Get the current rate
        const latestRate = await controller.getRateAt(GRT, 0);

        const expectedRate = startingRate.add(startingRate.mul(maxPercentIncrease).div(10000));

        // The rate should be at the min rate
        expect(latestRate.current).to.equal(expectedRate);

        // Sanity check that the target rate is greater than the current rate to ensure that the rate limiting is being used
        expect(latestRate.target).to.be.gt(latestRate.current);
    });

    it("Rate decreases are limited by the max rate percent decrease (within the bounds of min and max)", async function () {
        const controller = await getController();

        const period = await controller.period();

        const minRate = ethers.utils.parseUnits("0.4", 8);
        const maxRate = ethers.utils.parseUnits("0.6", 8);

        const maxPercentDecrease = BigNumber.from(10); // 10/10000 = 0.1%

        await controller.setConfig(GRT, {
            ...DEFAULT_CONFIG,
            min: minRate,
            max: maxRate,
            maxDecrease: MAX_RATE,
            maxIncrease: MAX_RATE,
            maxPercentDecrease: maxPercentDecrease,
            maxPercentIncrease: MAX_PERCENT_INCREASE,
        });

        // Push a starting rate of 50%
        const startingRate = ethers.utils.parseUnits("0.5", 8);

        await controller.manuallyPushRate(GRT, startingRate, startingRate, 1);

        // Set input smaller than the target to make the rate decrease
        const input = ethers.utils.parseUnits("0.1", 8);
        await controller.setInput(GRT, input);
        const target = ethers.utils.parseUnits("0.9", 8);
        await controller.setTarget(GRT, target);

        // Advance the block time by the period
        await timeAndMine.increaseTime(period.toNumber());

        // Update the rate
        await controller.update(ethers.utils.defaultAbiCoder.encode(["address"], [GRT]));

        // Get the current rate
        const latestRate = await controller.getRateAt(GRT, 0);

        const expectedRate = startingRate.sub(startingRate.mul(maxPercentDecrease).div(10000));

        // The rate should be at the min rate
        expect(latestRate.current).to.equal(expectedRate);

        // Sanity check that the target rate is greater than the current rate to ensure that the rate limiting is being used
        expect(latestRate.target).to.be.lt(latestRate.current);
    });

    it("Rate increases are limited by the max rate percent increase (even when below the min)", async function () {
        const controller = await getController();

        const period = await controller.period();

        const minRate = ethers.utils.parseUnits("0.4", 8);
        const maxRate = ethers.utils.parseUnits("0.6", 8);

        const maxPercentIncrease = BigNumber.from(10); // 10/10000 = 0.1%

        await controller.setConfig(GRT, {
            ...DEFAULT_CONFIG,
            min: minRate,
            max: maxRate,
            maxDecrease: MAX_RATE,
            maxIncrease: MAX_RATE,
            maxPercentDecrease: MAX_PERCENT_DECREASE,
            maxPercentIncrease: maxPercentIncrease,
        });

        // Push a starting rate of 1%
        const startingRate = ethers.utils.parseUnits("0.01", 8);

        await controller.manuallyPushRate(GRT, startingRate, startingRate, 1);

        // Set input larger than the target to make the rate increase
        const input = ethers.utils.parseUnits("0.9", 8);
        await controller.setInput(GRT, input);
        const target = ethers.utils.parseUnits("0.1", 8);
        await controller.setTarget(GRT, target);

        // Advance the block time by the period
        await timeAndMine.increaseTime(period.toNumber());

        // Update the rate
        await controller.update(ethers.utils.defaultAbiCoder.encode(["address"], [GRT]));

        // Get the current rate
        const latestRate = await controller.getRateAt(GRT, 0);

        const expectedRate = startingRate.add(startingRate.mul(maxPercentIncrease).div(10000));

        // The rate should be at the min rate
        expect(latestRate.current).to.equal(expectedRate);

        // Sanity check that the target rate is greater than the current rate to ensure that the rate limiting is being used
        expect(latestRate.target).to.be.gt(latestRate.current);
    });

    it("Rate decreases are limited by the max rate percent decrease (even when above the max)", async function () {
        const controller = await getController();

        const period = await controller.period();

        const minRate = ethers.utils.parseUnits("0.4", 8);
        const maxRate = ethers.utils.parseUnits("0.6", 8);

        const maxPercentDecrease = BigNumber.from(10); // 10/10000 = 0.1%

        await controller.setConfig(GRT, {
            ...DEFAULT_CONFIG,
            min: minRate,
            max: maxRate,
            maxDecrease: MAX_RATE,
            maxIncrease: MAX_RATE,
            maxPercentDecrease: maxPercentDecrease,
            maxPercentIncrease: MAX_PERCENT_INCREASE,
        });

        // Push a starting rate of 0%
        const startingRate = ethers.utils.parseUnits("1", 8);

        await controller.manuallyPushRate(GRT, startingRate, startingRate, 1);

        // Set input smaller than the target to make the rate decrease
        const input = ethers.utils.parseUnits("0.1", 8);
        await controller.setInput(GRT, input);
        const target = ethers.utils.parseUnits("0.9", 8);
        await controller.setTarget(GRT, target);

        // Advance the block time by the period
        await timeAndMine.increaseTime(period.toNumber());

        // Update the rate
        await controller.update(ethers.utils.defaultAbiCoder.encode(["address"], [GRT]));

        // Get the current rate
        const latestRate = await controller.getRateAt(GRT, 0);

        const expectedRate = startingRate.sub(startingRate.mul(maxPercentDecrease).div(10000));

        // The rate should be at the min rate
        expect(latestRate.current).to.equal(expectedRate);

        // Sanity check that the target rate is greater than the current rate to ensure that the rate limiting is being used
        expect(latestRate.target).to.be.lt(latestRate.current);
    });

    it("Rate increases are not limited by the max rate percent increase when the last rate is zero", async function () {
        const controller = await getController();

        const period = await controller.period();

        const minRate = ethers.utils.parseUnits("0.4", 8);
        const maxRate = ethers.utils.parseUnits("0.6", 8);

        const maxPercentIncrease = BigNumber.from(10); // 10/10000 = 0.1%

        await controller.setConfig(GRT, {
            ...DEFAULT_CONFIG,
            min: minRate,
            max: maxRate,
            maxDecrease: MAX_RATE,
            maxIncrease: MAX_RATE,
            maxPercentDecrease: MAX_PERCENT_DECREASE,
            maxPercentIncrease: maxPercentIncrease,
        });

        // Push a starting rate of 0%
        const startingRate = ethers.utils.parseUnits("0", 8);

        await controller.manuallyPushRate(GRT, startingRate, startingRate, 1);

        // Set input larger than the target to make the rate increase
        const input = ethers.utils.parseUnits("0.9", 8);
        await controller.setInput(GRT, input);
        const target = ethers.utils.parseUnits("0.1", 8);
        await controller.setTarget(GRT, target);

        // Advance the block time by the period
        await timeAndMine.increaseTime(period.toNumber());

        // Update the rate
        await controller.update(ethers.utils.defaultAbiCoder.encode(["address"], [GRT]));

        // Get the current rate
        const latestRate = await controller.getRateAt(GRT, 0);

        // The rate should be at the min rate
        expect(latestRate.current).to.be.gte(minRate);
    });

    it("Rate increases by less than the max increase are okay", async function () {
        const controller = await getController();

        const period = await controller.period();

        const minRate = ethers.utils.parseUnits("0.4", 8);
        const maxRate = ethers.utils.parseUnits("0.6", 8);

        const maxPercentIncrease = BigNumber.from(1000); // 1000/10000 = 10% relative
        const maxIncrease = ethers.utils.parseUnits("0.1", 8); // 10% absolute

        await controller.setConfig(GRT, {
            ...DEFAULT_CONFIG,
            min: minRate,
            max: maxRate,
            maxDecrease: MAX_RATE,
            maxIncrease: maxIncrease,
            maxPercentDecrease: MAX_PERCENT_DECREASE,
            maxPercentIncrease: maxPercentIncrease,
        });

        // Push a starting rate of 50%
        const startingRate = ethers.utils.parseUnits("0.5", 8);

        await controller.manuallyPushRate(GRT, startingRate, startingRate, 1);

        // Set input larger than the target to make the rate increase
        const input = ethers.utils.parseUnits("0.9", 8);
        await controller.setInput(GRT, input);
        const target = ethers.utils.parseUnits("0.1", 8);
        await controller.setTarget(GRT, target);

        // Advance the block time by the period
        await timeAndMine.increaseTime(period.toNumber());

        // Update the rate
        await controller.update(ethers.utils.defaultAbiCoder.encode(["address"], [GRT]));

        // Get the current rate
        const latestRate = await controller.getRateAt(GRT, 0);

        const expectedRateMaxByPercent = startingRate.add(startingRate.mul(maxPercentIncrease).div(10000));
        const expectedRateMaxByAbsolute = startingRate.add(maxIncrease);

        // The rate should increase from the starting rate
        expect(latestRate.current).to.be.gt(startingRate);

        // Sanity check that the current rate is less than the expected max increases
        expect(latestRate.current).to.be.lte(expectedRateMaxByPercent);
        expect(latestRate.current).to.be.lte(expectedRateMaxByAbsolute);
    });

    it("Rate decreases by less than the max decrease are okay", async function () {
        const controller = await getController();

        const period = await controller.period();

        const minRate = ethers.utils.parseUnits("0.4", 8);
        const maxRate = ethers.utils.parseUnits("0.6", 8);

        const maxPercentDecrease = BigNumber.from(1000); // 1000/10000 = 10% relative
        const maxDecrease = ethers.utils.parseUnits("0.1", 8); // 10% absolute

        await controller.setConfig(GRT, {
            ...DEFAULT_CONFIG,
            min: minRate,
            max: maxRate,
            maxDecrease: maxDecrease,
            maxIncrease: MAX_RATE,
            maxPercentDecrease: maxPercentDecrease,
            maxPercentIncrease: MAX_PERCENT_INCREASE,
        });

        // Push a starting rate of 50%
        const startingRate = ethers.utils.parseUnits("0.5", 8);

        await controller.manuallyPushRate(GRT, startingRate, startingRate, 1);

        // Set input smaller than the target to make the rate decrease
        const input = ethers.utils.parseUnits("0.1", 8);
        await controller.setInput(GRT, input);
        const target = ethers.utils.parseUnits("0.9", 8);
        await controller.setTarget(GRT, target);

        // Advance the block time by the period
        await timeAndMine.increaseTime(period.toNumber());

        // Update the rate
        await controller.update(ethers.utils.defaultAbiCoder.encode(["address"], [GRT]));

        // Get the current rate
        const latestRate = await controller.getRateAt(GRT, 0);

        const expectedRateMaxByPercent = startingRate.sub(startingRate.mul(maxPercentDecrease).div(10000));
        const expectedRateMaxByAbsolute = startingRate.sub(maxDecrease);

        // The rate should decrease from the starting rate
        expect(latestRate.current).to.be.lt(startingRate);

        // Sanity check that the current rate is greater than the expected max decreases
        expect(latestRate.current).to.be.gte(expectedRateMaxByPercent);
        expect(latestRate.current).to.be.gte(expectedRateMaxByAbsolute);
    });

    it("The more restrictive limit (percent) is used with rate increases", async function () {
        const controller = await getController();

        const period = await controller.period();

        const minRate = ethers.utils.parseUnits("0.4", 8);
        const maxRate = ethers.utils.parseUnits("0.6", 8);

        const maxPercentIncrease = BigNumber.from(10); // 10/10000 = 0.01% relative
        const maxIncrease = ethers.utils.parseUnits("0.1", 8); // 10% absolute

        await controller.setConfig(GRT, {
            ...DEFAULT_CONFIG,
            min: minRate,
            max: maxRate,
            maxDecrease: MAX_RATE,
            maxIncrease: maxIncrease,
            maxPercentDecrease: MAX_PERCENT_DECREASE,
            maxPercentIncrease: maxPercentIncrease,
        });

        // Push a starting rate of 50%
        const startingRate = ethers.utils.parseUnits("0.5", 8);

        await controller.manuallyPushRate(GRT, startingRate, startingRate, 1);

        // Set input larger than the target to make the rate increase
        const input = ethers.utils.parseUnits("0.9", 8);
        await controller.setInput(GRT, input);
        const target = ethers.utils.parseUnits("0.1", 8);
        await controller.setTarget(GRT, target);

        // Advance the block time by the period
        await timeAndMine.increaseTime(period.toNumber());

        // Update the rate
        await controller.update(ethers.utils.defaultAbiCoder.encode(["address"], [GRT]));

        // Get the current rate
        const latestRate = await controller.getRateAt(GRT, 0);

        const expectedRateMaxByPercent = startingRate.add(startingRate.mul(maxPercentIncrease).div(10000));
        const expectedRateMaxByAbsolute = startingRate.add(maxIncrease);

        // The rate should increase from the starting rate
        expect(latestRate.current).to.eq(expectedRateMaxByPercent);

        // Sanity check that the current rate is less than the both expected max increases
        expect(latestRate.current).to.be.lte(expectedRateMaxByPercent);
        expect(latestRate.current).to.be.lte(expectedRateMaxByAbsolute);

        // Sanity check that the percent change is the more restrictive limit
        expect(expectedRateMaxByPercent).to.be.lt(expectedRateMaxByAbsolute);
    });

    it("The more restrictive limit (absolute) is used with rate increases", async function () {
        const controller = await getController();

        const period = await controller.period();

        const minRate = ethers.utils.parseUnits("0.4", 8);
        const maxRate = ethers.utils.parseUnits("0.6", 8);

        const maxPercentIncrease = BigNumber.from(1000); // 1000/10000 = 10% relative
        const maxIncrease = ethers.utils.parseUnits("0.0001", 8); // 0.01% absolute

        await controller.setConfig(GRT, {
            ...DEFAULT_CONFIG,
            min: minRate,
            max: maxRate,
            maxDecrease: MAX_RATE,
            maxIncrease: maxIncrease,
            maxPercentDecrease: MAX_PERCENT_DECREASE,
            maxPercentIncrease: maxPercentIncrease,
        });

        // Push a starting rate of 50%
        const startingRate = ethers.utils.parseUnits("0.5", 8);

        await controller.manuallyPushRate(GRT, startingRate, startingRate, 1);

        // Set input larger than the target to make the rate increase
        const input = ethers.utils.parseUnits("0.9", 8);
        await controller.setInput(GRT, input);
        const target = ethers.utils.parseUnits("0.1", 8);
        await controller.setTarget(GRT, target);

        // Advance the block time by the period
        await timeAndMine.increaseTime(period.toNumber());

        // Update the rate
        await controller.update(ethers.utils.defaultAbiCoder.encode(["address"], [GRT]));

        // Get the current rate
        const latestRate = await controller.getRateAt(GRT, 0);

        const expectedRateMaxByPercent = startingRate.add(startingRate.mul(maxPercentIncrease).div(10000));
        const expectedRateMaxByAbsolute = startingRate.add(maxIncrease);

        // The rate should increase from the starting rate
        expect(latestRate.current).to.eq(expectedRateMaxByAbsolute);

        // Sanity check that the current rate is less than the both expected max increases
        expect(latestRate.current).to.be.lte(expectedRateMaxByPercent);
        expect(latestRate.current).to.be.lte(expectedRateMaxByAbsolute);

        // Sanity check that the absolute change is the more restrictive limit
        expect(expectedRateMaxByAbsolute).to.be.lt(expectedRateMaxByPercent);
    });

    it("The more restrictive limit (percent) is used with rate decreases", async function () {
        const controller = await getController();

        const period = await controller.period();

        const minRate = ethers.utils.parseUnits("0.4", 8);
        const maxRate = ethers.utils.parseUnits("0.6", 8);

        const maxPercentDecrease = BigNumber.from(10); // 10/10000 = 0.01% relative
        const maxDecrease = ethers.utils.parseUnits("0.1", 8); // 10% absolute

        await controller.setConfig(GRT, {
            ...DEFAULT_CONFIG,
            min: minRate,
            max: maxRate,
            maxDecrease: maxDecrease,
            maxIncrease: MAX_RATE,
            maxPercentDecrease: maxPercentDecrease,
            maxPercentIncrease: MAX_PERCENT_INCREASE,
        });

        // Push a starting rate of 50%
        const startingRate = ethers.utils.parseUnits("0.5", 8);

        await controller.manuallyPushRate(GRT, startingRate, startingRate, 1);

        // Set input smaller than the target to make the rate decreases
        const input = ethers.utils.parseUnits("0.1", 8);
        await controller.setInput(GRT, input);
        const target = ethers.utils.parseUnits("0.9", 8);
        await controller.setTarget(GRT, target);

        // Advance the block time by the period
        await timeAndMine.increaseTime(period.toNumber());

        // Update the rate
        await controller.update(ethers.utils.defaultAbiCoder.encode(["address"], [GRT]));

        // Get the current rate
        const latestRate = await controller.getRateAt(GRT, 0);

        const expectedRateMaxByPercent = startingRate.sub(startingRate.mul(maxPercentDecrease).div(10000));
        const expectedRateMaxByAbsolute = startingRate.sub(maxDecrease);

        // The rate should decrease from the starting rate
        expect(latestRate.current).to.eq(expectedRateMaxByPercent);

        // Sanity check that the current rate is less than the both expected max decreases
        expect(latestRate.current).to.be.gte(expectedRateMaxByPercent);
        expect(latestRate.current).to.be.gte(expectedRateMaxByAbsolute);

        // Sanity check that the percent change is the more restrictive limit
        expect(expectedRateMaxByPercent).to.be.gt(expectedRateMaxByAbsolute);
    });

    it("The more restrictive limit (absolute) is used with rate decreases", async function () {
        const controller = await getController();

        const period = await controller.period();

        const minRate = ethers.utils.parseUnits("0.4", 8);
        const maxRate = ethers.utils.parseUnits("0.6", 8);

        const maxPercentDecrease = BigNumber.from(1000); // 1000/10000 = 10% relative
        const maxDecrease = ethers.utils.parseUnits("0.0001", 8); // 0.01% absolute

        await controller.setConfig(GRT, {
            ...DEFAULT_CONFIG,
            min: minRate,
            max: maxRate,
            maxDecrease: maxDecrease,
            maxIncrease: MAX_RATE,
            maxPercentDecrease: maxPercentDecrease,
            maxPercentIncrease: MAX_PERCENT_INCREASE,
        });

        // Push a starting rate of 50%
        const startingRate = ethers.utils.parseUnits("0.5", 8);

        await controller.manuallyPushRate(GRT, startingRate, startingRate, 1);

        // Set input smaller than the target to make the rate decreases
        const input = ethers.utils.parseUnits("0.1", 8);
        await controller.setInput(GRT, input);
        const target = ethers.utils.parseUnits("0.9", 8);
        await controller.setTarget(GRT, target);

        // Advance the block time by the period
        await timeAndMine.increaseTime(period.toNumber());

        // Update the rate
        await controller.update(ethers.utils.defaultAbiCoder.encode(["address"], [GRT]));

        // Get the current rate
        const latestRate = await controller.getRateAt(GRT, 0);

        const expectedRateMaxByPercent = startingRate.sub(startingRate.mul(maxPercentDecrease).div(10000));
        const expectedRateMaxByAbsolute = startingRate.sub(maxDecrease);

        // The rate should decrease from the starting rate
        expect(latestRate.current).to.eq(expectedRateMaxByAbsolute);

        // Sanity check that the current rate is less than the both expected max decreases
        expect(latestRate.current).to.be.gte(expectedRateMaxByPercent);
        expect(latestRate.current).to.be.gte(expectedRateMaxByAbsolute);

        // Sanity check that the absolute change is the more restrictive limit
        expect(expectedRateMaxByAbsolute).to.be.gt(expectedRateMaxByPercent);
    });

    it("Clamps current and target rates to uint64.max", async function () {
        const controller = await getController();

        const period = await controller.period();

        await controller.setConfig(GRT, {
            ...DEFAULT_CONFIG,
            maxIncrease: MAX_RATE,
            maxDecrease: MAX_RATE,
            max: MAX_RATE,
            min: BigNumber.from(0),
        });
        await controller.setPidConfig(GRT, {
            ...DEFAULT_PID_CONFIG,
            kPDenominator: BigNumber.from(1),
            kIDenominator: BigNumber.from(1),
        });

        // Set input larger than the target to make the rate increase
        const input = ethers.utils.parseUnits("0.9", 8);
        await controller.setInput(GRT, input);
        const target = ethers.utils.parseUnits("0.1", 8);
        await controller.setTarget(GRT, target);

        const startingRate = MAX_RATE.sub(2);

        await controller.manuallyPushRate(GRT, startingRate, startingRate, 1);

        // Advance the block time by the period
        await timeAndMine.increaseTime(period.toNumber());

        // Update the rate
        await controller.update(ethers.utils.defaultAbiCoder.encode(["address"], [GRT]));

        // Get the current rate
        const latestRate = await controller.getRateAt(GRT, 0);

        expect(latestRate.current).to.eq(MAX_RATE);
        expect(latestRate.target).to.eq(MAX_RATE);
    });

    it("Negative real target and current rates are clamped to 0", async function () {
        const controller = await getController();

        const period = await controller.period();

        await controller.setConfig(GRT, {
            ...DEFAULT_CONFIG,
            maxIncrease: MAX_RATE,
            maxDecrease: MAX_RATE,
            max: MAX_RATE,
            min: BigNumber.from(0),
        });
        await controller.setPidConfig(GRT, {
            ...DEFAULT_PID_CONFIG,
            kPDenominator: BigNumber.from(1),
            kIDenominator: BigNumber.from(1),
        });

        // Set input smaller than the target to make the rate decrease
        const input = ethers.utils.parseUnits("0.1", 8);
        await controller.setInput(GRT, input);
        const target = ethers.utils.parseUnits("0.9", 8);
        await controller.setTarget(GRT, target);

        const startingRate = BigNumber.from(0);

        await controller.manuallyPushRate(GRT, startingRate, startingRate, 1);

        // Advance the block time by the period
        await timeAndMine.increaseTime(period.toNumber());

        // Update the rate
        await controller.update(ethers.utils.defaultAbiCoder.encode(["address"], [GRT]));

        // Get the current rate
        const latestRate = await controller.getRateAt(GRT, 0);

        expect(latestRate.current).to.eq(0);
        expect(latestRate.target).to.eq(0);
    });

    it("A large iTerm does not break the clamping mechanism", async function () {
        const controller = await getController();

        const period = await controller.period();

        const maxIncrease = BigNumber.from(100);
        const maxDecrease = BigNumber.from(100);

        await controller.setConfig(GRT, {
            ...DEFAULT_CONFIG,
            maxIncrease: maxIncrease,
            maxDecrease: MAX_RATE,
            max: MAX_RATE,
            min: BigNumber.from(0),
        });
        await controller.setPidConfig(GRT, {
            ...DEFAULT_PID_CONFIG,
            kPDenominator: BigNumber.from(1),
            kIDenominator: BigNumber.from(1),
        });

        // Set input larger than the target to make the rate increase
        const input = ethers.utils.parseUnits("0.9", 8);
        await controller.setInput(GRT, input);
        const target = ethers.utils.parseUnits("0.1", 8);
        await controller.setTarget(GRT, target);

        const startingRate = MAX_RATE.sub(200);

        await controller.manuallyPushRate(GRT, startingRate, startingRate, 1);

        await controller.stubSetITerm(GRT, BigNumber.from(2).pow(65));

        // Advance the block time by the period
        await timeAndMine.increaseTime(period.toNumber());

        // Update the rate
        await controller.update(ethers.utils.defaultAbiCoder.encode(["address"], [GRT]));

        // Get the current rate
        const latestRate = await controller.getRateAt(GRT, 0);

        const expectedRate = startingRate.add(maxIncrease);

        expect(latestRate.current).to.eq(expectedRate);
        expect(latestRate.target).to.eq(MAX_RATE);
    });

    it("Prevents windup when the rate is capped by the min rate (=0%)", async function () {
        const controller = await getController();

        const period = await controller.period();

        const minRate = BigNumber.from(0);
        const maxRate = ethers.utils.parseUnits("1", 8);

        await controller.setConfig(GRT, {
            ...DEFAULT_CONFIG,
            min: minRate,
            max: maxRate,
        });

        // Push a starting rate of 10%
        const startingRate = ethers.utils.parseUnits("0.10", 8);
        await controller.manuallyPushRate(GRT, startingRate, startingRate, 1);

        // Set the target rate to 90%
        const targetRate = ethers.utils.parseUnits("0.90", 8);
        await controller.setTarget(GRT, targetRate);

        // Set the input rate to 0% to cause the rate to decrease
        const inputRate = ethers.utils.parseUnits("0.10", 8);
        await controller.setInput(GRT, inputRate);

        var updatesAtTheMinRate = 0;
        const magicNumber = 10;

        for (var i = 0; i < 100; ++i) {
            // Advance the block time by the period
            await timeAndMine.increaseTime(period.toNumber());

            // Update the rate
            await controller.update(ethers.utils.defaultAbiCoder.encode(["address"], [GRT]));

            // Get the current rate
            const currentRate = await controller.computeRate(GRT);

            // If the current rate is at the min rate, increment the counter
            if (currentRate.eq(minRate)) {
                updatesAtTheMinRate++;
            }

            // The rate should not be lower than the min rate
            expect(currentRate).to.be.gte(minRate);

            if (updatesAtTheMinRate >= magicNumber) {
                break;
            }
        }

        // Confirm that the rate has been at the min rate for at least magicNumber updates
        expect(updatesAtTheMinRate).to.be.gte(magicNumber);

        // Set the input rate to 100% to cause the rate to increase
        await controller.setInput(GRT, ethers.utils.parseUnits("1", 8));

        // Mine one more update
        await timeAndMine.increaseTime(period.toNumber());
        await controller.update(ethers.utils.defaultAbiCoder.encode(["address"], [GRT]));

        // Get the current rate
        const currentRate = await controller.computeRate(GRT);

        // Confirm that the rate is above the min rate
        // If windup occurred, the rate will be at the min rate
        expect(currentRate).to.be.gt(minRate);
    });

    it("Prevents windup when the rate is capped by the min rate (=1%)", async function () {
        const controller = await getController();

        const period = await controller.period();

        const minRate = ethers.utils.parseUnits("0.01", 8);
        const maxRate = ethers.utils.parseUnits("1", 8);

        await controller.setConfig(GRT, {
            ...DEFAULT_CONFIG,
            min: minRate,
            max: maxRate,
        });

        // Push a starting rate of 10%
        const startingRate = ethers.utils.parseUnits("0.10", 8);
        await controller.manuallyPushRate(GRT, startingRate, startingRate, 1);

        // Set the target rate to 90%
        const targetRate = ethers.utils.parseUnits("0.90", 8);
        await controller.setTarget(GRT, targetRate);

        // Set the input rate to 0% to cause the rate to decrease
        const inputRate = ethers.utils.parseUnits("0.10", 8);
        await controller.setInput(GRT, inputRate);

        var updatesAtTheMinRate = 0;
        const magicNumber = 10;

        for (var i = 0; i < 100; ++i) {
            // Advance the block time by the period
            await timeAndMine.increaseTime(period.toNumber());

            // Update the rate
            await controller.update(ethers.utils.defaultAbiCoder.encode(["address"], [GRT]));

            // Get the current rate
            const currentRate = await controller.computeRate(GRT);

            // If the current rate is at the min rate, increment the counter
            if (currentRate.eq(minRate)) {
                updatesAtTheMinRate++;
            }

            // The rate should not be lower than the min rate
            expect(currentRate).to.be.gte(minRate);

            if (updatesAtTheMinRate >= magicNumber) {
                break;
            }
        }

        // Confirm that the rate has been at the min rate for at least magicNumber updates
        expect(updatesAtTheMinRate).to.be.gte(magicNumber);

        // Set the input rate to 100% to cause the rate to increase
        await controller.setInput(GRT, ethers.utils.parseUnits("1", 8));

        // Mine one more update
        await timeAndMine.increaseTime(period.toNumber());
        await controller.update(ethers.utils.defaultAbiCoder.encode(["address"], [GRT]));

        // Get the current rate
        const currentRate = await controller.computeRate(GRT);

        // Confirm that the rate is above the min rate
        // If windup occurred, the rate will be at the min rate
        expect(currentRate).to.be.gt(minRate);
    });

    it("Prevents windup when the rate is capped by the max rate", async function () {
        const controller = await getController();

        const period = await controller.period();

        const minRate = ethers.utils.parseUnits("0", 8);
        const maxRate = ethers.utils.parseUnits("1", 8);

        // Set min to 0
        await controller.setConfig(GRT, {
            ...DEFAULT_CONFIG,
            min: minRate,
            max: maxRate,
        });

        // Push a starting rate of 90%
        const startingRate = ethers.utils.parseUnits("0.90", 8);
        await controller.manuallyPushRate(GRT, startingRate, startingRate, 1);

        // Set the target rate to 90%
        const targetRate = ethers.utils.parseUnits("0.90", 8);
        await controller.setTarget(GRT, targetRate);

        // Set the input rate to 190% to cause the rate to increase
        const inputRate = ethers.utils.parseUnits("1.9", 8);
        await controller.setInput(GRT, inputRate);

        var updatesAtTheMinRate = 0;
        const magicNumber = 10;

        for (var i = 0; i < 100; ++i) {
            // Advance the block time by the period
            await timeAndMine.increaseTime(period.toNumber());

            // Update the rate
            await controller.update(ethers.utils.defaultAbiCoder.encode(["address"], [GRT]));

            // Get the current rate
            const currentRate = await controller.computeRate(GRT);

            // If the current rate is at the min rate, increment the counter
            if (currentRate.eq(maxRate)) {
                updatesAtTheMinRate++;
            }

            // The rate should not be higher than the max rate
            expect(currentRate).to.be.lte(maxRate);

            if (updatesAtTheMinRate >= magicNumber) {
                break;
            }
        }

        // Confirm that the rate has been at the min rate for at least magicNumber updates
        expect(updatesAtTheMinRate).to.be.gte(magicNumber);

        // Set the input rate to 0% to cause the rate to decrease
        await controller.setInput(GRT, ethers.utils.parseUnits("0", 8));

        // Mine one more update
        await timeAndMine.increaseTime(period.toNumber());
        await controller.update(ethers.utils.defaultAbiCoder.encode(["address"], [GRT]));

        // Get the current rate
        const currentRate = await controller.computeRate(GRT);

        // Confirm that the rate is below the max rate
        // If windup occurred, the rate will be at the max rate
        expect(currentRate).to.be.lt(maxRate);
    });

    it("Manually pushing a rate reinitializes the PID controller", async function () {
        const controller = await getController();

        const period = await controller.period();

        const startingRate = ethers.utils.parseUnits("0.234", 8);
        await controller.manuallyPushRate(GRT, startingRate, startingRate, 1);

        // Set input and target to the same 90% (using 8 decimals of input precision)
        const targetRate = ethers.utils.parseUnits("0.90", 8);
        await controller.setTarget(GRT, targetRate);
        await controller.setInput(GRT, targetRate);

        // Advance the block time by the period
        await timeAndMine.increaseTime(period.toNumber());

        // Update the rate
        await controller.update(ethers.utils.defaultAbiCoder.encode(["address"], [GRT]));

        // Get the current rate
        const currentRate = await controller.computeRate(GRT);

        // Confirm that the new rate equals the manually pushed rate
        // If the PID controller is not reinitialized, the rate will be the same as rate before the manually pushed rate (0)
        expect(currentRate).to.equal(startingRate);
    });

    it("Manually pushing a rate does not result in kickback with the next update", async function () {
        const controller = await getController();

        const period = await controller.period();

        // Set input and target to the same 90% (using 8 decimals of input precision)
        const targetRate = ethers.utils.parseUnits("0.90", 8);
        const inputRate = ethers.utils.parseUnits("0.10", 8);
        await controller.setTarget(GRT, targetRate);
        await controller.setInput(GRT, inputRate);

        const startingRate = ethers.utils.parseUnits("0.234", 8);
        await controller.manuallyPushRate(GRT, startingRate, startingRate, 1);

        // Advance the block time by the period
        await timeAndMine.increaseTime(period.toNumber());

        // Update the rate
        await controller.update(ethers.utils.defaultAbiCoder.encode(["address"], [GRT]));

        // Get the current rate
        const currentRate = await controller.computeRate(GRT);

        // Calculate expected rate: The proportional component should not kick
        const error = targetRate.sub(inputRate);
        const expectedChange = error.mul(DEFAULT_PID_CONFIG.kINumerator).div(DEFAULT_PID_CONFIG.kIDenominator);
        const expectedRate = startingRate.add(expectedChange);

        // Confirm that the new rate equals the manually pushed rate
        // If the PID controller is not reinitialized, the rate will be the same as rate before the manually pushed rate (0)
        expect(currentRate).to.equal(expectedRate);
    });

    it("It works with a transformer", async function () {
        const deployment1 = await deployFunc();
        const deployment2 = await deployFunc();

        const controller1 = deployment1.controller;
        const controller2 = deployment2.controller;

        const transformerFactory = await ethers.getContractFactory("NegativeErrorScalingTransformer");
        const transformer = await transformerFactory.deploy(2, 1);
        await transformer.deployed();

        const period = await controller1.period();

        const minRate = ethers.utils.parseUnits("0.1", 8);
        const maxRate = ethers.utils.parseUnits("1", 8);

        const maxPercentIncrease = BigNumber.from(2000); // 1000/10000 = 20% relative
        const maxIncrease = ethers.utils.parseUnits("0.2", 8); // 20% absolute

        const config = {
            ...DEFAULT_CONFIG,
            min: minRate,
            max: maxRate,
            maxDecrease: MAX_RATE,
            maxIncrease: maxIncrease,
            maxPercentDecrease: MAX_PERCENT_DECREASE,
            maxPercentIncrease: maxPercentIncrease,
        };

        // Get our signer address
        const [signer] = await ethers.getSigners();

        // Grant all roles to the signer
        await controller1.grantRole(ORACLE_UPDATER_MANAGER_ROLE, signer.address);
        await controller1.grantRole(ORACLE_UPDATER_ROLE, signer.address);
        await controller1.grantRole(RATE_ADMIN_ROLE, signer.address);
        await controller1.grantRole(UPDATE_PAUSE_ADMIN_ROLE, signer.address);
        await controller2.grantRole(ORACLE_UPDATER_MANAGER_ROLE, signer.address);
        await controller2.grantRole(ORACLE_UPDATER_ROLE, signer.address);
        await controller2.grantRole(RATE_ADMIN_ROLE, signer.address);
        await controller2.grantRole(UPDATE_PAUSE_ADMIN_ROLE, signer.address);

        await controller1.setConfig(GRT, config);
        await controller2.setConfig(GRT, config);

        await controller1.setPidConfig(GRT, DEFAULT_PID_CONFIG);
        await controller2.setPidConfig(GRT, { ...DEFAULT_PID_CONFIG, transformer: transformer.address });

        // Push a starting rate of 50%
        const startingRate = ethers.utils.parseUnits("0.5", 8);

        await controller1.manuallyPushRate(GRT, startingRate, startingRate, 1);
        await controller2.manuallyPushRate(GRT, startingRate, startingRate, 1);

        // Set input larger than the target to make the rate increase
        const input = ethers.utils.parseUnits("0.9", 8);
        await controller1.setInput(GRT, input);
        await controller2.setInput(GRT, input);
        const target = ethers.utils.parseUnits("0.1", 8);
        await controller1.setTarget(GRT, target);
        await controller2.setTarget(GRT, target);

        // Advance the block time by the period
        await timeAndMine.increaseTime(period.toNumber());

        // Update the rates
        await controller1.update(ethers.utils.defaultAbiCoder.encode(["address"], [GRT]));
        await controller2.update(ethers.utils.defaultAbiCoder.encode(["address"], [GRT]));

        // Get the current rate
        const latestRateWithoutTransformer = await controller1.getRateAt(GRT, 0);
        const latestRateWithTransformer = await controller2.getRateAt(GRT, 0);

        // Both rates should increase from the starting rate
        expect(latestRateWithoutTransformer.current).to.be.gt(startingRate);
        expect(latestRateWithTransformer.current).to.be.gt(startingRate);

        // The rate with the transformer should be larger
        expect(latestRateWithTransformer.current).to.be.gt(latestRateWithoutTransformer.current);
    });

    it("Uses a token-specific input and error oracle", async function () {
        const oracleFactory = await ethers.getContractFactory("InputAndErrorAccumulatorStub");
        const oracle = await oracleFactory.deploy();
        await oracle.deployed();

        await controller.setPidConfig(GRT, {
            ...DEFAULT_PID_CONFIG,
            inputAndErrorOracle: oracle.address,
        });

        const oldOracleInput = ethers.utils.parseUnits("0.5", 8);
        const newOracleInput = ethers.utils.parseUnits("0.9", 8);

        await controller.setInput(GRT, oldOracleInput);
        await oracle.setInput(GRT, newOracleInput);

        const inputAndError = await controller.stubGetInputAndError(GRT);

        expect(inputAndError.input).to.eq(newOracleInput);
    });

    it("Uses proportional on error when selected", async function () {
        const controller = await getController();

        const period = await controller.period();

        // Unrestricted change config
        const config = {
            ...DEFAULT_CONFIG,
            min: MIN_RATE,
            max: MAX_RATE,
            maxDecrease: MAX_RATE,
            maxIncrease: MAX_RATE,
            maxPercentDecrease: MAX_PERCENT_DECREASE,
            maxPercentIncrease: MAX_PERCENT_INCREASE,
        };

        await controller.setConfig(GRT, config);

        const pidConfig = {
            ...DEFAULT_PID_CONFIG,
            proportionalOnMeasurement: false,
            kINumerator: BigNumber.from(0), // Disable integral
            kDNumerator: BigNumber.from(0), // Disable derivative
            kPNumerator: BigNumber.from(-1),
            kPDenominator: BigNumber.from(100),
        };

        await controller.setPidConfig(GRT, pidConfig);

        // Push a starting rate of 50%
        const startingRate = ethers.utils.parseUnits("0.5", 8);

        await controller.manuallyPushRate(GRT, startingRate, startingRate, 1);

        // Set input larger than the target to make the rate increase
        const input = ethers.utils.parseUnits("0.9", 8);
        await controller.setInput(GRT, input);
        const target = ethers.utils.parseUnits("0.1", 8);
        await controller.setTarget(GRT, target);

        // Advance the block time by the period
        await timeAndMine.increaseTime(period.toNumber());

        // Update the rate
        await controller.update(ethers.utils.defaultAbiCoder.encode(["address"], [GRT]));

        const error = target.sub(input);

        const expectedChange = error.mul(pidConfig.kPNumerator).div(pidConfig.kPDenominator);
        const expectedRate = startingRate.add(expectedChange);

        // Get the current rate
        const latestRate = await controller.getRateAt(GRT, 0);

        // The rate should increase from the starting rate
        expect(latestRate.current).to.eq(expectedRate);
    });

    it("Uses proportional on measurement when selected", async function () {
        const controller = await getController();

        const period = await controller.period();

        // Unrestricted change config
        const config = {
            ...DEFAULT_CONFIG,
            min: MIN_RATE,
            max: MAX_RATE,
            maxDecrease: MAX_RATE,
            maxIncrease: MAX_RATE,
            maxPercentDecrease: MAX_PERCENT_DECREASE,
            maxPercentIncrease: MAX_PERCENT_INCREASE,
        };

        await controller.setConfig(GRT, config);

        const pidConfig = {
            ...DEFAULT_PID_CONFIG,
            proportionalOnMeasurement: true,
            kINumerator: BigNumber.from(0), // Disable integral
            kDNumerator: BigNumber.from(0), // Disable derivative
            kPNumerator: BigNumber.from(-1),
            kPDenominator: BigNumber.from(100),
        };

        await controller.setPidConfig(GRT, pidConfig);

        // Push a starting rate of 50%
        const startingRate = ethers.utils.parseUnits("0.5", 8);

        await controller.manuallyPushRate(GRT, startingRate, startingRate, 1);

        // Set input larger than the target to make the rate increase
        const input = ethers.utils.parseUnits("0.9", 8);
        await controller.setInput(GRT, input);
        const target = ethers.utils.parseUnits("0.1", 8);
        await controller.setTarget(GRT, target);

        // Advance the block time by the period
        await timeAndMine.increaseTime(period.toNumber());

        // Update the rate
        await controller.update(ethers.utils.defaultAbiCoder.encode(["address"], [GRT]));

        const expectedChange = input.mul(pidConfig.kPNumerator).div(pidConfig.kPDenominator);
        const expectedRate = startingRate.sub(expectedChange);

        // Get the current rate
        const latestRate = await controller.getRateAt(GRT, 0);

        // The rate should increase from the starting rate
        expect(latestRate.current).to.eq(expectedRate);
    });

    it("Uses derivative on error when selected", async function () {
        const controller = await getController();

        const period = await controller.period();

        // Unrestricted change config
        const config = {
            ...DEFAULT_CONFIG,
            min: MIN_RATE,
            max: MAX_RATE,
            maxDecrease: MAX_RATE,
            maxIncrease: MAX_RATE,
            maxPercentDecrease: MAX_PERCENT_DECREASE,
            maxPercentIncrease: MAX_PERCENT_INCREASE,
        };

        await controller.setConfig(GRT, config);

        const pidConfig = {
            ...DEFAULT_PID_CONFIG,
            derivativeOnMeasurement: false,
            kINumerator: BigNumber.from(0), // Disable integral
            kPNumerator: BigNumber.from(0), // Disable proportional
            kDNumerator: BigNumber.from(1000),
            kDDenominator: BigNumber.from(10000),
        };

        await controller.setPidConfig(GRT, pidConfig);

        // Push a starting rate of 50%
        const startingRate = ethers.utils.parseUnits("0.5", 8);

        const pushTx = await controller.manuallyPushRate(GRT, startingRate, startingRate, 1);

        // Get time of the push
        const pushTime = (await ethers.provider.getBlock(pushTx.blockNumber)).timestamp;

        const startingError = 0;

        // Set input larger than the target to make the rate increase
        const input = ethers.utils.parseUnits("0.9", 8);
        await controller.setInput(GRT, input);
        const target = ethers.utils.parseUnits("0.1", 8);
        await controller.setTarget(GRT, target);

        // Advance the block time by the period
        await timeAndMine.increaseTime(period.toNumber());

        // Update the rate
        const updateTx = await controller.update(ethers.utils.defaultAbiCoder.encode(["address"], [GRT]));

        // Get time of the update
        const updateTime = (await ethers.provider.getBlock(updateTx.blockNumber)).timestamp;

        const error = target.sub(input);
        const deltaError = error.sub(startingError);
        const deltaTime = updateTime - pushTime;
        const dTerm = deltaError.mul(pidConfig.kDNumerator).div(pidConfig.kDDenominator).div(deltaTime).mul(-1);

        const expectedRate = startingRate.sub(dTerm);

        // Get the current rate
        const latestRate = await controller.getRateAt(GRT, 0);

        // The rate should increase from the starting rate
        expect(latestRate.current).to.eq(expectedRate);
    });

    it("Uses derivative on measurement when selected", async function () {
        const controller = await getController();

        const period = await controller.period();

        // Unrestricted change config
        const config = {
            ...DEFAULT_CONFIG,
            min: MIN_RATE,
            max: MAX_RATE,
            maxDecrease: MAX_RATE,
            maxIncrease: MAX_RATE,
            maxPercentDecrease: MAX_PERCENT_DECREASE,
            maxPercentIncrease: MAX_PERCENT_INCREASE,
        };

        await controller.setConfig(GRT, config);

        const pidConfig = {
            ...DEFAULT_PID_CONFIG,
            derivativeOnMeasurement: true,
            kINumerator: BigNumber.from(0), // Disable integral
            kPNumerator: BigNumber.from(0), // Disable proportional
            kDNumerator: BigNumber.from(1000),
            kDDenominator: BigNumber.from(10000),
        };

        await controller.setPidConfig(GRT, pidConfig);

        // Push a starting rate of 50%
        const startingRate = ethers.utils.parseUnits("0.5", 8);

        const pushTx = await controller.manuallyPushRate(GRT, startingRate, startingRate, 1);

        // Get time of the push
        const pushTime = (await ethers.provider.getBlock(pushTx.blockNumber)).timestamp;

        const startingInput = 0;

        // Set input larger than the target to make the rate increase
        const input = ethers.utils.parseUnits("0.9", 8);
        await controller.setInput(GRT, input);
        const target = ethers.utils.parseUnits("0.1", 8);
        await controller.setTarget(GRT, target);

        // Advance the block time by the period
        await timeAndMine.increaseTime(period.toNumber());

        // Update the rate
        const updateTx = await controller.update(ethers.utils.defaultAbiCoder.encode(["address"], [GRT]));

        // Get time of the update
        const updateTime = (await ethers.provider.getBlock(updateTx.blockNumber)).timestamp;

        const deltaInput = input.sub(startingInput);
        const deltaTime = updateTime - pushTime;
        const dTerm = deltaInput.mul(pidConfig.kDNumerator).div(pidConfig.kDDenominator).div(deltaTime);

        const expectedRate = startingRate.sub(dTerm);

        // Get the current rate
        const latestRate = await controller.getRateAt(GRT, 0);

        // The rate should increase from the starting rate
        expect(latestRate.current).to.eq(expectedRate);
    });

    it("Doesn't calculate the derivative when we're calculating the first rate", async function () {
        const controller = await getController();

        const period = await controller.period();

        // Unrestricted change config
        const config = {
            ...DEFAULT_CONFIG,
            min: MIN_RATE,
            max: MAX_RATE,
            maxDecrease: MAX_RATE,
            maxIncrease: MAX_RATE,
            maxPercentDecrease: MAX_PERCENT_DECREASE,
            maxPercentIncrease: MAX_PERCENT_INCREASE,
        };

        await controller.setConfig(GRT, config);

        const pidConfig = {
            ...DEFAULT_PID_CONFIG,
            kINumerator: BigNumber.from(0), // Disable integral
            kPNumerator: BigNumber.from(0), // Disable proportional
            kDNumerator: BigNumber.from(1000),
            kDDenominator: BigNumber.from(10000),
        };

        await controller.setPidConfig(GRT, pidConfig);

        // Set input larger than the target to make the rate increase
        const input = ethers.utils.parseUnits("0.9", 8);
        await controller.setInput(GRT, input);
        const target = ethers.utils.parseUnits("0.1", 8);
        await controller.setTarget(GRT, target);

        // Advance the block time by the period
        await timeAndMine.increaseTime(period.toNumber());

        // Update the rate
        await controller.update(ethers.utils.defaultAbiCoder.encode(["address"], [GRT]));

        // Get the current rate
        const latestRate = await controller.getRateAt(GRT, 0);

        // The rate should increase from the starting rate
        expect(latestRate.current).to.eq(BigNumber.from(0));
    });

    it("Integrates the error", async function () {
        const controller = await getController();

        const period = await controller.period();

        // Unrestricted change config
        const config = {
            ...DEFAULT_CONFIG,
            min: MIN_RATE,
            max: MAX_RATE,
            maxDecrease: MAX_RATE,
            maxIncrease: MAX_RATE,
            maxPercentDecrease: MAX_PERCENT_DECREASE,
            maxPercentIncrease: MAX_PERCENT_INCREASE,
        };

        await controller.setConfig(GRT, config);

        const pidConfig = {
            ...DEFAULT_PID_CONFIG,
            kPNumerator: BigNumber.from(0), // Disable proportional
            kDNumerator: BigNumber.from(0), // Disable derivative
        };

        await controller.setPidConfig(GRT, pidConfig);

        // Push a starting rate of 50%
        const startingRate = ethers.utils.parseUnits("0.5", 8);

        await controller.manuallyPushRate(GRT, startingRate, startingRate, 1);

        // Set input larger than the target to make the rate increase
        const input = ethers.utils.parseUnits("0.9", 8);
        await controller.setInput(GRT, input);
        const target = ethers.utils.parseUnits("0.1", 8);
        await controller.setTarget(GRT, target);

        // Advance the block time by the period
        await timeAndMine.increaseTime(period.toNumber());

        // Update the rate
        await controller.update(ethers.utils.defaultAbiCoder.encode(["address"], [GRT]));

        const error = target.sub(input);
        const expectedChange = error.mul(pidConfig.kINumerator).div(pidConfig.kIDenominator);
        const expectedRate = startingRate.add(expectedChange);

        // Get the current rate
        const latestRate = await controller.getRateAt(GRT, 0);

        // The rate should increase from the starting rate
        expect(latestRate.current).to.eq(expectedRate);

        // Sanity check that the rate is not the same as the starting rate
        expect(latestRate.current).to.not.eq(startingRate);
    });

    it("Sets pidState.iTerm to the current integral", async function () {
        const controller = await getController();

        const period = await controller.period();

        const pidConfig = DEFAULT_PID_CONFIG;

        // Sanity check that the integral gains is not 0
        expect(pidConfig.kINumerator).to.not.equal(0);

        await controller.setConfig(GRT, DEFAULT_CONFIG);
        await controller.setPidConfig(GRT, pidConfig);

        // Set input larger than the target to make the rate increase
        const input = ethers.utils.parseUnits("0.923", 8);
        await controller.setInput(GRT, input);
        const target = ethers.utils.parseUnits("0.1", 8);
        await controller.setTarget(GRT, target);
        const error = target.sub(input);

        // Advance the block time by the period
        await timeAndMine.increaseTime(period.toNumber());

        // Update the rate
        await controller.update(ethers.utils.defaultAbiCoder.encode(["address"], [GRT]));

        // Get the pidState
        const pidData = await controller.pidData(GRT);

        const integral = error.mul(pidConfig.kINumerator).div(pidConfig.kIDenominator);

        // The iTerm should be the current integral
        expect(pidData.state.iTerm).to.eq(integral);
    });

    it("Sets pidState.lastInput to the current input", async function () {
        const controller = await getController();

        const period = await controller.period();

        await controller.setConfig(GRT, DEFAULT_CONFIG);
        await controller.setPidConfig(GRT, DEFAULT_PID_CONFIG);

        // Set input larger than the target to make the rate increase
        const input = ethers.utils.parseUnits("0.923", 8);
        await controller.setInput(GRT, input);
        const target = ethers.utils.parseUnits("0.1", 8);
        await controller.setTarget(GRT, target);

        // Advance the block time by the period
        await timeAndMine.increaseTime(period.toNumber());

        // Update the rate
        await controller.update(ethers.utils.defaultAbiCoder.encode(["address"], [GRT]));

        // Get the pidState
        const pidData = await controller.pidData(GRT);

        // The last input should be the current input
        expect(pidData.state.lastInput).to.eq(input);
    });

    it("Sets pidState.lastError to the current error", async function () {
        const controller = await getController();

        const period = await controller.period();

        await controller.setConfig(GRT, DEFAULT_CONFIG);
        await controller.setPidConfig(GRT, DEFAULT_PID_CONFIG);

        // Set input larger than the target to make the rate increase
        const input = ethers.utils.parseUnits("0.923", 8);
        await controller.setInput(GRT, input);
        const target = ethers.utils.parseUnits("0.1", 8);
        await controller.setTarget(GRT, target);

        // Advance the block time by the period
        await timeAndMine.increaseTime(period.toNumber());

        // Update the rate
        await controller.update(ethers.utils.defaultAbiCoder.encode(["address"], [GRT]));

        // Get the pidState
        const pidData = await controller.pidData(GRT);

        // The last error should be the current error
        expect(pidData.state.lastError).to.eq(target.sub(input));
    });
}

function createDescribeCanUpdateTests(isPidController) {
    return function describeStandardControllerCanUpdateTests(contractName, deployFunc) {
        describe(contractName + "#canUpdate", function () {
            var controller;

            async function deploy(updaterMustBeEoa) {
                const deployment = await deployFunc({
                    updaterMustBeEoa: updaterMustBeEoa,
                });
                controller = deployment.controller;

                // Get our signer address
                const [signer] = await ethers.getSigners();

                // Grant all roles to the signer
                await controller.grantRole(ORACLE_UPDATER_MANAGER_ROLE, signer.address);
                await controller.grantRole(ORACLE_UPDATER_ROLE, signer.address);
                await controller.grantRole(RATE_ADMIN_ROLE, signer.address);
                await controller.grantRole(UPDATE_PAUSE_ADMIN_ROLE, signer.address);

                // Set config for GRT
                await controller.setConfig(GRT, DEFAULT_CONFIG);

                if (isPidController) {
                    // Set PID config for GRT
                    await controller.setPidConfig(GRT, DEFAULT_PID_CONFIG);
                }
            }

            beforeEach(async () => {
                await deploy(false);
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

            it("Can't update if the updaters must be EOA and the sender is a contract, with the updater having the required role", async function () {
                // Redeploy with updaterMustBeEoa = true
                await deploy(true);

                // Deploy the caller contract
                const callerFactory = await ethers.getContractFactory("RateControllerStubCaller");
                const caller = await callerFactory.deploy(controller.address);
                await caller.deployed();

                // needsUpdate should return true
                await controller.overrideNeedsUpdate(true, true);

                // Revoke the role from everyone
                await controller.revokeRole(ORACLE_UPDATER_ROLE, AddressZero);

                // Grant the role to the caller contract
                await controller.grantRole(ORACLE_UPDATER_ROLE, caller.address);

                const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

                const canUpdate = await caller.canUpdate(updateData);
                const canUpdateWithEoa = await controller.canUpdate(updateData);

                expect(canUpdate).to.be.false;

                // Sanity check that EOA can update
                expect(canUpdateWithEoa).to.be.true;
            });

            it("Can't update if the updaters must be EOA and the sender is a contract, with the required role being open", async function () {
                // Redeploy with updaterMustBeEoa = true
                await deploy(true);

                // Deploy the caller contract
                const callerFactory = await ethers.getContractFactory("RateControllerStubCaller");
                const caller = await callerFactory.deploy(controller.address);
                await caller.deployed();

                // needsUpdate should return true
                await controller.overrideNeedsUpdate(true, true);

                // Get our signer address
                const [signer] = await ethers.getSigners();

                // Revoke the role from the signer
                await controller.revokeRole(ORACLE_UPDATER_ROLE, signer.address);
                // Grant the role to everyone
                await controller.grantRole(ORACLE_UPDATER_ROLE, AddressZero);

                const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

                const canUpdate = await caller.canUpdate(updateData);
                const canUpdateWithEoa = await controller.canUpdate(updateData);

                expect(canUpdate).to.be.false;

                // Sanity check that EOA can update
                expect(canUpdateWithEoa).to.be.true;
            });

            it("Can update if the updaters don't have to be EOA and the sender is a contract, with the updater having the required role", async function () {
                // Redeploy with updaterMustBeEoa = false
                await deploy(false);

                // Deploy the caller contract
                const callerFactory = await ethers.getContractFactory("RateControllerStubCaller");
                const caller = await callerFactory.deploy(controller.address);
                await caller.deployed();

                // needsUpdate should return true
                await controller.overrideNeedsUpdate(true, true);

                // Revoke the role from everyone
                await controller.revokeRole(ORACLE_UPDATER_ROLE, AddressZero);

                // Grant the role to the caller contract
                await controller.grantRole(ORACLE_UPDATER_ROLE, caller.address);

                const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

                const canUpdate = await caller.canUpdate(updateData);

                expect(canUpdate).to.be.true;
            });

            it("Can update if the updaters don't have to be EOA and the sender is a contract, with the required role being open", async function () {
                // Redeploy with updaterMustBeEoa = false
                await deploy(false);

                // Deploy the caller contract
                const callerFactory = await ethers.getContractFactory("RateControllerStubCaller");
                const caller = await callerFactory.deploy(controller.address);
                await caller.deployed();

                // needsUpdate should return true
                await controller.overrideNeedsUpdate(true, true);

                // Get our signer address
                const [signer] = await ethers.getSigners();

                // Revoke the role from the signer
                await controller.revokeRole(ORACLE_UPDATER_ROLE, signer.address);
                // Grant the role to everyone
                await controller.grantRole(ORACLE_UPDATER_ROLE, AddressZero);

                const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

                const canUpdate = await caller.canUpdate(updateData);

                expect(canUpdate).to.be.true;
            });

            it("Can't update if we haven't set a config for the token", async function () {
                const token = USDC;

                const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [token]);

                const canUpdate = await controller.canUpdate(updateData);

                expect(canUpdate).to.be.false;

                // Sanity check that it needs an update if we set the config
                await controller.setConfig(token, DEFAULT_CONFIG);
                if (isPidController) {
                    await controller.setPidConfig(token, DEFAULT_PID_CONFIG);
                }
                expect(await controller.canUpdate(updateData)).to.be.true;
            });

            if (isPidController) {
                it("Can't update if we haven't set a PID config for the token", async function () {
                    const token = USDC;

                    // Set config
                    await controller.setConfig(token, DEFAULT_CONFIG);

                    const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [token]);

                    const canUpdate = await controller.canUpdate(updateData);

                    expect(canUpdate).to.be.false;

                    // Sanity check that it needs an update if we set the config
                    await controller.setPidConfig(token, DEFAULT_PID_CONFIG);
                    expect(await controller.canUpdate(updateData)).to.be.true;
                });
            }

            it("Can't update if canComputeNextRate returns false", async function () {
                // Set canComputeNextRate to false
                await controller.overrideCanComputeNextRate(true, false);

                const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [GRT]);

                const canUpdate = await controller.canUpdate(updateData);

                expect(canUpdate).to.be.false;

                // Sanity check that it can update if we set canComputeNextRate to true
                await controller.overrideCanComputeNextRate(false, false);
                expect(await controller.canUpdate(updateData)).to.be.true;
            });
        });
    };
}

function createDecreaseChangeThresholdTests(isPidController, supportsChangeThresholds) {
    return function describeStandardControllerSetChangeThresholdsTests(contractName, deployFunc) {
        describe(contractName + "#setChangeThreshold", function () {
            var controller;

            async function deploy(updaterMustBeEoa) {
                const deployment = await deployFunc({
                    updaterMustBeEoa: updaterMustBeEoa,
                });
                controller = deployment.controller;

                // Get our signer address
                const [signer] = await ethers.getSigners();

                // Grant all roles to the signer
                await controller.grantRole(ORACLE_UPDATER_MANAGER_ROLE, signer.address);
                await controller.grantRole(ORACLE_UPDATER_ROLE, signer.address);
                await controller.grantRole(RATE_ADMIN_ROLE, signer.address);
                await controller.grantRole(UPDATE_PAUSE_ADMIN_ROLE, signer.address);

                // Set config for GRT
                await controller.setConfig(USDC, DEFAULT_CONFIG);

                if (isPidController) {
                    // Set PID config for GRT
                    await controller.setPidConfig(USDC, DEFAULT_PID_CONFIG);
                }
            }

            beforeEach(async () => {
                await deploy(false);
            });

            if (supportsChangeThresholds) {
                it("Should work if the caller has all roles", async function () {
                    const tx = await controller.setChangeThreshold(USDC, TWO_PERCENT_CHANGE);

                    const timestamp = await blockTimestamp(tx.blockNumber);

                    await expect(tx)
                        .to.emit(controller, "ChangeThresholdUpdated")
                        .withArgs(USDC, 0, TWO_PERCENT_CHANGE, timestamp);

                    expect(await controller.getChangeThreshold(USDC)).to.equal(TWO_PERCENT_CHANGE);
                });

                it("Should work if the caller has the admin role", async function () {
                    const [, other] = await ethers.getSigners();

                    await controller.grantRole(ADMIN_ROLE, other.address);

                    const tx = await controller.connect(other).setChangeThreshold(USDC, TWO_PERCENT_CHANGE);

                    const timestamp = await blockTimestamp(tx.blockNumber);

                    await expect(tx)
                        .to.emit(controller, "ChangeThresholdUpdated")
                        .withArgs(USDC, 0, TWO_PERCENT_CHANGE, timestamp);

                    expect(await controller.getChangeThreshold(USDC)).to.equal(TWO_PERCENT_CHANGE);
                });

                it("Should revert if the caller doesn't have any role", async function () {
                    const [, other] = await ethers.getSigners();

                    await expect(
                        controller.connect(other).setChangeThreshold(USDC, TWO_PERCENT_CHANGE)
                    ).to.be.revertedWith(/AccessControl: .*/);
                });

                it("Should work when the threshold changes to above zero then to zero", async function () {
                    const tx1 = await controller.setChangeThreshold(USDC, TWO_PERCENT_CHANGE);
                    const timestamp1 = await blockTimestamp(tx1.blockNumber);

                    await expect(tx1)
                        .to.emit(controller, "ChangeThresholdUpdated")
                        .withArgs(USDC, 0, TWO_PERCENT_CHANGE, timestamp1);

                    expect(await controller.getChangeThreshold(USDC)).to.equal(TWO_PERCENT_CHANGE);

                    const tx2 = await controller.setChangeThreshold(USDC, 0);
                    const timestamp2 = await blockTimestamp(tx2.blockNumber);

                    await expect(tx2)
                        .to.emit(controller, "ChangeThresholdUpdated")
                        .withArgs(USDC, TWO_PERCENT_CHANGE, 0, timestamp2);

                    expect(await controller.getChangeThreshold(USDC)).to.equal(0);
                });

                it("Should not emit an event if the threshold doesn't change", async function () {
                    await expect(controller.setChangeThreshold(USDC, 0)).to.not.emit(
                        controller,
                        "ChangeThresholdUpdated"
                    );

                    expect(await controller.getChangeThreshold(USDC)).to.equal(0);
                });
            } else {
                it("Reverts even if the caller has all roles", async function () {
                    await expect(controller.setChangeThreshold(USDC, TWO_PERCENT_CHANGE)).to.be.revertedWith(
                        "Not supported"
                    );
                });
            }
        });
    };
}

function createStandardWillAnythingChangeTests() {
    return function describeStandardControllerWillAnythingChangeTests(contractName, deployFunc) {
        describe(contractName + "#willAnythingChange", function () {
            var controller;

            const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [USDC]);

            beforeEach(async () => {
                const deployment = await deployFunc();
                controller = deployment.controller;

                // Get our signer address
                const [signer] = await ethers.getSigners();

                // Grant all roles to the signer
                await controller.grantRole(ORACLE_UPDATER_MANAGER_ROLE, signer.address);
                await controller.grantRole(ORACLE_UPDATER_ROLE, signer.address);
                await controller.grantRole(RATE_ADMIN_ROLE, signer.address);
                await controller.grantRole(UPDATE_PAUSE_ADMIN_ROLE, signer.address);

                await controller.setConfig(USDC, DEFAULT_CONFIG);
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
    };
}

function createStandardCalculateChangeTests() {
    return function describeStandardControllerCalculateChangeTests(contractName, deployFunc) {
        describe(contractName + "#calculateChange", function () {
            var controller;

            beforeEach(async () => {
                const deployment = await deployFunc();
                controller = deployment.controller;
            });

            it("Returns isInfinite=true if the change overflows", async function () {
                const [change, isInfinite] = await controller.stubCalculateChange(
                    BigNumber.from(1),
                    BigNumber.from(2).pow(256).sub(1) // MAX_UINT_256 - 1
                );

                expect(change).to.equal(0);
                expect(isInfinite).to.be.true;
            });
        });
    };
}

function describeTests(
    contractName,
    deployFunc,
    setDefaultConfigFunc,
    describeComputeRateTests,
    describeNeedsUpdateTests,
    describeUpdateTests,
    describeCanUpdateTests,
    describeSetChangeThresholdTests,
    describeWillAnythingChangeTests,
    describeCalculateChangeTests
) {
    describe(contractName + "#constructor", function () {
        const tests = [
            {
                period: 1,
                initialBufferCardinality: 1,
                updaterMustBeEoa: false,
                computeAhead: false,
            },
            {
                period: 2,
                initialBufferCardinality: 1,
                updaterMustBeEoa: false,
                computeAhead: false,
            },
            {
                period: 1,
                initialBufferCardinality: 2,
                updaterMustBeEoa: false,
                computeAhead: false,
            },
            {
                period: 1,
                initialBufferCardinality: 1,
                updaterMustBeEoa: true,
                computeAhead: false,
            },
            {
                period: 2,
                initialBufferCardinality: 1,
                updaterMustBeEoa: true,
                computeAhead: false,
            },
            {
                period: 1,
                initialBufferCardinality: 2,
                updaterMustBeEoa: true,
                computeAhead: false,
            },
            {
                period: 1,
                initialBufferCardinality: 1,
                updaterMustBeEoa: false,
                computeAhead: true,
            },
        ];

        for (const test of tests) {
            it(
                "Should deploy with period " +
                    test.period +
                    ", initialBufferCardinality " +
                    test.initialBufferCardinality +
                    ", updaterMustBeEoa " +
                    test.updaterMustBeEoa +
                    ", and computeAhead ",
                async function () {
                    const deployment = await deployFunc(test);
                    const controller = deployment.controller;

                    expect(await controller.computeAhead()).to.equal(test.computeAhead);
                    expect(await controller.period()).to.equal(test.period);
                    expect(await controller.getRatesCapacity(GRT)).to.equal(test.initialBufferCardinality);
                    expect(await controller.updatersMustBeEoa()).to.equal(test.updaterMustBeEoa);

                    // Granularity should always be 1
                    expect(await controller.granularity()).to.equal(1);
                }
            );
        }
    });

    describe(contractName + "#push", function () {
        var controller;

        beforeEach(async () => {
            const deployment = await deployFunc();
            controller = deployment.controller;
        });

        it("Should initialize the buffer if it hasn't been initialized", async function () {
            const pushTx = await controller.stubPush(USDC, 1, 1, 1);

            // Check that the buffer initialized event was emitted
            await expect(pushTx)
                .to.emit(controller, "RatesCapacityInitialized")
                .withArgs(USDC, INITIAL_BUFFER_CARDINALITY);
        });
    });

    describe(contractName + "#setUpdatesPaused", function () {
        var controller;

        beforeEach(async () => {
            const deployment = await deployFunc();
            controller = deployment.controller;

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

        it("Should not revert if the token is missing a config", async function () {
            const tx = await controller.setUpdatesPaused(USDC, true);
            const timestamp = await blockTimestamp(tx.blockNumber);

            await expect(tx).to.emit(controller, "PauseStatusChanged").withArgs(USDC, true, timestamp);

            // Sanity check that the changes were made
            expect(await controller.areUpdatesPaused(USDC)).to.equal(true);

            // Sanity check that USDC is missing a config
            await expect(controller.getConfig(USDC)).to.be.revertedWith("MissingConfig").withArgs(USDC);
        });

        it("Should emit an event when the updates are paused", async function () {
            const tx = await controller.setUpdatesPaused(GRT, true);
            const timestamp = await blockTimestamp(tx.blockNumber);

            await expect(tx).to.emit(controller, "PauseStatusChanged").withArgs(GRT, true, timestamp);

            // Sanity check that the changes were made
            expect(await controller.areUpdatesPaused(GRT)).to.equal(true);
        });

        it("Should emit an event when the updates are unpaused", async function () {
            await controller.setUpdatesPaused(GRT, true);

            const tx = await controller.setUpdatesPaused(GRT, false);
            const timestamp = await blockTimestamp(tx.blockNumber);

            await expect(tx).to.emit(controller, "PauseStatusChanged").withArgs(GRT, false, timestamp);

            // Sanity check that the changes were made
            expect(await controller.areUpdatesPaused(GRT)).to.equal(false);
        });

        it("Should revert when the update status is unchanged (paused = false)", async function () {
            await expect(controller.setUpdatesPaused(GRT, false)).to.be.revertedWith("PauseStatusUnchanged");

            // Sanity check that the status is the same
            expect(await controller.areUpdatesPaused(GRT)).to.equal(false);
        });

        it("Should revert when the update status is unchanged (paused = true)", async function () {
            await controller.setUpdatesPaused(GRT, true);

            // Sanity check that the changes were made
            expect(await controller.areUpdatesPaused(GRT)).to.equal(true);

            await expect(controller.setUpdatesPaused(GRT, true)).to.be.revertedWith("PauseStatusUnchanged");

            // Sanity check that the status is the same
            expect(await controller.areUpdatesPaused(GRT)).to.equal(true);
        });

        it("Should call onPaused when the updates are paused", async function () {
            await controller.setUpdatesPaused(GRT, true);

            // Sanity check that the changes were made
            expect(await controller.areUpdatesPaused(GRT)).to.equal(true);

            // Sanity check that the onPaused function was called
            const call = await controller.onPauseCalls(GRT);
            expect(call.paused).to.equal(true);
            expect(call.callCount).to.equal(1);
        });

        it("Should not call onPaused when the updates are paused, but they're already paused", async function () {
            await controller.setUpdatesPaused(GRT, true);
            await expect(controller.setUpdatesPaused(GRT, true)).to.be.revertedWith("PauseStatusUnchanged");

            // Sanity check that the changes were made
            expect(await controller.areUpdatesPaused(GRT)).to.equal(true);

            // Sanity check that the onPaused function was called
            const call = await controller.onPauseCalls(GRT);
            expect(call.paused).to.equal(true);
            expect(call.callCount).to.equal(1);
        });

        it("Should call onPaused when the updates are unpaused", async function () {
            await controller.setUpdatesPaused(GRT, true);

            // Sanity check that the changes were made
            expect(await controller.areUpdatesPaused(GRT)).to.equal(true);

            await controller.setUpdatesPaused(GRT, false);

            // Sanity check that the changes were made
            expect(await controller.areUpdatesPaused(GRT)).to.equal(false);

            // Sanity check that the onPaused function was called
            const call = await controller.onPauseCalls(GRT);
            expect(call.paused).to.equal(false);
            expect(call.callCount).to.equal(2);
        });

        it("Should not call onPaused when the updates are unpaused, but they're already unpaused", async function () {
            await expect(controller.setUpdatesPaused(GRT, false)).to.be.revertedWith("PauseStatusUnchanged");

            // Sanity check that the changes were made
            expect(await controller.areUpdatesPaused(GRT)).to.equal(false);

            // Sanity check that the onPaused function was called
            const call = await controller.onPauseCalls(GRT);
            expect(call.paused).to.equal(false);
            expect(call.callCount).to.equal(0);
        });
    });

    describe(contractName + "#setConfig", function () {
        var computerFactory;

        var controller;
        var computer;

        before(async function () {
            computerFactory = await ethers.getContractFactory("RateComputerStub");
        });

        beforeEach(async () => {
            const deployment = await deployFunc();
            controller = deployment.controller;

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
                ...DEFAULT_CONFIG,
                maxIncrease: ethers.utils.parseUnits("0.02", 18), // 2%
                maxDecrease: ethers.utils.parseUnits("0.01", 18), // 1%
                base: ethers.utils.parseUnits("0.6", 18), // 60%
                componentWeights: [4000], // 40%
                components: [],
            };

            await expect(controller.setConfig(GRT, config)).to.be.revertedWith("InvalidConfig").withArgs(GRT);
        });

        it("Should revert if there's a component length mismatch (componentWeights.length = 0, components.length = 1)", async function () {
            const config = {
                ...DEFAULT_CONFIG,
                maxIncrease: ethers.utils.parseUnits("0.02", 18), // 2%
                maxDecrease: ethers.utils.parseUnits("0.01", 18), // 1%
                base: ethers.utils.parseUnits("0.6", 18), // 60%
                componentWeights: [],
                components: [computer.address],
            };

            await expect(controller.setConfig(GRT, config)).to.be.revertedWith("InvalidConfig").withArgs(GRT);
        });

        it("Should revert if the max rate is less than the min rate", async function () {
            const config = {
                ...DEFAULT_CONFIG,
                max: ethers.utils.parseUnits("1", 18),
                min: ethers.utils.parseUnits("2", 18),
            };

            await expect(controller.setConfig(GRT, config)).to.be.revertedWith("InvalidConfig").withArgs(GRT);
        });

        it("Should revert if the max percent decrease is greater than 100%", async function () {
            const config = {
                ...DEFAULT_CONFIG,
                maxPercentDecrease: BigNumber.from(10001),
            };

            await expect(controller.setConfig(GRT, config)).to.be.revertedWith("InvalidConfig").withArgs(GRT);
        });

        it("Should not revert if the sum of the component weights is greater than 10000 (with one component)", async function () {
            const config = {
                ...DEFAULT_CONFIG,
                maxIncrease: ethers.utils.parseUnits("0.02", 18), // 2%
                maxDecrease: ethers.utils.parseUnits("0.01", 18), // 1%
                base: ethers.utils.parseUnits("0", 18), // 0%
                componentWeights: [10001],
                components: [computer.address],
            };

            await expect(controller.setConfig(GRT, config)).to.not.be.reverted;
        });

        it("Should not revert if the sum of the component weights is greater than 10000 (with two components)", async function () {
            const secondComputer = await computerFactory.deploy();
            await secondComputer.deployed();

            const config = {
                ...DEFAULT_CONFIG,
                maxIncrease: ethers.utils.parseUnits("0.02", 18), // 2%
                maxDecrease: ethers.utils.parseUnits("0.01", 18), // 1%
                base: ethers.utils.parseUnits("0", 18), // 0%
                componentWeights: [5000, 5001],
                components: [computer.address, secondComputer.address],
            };

            await expect(controller.setConfig(GRT, config)).to.not.be.reverted;
        });

        it("Should not revert if a rate overflow is possible (the rate will be truncated to the max)", async function () {
            const config = {
                ...DEFAULT_CONFIG,
                maxIncrease: ethers.utils.parseUnits("0.02", 18), // 2%
                maxDecrease: ethers.utils.parseUnits("0.01", 18), // 1%
                base: BigNumber.from(1),
                componentWeights: [10000], // 100% of (2^64)-1
                components: [computer.address],
            };

            await expect(controller.setConfig(GRT, config)).to.not.be.reverted;
        });

        it("Should revert when a component with the zero address is provided", async function () {
            const config = {
                ...DEFAULT_CONFIG,
                maxIncrease: ethers.utils.parseUnits("0.02", 18), // 2%
                maxDecrease: ethers.utils.parseUnits("0.01", 18), // 1%
                base: BigNumber.from(1),
                componentWeights: [1],
                components: [AddressZero],
            };

            await expect(controller.setConfig(GRT, config)).to.be.revertedWith("InvalidConfig").withArgs(GRT);
        });

        it("Should revert when a component that doesn't implement ERC165 is provided", async function () {
            // Deploy a mock contract that doesn't implement ERC165
            const badComputer = await ethers.getContractFactory("BadRateComputerStub2");

            const badComputerInstance = await badComputer.deploy();
            await badComputerInstance.deployed();

            const config = {
                ...DEFAULT_CONFIG,
                maxIncrease: ethers.utils.parseUnits("0.02", 18), // 2%
                maxDecrease: ethers.utils.parseUnits("0.01", 18), // 1%
                base: BigNumber.from(1),
                componentWeights: [1],
                components: [badComputerInstance.address],
            };

            await expect(controller.setConfig(GRT, config)).to.be.revertedWith("InvalidConfig").withArgs(GRT);
        });

        it("Should revert when a component that doesn't implement IRateComputer (ERC165) is provided", async function () {
            // Deploy a mock contract that doesn't implement ERC165
            const badComputer = await ethers.getContractFactory("BadRateComputerStub1");

            const badComputerInstance = await badComputer.deploy();
            await badComputerInstance.deployed();

            const config = {
                ...DEFAULT_CONFIG,
                maxIncrease: ethers.utils.parseUnits("0.02", 18), // 2%
                maxDecrease: ethers.utils.parseUnits("0.01", 18), // 1%
                base: BigNumber.from(1),
                componentWeights: [1],
                components: [badComputerInstance.address],
            };

            await expect(controller.setConfig(GRT, config)).to.be.revertedWith("InvalidConfig").withArgs(GRT);
        });

        it("Should revert when a duplicate component is provided", async function () {
            const config = {
                ...DEFAULT_CONFIG,
                componentWeights: [1, 1],
                components: [computer.address, computer.address],
            };

            await expect(controller.setConfig(GRT, config)).to.be.revertedWith("InvalidConfig").withArgs(GRT);
        });

        it("Should revert if a component weight is zero", async function () {
            const config = {
                ...DEFAULT_CONFIG,
                componentWeights: [0],
                components: [computer.address],
            };

            await expect(controller.setConfig(GRT, config)).to.be.revertedWith("InvalidConfig").withArgs(GRT);
        });

        it("Should update the config even if no components are specified", async function () {
            // The default config has no components, but we explicitly set them to be empty here just to be sure.
            const tx = await controller.setConfig(GRT, {
                ...DEFAULT_CONFIG,
                componentWeights: [],
                components: [],
            });

            const timestamp = await blockTimestamp(tx.blockNumber);

            await expect(tx).to.emit(controller, "RateConfigUpdated");

            // Check the event args
            const receipt = await tx.wait();
            const event = receipt.events?.find((e) => e.event === "RateConfigUpdated");
            expect(event?.args?.token).to.equal(GRT);
            expect(event?.args?.oldConfig).to.deep.equal(Object.values(ZERO_CONFIG));
            expect(event?.args?.newConfig).to.deep.equal(Object.values(DEFAULT_CONFIG));
            expect(event?.args?.timestamp).to.equal(timestamp);

            // Sanity check that the new config is set
            const newConfig = await controller.getConfig(GRT);
            expect(newConfig.maxIncrease).to.equal(DEFAULT_CONFIG.maxIncrease);
            expect(newConfig.maxDecrease).to.equal(DEFAULT_CONFIG.maxDecrease);
            expect(newConfig.base).to.equal(DEFAULT_CONFIG.base);
            expect(newConfig.componentWeights).to.deep.equal(DEFAULT_CONFIG.componentWeights);
            expect(newConfig.components).to.deep.equal(DEFAULT_CONFIG.components);
        });

        it("Should update the config when two components with 100% weights are provided", async function () {
            const secondComputer = await computerFactory.deploy();
            await secondComputer.deployed();

            const config = {
                ...DEFAULT_CONFIG,
                componentWeights: [10000, 10000],
                components: [computer.address, secondComputer.address],
            };

            const tx = await controller.setConfig(GRT, config);

            const timestamp = await blockTimestamp(tx.blockNumber);

            await expect(tx).to.emit(controller, "RateConfigUpdated");

            // Check the event args
            const receipt = await tx.wait();
            const event = receipt.events?.find((e) => e.event === "RateConfigUpdated");
            expect(event?.args?.token).to.equal(GRT);
            expect(event?.args?.oldConfig).to.deep.equal(Object.values(ZERO_CONFIG));
            expect(event?.args?.newConfig).to.deep.equal(Object.values(config));
            expect(event?.args?.timestamp).to.equal(timestamp);

            // Sanity check that the new config is set
            const newConfig = await controller.getConfig(GRT);
            expect(newConfig.maxIncrease).to.equal(config.maxIncrease);
            expect(newConfig.maxDecrease).to.equal(config.maxDecrease);
            expect(newConfig.base).to.equal(config.base);
            expect(newConfig.componentWeights).to.deep.equal(config.componentWeights);
            expect(newConfig.components).to.deep.equal(config.components);
        });

        it("Should emit a RateConfigUpdated event if the config is valid", async function () {
            const tx = await controller.setConfig(GRT, DEFAULT_CONFIG);

            await expect(tx).to.emit(controller, "RateConfigUpdated");

            const timestamp = await blockTimestamp(tx.blockNumber);

            // Check the event args
            const receipt = await tx.wait();
            const event = receipt.events?.find((e) => e.event === "RateConfigUpdated");
            expect(event?.args?.token).to.equal(GRT);
            expect(event?.args?.oldConfig).to.deep.equal(Object.values(ZERO_CONFIG));
            expect(event?.args?.newConfig).to.deep.equal(Object.values(DEFAULT_CONFIG));
            expect(event?.args?.timestamp).to.equal(timestamp);

            // Sanity check that the new config is set
            const newConfig = await controller.getConfig(GRT);
            expect(newConfig.maxIncrease).to.equal(DEFAULT_CONFIG.maxIncrease);
            expect(newConfig.maxDecrease).to.equal(DEFAULT_CONFIG.maxDecrease);
            expect(newConfig.base).to.equal(DEFAULT_CONFIG.base);
            expect(newConfig.componentWeights).to.deep.equal(DEFAULT_CONFIG.componentWeights);
            expect(newConfig.components).to.deep.equal(DEFAULT_CONFIG.components);
        });

        it("Should emit a RateConfigUpdated event if the config is valid and we call the function multiple times", async function () {
            const tx1 = await controller.setConfig(GRT, DEFAULT_CONFIG);

            const timestamp1 = await blockTimestamp(tx1.blockNumber);

            await expect(tx1).to.emit(controller, "RateConfigUpdated");

            // Check the event args
            const receipt1 = await tx1.wait();
            const event1 = receipt1.events?.find((e) => e.event === "RateConfigUpdated");
            expect(event1?.args?.token).to.equal(GRT);
            expect(event1?.args?.oldConfig).to.deep.equal(Object.values(ZERO_CONFIG));
            expect(event1?.args?.newConfig).to.deep.equal(Object.values(DEFAULT_CONFIG));
            expect(event1?.args?.timestamp).to.equal(timestamp1);

            const tx2 = await controller.setConfig(GRT, DEFAULT_CONFIG);

            const timestamp2 = await blockTimestamp(tx2.blockNumber);

            await expect(tx2).to.emit(controller, "RateConfigUpdated");

            // Check the event args
            const receipt2 = await tx2.wait();
            const event2 = receipt2.events?.find((e) => e.event === "RateConfigUpdated");
            expect(event2?.args?.token).to.equal(GRT);
            expect(event2?.args?.oldConfig).to.deep.equal(Object.values(DEFAULT_CONFIG));
            expect(event2?.args?.newConfig).to.deep.equal(Object.values(DEFAULT_CONFIG));
            expect(event2?.args?.timestamp).to.equal(timestamp2);

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
            expect(newConfig.maxPercentIncrease).to.equal(DEFAULT_CONFIG.maxPercentIncrease);
            expect(newConfig.maxPercentDecrease).to.equal(DEFAULT_CONFIG.maxPercentDecrease);
            expect(newConfig.base).to.equal(DEFAULT_CONFIG.base);
            expect(newConfig.componentWeights).to.deep.equal(DEFAULT_CONFIG.componentWeights);
            expect(newConfig.components).to.deep.equal(DEFAULT_CONFIG.components);

            const secondConfig = {
                ...DEFAULT_CONFIG,
                maxIncrease: ethers.utils.parseUnits("0.03", 18), // 3%
                maxDecrease: ethers.utils.parseUnits("0.04", 18), // 4%
                maxPercentIncrease: 1000, // 10%
                maxPercentDecrease: 2000, // 20%
                base: ethers.utils.parseUnits("0", 18), // 0%
                componentWeights: [10000],
                components: [computer.address],
            };

            const tx = await controller.setConfig(GRT, secondConfig);

            const timestamp = await blockTimestamp(tx.blockNumber);

            await expect(tx).to.emit(controller, "RateConfigUpdated");

            // Check the event args
            const receipt = await tx.wait();
            const event = receipt.events?.find((e) => e.event === "RateConfigUpdated");
            expect(event?.args?.token).to.equal(GRT);
            expect(event?.args?.oldConfig).to.deep.equal(Object.values(DEFAULT_CONFIG));
            expect(event?.args?.newConfig).to.deep.equal(Object.values(secondConfig));
            expect(event?.args?.timestamp).to.equal(timestamp);

            // Sanity check that the new config is set
            const newConfig2 = await controller.getConfig(GRT);
            expect(newConfig2.maxIncrease).to.equal(secondConfig.maxIncrease);
            expect(newConfig2.maxDecrease).to.equal(secondConfig.maxDecrease);
            expect(newConfig2.maxPercentIncrease).to.equal(secondConfig.maxPercentIncrease);
            expect(newConfig2.maxPercentDecrease).to.equal(secondConfig.maxPercentDecrease);
            expect(newConfig2.base).to.equal(secondConfig.base);
            expect(newConfig2.componentWeights).to.deep.equal(secondConfig.componentWeights);
            expect(newConfig2.components).to.deep.equal(secondConfig.components);
        });
    });

    describe(contractName + "#getConfig", function () {
        var controller;

        beforeEach(async () => {
            const deployment = await deployFunc();
            controller = deployment.controller;

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

    describe(contractName + "#setHookConfig", function () {
        var controller;

        var hook;

        beforeEach(async () => {
            const deployment = await deployFunc();
            controller = deployment.controller;
            // Get our signer address
            const [signer] = await ethers.getSigners();

            // Deploy a hook
            const hookFactory = await ethers.getContractFactory("HookStub");
            hook = await hookFactory.deploy();
            await hook.deployed();

            // Grant all roles to the signer
            await controller.grantRole(ORACLE_UPDATER_MANAGER_ROLE, signer.address);
            await controller.grantRole(ORACLE_UPDATER_ROLE, signer.address);
            await controller.grantRole(RATE_ADMIN_ROLE, signer.address);
            await controller.grantRole(UPDATE_PAUSE_ADMIN_ROLE, signer.address);
        });

        it("Reverts if the hook doesn't implement ERC165", async function () {
            const hookFactory = await ethers.getContractFactory("HookNoErc165");
            const badHook = await hookFactory.deploy();
            await badHook.deployed();

            const interfaceIdsFactory = await ethers.getContractFactory("InterfaceIds");
            const interfaceIds = await interfaceIdsFactory.deploy();

            const expectedInterfaceId = await interfaceIds.iControllerPreUpdateHook();

            await expect(
                controller.setHookConfig(HOOK_TYPE_PRE_UPDATE, {
                    allowHookFailure: false,
                    hookGasLimit: 1_000_000,
                    hookAddress: badHook.address,
                })
            )
                .to.be.revertedWith("HookDoesntSupportInterface")
                .withArgs(HOOK_TYPE_PRE_UPDATE, badHook.address, expectedInterfaceId);
        });

        it("Reverts if the hook is a pre update hook, but we try to set it as a post update hook", async function () {
            const hookFactory = await ethers.getContractFactory("ControllerPreUpdateHookStub");
            const badHook = await hookFactory.deploy();
            await badHook.deployed();

            const interfaceIdsFactory = await ethers.getContractFactory("InterfaceIds");
            const interfaceIds = await interfaceIdsFactory.deploy();

            const expectedInterfaceId = await interfaceIds.iControllerPostUpdateHook();

            await expect(
                controller.setHookConfig(HOOK_TYPE_POST_UPDATE, {
                    allowHookFailure: false,
                    hookGasLimit: 1_000_000,
                    hookAddress: badHook.address,
                })
            )
                .to.be.revertedWith("HookDoesntSupportInterface")
                .withArgs(HOOK_TYPE_POST_UPDATE, badHook.address, expectedInterfaceId);
        });

        it("Reverts if the hook is a post update hook, but we try to set it as a pre update hook", async function () {
            const hookFactory = await ethers.getContractFactory("ControllerPostUpdateHookStub");
            const badHook = await hookFactory.deploy();
            await badHook.deployed();

            const interfaceIdsFactory = await ethers.getContractFactory("InterfaceIds");
            const interfaceIds = await interfaceIdsFactory.deploy();

            const expectedInterfaceId = await interfaceIds.iControllerPreUpdateHook();

            await expect(
                controller.setHookConfig(HOOK_TYPE_PRE_UPDATE, {
                    allowHookFailure: false,
                    hookGasLimit: 1_000_000,
                    hookAddress: badHook.address,
                })
            )
                .to.be.revertedWith("HookDoesntSupportInterface")
                .withArgs(HOOK_TYPE_PRE_UPDATE, badHook.address, expectedInterfaceId);
        });

        it("Reverts if the caller does not have the ADMIN role", async function () {
            // Get the second signer
            const [, signer] = await ethers.getSigners();

            // Format the signer's address to be lowercase
            const signerAddress = signer.address.toLowerCase();

            // Grant all other roles to the signer
            await controller.grantRole(ORACLE_UPDATER_MANAGER_ROLE, signer.address);
            await controller.grantRole(ORACLE_UPDATER_ROLE, signer.address);
            await controller.grantRole(RATE_ADMIN_ROLE, signer.address);
            await controller.grantRole(UPDATE_PAUSE_ADMIN_ROLE, signer.address);

            await expect(
                controller.connect(signer).setHookConfig(HOOK_TYPE_PRE_UPDATE, {
                    allowHookFailure: false,
                    hookGasLimit: 1_000_000,
                    hookAddress: hook.address,
                })
            ).to.be.revertedWith("AccessControl: account " + signerAddress + " is missing role " + ADMIN_ROLE);
        });

        it("Reverts if we try to disable the hook when it's already disabled", async function () {
            // Try with the pre update hook
            await expect(controller.setHookConfig(HOOK_TYPE_PRE_UPDATE, DISABLED_HOOK_CONFIG))
                .to.be.revertedWith("HookConfigUnchanged")
                .withArgs(HOOK_TYPE_PRE_UPDATE);

            // Try with the post update hook
            await expect(controller.setHookConfig(HOOK_TYPE_POST_UPDATE, DISABLED_HOOK_CONFIG))
                .to.be.revertedWith("HookConfigUnchanged")
                .withArgs(HOOK_TYPE_POST_UPDATE);
        });

        it("Reverts if we try to set the hook config to the same value", async function () {
            const hookConfig = {
                allowHookFailure: false,
                hookGasLimit: 1_000_000,
                hookAddress: hook.address,
            };

            // Set the pre update hook config
            await controller.setHookConfig(HOOK_TYPE_PRE_UPDATE, hookConfig);

            // Try to set the same config again
            await expect(controller.setHookConfig(HOOK_TYPE_PRE_UPDATE, hookConfig))
                .to.be.revertedWith("HookConfigUnchanged")
                .withArgs(HOOK_TYPE_PRE_UPDATE);
        });

        it("Reverts if we try setting the hook address to the zero address, but the other values are non-zero, without active hooks", async function () {
            const hookConfig1 = {
                allowHookFailure: false,
                hookGasLimit: 1_000_000,
                hookAddress: AddressZero,
            };

            const hookConfig2 = {
                allowHookFailure: true,
                hookGasLimit: 0,
                hookAddress: AddressZero,
            };

            const hookConfig3 = {
                allowHookFailure: true,
                hookGasLimit: 1_000_000,
                hookAddress: AddressZero,
            };

            // Try to set the pre update hook config
            await expect(controller.setHookConfig(HOOK_TYPE_PRE_UPDATE, hookConfig1))
                .to.be.revertedWith("InvalidHookConfig")
                .withArgs(HOOK_TYPE_PRE_UPDATE);
            await expect(controller.setHookConfig(HOOK_TYPE_PRE_UPDATE, hookConfig2))
                .to.be.revertedWith("InvalidHookConfig")
                .withArgs(HOOK_TYPE_PRE_UPDATE);
            await expect(controller.setHookConfig(HOOK_TYPE_PRE_UPDATE, hookConfig3))
                .to.be.revertedWith("InvalidHookConfig")
                .withArgs(HOOK_TYPE_PRE_UPDATE);

            // Try to set the post update hook config
            await expect(controller.setHookConfig(HOOK_TYPE_POST_UPDATE, hookConfig1))
                .to.be.revertedWith("InvalidHookConfig")
                .withArgs(HOOK_TYPE_POST_UPDATE);
            await expect(controller.setHookConfig(HOOK_TYPE_POST_UPDATE, hookConfig2))
                .to.be.revertedWith("InvalidHookConfig")
                .withArgs(HOOK_TYPE_POST_UPDATE);
            await expect(controller.setHookConfig(HOOK_TYPE_POST_UPDATE, hookConfig3))
                .to.be.revertedWith("InvalidHookConfig")
                .withArgs(HOOK_TYPE_POST_UPDATE);
        });

        it("Reverts if we try setting the hook address to the zero address, but the other values are non-zero, with active hooks", async function () {
            const hookConfig1 = {
                allowHookFailure: false,
                hookGasLimit: 1_000_000,
                hookAddress: AddressZero,
            };

            const hookConfig2 = {
                allowHookFailure: true,
                hookGasLimit: 0,
                hookAddress: AddressZero,
            };

            const hookConfig3 = {
                allowHookFailure: true,
                hookGasLimit: 1_000_000,
                hookAddress: AddressZero,
            };

            // Set the pre update hook config
            await controller.setHookConfig(HOOK_TYPE_PRE_UPDATE, {
                allowHookFailure: false,
                hookGasLimit: 1_000_000,
                hookAddress: hook.address,
            });

            // Try to set the pre update hook config with the zero address
            await expect(controller.setHookConfig(HOOK_TYPE_PRE_UPDATE, hookConfig1))
                .to.be.revertedWith("InvalidHookConfig")
                .withArgs(HOOK_TYPE_PRE_UPDATE);
            await expect(controller.setHookConfig(HOOK_TYPE_PRE_UPDATE, hookConfig2))
                .to.be.revertedWith("InvalidHookConfig")
                .withArgs(HOOK_TYPE_PRE_UPDATE);
            await expect(controller.setHookConfig(HOOK_TYPE_PRE_UPDATE, hookConfig3))
                .to.be.revertedWith("InvalidHookConfig")
                .withArgs(HOOK_TYPE_PRE_UPDATE);

            // Set the post update hook config
            await controller.setHookConfig(HOOK_TYPE_POST_UPDATE, {
                allowHookFailure: false,
                hookGasLimit: 1_000_000,
                hookAddress: hook.address,
            });

            // Try to set the post update hook config with the zero address
            await expect(controller.setHookConfig(HOOK_TYPE_POST_UPDATE, hookConfig1))
                .to.be.revertedWith("InvalidHookConfig")
                .withArgs(HOOK_TYPE_POST_UPDATE);

            await expect(controller.setHookConfig(HOOK_TYPE_POST_UPDATE, hookConfig2))
                .to.be.revertedWith("InvalidHookConfig")
                .withArgs(HOOK_TYPE_POST_UPDATE);

            await expect(controller.setHookConfig(HOOK_TYPE_POST_UPDATE, hookConfig3))
                .to.be.revertedWith("InvalidHookConfig")
                .withArgs(HOOK_TYPE_POST_UPDATE);
        });

        it("Reverts if the hook gas limit is zero", async function () {
            const hookConfig = {
                allowHookFailure: false,
                hookGasLimit: 0, // Zero gas limit
                hookAddress: hook.address,
            };

            // Try to set the pre update hook config with zero gas limit
            await expect(controller.setHookConfig(HOOK_TYPE_PRE_UPDATE, hookConfig))
                .to.be.revertedWith("InvalidHookConfig")
                .withArgs(HOOK_TYPE_PRE_UPDATE);

            // Try to set the post update hook config with zero gas limit
            await expect(controller.setHookConfig(HOOK_TYPE_POST_UPDATE, hookConfig))
                .to.be.revertedWith("InvalidHookConfig")
                .withArgs(HOOK_TYPE_POST_UPDATE);
        });

        it("Reverts if the hook type is not valid", async function () {
            const hookConfig = {
                allowHookFailure: false,
                hookGasLimit: 1_000_000,
                hookAddress: hook.address,
            };

            const hookType = HOOK_TYPE_POST_UPDATE + 1; // Invalid hook type

            // Try to set the hook config with an invalid hook type
            await expect(controller.setHookConfig(hookType, hookConfig))
                .to.be.revertedWith("InvalidHookType")
                .withArgs(BigNumber.from(hookType));
        });

        it("Sets the pre update hook config", async function () {
            const [signer] = await ethers.getSigners();
            const signerAddress = await signer.getAddress();

            const hookConfig = {
                allowHookFailure: false,
                hookGasLimit: BigNumber.from(1_000_000),
                hookAddress: hook.address,
            };

            const tx = await controller.setHookConfig(HOOK_TYPE_PRE_UPDATE, hookConfig);

            const txTimestamp = blockTimestamp(tx.blockNumber);

            await expect(tx)
                .to.emit(controller, "HookConfigUpdated")
                .withArgs(signerAddress, HOOK_TYPE_PRE_UPDATE, DISABLED_HOOK_CONFIG, hookConfig, txTimestamp);

            const activeHookTypes = await controller.stubActiveHookTypes();

            const expectedActiveHookTypes = BigNumber.from(1).shl(HOOK_TYPE_PRE_UPDATE);
            expect(activeHookTypes).to.equal(expectedActiveHookTypes);

            // Sanity check that the config was set
            const config = await controller.getHookConfig(HOOK_TYPE_PRE_UPDATE);
            expect(config.allowHookFailure).to.equal(hookConfig.allowHookFailure);
            expect(config.hookGasLimit).to.equal(hookConfig.hookGasLimit);
            expect(config.hookAddress).to.equal(hookConfig.hookAddress);
        });

        it("Sets the post update hook config", async function () {
            const [signer] = await ethers.getSigners();
            const signerAddress = await signer.getAddress();

            const hookConfig = {
                allowHookFailure: false,
                hookGasLimit: BigNumber.from(1_000_000),
                hookAddress: hook.address,
            };

            const tx = await controller.setHookConfig(HOOK_TYPE_POST_UPDATE, hookConfig);

            const txTimestamp = blockTimestamp(tx.blockNumber);

            await expect(tx)
                .to.emit(controller, "HookConfigUpdated")
                .withArgs(signerAddress, HOOK_TYPE_POST_UPDATE, DISABLED_HOOK_CONFIG, hookConfig, txTimestamp);

            const activeHookTypes = await controller.stubActiveHookTypes();

            const expectedActiveHookTypes = BigNumber.from(1).shl(HOOK_TYPE_POST_UPDATE);
            expect(activeHookTypes).to.equal(expectedActiveHookTypes);

            // Sanity check that the config was set
            const config = await controller.getHookConfig(HOOK_TYPE_POST_UPDATE);
            expect(config.allowHookFailure).to.equal(hookConfig.allowHookFailure);
            expect(config.hookGasLimit).to.equal(hookConfig.hookGasLimit);
            expect(config.hookAddress).to.equal(hookConfig.hookAddress);
        });

        it("Changes the pre update hook config", async function () {
            const [signer] = await ethers.getSigners();
            const signerAddress = await signer.getAddress();

            // Set the pre update hook config
            const hookConfig = {
                allowHookFailure: false,
                hookGasLimit: BigNumber.from(1_000_000),
                hookAddress: hook.address,
            };
            await controller.setHookConfig(HOOK_TYPE_PRE_UPDATE, hookConfig);

            // Change the pre update hook config
            const newHookConfig = {
                allowHookFailure: true,
                hookGasLimit: BigNumber.from(2_000_000),
                hookAddress: hook.address,
            };

            const tx = await controller.setHookConfig(HOOK_TYPE_PRE_UPDATE, newHookConfig);

            const txTimestamp = blockTimestamp(tx.blockNumber);

            await expect(tx)
                .to.emit(controller, "HookConfigUpdated")
                .withArgs(signerAddress, HOOK_TYPE_PRE_UPDATE, hookConfig, newHookConfig, txTimestamp);

            const activeHookTypes = await controller.stubActiveHookTypes();

            const expectedActiveHookTypes = BigNumber.from(1).shl(HOOK_TYPE_PRE_UPDATE);
            expect(activeHookTypes).to.equal(expectedActiveHookTypes);

            // Sanity check that the config was set
            const config = await controller.getHookConfig(HOOK_TYPE_PRE_UPDATE);
            expect(config.allowHookFailure).to.equal(newHookConfig.allowHookFailure);
            expect(config.hookGasLimit).to.equal(newHookConfig.hookGasLimit);
            expect(config.hookAddress).to.equal(newHookConfig.hookAddress);
        });

        it("Changes the post update hook config", async function () {
            const [signer] = await ethers.getSigners();
            const signerAddress = await signer.getAddress();

            // Set the post update hook config
            const hookConfig = {
                allowHookFailure: false,
                hookGasLimit: BigNumber.from(1_000_000),
                hookAddress: hook.address,
            };
            await controller.setHookConfig(HOOK_TYPE_POST_UPDATE, hookConfig);

            // Change the post update hook config
            const newHookConfig = {
                allowHookFailure: true,
                hookGasLimit: BigNumber.from(2_000_000),
                hookAddress: hook.address,
            };

            const tx = await controller.setHookConfig(HOOK_TYPE_POST_UPDATE, newHookConfig);

            const txTimestamp = blockTimestamp(tx.blockNumber);

            await expect(tx)
                .to.emit(controller, "HookConfigUpdated")
                .withArgs(signerAddress, HOOK_TYPE_POST_UPDATE, hookConfig, newHookConfig, txTimestamp);

            const activeHookTypes = await controller.stubActiveHookTypes();

            const expectedActiveHookTypes = BigNumber.from(1).shl(HOOK_TYPE_POST_UPDATE);
            expect(activeHookTypes).to.equal(expectedActiveHookTypes);

            // Sanity check that the config was set
            const config = await controller.getHookConfig(HOOK_TYPE_POST_UPDATE);
            expect(config.allowHookFailure).to.equal(newHookConfig.allowHookFailure);
            expect(config.hookGasLimit).to.equal(newHookConfig.hookGasLimit);
            expect(config.hookAddress).to.equal(newHookConfig.hookAddress);
        });

        it("Disables the pre update hook", async function () {
            const [signer] = await ethers.getSigners();
            const signerAddress = await signer.getAddress();

            // Set the pre update hook config
            const hookConfig = {
                allowHookFailure: false,
                hookGasLimit: BigNumber.from(1_000_000),
                hookAddress: hook.address,
            };
            await controller.setHookConfig(HOOK_TYPE_PRE_UPDATE, hookConfig);

            // Disable the pre update hook
            const tx = await controller.setHookConfig(HOOK_TYPE_PRE_UPDATE, DISABLED_HOOK_CONFIG);

            const txTimestamp = blockTimestamp(tx.blockNumber);

            await expect(tx)
                .to.emit(controller, "HookConfigUpdated")
                .withArgs(signerAddress, HOOK_TYPE_PRE_UPDATE, hookConfig, DISABLED_HOOK_CONFIG, txTimestamp);

            const activeHookTypes = await controller.stubActiveHookTypes();

            const expectedActiveHookTypes = BigNumber.from(0);
            expect(activeHookTypes).to.equal(expectedActiveHookTypes);

            // Sanity check that the config was set
            const config = await controller.getHookConfig(HOOK_TYPE_PRE_UPDATE);
            expect(config.allowHookFailure).to.equal(DISABLED_HOOK_CONFIG.allowHookFailure);
            expect(config.hookGasLimit).to.equal(DISABLED_HOOK_CONFIG.hookGasLimit);
            expect(config.hookAddress).to.equal(DISABLED_HOOK_CONFIG.hookAddress);
        });

        it("Disables the post update hook", async function () {
            const [signer] = await ethers.getSigners();
            const signerAddress = await signer.getAddress();

            // Set the post update hook config
            const hookConfig = {
                allowHookFailure: false,
                hookGasLimit: BigNumber.from(1_000_000),
                hookAddress: hook.address,
            };
            await controller.setHookConfig(HOOK_TYPE_POST_UPDATE, hookConfig);

            // Disable the post update hook
            const tx = await controller.setHookConfig(HOOK_TYPE_POST_UPDATE, DISABLED_HOOK_CONFIG);

            const txTimestamp = blockTimestamp(tx.blockNumber);

            await expect(tx)
                .to.emit(controller, "HookConfigUpdated")
                .withArgs(signerAddress, HOOK_TYPE_POST_UPDATE, hookConfig, DISABLED_HOOK_CONFIG, txTimestamp);

            const activeHookTypes = await controller.stubActiveHookTypes();

            const expectedActiveHookTypes = BigNumber.from(0);
            expect(activeHookTypes).to.equal(expectedActiveHookTypes);

            // Sanity check that the config was set
            const config = await controller.getHookConfig(HOOK_TYPE_POST_UPDATE);
            expect(config.allowHookFailure).to.equal(DISABLED_HOOK_CONFIG.allowHookFailure);
            expect(config.hookGasLimit).to.equal(DISABLED_HOOK_CONFIG.hookGasLimit);
            expect(config.hookAddress).to.equal(DISABLED_HOOK_CONFIG.hookAddress);
        });

        it("Sets both pre and post update hooks", async function () {
            const [signer] = await ethers.getSigners();
            const signerAddress = await signer.getAddress();

            const hookFactory = await ethers.getContractFactory("HookStub");
            const hook2 = await hookFactory.deploy();
            await hook2.deployed();

            // Set the pre update hook config
            const preUpdateHookConfig = {
                allowHookFailure: false,
                hookGasLimit: BigNumber.from(2_000_000),
                hookAddress: hook.address,
            };
            const preUpdateTx = await controller.setHookConfig(HOOK_TYPE_PRE_UPDATE, preUpdateHookConfig);

            const preUpdateTxTimestamp = blockTimestamp(preUpdateTx.blockNumber);

            await expect(preUpdateTx)
                .to.emit(controller, "HookConfigUpdated")
                .withArgs(
                    signerAddress,
                    HOOK_TYPE_PRE_UPDATE,
                    DISABLED_HOOK_CONFIG,
                    preUpdateHookConfig,
                    preUpdateTxTimestamp
                );

            // Set the post update hook config
            const postUpdateHookConfig = {
                allowHookFailure: true,
                hookGasLimit: BigNumber.from(1_000_000),
                hookAddress: hook2.address,
            };
            const postUpdateTx = await controller.setHookConfig(HOOK_TYPE_POST_UPDATE, postUpdateHookConfig);
            const postUpdateTxTimestamp = blockTimestamp(postUpdateTx.blockNumber);
            await expect(postUpdateTx)
                .to.emit(controller, "HookConfigUpdated")
                .withArgs(
                    signerAddress,
                    HOOK_TYPE_POST_UPDATE,
                    DISABLED_HOOK_CONFIG,
                    postUpdateHookConfig,
                    postUpdateTxTimestamp
                );

            const activeHookTypes = await controller.stubActiveHookTypes();

            const expectedActiveHookTypes = BigNumber.from(1)
                .shl(HOOK_TYPE_PRE_UPDATE)
                .or(BigNumber.from(1).shl(HOOK_TYPE_POST_UPDATE));
            expect(activeHookTypes).to.equal(expectedActiveHookTypes);

            // Sanity check that the configs were set
            const preUpdateConfig = await controller.getHookConfig(HOOK_TYPE_PRE_UPDATE);
            expect(preUpdateConfig.allowHookFailure).to.equal(preUpdateHookConfig.allowHookFailure);
            expect(preUpdateConfig.hookGasLimit).to.equal(preUpdateHookConfig.hookGasLimit);
            expect(preUpdateConfig.hookAddress).to.equal(preUpdateHookConfig.hookAddress);

            const postUpdateConfig = await controller.getHookConfig(HOOK_TYPE_POST_UPDATE);
            expect(postUpdateConfig.allowHookFailure).to.equal(postUpdateHookConfig.allowHookFailure);
            expect(postUpdateConfig.hookGasLimit).to.equal(postUpdateHookConfig.hookGasLimit);
            expect(postUpdateConfig.hookAddress).to.equal(postUpdateHookConfig.hookAddress);
        });
    });

    describeComputeRateTests(contractName, deployFunc);

    describe(contractName + "#timeSinceLastUpdate", function () {
        var controller;

        beforeEach(async () => {
            const deployment = await deployFunc();
            controller = deployment.controller;

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

    describe(contractName + "#lastUpdateTime", function () {
        var controller;

        beforeEach(async () => {
            const deployment = await deployFunc();
            controller = deployment.controller;

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

    describeCanUpdateTests(contractName, deployFunc);

    describeNeedsUpdateTests(contractName, deployFunc);

    describeUpdateTests(contractName, deployFunc);

    describeSetChangeThresholdTests?.(contractName, deployFunc);

    describeWillAnythingChangeTests?.(contractName, deployFunc);

    describeCalculateChangeTests?.(contractName, deployFunc);

    describe(contractName + " - IHistoricalRates implementation", function () {
        var controller;

        beforeEach(async () => {
            const deployment = await deployFunc();
            controller = deployment.controller;

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

        describe(contractName + "#initializeBuffers", function () {
            it("Can't be called twice", async function () {
                await controller.stubInitializeBuffers(USDC);

                await expect(controller.stubInitializeBuffers(USDC))
                    .to.be.revertedWith("BufferAlreadyInitialized")
                    .withArgs(USDC);
            });

            it("Emits the correct event", async function () {
                await expect(controller.stubInitializeBuffers(USDC))
                    .to.emit(controller, "RatesCapacityInitialized")
                    .withArgs(USDC, INITIAL_BUFFER_CARDINALITY);
            });
        });

        describe(contractName + "#setRatesCapacity", function () {
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
                await expect(controller.setRatesCapacity(USDC, 2)).to.be.revertedWith("MissingConfig").withArgs(USDC);
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
                await expect(controller.setRatesCapacity(GRT, amount)).to.not.emit(
                    controller,
                    "RatesCapacityIncreased"
                );
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

        describe(contractName + "#getRatesCapacity", function () {
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

        describe(contractName + "#getRatesCount", function () {
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

        describe(contractName + "#getRates(token, amount, offset, increment)", function () {
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

        describe(contractName + "#getRates(token, amount)", function () {
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

        describe(contractName + "#getRateAt", function () {
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

    describe(contractName + "#manuallyPushRate", function () {
        var controller;

        beforeEach(async function () {
            const deployment = await deployFunc();
            controller = deployment.controller;

            // Get our signer address
            const [signer] = await ethers.getSigners();

            // Grant all roles to the signer
            await controller.grantRole(ORACLE_UPDATER_MANAGER_ROLE, signer.address);
            await controller.grantRole(ORACLE_UPDATER_ROLE, signer.address);
            await controller.grantRole(RATE_ADMIN_ROLE, signer.address);
            await controller.grantRole(UPDATE_PAUSE_ADMIN_ROLE, signer.address);

            // Set config for GRT
            await setDefaultConfigFunc(controller, GRT);
        });

        it("Should revert if the caller does not have the ADMIN role", async function () {
            // Get the second signer
            const [, signer] = await ethers.getSigners();

            // Assign the signer all of the other roles
            await controller.grantRole(ORACLE_UPDATER_MANAGER_ROLE, signer.address);
            await controller.grantRole(ORACLE_UPDATER_ROLE, signer.address);
            await controller.grantRole(UPDATE_PAUSE_ADMIN_ROLE, signer.address);
            await controller.grantRole(RATE_ADMIN_ROLE, signer.address);

            // Format the signer's address to be lowercase
            const signerAddress = signer.address.toLowerCase();

            const rate = ethers.utils.parseUnits("0.1234", 18);

            await expect(controller.connect(signer).manuallyPushRate(GRT, rate, rate, 1)).to.be.revertedWith(
                "AccessControl: account " + signerAddress + " is missing role " + ADMIN_ROLE
            );

            // Sanity check that we can successfully call the function if we have the role
            await controller.grantRole(ADMIN_ROLE, signer.address);
            await expect(controller.connect(signer).manuallyPushRate(GRT, rate, rate, 1)).to.not.be.reverted;
        });

        it("Should revert if the token doesn't have a config", async function () {
            const rate = ethers.utils.parseUnits("0.1234", 18);

            await expect(controller.manuallyPushRate(USDC, rate, rate, 1))
                .to.be.revertedWith(/MissingPidConfig|MissingConfig/)
                .withArgs(USDC);

            // Sanity check that it works if we set a config
            await setDefaultConfigFunc(controller, USDC);
            await expect(controller.manuallyPushRate(USDC, rate, rate, 1)).to.not.be.reverted;
        });

        it("Doesn't emit any events or push any rates if the amount is set to zero", async function () {
            const rate = ethers.utils.parseUnits("0.1234", 18);

            const initialRateCount = await controller.getRatesCount(GRT);
            // Sanity check that the rate count is 0
            expect(initialRateCount).to.equal(0);

            const tx = await controller.manuallyPushRate(GRT, rate, rate, 0);

            const receipt = await tx.wait();

            expect(receipt.events.length).to.equal(0);
            expect(await controller.getRatesCount(GRT)).to.equal(initialRateCount);
        });

        it("Pushes one rate if the amount is set to one", async function () {
            const rate = ethers.utils.parseUnits("0.1234", 18);

            const initialRateCount = await controller.getRatesCount(GRT);
            // Sanity check that the rate count is 0
            expect(initialRateCount).to.equal(0);

            const capacity = await controller.getRatesCapacity(GRT);

            const amount = 1;

            const tx = await controller.manuallyPushRate(GRT, rate, rate, amount);
            const receipt = await tx.wait();
            const timestamp = await blockTimestamp(receipt.blockNumber);

            expect(receipt).to.emit(controller, "RateUpdated").withArgs(GRT, rate, rate, timestamp);
            expect(receipt).to.emit(controller, "RatePushedManually").withArgs(GRT, rate, rate, amount, timestamp);
            expect(await controller.getRatesCount(GRT)).to.equal(Math.min(initialRateCount + amount, capacity));
            // Ensure RateUpdated was emitted `amount` times
            expect(receipt.events.filter((e) => e.event === "RateUpdated").length).to.equal(amount);
        });

        it("Pushes two rates if the amount is set to two", async function () {
            const rate = ethers.utils.parseUnits("0.1234", 18);

            const initialRateCount = await controller.getRatesCount(GRT);
            // Sanity check that the rate count is 0
            expect(initialRateCount).to.equal(0);

            const capacity = await controller.getRatesCapacity(GRT);

            const amount = 2;

            const tx = await controller.manuallyPushRate(GRT, rate, rate, amount);
            const receipt = await tx.wait();
            const timestamp = await blockTimestamp(receipt.blockNumber);

            expect(receipt).to.emit(controller, "RateUpdated").withArgs(GRT, rate, rate, timestamp);
            expect(receipt).to.emit(controller, "RatePushedManually").withArgs(GRT, rate, rate, amount, timestamp);
            expect(await controller.getRatesCount(GRT)).to.equal(Math.min(initialRateCount + amount, capacity));
            // Ensure RateUpdated was emitted `amount` times
            expect(receipt.events.filter((e) => e.event === "RateUpdated").length).to.equal(amount);
        });

        describe("Update hooks", function () {
            let hookFactory;

            let hook;

            before(async function () {
                hookFactory = await ethers.getContractFactory("HookStub");
            });

            beforeEach(async function () {
                hook = await hookFactory.deploy();
                await hook.deployed();
            });

            it("Calls only the pre update hook", async function () {
                await controller.setHookConfig(HOOK_TYPE_PRE_UPDATE, {
                    allowHookFailure: false,
                    hookGasLimit: 1_000_000,
                    hookAddress: hook.address,
                });

                const updateTxPromise = controller.manuallyPushRate(GRT, 1, 1, 1);

                await expect(updateTxPromise).to.emit(controller, "RateUpdated");

                expect(await hook.preUpdateCallCount()).to.equal(1);
                expect(await hook.postUpdateCallCount()).to.equal(0);
            });

            it("Calls only the post update hook", async function () {
                await controller.setHookConfig(HOOK_TYPE_POST_UPDATE, {
                    allowHookFailure: false,
                    hookGasLimit: 1_000_000,
                    hookAddress: hook.address,
                });

                const updateTxPromise = controller.manuallyPushRate(GRT, 1, 1, 1);

                await expect(updateTxPromise).to.emit(controller, "RateUpdated");

                expect(await hook.preUpdateCallCount()).to.equal(0);
                expect(await hook.postUpdateCallCount()).to.equal(1);
            });

            it("Reverts when the pre update hook fails (allowHookFailure = false)", async function () {
                await controller.setHookConfig(HOOK_TYPE_PRE_UPDATE, {
                    allowHookFailure: false,
                    hookGasLimit: 1_000_000,
                    hookAddress: hook.address,
                });

                // Make the pre update hook fail
                await hook.stubSetRevertPreUpdate(true);

                const expectedInnerError = new ethers.utils.Interface([
                    "error PreUpdateHookFailed(address token)",
                ]).encodeErrorResult("PreUpdateHookFailed", [GRT]);

                await expect(controller.manuallyPushRate(GRT, 1, 1, 1))
                    .to.be.revertedWith("HookFailedError")
                    .withArgs(HOOK_TYPE_PRE_UPDATE, hook.address, GRT, expectedInnerError);
            });

            it("Reverts when the post update hook fails (allowHookFailure = false)", async function () {
                await controller.setHookConfig(HOOK_TYPE_POST_UPDATE, {
                    allowHookFailure: false,
                    hookGasLimit: 1_000_000,
                    hookAddress: hook.address,
                });

                // Make the post update hook fail
                await hook.stubSetRevertPostUpdate(true);

                const expectedInnerError = new ethers.utils.Interface([
                    "error PostUpdateHookFailed(address token)",
                ]).encodeErrorResult("PostUpdateHookFailed", [GRT]);

                await expect(controller.manuallyPushRate(GRT, 1, 1, 1))
                    .to.be.revertedWith("HookFailedError")
                    .withArgs(HOOK_TYPE_POST_UPDATE, hook.address, GRT, expectedInnerError);
            });

            it("Emits a failure event when the pre update hook fails (allowHookFailure = true)", async function () {
                await controller.setHookConfig(HOOK_TYPE_PRE_UPDATE, {
                    allowHookFailure: true,
                    hookGasLimit: 1_000_000,
                    hookAddress: hook.address,
                });

                // Make the pre update hook fail
                await hook.stubSetRevertPreUpdate(true);

                const updateTx = await controller.manuallyPushRate(GRT, 1, 1, 1);

                const timestamp = await currentBlockTimestamp();

                const expectedInnerError = new ethers.utils.Interface([
                    "error PreUpdateHookFailed(address token)",
                ]).encodeErrorResult("PreUpdateHookFailed", [GRT]);

                await expect(updateTx)
                    .to.emit(controller, "HookFailed")
                    .withArgs(HOOK_TYPE_PRE_UPDATE, hook.address, GRT, expectedInnerError, timestamp);
            });

            it("Emits a failure event when the post update hook fails (allowHookFailure = true)", async function () {
                await controller.setHookConfig(HOOK_TYPE_POST_UPDATE, {
                    allowHookFailure: true,
                    hookGasLimit: 1_000_000,
                    hookAddress: hook.address,
                });

                // Make the post update hook fail
                await hook.stubSetRevertPostUpdate(true);

                const updateTx = await controller.manuallyPushRate(GRT, 1, 1, 1);

                const timestamp = await currentBlockTimestamp();

                const expectedInnerError = new ethers.utils.Interface([
                    "error PostUpdateHookFailed(address token)",
                ]).encodeErrorResult("PostUpdateHookFailed", [GRT]);

                await expect(updateTx)
                    .to.emit(controller, "HookFailed")
                    .withArgs(HOOK_TYPE_POST_UPDATE, hook.address, GRT, expectedInnerError, timestamp);
            });

            it("Reverts when the pre update hook runs out of gas (allowHookFailure = false)", async function () {
                await controller.setHookConfig(HOOK_TYPE_PRE_UPDATE, {
                    allowHookFailure: false,
                    hookGasLimit: 1,
                    hookAddress: hook.address,
                });

                await expect(controller.manuallyPushRate(GRT, 1, 1, 1))
                    .to.be.revertedWith("HookFailedError")
                    .withArgs(HOOK_TYPE_PRE_UPDATE, hook.address, GRT, "0x");
            });

            it("Reverts when the post update hook runs out of gas (allowHookFailure = false)", async function () {
                await controller.setHookConfig(HOOK_TYPE_POST_UPDATE, {
                    allowHookFailure: false,
                    hookGasLimit: 1,
                    hookAddress: hook.address,
                });

                await expect(controller.manuallyPushRate(GRT, 1, 1, 1))
                    .to.be.revertedWith("HookFailedError")
                    .withArgs(HOOK_TYPE_POST_UPDATE, hook.address, GRT, "0x");
            });

            it("Emits a failure event when the pre update hook runs out of gas (allowHookFailure = true)", async function () {
                await controller.setHookConfig(HOOK_TYPE_PRE_UPDATE, {
                    allowHookFailure: true,
                    hookGasLimit: 1,
                    hookAddress: hook.address,
                });

                const updateTx = await controller.manuallyPushRate(GRT, 1, 1, 1);

                const timestamp = await currentBlockTimestamp();

                await expect(updateTx)
                    .to.emit(controller, "HookFailed")
                    .withArgs(HOOK_TYPE_PRE_UPDATE, hook.address, GRT, "0x", timestamp);
            });

            it("Emits a failure event when the post update hook runs out of gas (allowHookFailure = true)", async function () {
                await controller.setHookConfig(HOOK_TYPE_POST_UPDATE, {
                    allowHookFailure: true,
                    hookGasLimit: 1,
                    hookAddress: hook.address,
                });

                const updateTx = await controller.manuallyPushRate(GRT, 1, 1, 1);

                const timestamp = await currentBlockTimestamp();

                await expect(updateTx)
                    .to.emit(controller, "HookFailed")
                    .withArgs(HOOK_TYPE_POST_UPDATE, hook.address, GRT, "0x", timestamp);
            });

            it("Updating is non-reentrant (with pre update hook)", async function () {
                const hookFactory = await ethers.getContractFactory("ReentrantHook");

                const reentrantHook = await hookFactory.deploy(/* callUpdate */ true);
                await reentrantHook.deployed();

                await controller.setHookConfig(HOOK_TYPE_PRE_UPDATE, {
                    allowHookFailure: false,
                    hookGasLimit: 1_000_000,
                    hookAddress: reentrantHook.address,
                });

                // The selector for Error(string) is the first 4 bytes of the hash of "Error(string)"
                const selector = keccak256(toUtf8Bytes("Error(string)")).slice(0, 10); // 0x08c379a0
                const encodedReason = defaultAbiCoder.encode(["string"], ["ReentrancyGuard: reentrant call"]);
                // Full revert data = selector + encoded string (without 0x prefix)
                const expectedInnerError = selector + encodedReason.slice(2);

                await expect(controller.manuallyPushRate(GRT, 1, 1, 1))
                    .to.be.revertedWith("HookFailedError")
                    .withArgs(HOOK_TYPE_PRE_UPDATE, reentrantHook.address, GRT, expectedInnerError);
            });

            it("Updating is non-reentrant (with post update hook)", async function () {
                const hookFactory = await ethers.getContractFactory("ReentrantHook");

                const reentrantHook = await hookFactory.deploy(/* callUpdate */ true);
                await reentrantHook.deployed();

                await controller.setHookConfig(HOOK_TYPE_POST_UPDATE, {
                    allowHookFailure: false,
                    hookGasLimit: 1_000_000,
                    hookAddress: reentrantHook.address,
                });

                // The selector for Error(string) is the first 4 bytes of the hash of "Error(string)"
                const selector = keccak256(toUtf8Bytes("Error(string)")).slice(0, 10); // 0x08c379a0
                const encodedReason = defaultAbiCoder.encode(["string"], ["ReentrancyGuard: reentrant call"]);
                // Full revert data = selector + encoded string (without 0x prefix)
                const expectedInnerError = selector + encodedReason.slice(2);

                await expect(controller.manuallyPushRate(GRT, 1, 1, 1))
                    .to.be.revertedWith("HookFailedError")
                    .withArgs(HOOK_TYPE_POST_UPDATE, reentrantHook.address, GRT, expectedInnerError);
            });

            it("Manually pushing a rate is non-reentrant (with pre update hook)", async function () {
                const hookFactory = await ethers.getContractFactory("ReentrantHook");

                const reentrantHook = await hookFactory.deploy(/* callUpdate */ false);
                await reentrantHook.deployed();

                // Grant the hook the ADMIN role so that it can call manuallyPushRate
                await controller.grantRole(ADMIN_ROLE, reentrantHook.address);

                await controller.setHookConfig(HOOK_TYPE_PRE_UPDATE, {
                    allowHookFailure: false,
                    hookGasLimit: 1_000_000,
                    hookAddress: reentrantHook.address,
                });

                // The selector for Error(string) is the first 4 bytes of the hash of "Error(string)"
                const selector = keccak256(toUtf8Bytes("Error(string)")).slice(0, 10); // 0x08c379a0
                const encodedReason = defaultAbiCoder.encode(["string"], ["ReentrancyGuard: reentrant call"]);
                // Full revert data = selector + encoded string (without 0x prefix)
                const expectedInnerError = selector + encodedReason.slice(2);

                await expect(controller.manuallyPushRate(GRT, 1, 1, 1))
                    .to.be.revertedWith("HookFailedError")
                    .withArgs(HOOK_TYPE_PRE_UPDATE, reentrantHook.address, GRT, expectedInnerError);
            });

            it("Manually pushing a rate is non-reentrant (with post update hook)", async function () {
                const hookFactory = await ethers.getContractFactory("ReentrantHook");

                const reentrantHook = await hookFactory.deploy(/* callUpdate */ false);
                await reentrantHook.deployed();

                // Grant the hook the ADMIN role so that it can call manuallyPushRate
                await controller.grantRole(ADMIN_ROLE, reentrantHook.address);

                await controller.setHookConfig(HOOK_TYPE_POST_UPDATE, {
                    allowHookFailure: false,
                    hookGasLimit: 1_000_000,
                    hookAddress: reentrantHook.address,
                });

                // The selector for Error(string) is the first 4 bytes of the hash of "Error(string)"
                const selector = keccak256(toUtf8Bytes("Error(string)")).slice(0, 10); // 0x08c379a0
                const encodedReason = defaultAbiCoder.encode(["string"], ["ReentrancyGuard: reentrant call"]);
                // Full revert data = selector + encoded string (without 0x prefix)
                const expectedInnerError = selector + encodedReason.slice(2);

                await expect(controller.manuallyPushRate(GRT, 1, 1, 1))
                    .to.be.revertedWith("HookFailedError")
                    .withArgs(HOOK_TYPE_POST_UPDATE, reentrantHook.address, GRT, expectedInnerError);
            });
        });
    });

    describe(contractName + "#supportsInterface", function () {
        var controller;
        var interfaceIds;

        beforeEach(async () => {
            const deployment = await deployFunc();
            controller = deployment.controller;

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
}

async function initializePidController(controller) {
    await controller.setPidConfig(GRT, DEFAULT_PID_CONFIG);
}

async function setDefaultStandardConfig(controller, token) {
    await controller.setConfig(token, DEFAULT_CONFIG);
}

async function setDefaultPidConfig(controller, token) {
    await controller.setConfig(token, DEFAULT_CONFIG);
    await controller.setPidConfig(token, DEFAULT_PID_CONFIG);
}

describeTests(
    "RateController",
    deployStandardController,
    setDefaultStandardConfig,
    describeStandardControllerComputeRateTests,
    createDescribeStandardControllerNeedsUpdateTests(/* supportsChangeThresholds */ true, undefined, undefined),
    createDescribeStandardControllerUpdateTests(undefined, true, undefined, true),
    createDescribeCanUpdateTests(false),
    createDecreaseChangeThresholdTests(false, true),
    createStandardWillAnythingChangeTests(),
    createStandardCalculateChangeTests()
);
describeTests(
    "PidController",
    deployPidController,
    setDefaultPidConfig,
    describePidControllerComputeRateTests,
    createDescribeStandardControllerNeedsUpdateTests(
        /* supportsChangeThresholds */ false,
        initializePidController,
        describePidControllerNeedsUpdateTests
    ),
    createDescribeStandardControllerUpdateTests(
        initializePidController,
        false,
        describePidControllerUpdateTests,
        false
    ),
    createDescribeCanUpdateTests(true),
    createDecreaseChangeThresholdTests(true, false),
    undefined,
    createStandardCalculateChangeTests()
);
