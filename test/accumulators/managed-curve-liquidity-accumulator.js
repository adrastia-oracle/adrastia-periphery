const { expect } = require("chai");
const { ethers } = require("hardhat");

const {
    abi: ARITHMETIC_AVERAGING_ABI,
    bytecode: ARITHMETIC_AVERAGING_BYTECODE,
} = require("@adrastia-oracle/adrastia-core/artifacts/contracts/strategies/averaging/ArithmeticAveraging.sol/ArithmeticAveraging.json");

const ORACLE_UPDATER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("ORACLE_UPDATER_ROLE"));

const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";

const MIN_UPDATE_DELAY = 1;
const MAX_UPDATE_DELAY = 2;
const TWO_PERCENT_CHANGE = 2000000;

async function currentBlockTimestamp() {
    const currentBlockNumber = await ethers.provider.getBlockNumber();

    return await blockTimestamp(currentBlockNumber);
}

async function blockTimestamp(blockNum) {
    return (await ethers.provider.getBlock(blockNum)).timestamp;
}

function describeCurveLiquidityAccumulatorTests(contractName) {
    describe(contractName + "#update", function () {
        var accumulator;

        beforeEach(async function () {
            // Deploy the curve pool
            const poolFactory = await ethers.getContractFactory("CurvePoolStub");
            const curvePool = await poolFactory.deploy([WETH, USDC]);
            await curvePool.deployed();

            // Deploy the averaging strategy
            const averagingStrategyFactory = await ethers.getContractFactory(
                ARITHMETIC_AVERAGING_ABI,
                ARITHMETIC_AVERAGING_BYTECODE
            );
            const averagingStrategy = await averagingStrategyFactory.deploy();
            await averagingStrategy.deployed();

            // Deploy accumulator
            const accumulatorFactory = await ethers.getContractFactory(contractName);
            accumulator = await accumulatorFactory.deploy(
                averagingStrategy.address,
                curvePool.address,
                2,
                USDC,
                USDC,
                0, // Liquidity decimals
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
                const [tokenLiquidity, quoteTokenLiquidity] = await accumulator["consultLiquidity(address,uint256)"](
                    WETH,
                    0
                );

                const updateData = ethers.utils.defaultAbiCoder.encode(
                    ["address", "uint", "uint", "uint"],
                    [WETH, tokenLiquidity, quoteTokenLiquidity, await currentBlockTimestamp()]
                );

                expect(await accumulator.canUpdate(updateData)).to.equal(true);

                expect(await accumulator.update(updateData)).to.emit(accumulator, "Updated");

                // Increase time so that the accumulator needs another update
                await hre.timeAndMine.increaseTime(MAX_UPDATE_DELAY + 1);

                // The second call has some different functionality, so ensure that the results are the same for it
                expect(await accumulator.update(updateData)).to.emit(accumulator, "Updated");
            });

            it("Accounts without oracle updater role cannot update", async function () {
                const [tokenLiquidity, quoteTokenLiquidity] = await accumulator["consultLiquidity(address,uint256)"](
                    WETH,
                    0
                );

                const updateData = ethers.utils.defaultAbiCoder.encode(
                    ["address", "uint", "uint", "uint"],
                    [WETH, tokenLiquidity, quoteTokenLiquidity, await currentBlockTimestamp()]
                );

                const [, addr1] = await ethers.getSigners();

                expect(await accumulator.connect(addr1).canUpdate(updateData)).to.equal(false);

                await expect(accumulator.connect(addr1).update(updateData)).to.be.revertedWith(
                    "ManagedCurveLiquidityAccumulator: MISSING_ROLE"
                );

                // Increase time so that the accumulator needs another update
                await hre.timeAndMine.increaseTime(MAX_UPDATE_DELAY + 1);

                // The second call has some different functionality, so ensure that the results are the same for it
                await expect(accumulator.connect(addr1).update(updateData)).to.be.revertedWith(
                    "ManagedCurveLiquidityAccumulator: MISSING_ROLE"
                );
            });
        });

        describe("Smart contracts can't update", function () {
            var updateableCallerFactory;

            beforeEach(async function () {
                // Allow every address to update
                await accumulator.grantRole(ORACLE_UPDATER_ROLE, ethers.constants.AddressZero);

                updateableCallerFactory = await ethers.getContractFactory("UpdateableCaller");
            });

            it("Can't update in the constructor", async function () {
                const [tokenLiquidity, quoteTokenLiquidity] = await accumulator["consultLiquidity(address,uint256)"](
                    WETH,
                    0
                );

                const updateData = ethers.utils.defaultAbiCoder.encode(
                    ["address", "uint", "uint", "uint"],
                    [WETH, tokenLiquidity, quoteTokenLiquidity, await currentBlockTimestamp()]
                );

                await expect(updateableCallerFactory.deploy(accumulator.address, true, updateData)).to.be.revertedWith(
                    "LiquidityAccumulator: MUST_BE_EOA"
                );
            });

            it("Can't update in a function call", async function () {
                const [tokenLiquidity, quoteTokenLiquidity] = await accumulator["consultLiquidity(address,uint256)"](
                    WETH,
                    0
                );

                const updateData = ethers.utils.defaultAbiCoder.encode(
                    ["address", "uint", "uint", "uint"],
                    [WETH, tokenLiquidity, quoteTokenLiquidity, await currentBlockTimestamp()]
                );

                const updateableCaller = await updateableCallerFactory.deploy(accumulator.address, false, updateData);

                await expect(updateableCaller.callUpdate()).to.be.revertedWith("LiquidityAccumulator: MUST_BE_EOA");
            });
        });

        describe("All accounts can update", function () {
            beforeEach(async () => {
                // Grant everyone the oracle updater role
                await accumulator.grantRole(ORACLE_UPDATER_ROLE, ethers.constants.AddressZero);
            });

            it("Accounts with oracle updater role can update", async function () {
                const [tokenLiquidity, quoteTokenLiquidity] = await accumulator["consultLiquidity(address,uint256)"](
                    WETH,
                    0
                );

                const updateData = ethers.utils.defaultAbiCoder.encode(
                    ["address", "uint", "uint", "uint"],
                    [WETH, tokenLiquidity, quoteTokenLiquidity, await currentBlockTimestamp()]
                );

                expect(await accumulator.canUpdate(updateData)).to.equal(true);

                expect(await accumulator.update(updateData)).to.emit(accumulator, "Updated");

                // Increase time so that the accumulator needs another update
                await hre.timeAndMine.increaseTime(MAX_UPDATE_DELAY + 1);

                // The second call has some different functionality, so ensure that the results are the same for it
                expect(await accumulator.update(updateData)).to.emit(accumulator, "Updated");
            });

            it("Accounts without oracle updater role can update", async function () {
                const [tokenLiquidity, quoteTokenLiquidity] = await accumulator["consultLiquidity(address,uint256)"](
                    WETH,
                    0
                );

                const updateData = ethers.utils.defaultAbiCoder.encode(
                    ["address", "uint", "uint", "uint"],
                    [WETH, tokenLiquidity, quoteTokenLiquidity, await currentBlockTimestamp()]
                );

                const [, addr1] = await ethers.getSigners();

                expect(await accumulator.connect(addr1).canUpdate(updateData)).to.equal(true);

                await expect(accumulator.connect(addr1).update(updateData)).to.emit(accumulator, "Updated");

                // Increase time so that the accumulator needs another update
                await hre.timeAndMine.increaseTime(MAX_UPDATE_DELAY + 1);

                // The second call has some different functionality, so ensure that the results are the same for it
                await expect(accumulator.connect(addr1).update(updateData)).to.emit(accumulator, "Updated");
            });
        });
    });

    describe(contractName + "#supportsInterface(interfaceId)", function () {
        var accumulator;
        var interfaceIds;

        beforeEach(async () => {
            // Deploy the curve pool
            const poolFactory = await ethers.getContractFactory("CurvePoolStub");
            const curvePool = await poolFactory.deploy([WETH, USDC]);
            await curvePool.deployed();

            // Deploy the averaging strategy
            const averagingStrategyFactory = await ethers.getContractFactory(
                ARITHMETIC_AVERAGING_ABI,
                ARITHMETIC_AVERAGING_BYTECODE
            );
            const averagingStrategy = await averagingStrategyFactory.deploy();
            await averagingStrategy.deployed();

            // Deploy accumulator
            const accumulatorFactory = await ethers.getContractFactory(contractName);
            accumulator = await accumulatorFactory.deploy(
                averagingStrategy.address,
                curvePool.address,
                2,
                USDC,
                USDC,
                0, // Liquidity decimals
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

        it("Should support IAccessControlEnumerable", async () => {
            const interfaceId = await interfaceIds.iAccessControlEnumerable();
            expect(await accumulator["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
        });
    });
}

describeCurveLiquidityAccumulatorTests("ManagedCurveLiquidityAccumulator");
