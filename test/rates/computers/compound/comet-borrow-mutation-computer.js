const { expect } = require("chai");
const { ethers } = require("hardhat");

const BigNumber = ethers.BigNumber;

const AddressZero = ethers.constants.AddressZero;

const RATE_ADMIN_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("RATE_ADMIN_ROLE"));

const GRT = "0xc944E90C64B2c07662A292be6244BDf05Cda44a7";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const NATIVECOIN = "0x0000000000000000000000000000000000000000";
const NON_ERC20 = "0x0000000000000000000000000000000000000001";

const DEFAULT_ONE_X_SCALAR = BigNumber.from(10).pow(6);
const DEFAULT_DECIMALS = 18;
const DEFAULT_DECIMAL_OFFSET = 0;

const PASS_THROUGH_CONFIG = {
    max: BigNumber.from(2).pow(64).sub(1),
    min: BigNumber.from(0),
    offset: BigNumber.from(0),
    scalar: DEFAULT_ONE_X_SCALAR.toNumber(),
};

async function currentBlockTimestamp() {
    const currentBlockNumber = await ethers.provider.getBlockNumber();

    return await blockTimestamp(currentBlockNumber);
}

async function blockTimestamp(blockNum) {
    return (await ethers.provider.getBlock(blockNum)).timestamp;
}

describe("CometBorrowMutationComputer#constructor", function () {
    var factory;

    var comet;

    beforeEach(async function () {
        factory = await ethers.getContractFactory("CometBorrowMutationComputer");

        const cometFactory = await ethers.getContractFactory("CometStub");
        comet = await cometFactory.deploy(USDC);
        await comet.deployed();
    });

    it("Works with the default one x scalar, decimals, and decimal offset", async function () {
        const computer = await factory.deploy(
            comet.address,
            DEFAULT_ONE_X_SCALAR,
            DEFAULT_DECIMALS,
            DEFAULT_DECIMAL_OFFSET
        );

        expect(await computer.defaultOneXScalar()).to.equal(DEFAULT_ONE_X_SCALAR);
        expect(await computer.defaultDecimals()).to.equal(DEFAULT_DECIMALS);
        expect(await computer.decimalsOffset()).to.equal(DEFAULT_DECIMAL_OFFSET);
        expect(await computer.comet()).to.equal(comet.address);
        expect(await computer.baseToken()).to.equal(USDC);
    });

    it("Reverts if the default one x scalar is zero", async function () {
        await expect(factory.deploy(comet.address, 0, DEFAULT_DECIMALS, DEFAULT_DECIMAL_OFFSET)).to.be.revertedWith(
            "InvalidOneXScalar"
        );
    });

    it("Works with a non-default one x scalar", async function () {
        const computer = await factory.deploy(comet.address, 100, DEFAULT_DECIMALS, DEFAULT_DECIMAL_OFFSET);

        expect(await computer.defaultOneXScalar()).to.equal(100);
        expect(await computer.defaultDecimals()).to.equal(DEFAULT_DECIMALS);
        expect(await computer.decimalsOffset()).to.equal(DEFAULT_DECIMAL_OFFSET);
        expect(await computer.comet()).to.equal(comet.address);
        expect(await computer.baseToken()).to.equal(USDC);
    });

    it("Works with a non-default default decimals", async function () {
        const computer = await factory.deploy(comet.address, DEFAULT_ONE_X_SCALAR, 100, DEFAULT_DECIMAL_OFFSET);

        expect(await computer.defaultOneXScalar()).to.equal(DEFAULT_ONE_X_SCALAR);
        expect(await computer.defaultDecimals()).to.equal(100);
        expect(await computer.decimalsOffset()).to.equal(DEFAULT_DECIMAL_OFFSET);
        expect(await computer.comet()).to.equal(comet.address);
        expect(await computer.baseToken()).to.equal(USDC);
    });

    it("Works with a non-default decimals offset", async function () {
        const computer = await factory.deploy(comet.address, DEFAULT_ONE_X_SCALAR, DEFAULT_DECIMALS, 100);

        expect(await computer.defaultOneXScalar()).to.equal(DEFAULT_ONE_X_SCALAR);
        expect(await computer.defaultDecimals()).to.equal(DEFAULT_DECIMALS);
        expect(await computer.decimalsOffset()).to.equal(100);
        expect(await computer.comet()).to.equal(comet.address);
        expect(await computer.baseToken()).to.equal(USDC);
    });
});

