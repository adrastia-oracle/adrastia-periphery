const { expect } = require("chai");
const { ethers } = require("hardhat");
const { getRandomBigNumber, getRandomSignedBigNumber } = require("../../../src/rand");
const { RATE_ADMIN_ROLE, ADMIN_ROLE } = require("../../../src/roles");

const BigNumber = ethers.BigNumber;

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

const DATA_SLOT_PRICE = 1;
const DATA_SLOT_LIQUIDITY_TOKEN = 2;
const DATA_SLOT_LIQUIDITY_QUOTETOKEN = 3;

const DEFAULT_DECIMALS = 4;

const DEFAULT_DATA_SLOT = DATA_SLOT_PRICE;
const DEFAULT_ONE_X_SCALAR = BigNumber.from(10).pow(6);
const DEFAULT_DECIMAL_OFFSET = 0;

const MAX_RATE = BigNumber.from(2).pow(64).sub(1);

async function currentBlockTimestamp() {
    const currentBlockNumber = await ethers.provider.getBlockNumber();

    return await blockTimestamp(currentBlockNumber);
}

async function blockTimestamp(blockNum) {
    return (await ethers.provider.getBlock(blockNum)).timestamp;
}

describe("OracleMutationComputer#constructor", function () {
    var oracleFactory;
    var factory;

    beforeEach(async function () {
        factory = await ethers.getContractFactory("OracleMutationComputerStub");
        oracleFactory = await ethers.getContractFactory("MockOracle2");
    });

    it("Works with the default one x scalar, decimals, and decimal offset", async function () {
        const oracle = await oracleFactory.deploy(ethers.constants.AddressZero, DEFAULT_DECIMALS, DEFAULT_DECIMALS);
        await oracle.deployed();

        const computer = await factory.deploy(
            oracle.address,
            DEFAULT_DATA_SLOT,
            DEFAULT_ONE_X_SCALAR,
            DEFAULT_DECIMAL_OFFSET
        );

        await computer.deployed();

        expect(await computer.defaultOneXScalar()).to.equal(DEFAULT_ONE_X_SCALAR);
        expect(await computer.decimalsOffset()).to.equal(DEFAULT_DECIMAL_OFFSET);
        expect(await computer.stubGetTokenDecimalsOrDefault(USDC)).to.equal(DEFAULT_DECIMALS);
    });

    it("Reverts if the default one x scalar is zero", async function () {
        const oracle = await oracleFactory.deploy(ethers.constants.AddressZero, DEFAULT_DECIMALS, DEFAULT_DECIMALS);
        await oracle.deployed();

        await expect(factory.deploy(oracle.address, DEFAULT_DATA_SLOT, 0, DEFAULT_DECIMAL_OFFSET)).to.be.revertedWith(
            "InvalidOneXScalar"
        );
    });

    it("Works with a non-default one x scalar", async function () {
        const oracle = await oracleFactory.deploy(ethers.constants.AddressZero, DEFAULT_DECIMALS, DEFAULT_DECIMALS);
        await oracle.deployed();

        const computer = await factory.deploy(oracle.address, DEFAULT_DATA_SLOT, 100, DEFAULT_DECIMAL_OFFSET);

        await computer.deployed();

        expect(await computer.defaultOneXScalar()).to.equal(100);
        expect(await computer.decimalsOffset()).to.equal(DEFAULT_DECIMAL_OFFSET);
        expect(await computer.stubGetTokenDecimalsOrDefault(USDC)).to.equal(DEFAULT_DECIMALS);
    });

    it("Works with a non-default decimals offset", async function () {
        const oracle = await oracleFactory.deploy(ethers.constants.AddressZero, DEFAULT_DECIMALS, DEFAULT_DECIMALS);
        await oracle.deployed();

        const computer = await factory.deploy(oracle.address, DEFAULT_DATA_SLOT, DEFAULT_ONE_X_SCALAR, 100);

        await computer.deployed();

        expect(await computer.defaultOneXScalar()).to.equal(DEFAULT_ONE_X_SCALAR);
        expect(await computer.decimalsOffset()).to.equal(100);
        expect(await computer.stubGetTokenDecimalsOrDefault(USDC)).to.equal(DEFAULT_DECIMALS);
    });

    it("Works with a non-default price decimals", async function () {
        const decimals = 18;

        const oracle = await oracleFactory.deploy(ethers.constants.AddressZero, decimals, DEFAULT_DECIMALS);
        await oracle.deployed();

        const computer = await factory.deploy(oracle.address, DEFAULT_DATA_SLOT, DEFAULT_ONE_X_SCALAR, 100);

        await computer.deployed();

        expect(await computer.defaultOneXScalar()).to.equal(DEFAULT_ONE_X_SCALAR);
        expect(await computer.decimalsOffset()).to.equal(100);
        expect(await computer.stubGetTokenDecimalsOrDefault(USDC)).to.equal(decimals);
    });

    it("Works with a non-default liquidity decimals and using the tokenLiquidity data slot", async function () {
        const decimals = 18;

        const oracle = await oracleFactory.deploy(ethers.constants.AddressZero, DEFAULT_DECIMALS, decimals);
        await oracle.deployed();

        const computer = await factory.deploy(oracle.address, DATA_SLOT_LIQUIDITY_TOKEN, DEFAULT_ONE_X_SCALAR, 100);

        await computer.deployed();

        expect(await computer.defaultOneXScalar()).to.equal(DEFAULT_ONE_X_SCALAR);
        expect(await computer.decimalsOffset()).to.equal(100);
        expect(await computer.stubGetTokenDecimalsOrDefault(USDC)).to.equal(decimals);
    });

    it("Works with a non-default liquidity decimals and using the quoteTokenLiquidity data slot", async function () {
        const decimals = 18;

        const oracle = await oracleFactory.deploy(ethers.constants.AddressZero, DEFAULT_DECIMALS, decimals);
        await oracle.deployed();

        const computer = await factory.deploy(
            oracle.address,
            DATA_SLOT_LIQUIDITY_QUOTETOKEN,
            DEFAULT_ONE_X_SCALAR,
            100
        );

        await computer.deployed();

        expect(await computer.defaultOneXScalar()).to.equal(DEFAULT_ONE_X_SCALAR);
        expect(await computer.decimalsOffset()).to.equal(100);
        expect(await computer.stubGetTokenDecimalsOrDefault(USDC)).to.equal(decimals);
    });

    it("Reverts with an invalid data slot (=0)", async function () {
        const oracle = await oracleFactory.deploy(ethers.constants.AddressZero, DEFAULT_DECIMALS, DEFAULT_DECIMALS);
        await oracle.deployed();

        await expect(
            factory.deploy(oracle.address, 0, DEFAULT_ONE_X_SCALAR, DEFAULT_DECIMAL_OFFSET)
        ).to.be.revertedWith("InvalidDataSlot");
    });

    it("Reverts with an invalid data slot (=4)", async function () {
        const oracle = await oracleFactory.deploy(ethers.constants.AddressZero, DEFAULT_DECIMALS, DEFAULT_DECIMALS);
        await oracle.deployed();

        await expect(
            factory.deploy(oracle.address, 4, DEFAULT_ONE_X_SCALAR, DEFAULT_DECIMAL_OFFSET)
        ).to.be.revertedWith("InvalidDataSlot");
    });
});

