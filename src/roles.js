const { ethers } = require("hardhat");

const ADMIN_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("ADMIN_ROLE"));
const ORACLE_UPDATER_MANAGER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("UPDATER_ADMIN_ROLE"));
const ORACLE_UPDATER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("ORACLE_UPDATER_ROLE"));
const RATE_ADMIN_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("RATE_ADMIN_ROLE"));
const UPDATE_PAUSE_ADMIN_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("UPDATE_PAUSE_ADMIN_ROLE"));

module.exports = {
    ADMIN_ROLE,
    ORACLE_UPDATER_MANAGER_ROLE,
    ORACLE_UPDATER_ROLE,
    RATE_ADMIN_ROLE,
    UPDATE_PAUSE_ADMIN_ROLE,
};
