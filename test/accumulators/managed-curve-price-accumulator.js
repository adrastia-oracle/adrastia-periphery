const { expect } = require("chai");
const { ethers } = require("hardhat");

const ORACLE_UPDATER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("ORACLE_UPDATER_ROLE"));

const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";

const MIN_UPDATE_DELAY = 1;
const MAX_UPDATE_DELAY = 2;
const TWO_PERCENT_CHANGE = 2000000;

describe("ManagedCurvePriceAccumulator#update", function () {
    var accumulator;

    beforeEach(async () => {
        // Deploy the curve pool
        const poolFactory = await ethers.getContractFactory("CurvePoolStub");
        const curvePool = await poolFactory.deploy([WETH, USDC]);
        await curvePool.deployed();

        // Deploy accumulator
        const accumulatorFactory = await ethers.getContractFactory("ManagedCurvePriceAccumulator");
        accumulator = await accumulatorFactory.deploy(
            curvePool.address,
            2,
            USDC,
            USDC,
            TWO_PERCENT_CHANGE,
            MIN_UPDATE_DELAY,
            MAX_UPDATE_DELAY
        );

        const [owner] = await ethers.getSigners();

        // Grant owner the oracle updater role
        await accumulator.grantRole(ORACLE_UPDATER_ROLE, owner.address);
    });

    describe("Only accounts with oracle updater role can update", function () {
        it("Accounts with oracle updater role can update", async function () {
            expect(await accumulator.update(WETH)).to.emit(accumulator, "Updated");
        });

        it("Accounts without oracle updater role cannot update", async function () {
            const [, addr1] = await ethers.getSigners();

            await expect(accumulator.connect(addr1).update(WETH)).to.be.reverted;
        });
    });

    describe("All accounts can update", function () {
        beforeEach(async () => {
            // Grant everyone the oracle updater role
            await accumulator.grantRole(ORACLE_UPDATER_ROLE, ethers.constants.AddressZero);
        });

        it("Accounts with oracle updater role can update", async function () {
            expect(await accumulator.update(WETH)).to.emit(accumulator, "Updated");
        });

        it("Accounts without oracle updater role can update", async function () {
            const [, addr1] = await ethers.getSigners();

            await expect(accumulator.connect(addr1).update(WETH)).to.emit(accumulator, "Updated");
        });
    });
});

describe("ManagedCurvePriceAccumulator#supportsInterface(interfaceId)", function () {
    var accumulator;
    var interfaceIds;

    beforeEach(async () => {
        // Deploy the curve pool
        const poolFactory = await ethers.getContractFactory("CurvePoolStub");
        const curvePool = await poolFactory.deploy([WETH, USDC]);
        await curvePool.deployed();

        // Deploy accumulator
        const accumulatorFactory = await ethers.getContractFactory("ManagedCurvePriceAccumulator");
        accumulator = await accumulatorFactory.deploy(
            curvePool.address,
            2,
            USDC,
            USDC,
            TWO_PERCENT_CHANGE,
            MIN_UPDATE_DELAY,
            MAX_UPDATE_DELAY
        );

        const interfaceIdsFactory = await ethers.getContractFactory("InterfaceIds");
        interfaceIds = await interfaceIdsFactory.deploy();
    });

    it("Should support IAccessControl", async () => {
        const interfaceId = await interfaceIds.iAccessControl();
        expect(await accumulator["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
    });
});
