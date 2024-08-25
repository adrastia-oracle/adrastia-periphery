const { expect } = require("chai");
const { BigNumber } = require("ethers");
const { ethers, timeAndMine } = require("hardhat");

const AddressZero = ethers.constants.AddressZero;

const ORACLE_UPDATER_MANAGER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("UPDATER_ADMIN_ROLE"));
const ORACLE_UPDATER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("ORACLE_UPDATER_ROLE"));
const RATE_ADMIN_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("RATE_ADMIN_ROLE"));
const UPDATE_PAUSE_ADMIN_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("UPDATE_PAUSE_ADMIN_ROLE"));

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

const DEFAULT_PERIOD = 100;

describe("TrueFiAlocPidController", function () {
    describe("TrueFiAlocPidController#update", function () {
        var controller;
        var oracle;
        var aloc;

        beforeEach(async function () {
            const alocFactory = await ethers.getContractFactory("AlocStub");
            aloc = await alocFactory.deploy();
            await aloc.deployed();

            const oracleFactory = await ethers.getContractFactory("InputAndErrorAccumulatorStub");
            oracle = await oracleFactory.deploy();
            await oracle.deployed();

            const controllerFactory = await ethers.getContractFactory("TrueFiAlocPidController");
            controller = await controllerFactory.deploy(oracle.address, false, DEFAULT_PERIOD, 1, false);

            // Grant roles
            const [signer] = await ethers.getSigners();
            await controller.grantRole(ORACLE_UPDATER_MANAGER_ROLE, signer.address);
            await controller.grantRole(ORACLE_UPDATER_ROLE, signer.address);
            await controller.grantRole(RATE_ADMIN_ROLE, signer.address);
            await controller.grantRole(UPDATE_PAUSE_ADMIN_ROLE, signer.address);

            // Set configs
            await controller.setConfig(aloc.address, DEFAULT_CONFIG);
            await controller.setPidConfig(aloc.address, DEFAULT_PID_CONFIG);

            // Set input and target s.t. the rate increases
            const input = ethers.utils.parseUnits("0.95", 8);
            const target = ethers.utils.parseUnits("0.9", 8);
            await oracle.setInput(aloc.address, input);
            await oracle.setTarget(aloc.address, target);
        });

        it("Doesn't call updateAndPayFee if the buffer is empty", async function () {
            // Encode the aloc address as the update data
            const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [aloc.address]);
            await expect(controller.update(updateData)).to.not.emit(aloc, "FeesPaid");
        });

        it("Calls updateAndPayFee if the buffer is not empty", async function () {
            const startingRate = ethers.utils.parseUnits("0.2", 8);
            await controller.manuallyPushRate(aloc.address, startingRate, startingRate, 1);

            const period = await controller.period();
            // Advance the period
            await timeAndMine.increaseTime(period.toNumber());

            // Encode the aloc address as the update data
            const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [aloc.address]);
            await expect(controller.update(updateData)).to.emit(aloc, "FeesPaid");
        });

        it("Doesn't call updateAndPayFee if the interest rate is unavailable but the buffer is not empty", async function () {
            const startingRate = ethers.utils.parseUnits("0.2", 8);
            await controller.manuallyPushRate(aloc.address, startingRate, startingRate, 1);

            // Set the interest rate to be unavailable
            await aloc.stubSetInterestRateReverts(true);

            const period = await controller.period();
            // Advance the period
            await timeAndMine.increaseTime(period.toNumber());

            // Encode the aloc address as the update data
            const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [aloc.address]);
            await expect(controller.update(updateData)).to.not.emit(aloc, "FeesPaid");
        });

        it("Calls updateAndPayFee before pushing the new rate", async function () {
            const startingRate = ethers.utils.parseUnits("0.2", 8);
            await controller.manuallyPushRate(aloc.address, startingRate, startingRate, 1);

            const period = await controller.period();
            // Advance the period
            await timeAndMine.increaseTime(period.toNumber());

            // Encode the aloc address as the update data
            const updateData = ethers.utils.defaultAbiCoder.encode(["address"], [aloc.address]);
            await expect(controller.update(updateData)).to.emit(aloc, "FeesPaid").withArgs(startingRate);

            const newRate = await controller.computeRate(aloc.address);

            // The new rate should be different from the starting rate
            expect(newRate).to.not.eq(startingRate);
        });
    });
});