describe("OracleMutationComputer#getValue", function () {
    var computer;
    var token;
    var oracle;

    const scrap = BigNumber.from(12345);

    const commonTests = [
        BigNumber.from(0),
        BigNumber.from(1),
        BigNumber.from(2),
        BigNumber.from(10).pow(18 + 9),
        BigNumber.from(2).pow(112).sub(1),
    ];

    const dataSlotsToTest = [
        {
            slot: DATA_SLOT_PRICE,
            name: "price",
            setValue: async function (token, value) {
                await oracle.stubSetObservation(token, value, scrap, scrap, await currentBlockTimestamp());
            },
        },
        {
            slot: DATA_SLOT_LIQUIDITY_TOKEN,
            name: "token liquidity",
            setValue: async function (token, value) {
                await oracle.stubSetObservation(token, scrap, value, scrap, await currentBlockTimestamp());
            },
        },
        {
            slot: DATA_SLOT_LIQUIDITY_QUOTETOKEN,
            name: "quote token liquidity",
            setValue: async function (token, value) {
                await oracle.stubSetObservation(token, scrap, scrap, value, await currentBlockTimestamp());
            },
        },
    ];

    const decimalsToTest = [18, 6, 0];

    const decimalOffsetsToTest = [0, 1, -1];

    function calculateExpectedValue(value, decimals, decimalsOffset) {
        var result = BigNumber.from(value);

        if (decimalsOffset > 0) {
            result = result.mul(BigNumber.from(10).pow(decimalsOffset));
        } else if (decimalsOffset < 0) {
            result = result.div(BigNumber.from(10).pow(-decimalsOffset));
        }

        result = result.div(BigNumber.from(10).pow(decimals));
        if (result.gt(ethers.constants.MaxUint256)) {
            return ethers.constants.MaxUint256;
        }

        return result;
    }

    function describeTests(decimals, decimalsOffset, slot) {
        for (const test of commonTests) {
            const expected = calculateExpectedValue(test, decimals, decimalsOffset);

            it(`Works with a value of ${test.toString()}, and the result is ${expected.toString()}`, async function () {
                await slot.setValue(token, test);

                // Allow for some rounding error with very large numbers
                const allowedDelta = test.div(BigNumber.from(10).pow(36));

                expect(await computer.stubGetValue(token)).to.be.closeTo(expected, allowedDelta);
            });
        }
    }

    for (const slot of dataSlotsToTest) {
        describe(`Using the ${slot.name} slot`, function () {
            for (const decimals of decimalsToTest) {
                describe(`Using ${decimals} decimals`, function () {
                    for (const decimalsOffset of decimalOffsetsToTest) {
                        describe(`Using a decimals offset of ${decimalsOffset}`, function () {
                            beforeEach(async function () {
                                const oracleFactory = await ethers.getContractFactory("MockOracle2");
                                oracle = await oracleFactory.deploy(ethers.constants.AddressZero, decimals, decimals);
                                await oracle.deployed();

                                const computerFactory = await ethers.getContractFactory("OracleMutationComputerStub");
                                computer = await computerFactory.deploy(
                                    oracle.address,
                                    slot.slot,
                                    DEFAULT_ONE_X_SCALAR,
                                    decimalsOffset
                                );

                                token = USDC;
                            });

                            describeTests(decimals, decimalsOffset, slot);
                        });
                    }
                });
            }
        });
    }
});

