const defaultWeb3ProviderOptions = Object.freeze({
  mnemonic: Object.freeze({
    phrase: '',
  }),
  // Ref: https://developers.rsk.co/rsk/architecture/account-based/
  derivationPath: "m/44'/37310'/0'/0/0",
  providerOrUrl: 'https://public-node.testnet.rsk.co/',
  // Higher polling interval to check for blocks less frequently
  pollingInterval: 15e3,
});

function rifNameUtilFactory({
  // dependencies
  setTimeout,
  web3Util,
  Rns,
  RnsFifsAddrRegistrarData,
  Erc677Data,
  // config
  postMakeCommitmentCanRevealPollingInterval = 35,
}) {
  if (!web3Util ||
    !Rns ||
    !RnsFifsAddrRegistrarData ||
    !Erc677Data) {
    throw new Error('One or more dependencies unspecified');
  }

  let rnsInstance;
  async function getNameService() {
    if (rnsInstance) {
      return rnsInstance;
    }
    const web3 = await web3Util.getWeb3();
    rnsInstance = new Rns(web3);
    return rnsInstance;
  }

  let rnsRegistrarInstance;
  async function getRnsRegistrar() {
    if (rnsRegistrarInstance) {
      return rnsRegistrarInstance;
    }
    const web3 = await web3Util.getWeb3();
    rnsRegistrarInstance = new web3.eth.Contract(
      RnsFifsAddrRegistrarData.abi,
      RnsFifsAddrRegistrarData.address.rskTestnet.toLowerCase(),
    );
    return rnsRegistrarInstance;
  }

  let rifTokenInstance;
  async function getRifToken() {
    if (rifTokenInstance) {
      return rifTokenInstance;
    }
    const web3 = await web3Util.getWeb3();
    rifTokenInstance = new web3.eth.Contract(
      Erc677Data.abi,
      Erc677Data.address.rskTestnet.toLowerCase(),
    );
    return rifTokenInstance;
  }

  async function getRnsFifsRegistrarRegisterCallData(
    name, // string calldata name,
    nameOwner, // address nameOwner,
    secret, // bytes32 secret,
    duration, // uint32 duration,
    addr, // address addr
  ) {
    const web3 = await web3Util.getWeb3();

    // Ref: https://github.com/rnsdomains/rns-rskregistrar/blob/94b7226c29a2c76cb5f234c86a1a0fc8ff600aba/contracts/FIFSAddrRegistrar.sol#L17-L18
    // bytes4(keccak256("register(string,address,bytes32,uint256,address)"))
    const functionSignature = '5f7b99d5';

    // Ref: https://github.com/rnsdomains/rns-rskregistrar/blob/94b7226c29a2c76cb5f234c86a1a0fc8ff600aba/contracts/FIFSAddrRegistrar.sol#L77-L87
    const nameBytes = web3.utils.fromAscii(name).slice(2);
    const nameOwnerBytes = nameOwner.toLowerCase().slice(2);
    const secretBytes = secret.toLowerCase().slice(2);
    const durationBytes = web3.utils
      .padLeft(web3.utils.numberToHex(duration), 64)
      .slice(2);
    const addrBytes = addr.toLowerCase().slice(2);

    // NOTE `nameBytes` goes last since it is variable length
    const callData = `0x${
      functionSignature}${
      nameOwnerBytes}${
      secretBytes}${
      durationBytes}${
      addrBytes}${
      nameBytes}`;

    if (callData.length - nameBytes.length !== 218) {
      // '0x'.length + (108 * 2) === 218
      throw new Error('Call data formatting length mismatch');
    }

    return callData;
  }

  async function waitSeconds(s) {
    return await new Promise((resolve) => {
      setTimeout(resolve, s * 1e3)
    });
  }

  async function registerCommit(label, address) {
    const web3 = await web3Util.getWeb3();
    const rnsRegistrar = await getRnsRegistrar();
    const mainAccount = await web3Util.getMainAccount();

    // Registration step #0: Make commitment (call)
    const secret = web3.utils.randomHex(32);
    const commitment = await rnsRegistrar.methods
      .makeCommitment(
        web3.utils.keccak256(label), // bytes32 label,
        address, // address nameOwner,
        secret, // bytes32 secret
      )
      .call({ from: mainAccount });

    // Registration step #1: Commit (send)
    const tx1 = await rnsRegistrar.methods
      .commit(commitment)
      .send({ from: mainAccount });

    // Registration step #2: Wait for can reveal (call)
    let canReveal = false;
    while (!canReveal) {
      canReveal = await rnsRegistrar.methods
        .canReveal(commitment)
        .call({ from: mainAccount });
      if (!canReveal) {
        await waitSeconds(postMakeCommitmentCanRevealPollingInterval);
      }
    }

    return {
      secret,
      commitment,
      makeCommitmentTxHash: tx1.transactionHash,
    };
  }

  async function registerFinalise(label, address, duration, secret) {
    const web3 = await web3Util.getWeb3();
    const rifToken = await getRifToken();
    const mainAccount = await web3Util.getMainAccount();

    // NOTE hardcoding replicated logic locally instead of
    // invoking the smart contract method for the calculation
    // const rifPrice = await rnsRegistrar.methods
    //   .price(label, 0, duration)
    //   .call();
    const rifPrice = web3.utils
      .toBN(duration + Math.max(0, 2 - duration))
      .mul(web3.utils.toBN('1000000000000000000'));

    // Registration step #3: Register (send)
    // transferAndCall using RIF token (ERC677 technique)
    const rnsFifsRegistrarRegisterCallData =
      await getRnsFifsRegistrarRegisterCallData(
        label, address, secret, duration, address,
      );
    const tx3Invocation = rifToken.methods.transferAndCall(
      RnsFifsAddrRegistrarData.address.rskTestnet.toLowerCase(),
      rifPrice,
      rnsFifsRegistrarRegisterCallData,
    );
    // TODO attempt to estimate the gas (in order to override with a multiple)
    // fails due to what appears to be a a bug in `@truffle/hdwallet-provider`
    // or in `@trufflesuite/web3-provider-engine`:
    // `TypeError: Converting circular structure to JSON`
    // const tx3GasEstimateRaw = await tx3Invocation.estimateGas(tx3Invocation);
    // const tx3GasEstimate = web3.utils.toBN(tx3GasEstimateRaw * 1.1);
    const tx3 = await tx3Invocation.send({
      from: mainAccount,
      // gas: tx3GasEstimate,
    });

    return {
      transferAndCallTxHash: tx3.transactionHash,
    };
  }

  async function register(label, address, duration) {
    const rns = await getNameService();

    const available = await rns.available(label);
    if (!available) {
      throw new Error('Label is unavailable');
    }

    const {
      secret,
    } = await registerCommit(label, address);

    return await registerFinalise(label, address, duration, secret);
  }

  async function publish(label, address, contentHash) {
    const rns = await getNameService();

    let lookedUpAddress;
    let noResolver = false;
    const name = `${label}.rsk`;
    try {
      lookedUpAddress = await rns.addr(name);
    } catch (lookupError) {
      if (lookupError.message !== 'No resolver') {
        throw lookupError; // rethrow
      } else {
        noResolver = true;
      }
    }
    if (noResolver) {
      // then register the address for the first time
      await register(label, address, 1);
    } else if (lookedUpAddress.toLowerCase() !== address.toLowerCase()) {
      throw new Error(
        'Name already registered to a different address: ' +
        lookedUpAddress);
    }
    const currentContentHash = await
      rns.contenthash(name);
    if (currentContentHash === contentHash) {
      // Content hash already up to date
      return currentContentHash;
    } else {
      // Updating contenthash for name...
      const updatedContentHash = await
        rns.setContenthash(name, contentHash);
      return updatedContentHash;
    }
  }

  return {
    getNameService,
    getRnsRegistrar,
    getRifToken,
    getRnsFifsRegistrarRegisterCallData,
    registerCommit,
    registerFinalise,
    register,
    publish,
  };
}

let defaultInstance;
const moduleWrap = {
  factory: rifNameUtilFactory,
  get default () {
    if (defaultInstance) {
      return defaultInstance;
    }
    defaultInstance = rifNameUtilFactory({
      setTimeout,
      web3Util: require('./web3-util.js').default,
      Rns: require('@rsksmart/rns'),
      RnsFifsAddrRegistrarData: require('@rsksmart/rns-rskregistrar/FIFSAddrRegistrarData.json'),
      Erc677Data: require('@rsksmart/erc677/ERC677Data.json'),
    });
    return defaultInstance;
  },
}

module.exports = moduleWrap;