describe("CometBorrowMutationComputer#getValue", function () {
    var computer;
    var token;
    var comet;

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
        for (const amount of commonTests) {
            const expected = calculateExpectedValue(amount, decimals, decimalsOffset);

            it(`Works with a debt of ${amount.toString()}, and the result is ${expected.toString()}`, async function () {
                await comet.stubSetTotalBorrow(amount);

                // Allow for some rounding error with very large numbers
                const allowedDelta = expected.div(BigNumber.from(10).pow(36));

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
                            token = GRT;

                            const cometFactory = await ethers.getContractFactory("CometStub");
                            comet = await cometFactory.deploy(token);
                            await comet.deployed();

                            const computerFactory = await ethers.getContractFactory("CometBorrowMutationComputerStub");
                            computer = await computerFactory.deploy(
                                comet.address,
                                DEFAULT_ONE_X_SCALAR,
                                defaultDecimals,
                                decimalsOffset
                            );
                        });

                        describeTests(18, decimalsOffset);
                    });

                    describe("Using a token with 6 decimals", function () {
                        beforeEach(async function () {
                            token = USDC;

                            const cometFactory = await ethers.getContractFactory("CometStub");
                            comet = await cometFactory.deploy(token);
                            await comet.deployed();

                            const computerFactory = await ethers.getContractFactory("CometBorrowMutationComputerStub");
                            computer = await computerFactory.deploy(
                                comet.address,
                                DEFAULT_ONE_X_SCALAR,
                                defaultDecimals,
                                decimalsOffset
                            );
                        });

                        describeTests(6, decimalsOffset);
                    });

                    describe("Using a non-standard token where we use the default decimals", function () {
                        beforeEach(async function () {
                            token = NON_ERC20;

                            const cometFactory = await ethers.getContractFactory("CometStub");
                            comet = await cometFactory.deploy(token);
                            await comet.deployed();

                            const computerFactory = await ethers.getContractFactory("CometBorrowMutationComputerStub");
                            computer = await computerFactory.deploy(
                                comet.address,
                                DEFAULT_ONE_X_SCALAR,
                                defaultDecimals,
                                decimalsOffset
                            );
                        });

                        describeTests(defaultDecimals, decimalsOffset);
                    });
                });
            }
        });
    }

    it("Reverts if the token address is zero", async function () {
        const cometFactory = await ethers.getContractFactory("CometStub");
        comet = await cometFactory.deploy(USDC);
        await comet.deployed();

        const computerFactory = await ethers.getContractFactory("CometBorrowMutationComputerStub");
        computer = await computerFactory.deploy(
            comet.address,
            DEFAULT_ONE_X_SCALAR,
            DEFAULT_DECIMALS,
            DEFAULT_DECIMAL_OFFSET
        );

        await expect(computer.stubGetValue(AddressZero)).to.be.revertedWith("InvalidInput");
    });

    it("Reverts if the token address doesn't match the base token", async function () {
        const cometFactory = await ethers.getContractFactory("CometStub");
        comet = await cometFactory.deploy(USDC);
        await comet.deployed();

        const computerFactory = await ethers.getContractFactory("CometBorrowMutationComputerStub");
        computer = await computerFactory.deploy(
            comet.address,
            DEFAULT_ONE_X_SCALAR,
            DEFAULT_DECIMALS,
            DEFAULT_DECIMAL_OFFSET
        );

        await expect(computer.stubGetValue(GRT)).to.be.revertedWith("InvalidInput");
    });
});

describe("CometBorrowMutationComputer#setConfig", function () {
    var computer;

    beforeEach(async function () {
        const cometFactory = await ethers.getContractFactory("CometStub");
        comet = await cometFactory.deploy(USDC);
        await comet.deployed();

        const computerFactory = await ethers.getContractFactory("CometBorrowMutationComputerStub");
        computer = await computerFactory.deploy(
            comet.address,
            DEFAULT_ONE_X_SCALAR,
            DEFAULT_DECIMALS,
            DEFAULT_DECIMAL_OFFSET
        );
    });

    it("Works when the caller has all roles", async function () {
        const [owner] = await ethers.getSigners();

        await computer.grantRole(RATE_ADMIN_ROLE, owner.address);

        await computer.setConfig(
            USDC,
            PASS_THROUGH_CONFIG.max,
            PASS_THROUGH_CONFIG.min,
            PASS_THROUGH_CONFIG.offset,
            PASS_THROUGH_CONFIG.scalar
        );
    });

    it("Works when the caller has rate admin role", async function () {
        const [, rateAdmin] = await ethers.getSigners();

        await computer.grantRole(RATE_ADMIN_ROLE, rateAdmin.address);

        await computer
            .connect(rateAdmin)
            .setConfig(
                USDC,
                PASS_THROUGH_CONFIG.max,
                PASS_THROUGH_CONFIG.min,
                PASS_THROUGH_CONFIG.offset,
                PASS_THROUGH_CONFIG.scalar
            );
    });

    it("Reverts when the caller doesn't have any roles", async function () {
        const [, other] = await ethers.getSigners();

        await expect(
            computer
                .connect(other)
                .setConfig(
                    USDC,
                    PASS_THROUGH_CONFIG.max,
                    PASS_THROUGH_CONFIG.min,
                    PASS_THROUGH_CONFIG.offset,
                    PASS_THROUGH_CONFIG.scalar
                )
        ).to.be.revertedWith(/AccessControl: .*/);
    });
});

describe("CometBorrowMutationComputer#supportsInterface", function () {
    var interfaceIds;
    var computer;

    beforeEach(async function () {
        const cometFactory = await ethers.getContractFactory("CometStub");
        comet = await cometFactory.deploy(USDC);
        await comet.deployed();

        const computerFactory = await ethers.getContractFactory("CometBorrowMutationComputer");
        computer = await computerFactory.deploy(
            comet.address,
            DEFAULT_ONE_X_SCALAR,
            DEFAULT_DECIMALS,
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