describe("SlopedOracleMutationComputer#getValue", function () {
    const decimals = 8;

    var oracleFactory;
    var computerFactory;

    var computer;
    var token;
    var oracle;

    before(async function () {
        const tokenFactory = await ethers.getContractFactory("FakeERC20");
        const tokenContract = await tokenFactory.deploy("Token", "TKN", decimals);
        await tokenContract.deployed();

        token = tokenContract.address;

        oracleFactory = await ethers.getContractFactory("MockOracle2");
        computerFactory = await ethers.getContractFactory("SlopedOracleMutationComputerStub");
    });

    beforeEach(async function () {
        oracle = await oracleFactory.deploy(ethers.constants.AddressZero, decimals, decimals);
        await oracle.deployed();

        computer = await computerFactory.deploy(
            oracle.address,
            DATA_SLOT_LIQUIDITY_TOKEN,
            DEFAULT_ONE_X_SCALAR,
            decimals
        );

        await computer.setConfig(token, MAX_RATE, 0, 0, DEFAULT_ONE_X_SCALAR);

        // Ensure the oracle is able to return data
        await oracle.stubSetObservation(token, 0, 0, 0, 1);
    });

    it("Reverts if the input value equals 2^255", async function () {
        const input = BigNumber.from(2).pow(255);

        const base = ethers.constants.Zero;
        const baseSlope = ethers.constants.One;
        const kink = ethers.constants.Zero;
        const kinkSlope = ethers.constants.Zero;

        await computer.setSlopeConfig(token, base, baseSlope, kink, kinkSlope);

        // Oracles don't support past 2^112-1, so we use this special function
        await computer.stubSetSanitizeInput(true, input);

        await expect(computer.stubGetValue(token)).to.be.revertedWith("InputValueTooLarge");
    });

    it("Reverts if the input value is greater than 2^255", async function () {
        const input = BigNumber.from(2).pow(255).add(1);

        const base = ethers.constants.Zero;
        const baseSlope = ethers.constants.One;
        const kink = ethers.constants.Zero;
        const kinkSlope = ethers.constants.Zero;

        await computer.setSlopeConfig(token, base, baseSlope, kink, kinkSlope);

        // Oracles don't support past 2^112-1, so we use this special function
        await computer.stubSetSanitizeInput(true, input);

        await expect(computer.stubGetValue(token)).to.be.revertedWith("InputValueTooLarge");
    });

    it("Reverts if the config has not been set", async function () {
        const input = ethers.constants.Zero;

        await oracle.stubSetObservation(token, 0, input, 0, 1);

        await expect(computer.stubGetValue(token)).to.be.revertedWith("MissingSlopeConfig");
    });

    it("Returns the base when the the base slope is zero and we're at the kink", async function () {
        const input = ethers.utils.parseUnits("1000000", decimals);

        const base = BigNumber.from(123);
        const baseSlope = ethers.constants.Zero;
        const kink = input;
        const kinkSlope = ethers.constants.One;

        await computer.setSlopeConfig(token, base, baseSlope, kink, kinkSlope);

        await oracle.stubSetObservation(token, 0, input, 0, 1);

        const value = await computer.stubGetValue(token);
        expect(value).to.equal(base);
    });

    it("Returns the sloped input when the base is zero and kink slope is zero", async function () {
        const input = ethers.utils.parseUnits("1000000", decimals);

        const base = ethers.constants.Zero;
        const baseSlope = ethers.constants.One;
        const kink = ethers.constants.Zero;
        const kinkSlope = ethers.constants.Zero;

        await computer.setSlopeConfig(token, base, baseSlope, kink, kinkSlope);

        await oracle.stubSetObservation(token, 0, input, 0, 1);

        const value = await computer.stubGetValue(token);
        expect(value).to.equal(input);
    });

    it("Returns the sloped input when the base is zero and we're at the kink exactly", async function () {
        const input = ethers.utils.parseUnits("1000000", decimals);

        const base = ethers.constants.Zero;
        const baseSlope = ethers.constants.One;
        const kink = input;
        const kinkSlope = ethers.constants.One;

        await computer.setSlopeConfig(token, base, baseSlope, kink, kinkSlope);

        await oracle.stubSetObservation(token, 0, input, 0, 1);

        const value = await computer.stubGetValue(token);
        expect(value).to.equal(input);
    });

    it("Returns the kinked sloped input when the base is zero and we're past the kink", async function () {
        const input = ethers.utils.parseUnits("1000000", decimals);

        const base = ethers.constants.Zero;
        const baseSlope = ethers.constants.One;
        const kink = input.sub(1);
        const kinkSlope = ethers.constants.One;

        await computer.setSlopeConfig(token, base, baseSlope, kink, kinkSlope);

        await oracle.stubSetObservation(token, 0, input, 0, 1);

        const value = await computer.stubGetValue(token);

        const diffFromKink = input.sub(kink);
        const kinkedSlopeY = diffFromKink.gt(0) ? diffFromKink.mul(kinkSlope) : ethers.constants.Zero;

        const baseSlopeY = input.mul(baseSlope);

        const expected = kinkedSlopeY.add(baseSlopeY).add(base);

        expect(value).to.equal(expected);
    });

    it("Returns the kinked sloped input plus the base when we're past the kink", async function () {
        const input = ethers.utils.parseUnits("1000000", decimals);

        const base = BigNumber.from(1234);
        const baseSlope = ethers.constants.One;
        const kink = input.sub(1);
        const kinkSlope = ethers.constants.One;

        await computer.setSlopeConfig(token, base, baseSlope, kink, kinkSlope);

        await oracle.stubSetObservation(token, 0, input, 0, 1);

        const value = await computer.stubGetValue(token);

        const diffFromKink = input.sub(kink);
        const kinkedSlopeY = diffFromKink.gt(0) ? diffFromKink.mul(kinkSlope) : ethers.constants.Zero;

        const baseSlopeY = input.mul(baseSlope);

        const expected = kinkedSlopeY.add(baseSlopeY).add(base);

        expect(value).to.equal(expected);
    });

    it("Uses the sanitized input", async function () {
        const input = ethers.utils.parseUnits("1000000", decimals);
        const sanitizedInput = ethers.constants.One;

        const base = BigNumber.from(1234);
        const baseSlope = ethers.constants.One;
        const kink = input.sub(1);
        const kinkSlope = ethers.constants.One;

        await computer.setSlopeConfig(token, base, baseSlope, kink, kinkSlope);

        await oracle.stubSetObservation(token, 0, input, 0, 1);

        await computer.stubSetSanitizeInput(true, sanitizedInput);

        const value = await computer.stubGetValue(token);

        const diffFromKink = sanitizedInput.sub(kink);
        const kinkedSlopeY = diffFromKink.gt(0) ? diffFromKink.mul(kinkSlope) : ethers.constants.Zero;

        const baseSlopeY = sanitizedInput.mul(baseSlope);

        const expected = kinkedSlopeY.add(baseSlopeY).add(base);

        expect(value).to.equal(expected);
    });

    it("Returns zero when the computed value is negative", async function () {
        const input = ethers.utils.parseUnits("1000000", decimals);

        const base = BigNumber.from(-1234);
        const baseSlope = ethers.constants.Zero;
        const kink = input.add(1);
        const kinkSlope = ethers.constants.One;

        await computer.setSlopeConfig(token, base, baseSlope, kink, kinkSlope);

        await oracle.stubSetObservation(token, 0, input, 0, 1);

        const value = await computer.stubGetValue(token);

        expect(value).to.equal(ethers.constants.Zero);
    });

    const nFuzz = 1000;

    it(`Works with ${nFuzz} rounds of fuzzing`, async function () {
        for (var i = 0; i < nFuzz; ++i) {
            const input = getRandomBigNumber(112);

            const base = getRandomSignedBigNumber(128);
            const baseSlope = getRandomSignedBigNumber(64);
            const kink = getRandomBigNumber(112);
            const kinkSlope = getRandomSignedBigNumber(64);

            if (kinkSlope.eq(0) && baseSlope.eq(0)) {
                // Invalid config. Skip.
                --i;

                continue;
            }

            await computer.setSlopeConfig(token, base, baseSlope, kink, kinkSlope);

            await oracle.stubSetObservation(token, 0, input, 0, 1);

            const value = await computer.stubGetValue(token);

            const diffFromKink = input.sub(kink);
            const kinkedSlopeY = diffFromKink.gt(0) ? diffFromKink.mul(kinkSlope) : ethers.constants.Zero;
            const baseSlopeY = input.mul(baseSlope);

            var expected = base.add(baseSlopeY).add(kinkedSlopeY);

            if (expected.lt(0)) {
                // Negative values are not allowed
                expected = ethers.constants.Zero;
            }

            expect(
                value,
                "Calculated value with input=" +
                    input.toString() +
                    ", base=" +
                    base.toString() +
                    ", baseSlope=" +
                    baseSlope.toString() +
                    ", kink=" +
                    kink.toString() +
                    ", kinkSlope=" +
                    kinkSlope.toString()
            ).to.equal(expected);
        }
    });

    it(`Works with ${nFuzz} rounds of fuzzing positive values`, async function () {
        for (var i = 0; i < nFuzz; ++i) {
            const input = getRandomBigNumber(112);

            const base = getRandomBigNumber(127);
            const baseSlope = getRandomBigNumber(63);
            const kink = getRandomBigNumber(112);
            const kinkSlope = getRandomBigNumber(63);

            if (kinkSlope.eq(0) && baseSlope.eq(0)) {
                // Invalid config. Skip.
                --i;

                continue;
            }

            await computer.setSlopeConfig(token, base, baseSlope, kink, kinkSlope);

            await oracle.stubSetObservation(token, 0, input, 0, 1);

            const value = await computer.stubGetValue(token);

            const diffFromKink = input.sub(kink);
            const kinkedSlopeY = diffFromKink.gt(0) ? diffFromKink.mul(kinkSlope) : ethers.constants.Zero;
            const baseSlopeY = input.mul(baseSlope);

            var expected = base.add(baseSlopeY).add(kinkedSlopeY);

            if (expected.lt(0)) {
                // Negative values are not allowed
                expected = ethers.constants.Zero;
            }

            expect(
                value,
                "Calculated value with input=" +
                    input.toString() +
                    ", base=" +
                    base.toString() +
                    ", baseSlope=" +
                    baseSlope.toString() +
                    ", kink=" +
                    kink.toString() +
                    ", kinkSlope=" +
                    kinkSlope.toString()
            ).to.equal(expected);
        }
    });
});

