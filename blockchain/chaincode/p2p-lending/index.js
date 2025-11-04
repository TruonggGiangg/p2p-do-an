'use strict';

// Export the fully-implemented contract class located in ./lib
const P2PLendingContract = require('./lib/p2p-lending-contract');

/**
 * Hyperledger Fabric chaincode entrypoint
 * Multiple contracts can be exported via the `contracts` array.
 * We export only one contract here.
 */
module.exports.contracts = [P2PLendingContract];
