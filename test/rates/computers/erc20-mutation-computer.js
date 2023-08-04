const { expect } = require("chai");
const { ethers } = require("hardhat");

const BigNumber = ethers.BigNumber;

const GRT = "0xc944E90C64B2c07662A292be6244BDf05Cda44a7";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const NON_ERC20 = "0x0000000000000000000000000000000000000001";

const DEFAULT_ONE_X_SCALAR = BigNumber.from(10).pow(6);
const DEFAULT_DECIMALS = 18;
const DEFAULT_DECIMAL_OFFSET = 0;

async function currentBlockTimestamp() {
    const currentBlockNumber = await ethers.provider.getBlockNumber();

    return await blockTimestamp(currentBlockNumber);
}

async function blockTimestamp(blockNum) {
    return (await ethers.provider.getBlock(blockNum)).timestamp;
}

describe("Erc20MutationComputer#constructor", function () {
    var factory;

    beforeEach(async function () {
        factory = await ethers.getContractFactory("Erc20MutationComputerStub");
    });

    it("Works with the default one x scalar, decimals, and decimal offset", async function () {
        const computer = await factory.deploy(DEFAULT_ONE_X_SCALAR, DEFAULT_DECIMALS, DEFAULT_DECIMAL_OFFSET);

        await computer.deployed();

        expect(await computer.defaultOneXScalar()).to.equal(DEFAULT_ONE_X_SCALAR);
        expect(await computer.defaultDecimals()).to.equal(DEFAULT_DECIMALS);
        expect(await computer.decimalsOffset()).to.equal(DEFAULT_DECIMAL_OFFSET);
    });

    it("Reverts if the default one x scalar is zero", async function () {
        await expect(factory.deploy(0, DEFAULT_DECIMALS, DEFAULT_DECIMAL_OFFSET)).to.be.revertedWith(
            "InvalidOneXScalar"
        );
    });

    it("Works with a non-default one x scalar", async function () {
        const computer = await factory.deploy(100, DEFAULT_DECIMALS, DEFAULT_DECIMAL_OFFSET);

        await computer.deployed();

        expect(await computer.defaultOneXScalar()).to.equal(100);
        expect(await computer.defaultDecimals()).to.equal(DEFAULT_DECIMALS);
        expect(await computer.decimalsOffset()).to.equal(DEFAULT_DECIMAL_OFFSET);
    });

    it("Works with a non-default default decimals", async function () {
        const computer = await factory.deploy(DEFAULT_ONE_X_SCALAR, 100, DEFAULT_DECIMAL_OFFSET);

        await computer.deployed();

        expect(await computer.defaultOneXScalar()).to.equal(DEFAULT_ONE_X_SCALAR);
        expect(await computer.defaultDecimals()).to.equal(100);
        expect(await computer.decimalsOffset()).to.equal(DEFAULT_DECIMAL_OFFSET);
    });

    it("Works with a non-default decimals offset", async function () {
        const computer = await factory.deploy(DEFAULT_ONE_X_SCALAR, DEFAULT_DECIMALS, 100);

        await computer.deployed();

        expect(await computer.defaultOneXScalar()).to.equal(DEFAULT_ONE_X_SCALAR);
        expect(await computer.defaultDecimals()).to.equal(DEFAULT_DECIMALS);
        expect(await computer.decimalsOffset()).to.equal(100);
    });
});

describe("Erc20MutationComputer#getValue", function () {
    var computer;
    var token;

    const commonTests = [
        BigNumber.from(0),
        BigNumber.from(1),
        BigNumber.from(2),
        BigNumber.from(10).pow(18 + 9),
        BigNumber.from(2).pow(256).sub(1),
    ];

    const defaultDecimalsToTest = [18, 6, 0];

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

    function describeTests(decimals, decimalsOffset) {
        for (const test of commonTests) {
            const expected = calculateExpectedValue(test, decimals, decimalsOffset);

            it(`Works with a value of ${test.toString()}, and the result is ${expected.toString()}`, async function () {
                await computer.stubSetValue(token, test);

                // Allow for some rounding error with very large numbers
                const allowedDelta = test.div(BigNumber.from(10).pow(36));

                expect(await computer.stubGetValue(token)).to.be.closeTo(expected, allowedDelta);
            });
        }
    }

    for (const defaultDecimals of defaultDecimalsToTest) {
        describe(`Using a default decimals of ${defaultDecimals}`, function () {
            for (const decimalsOffset of decimalOffsetsToTest) {
                describe(`Using a decimals offset of ${decimalsOffset}`, function () {
                    describe("Using a token with 18 decimals", function () {
                        beforeEach(async function () {
                            const computerFactory = await ethers.getContractFactory("Erc20MutationComputerStub");
                            computer = await computerFactory.deploy(
                                DEFAULT_ONE_X_SCALAR,
                                defaultDecimals,
                                decimalsOffset
                            );

                            token = GRT;
                        });

                        describeTests(18, decimalsOffset);
                    });

                    describe("Using a token with 6 decimals", function () {
                        beforeEach(async function () {
                            const computerFactory = await ethers.getContractFactory("Erc20MutationComputerStub");
                            computer = await computerFactory.deploy(
                                DEFAULT_ONE_X_SCALAR,
                                defaultDecimals,
                                decimalsOffset
                            );

                            token = USDC;
                        });

                        describeTests(6, decimalsOffset);
                    });

                    describe("Using a non-standard token where we use the default decimals", function () {
                        beforeEach(async function () {
                            const computerFactory = await ethers.getContractFactory("Erc20MutationComputerStub");
                            computer = await computerFactory.deploy(
                                DEFAULT_ONE_X_SCALAR,
                                defaultDecimals,
                                decimalsOffset
                            );

                            token = NON_ERC20;
                        });

                        describeTests(defaultDecimals, decimalsOffset);
                    });
                });
            }
        });
    }

    it("Reverts if the token address is zero", async function () {
        const computerFactory = await ethers.getContractFactory("Erc20MutationComputerStub");
        computer = await computerFactory.deploy(DEFAULT_ONE_X_SCALAR, DEFAULT_DECIMALS, DEFAULT_DECIMAL_OFFSET);

        await expect(computer.stubGetValue(ethers.constants.AddressZero)).to.be.revertedWith("InvalidInput");
    });
});

describe("Erc20MutationComputer#supportsInterface", function () {
    var interfaceIds;
    var computer;

    beforeEach(async function () {
        const computerFactory = await ethers.getContractFactory("Erc20MutationComputerStub");
        computer = await computerFactory.deploy(DEFAULT_ONE_X_SCALAR, DEFAULT_DECIMALS, DEFAULT_DECIMAL_OFFSET);

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