describe("SlopedOracleMutationComputer#setSlopeConfig", function () {
    const decimals = 8;

    var oracleFactory;
    var computerFactory;

    var computer;
    var token;
    var oracle;

    before(async function () {
        const tokenFactory = await ethers.getContractFactory("FakeERC20");
        const tokenContract = await tokenFactory.deploy("Token", "TKN", decimals);
        await tokenContract.deployed();

        token = tokenContract.address;

        oracleFactory = await ethers.getContractFactory("MockOracle2");
        computerFactory = await ethers.getContractFactory("SlopedOracleMutationComputerStub");
    });

    beforeEach(async function () {
        oracle = await oracleFactory.deploy(ethers.constants.AddressZero, decimals, decimals);
        await oracle.deployed();

        computer = await computerFactory.deploy(
            oracle.address,
            DATA_SLOT_LIQUIDITY_TOKEN,
            DEFAULT_ONE_X_SCALAR,
            decimals
        );
    });

    it("Reverts if everyting is zero", async function () {
        const base = ethers.constants.Zero;
        const baseSlope = ethers.constants.Zero;
        const kink = ethers.constants.Zero;
        const kinkSlope = ethers.constants.Zero;

        await expect(computer.setSlopeConfig(token, base, baseSlope, kink, kinkSlope)).to.be.revertedWith(
            "InvalidSlopeConfig"
        );
    });

    it("Reverts if both the base slope and the kink slope are zero", async function () {
        const base = ethers.constants.One;
        const baseSlope = ethers.constants.Zero;
        const kink = ethers.constants.One;
        const kinkSlope = ethers.constants.Zero;

        await expect(computer.setSlopeConfig(token, base, baseSlope, kink, kinkSlope)).to.be.revertedWith(
            "InvalidSlopeConfig"
        );
    });

    it("Reverts if nothing has changed", async function () {
        const base = ethers.constants.One;
        const baseSlope = ethers.constants.One;
        const kink = ethers.constants.One;
        const kinkSlope = ethers.constants.One;

        await computer.setSlopeConfig(token, base, baseSlope, kink, kinkSlope);

        await expect(computer.setSlopeConfig(token, base, baseSlope, kink, kinkSlope)).to.be.revertedWith(
            "SlopeConfigNotChanged"
        );
    });

    it("Works with a valid config", async function () {
        const base = ethers.constants.One;
        const baseSlope = ethers.constants.One;
        const kink = ethers.constants.One;
        const kinkSlope = ethers.constants.One;

        await computer.setSlopeConfig(token, base, baseSlope, kink, kinkSlope);

        const config = await computer.getSlopeConfig(token);

        expect(config.base).to.equal(base);
        expect(config.baseSlope).to.equal(baseSlope);
        expect(config.kink).to.equal(kink);
        expect(config.kinkSlope).to.equal(kinkSlope);
    });
});

