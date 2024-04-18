const { ethers } = require("hardhat");
const BigNumber = ethers.BigNumber;

function getRandomHex(length) {
    let result = "";
    const characters = "0123456789abcdef";
    const charactersLength = characters.length;

    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }

    return result;
}

function getRandomBigNumber(nBits) {
    if (nBits === 0) {
        return ethers.constants.Zero;
    }

    const hexLength = Math.ceil(nBits / 4); // Use ceil to round up to the nearest whole number
    const randomHexValue = getRandomHex(hexLength);

    // Adjust the most significant hex digit to fit the exact number of bits
    const excessBits = hexLength * 4 - nBits;
    if (excessBits > 0) {
        // Create a mask to trim the excess bits from the most significant hex digit
        const mask = (1 << (4 - excessBits)) - 1; // Creates a bitmask with the right number of bits set to 1
        const mostSignificantDigit = parseInt(randomHexValue[0], 16) & mask; // Apply mask to the first hex digit
        const adjustedHexValue = mostSignificantDigit.toString(16) + randomHexValue.slice(1);
        return BigNumber.from("0x" + adjustedHexValue);
    }

    return BigNumber.from("0x" + randomHexValue);
}

function getRandomSignedBigNumber(nBits) {
    const randomValue = getRandomBigNumber(nBits - 1);
    const sign = Math.random() < 0.5 ? -1 : 1;

    return randomValue.mul(sign);
}

module.exports = {
    getRandomBigNumber,
    getRandomSignedBigNumber,
};
