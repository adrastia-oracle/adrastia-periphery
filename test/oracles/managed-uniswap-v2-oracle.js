const { expect } = require("chai");
const { ethers } = require("hardhat");

const ORACLE_UPDATER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("ORACLE_UPDATER_ROLE"));

const uniswapV2FactoryAddress = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
const uniswapV2InitCodeHash = "0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f";

const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";

const MIN_UPDATE_DELAY = 1;
const MAX_UPDATE_DELAY = 2;
const TWO_PERCENT_CHANGE = 2000000;
const PERIOD = 100;

describe("ManagedUniswapV2Oracle#update", function () {
    var oracle;

    beforeEach(async () => {
        const liquidityAccumulatorFactory = await ethers.getContractFactory("UniswapV2LiquidityAccumulatorStub");
        const liquidityAccumulator = await liquidityAccumulatorFactory.deploy(
            uniswapV2FactoryAddress,
            uniswapV2InitCodeHash,
            USDC,
            TWO_PERCENT_CHANGE,
            MIN_UPDATE_DELAY,
            MAX_UPDATE_DELAY
        );
        await liquidityAccumulator.deployed();

        // Initialize liquidity accumulator
        await liquidityAccumulator.update(WETH);

        const oracleFactory = await ethers.getContractFactory("ManagedUniswapV2Oracle");

        oracle = await oracleFactory.deploy(
            liquidityAccumulator.address,
            uniswapV2FactoryAddress,
            uniswapV2InitCodeHash,
            USDC,
            PERIOD
        );

        const [owner] = await ethers.getSigners();

        // Grant owner the oracle updater role
        await oracle.grantRole(ORACLE_UPDATER_ROLE, owner.address);
    });

    describe("Only accounts with oracle updater role can update", function () {
        it("Accounts with oracle updater role can update", async function () {
            expect(await oracle.update(WETH)).to.emit(oracle, "Updated");
        });

        it("Accounts without oracle updater role cannot update", async function () {
            const [, addr1] = await ethers.getSigners();

            await expect(oracle.connect(addr1).update(WETH)).to.be.reverted;
        });
    });

    describe("All accounts can update", function () {
        beforeEach(async () => {
            // Grant everyone the oracle updater role
            await oracle.grantRole(ORACLE_UPDATER_ROLE, ethers.constants.AddressZero);
        });

        it("Accounts with oracle updater role can update", async function () {
            expect(await oracle.update(WETH)).to.emit(oracle, "Updated");
        });

        it("Accounts without oracle updater role can update", async function () {
            const [, addr1] = await ethers.getSigners();

            await expect(oracle.connect(addr1).update(WETH)).to.emit(oracle, "Updated");
        });
    });
});

describe("ManagedUniswapV2Oracle#supportsInterface(interfaceId)", function () {
    var oracle;
    var interfaceIds;

    beforeEach(async () => {
        const liquidityAccumulatorFactory = await ethers.getContractFactory("UniswapV2LiquidityAccumulatorStub");
        const liquidityAccumulator = await liquidityAccumulatorFactory.deploy(
            uniswapV2FactoryAddress,
            uniswapV2InitCodeHash,
            USDC,
            TWO_PERCENT_CHANGE,
            MIN_UPDATE_DELAY,
            MAX_UPDATE_DELAY
        );
        await liquidityAccumulator.deployed();

        // Initialize liquidity accumulator
        await liquidityAccumulator.update(WETH);

        const oracleFactory = await ethers.getContractFactory("ManagedUniswapV2Oracle");

        oracle = await oracleFactory.deploy(
            liquidityAccumulator.address,
            uniswapV2FactoryAddress,
            uniswapV2InitCodeHash,
            USDC,
            PERIOD
        );

        const interfaceIdsFactory = await ethers.getContractFactory("InterfaceIds");
        interfaceIds = await interfaceIdsFactory.deploy();
    });

    it("Should support IAccessControl", async () => {
        const interfaceId = await interfaceIds.iAccessControl();
        expect(await oracle["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
    });
});