describe("ManagedSlopedOracleMutationComputer#setSlopeConfig", function () {
    const decimals = 8;

    var oracleFactory;
    var computerFactory;

    var computer;
    var token;
    var oracle;

    var signer2;
    var signer2Address;

    const DEFAULT_BASE = ethers.constants.Zero;
    const DEFAULT_BASE_SLOPE = ethers.constants.One;
    const DEFAULT_KINK = ethers.constants.Zero;
    const DEFAULT_KINK_SLOPE = ethers.constants.One;

    before(async function () {
        const tokenFactory = await ethers.getContractFactory("FakeERC20");
        const tokenContract = await tokenFactory.deploy("Token", "TKN", decimals);
        await tokenContract.deployed();

        token = tokenContract.address;

        oracleFactory = await ethers.getContractFactory("MockOracle2");
        computerFactory = await ethers.getContractFactory("ManagedSlopedOracleMutationComputer");

        const [, s2] = await ethers.getSigners();
        signer2 = s2;
        signer2Address = signer2.address.toLowerCase();
    });

    beforeEach(async function () {
        oracle = await oracleFactory.deploy(ethers.constants.AddressZero, decimals, decimals);
        await oracle.deployed();

        computer = await computerFactory.deploy(
            oracle.address,
            DATA_SLOT_LIQUIDITY_TOKEN,
            DEFAULT_ONE_X_SCALAR,
            decimals
        );
    });

    it("Reverts if the caller has no roles", async function () {
        await expect(
            computer
                .connect(signer2)
                .setSlopeConfig(token, DEFAULT_BASE, DEFAULT_BASE_SLOPE, DEFAULT_KINK, DEFAULT_KINK_SLOPE)
        ).to.be.revertedWith("AccessControl: account " + signer2Address + " is missing role " + RATE_ADMIN_ROLE);
    });

    it("Reverts if the caller only has the admin role", async function () {
        await computer.grantRole(ADMIN_ROLE, signer2Address);

        await expect(
            computer
                .connect(signer2)
                .setSlopeConfig(token, DEFAULT_BASE, DEFAULT_BASE_SLOPE, DEFAULT_KINK, DEFAULT_KINK_SLOPE)
        ).to.be.revertedWith("AccessControl: account " + signer2Address + " is missing role " + RATE_ADMIN_ROLE);
    });

    it("Works if the caller has the rate admin role", async function () {
        await computer.grantRole(RATE_ADMIN_ROLE, signer2Address);

        await computer
            .connect(signer2)
            .setSlopeConfig(token, DEFAULT_BASE, DEFAULT_BASE_SLOPE, DEFAULT_KINK, DEFAULT_KINK_SLOPE);

        const config = await computer.getSlopeConfig(token);

        expect(config.base).to.equal(DEFAULT_BASE);
        expect(config.baseSlope).to.equal(DEFAULT_BASE_SLOPE);
        expect(config.kink).to.equal(DEFAULT_KINK);
        expect(config.kinkSlope).to.equal(DEFAULT_KINK_SLOPE);
    });
});

