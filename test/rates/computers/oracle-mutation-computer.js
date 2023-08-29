const { expect } = require("chai");
const { ethers } = require("hardhat");

const BigNumber = ethers.BigNumber;

const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

const DATA_SLOT_PRICE = 1;
const DATA_SLOT_LIQUIDITY_TOKEN = 2;
const DATA_SLOT_LIQUIDITY_QUOTETOKEN = 3;

const DEFAULT_DECIMALS = 4;

const DEFAULT_DATA_SLOT = DATA_SLOT_PRICE;
const DEFAULT_ONE_X_SCALAR = BigNumber.from(10).pow(6);
const DEFAULT_DECIMAL_OFFSET = 0;

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