describe("ManagedSlopedOracleMutationComputer#setConfig", function () {
    const decimals = 8;

    var oracleFactory;
    var computerFactory;

    var computer;
    var token;
    var oracle;

    var signer2;
    var signer2Address;

    const DEFAULT_MAX = MAX_RATE;
    const DEFAULT_MIN = ethers.constants.Zero;
    const DEFAULT_OFFSET = ethers.constants.Zero;
    const DEFAULT_SCALAR = DEFAULT_ONE_X_SCALAR;

    before(async function () {
        const tokenFactory = await ethers.getContractFactory("FakeERC20");
        const tokenContract = await tokenFactory.deploy("Token", "TKN", decimals);
        await tokenContract.deployed();

        token = tokenContract.address;

        oracleFactory = await ethers.getContractFactory("MockOracle2");
        computerFactory = await ethers.getContractFactory("ManagedSlopedOracleMutationComputer");

        const [, s2] = await ethers.getSigners();
        signer2 = s2;
        signer2Address = signer2.address.toLowerCase();
    });

    beforeEach(async function () {
        oracle = await oracleFactory.deploy(ethers.constants.AddressZero, decimals, decimals);
        await oracle.deployed();

        computer = await computerFactory.deploy(
            oracle.address,
            DATA_SLOT_LIQUIDITY_TOKEN,
            DEFAULT_ONE_X_SCALAR,
            decimals
        );
    });

    it("Reverts if the caller has no roles", async function () {
        await expect(
            computer.connect(signer2).setConfig(token, DEFAULT_MAX, DEFAULT_MIN, DEFAULT_OFFSET, DEFAULT_SCALAR)
        ).to.be.revertedWith("AccessControl: account " + signer2Address + " is missing role " + RATE_ADMIN_ROLE);
    });

    it("Reverts if the caller only has the admin role", async function () {
        await computer.grantRole(ADMIN_ROLE, signer2Address);

        await expect(
            computer.connect(signer2).setConfig(token, DEFAULT_MAX, DEFAULT_MIN, DEFAULT_OFFSET, DEFAULT_SCALAR)
        ).to.be.revertedWith("AccessControl: account " + signer2Address + " is missing role " + RATE_ADMIN_ROLE);
    });

    it("Works if the caller has the rate admin role", async function () {
        await computer.grantRole(RATE_ADMIN_ROLE, signer2Address);

        await computer.connect(signer2).setConfig(token, DEFAULT_MAX, DEFAULT_MIN, DEFAULT_OFFSET, DEFAULT_SCALAR);

        const config = await computer.getConfig(token);

        expect(config.max).to.equal(DEFAULT_MAX);
        expect(config.min).to.equal(DEFAULT_MIN);
        expect(config.offset).to.equal(DEFAULT_OFFSET);
        expect(config.scalar).to.equal(DEFAULT_SCALAR);
    });
});

describe("OracleMutationComputer#supportsInterface", function () {
    var interfaceIds;
    var computer;

    beforeEach(async function () {
        const oracleFactory = await ethers.getContractFactory("MockOracle2");
        const oracle = await oracleFactory.deploy(ethers.constants.AddressZero, DEFAULT_DECIMALS, DEFAULT_DECIMALS);
        await oracle.deployed();

        const factory = await ethers.getContractFactory("OracleMutationComputerStub");
        computer = await factory.deploy(
            oracle.address,
            DEFAULT_DATA_SLOT,
            DEFAULT_ONE_X_SCALAR,
            DEFAULT_DECIMAL_OFFSET
        );

        const interfaceIdsFactory = await ethers.getContractFactory("InterfaceIds");
        interfaceIds = await interfaceIdsFactory.deploy();
    });

    it("Should support IERC165", async () => {
        const interfaceId = await interfaceIds.iERC165();
        expect(await computer["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
    });

    it("Should support IRateComputer", async () => {
        const interfaceId = await interfaceIds.iRateComputer();
        expect(await computer["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
    });
});

describe("ManagedSlopedOracleMutationComputer#supportsInterface", function () {
    var interfaceIds;
    var computer;

    beforeEach(async function () {
        const oracleFactory = await ethers.getContractFactory("MockOracle2");
        const oracle = await oracleFactory.deploy(ethers.constants.AddressZero, DEFAULT_DECIMALS, DEFAULT_DECIMALS);
        await oracle.deployed();

        const factory = await ethers.getContractFactory("ManagedSlopedOracleMutationComputer");
        computer = await factory.deploy(
            oracle.address,
            DEFAULT_DATA_SLOT,
            DEFAULT_ONE_X_SCALAR,
            DEFAULT_DECIMAL_OFFSET
        );

        const interfaceIdsFactory = await ethers.getContractFactory("InterfaceIds");
        interfaceIds = await interfaceIdsFactory.deploy();
    });

    it("Should support IERC165", async () => {
        const interfaceId = await interfaceIds.iERC165();
        expect(await computer["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
    });

    it("Should support IRateComputer", async () => {
        const interfaceId = await interfaceIds.iRateComputer();
        expect(await computer["supportsInterface(bytes4)"](interfaceId)).to.equal(true);
    });
});
