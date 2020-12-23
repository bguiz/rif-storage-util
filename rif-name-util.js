function rifNameUtilFactory({
  // dependencies
  web3Util,
  Rns,
  RnsFifsAddrRegistrarData,
  Erc677Data,
  // config
  postMakeCommitmentCanRevealPollingInterval = 35,
  // TODO import rnsDefinitiveResolverAddress from somewhere, instead of hardcoding it
  rnsDefinitiveResolverAddress = '0x25C289ccCFFf700c6a38722F4913924fE504De0e',
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

  async function registerCommit(label, address) {
    // console.log('registerCommit', { label, address });
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
        await web3Util.waitSeconds(postMakeCommitmentCanRevealPollingInterval);
      }
    }

    return {
      secret,
      commitment,
      makeCommitmentTxHash: tx1.transactionHash,
    };
  }

  async function registerFinalise(label, address, duration, secret) {
    // console.log('registerFinalise', { label, address, duration, secret });
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

    // NOTE default resolver is not the "definitive resolver",
    // which is required in order to be able to get/ set contenthash

    return {
      transferAndCallTxHash: tx3.transactionHash,
    };
  }

  async function register(label, address, duration) {
    // console.log('register', { label, address, duration });
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

  async function contentUpdate(label, address, contenthash) {
    // console.log('contentUpdate', { label, address, contenthash });
    const rns = await getNameService();
    const name = `${label}.rsk`;

    let currentContenthash = '';
    let needToUpdateResolver = false;
    let needToUpdateContenthash = false;
    try {
      currentContenthash = await rns.contenthash(name);
      // console.log({ currentContenthash });
      needToUpdateContenthash =
        (`${currentContenthash.protocolType}://${currentContenthash.decoded}` !==
        contenthash);
    } catch (ex) {
      if (ex.message === 'No addr resolution set' ||
        ex.message === 'No resolver' ||
        ex.message === 'No contenthash interface') {
        needToUpdateResolver = true;
        needToUpdateContenthash = true;
      } else if (ex.message === 'No contenthash resolution set') {
        // resolver already supports contenthash, no need to change it
        needToUpdateContenthash = true;
      } else {
        throw ex;
      }
    }

    if (needToUpdateResolver) {
      const txHashForSetResolver = await rns.setResolver(
        name,
        rnsDefinitiveResolverAddress.toLowerCase(),
      );
      // console.log({ txHashForSetResolver });

      // wait until above tx has been mined
      const txReceiptForSetResolver = await web3Util.waitForTxToMine(txHashForSetResolver);
      if (!txReceiptForSetResolver.status) {
        throw new Error('Failure in setResolver for tx ' + txHashForSetResolver);
      }
    }

    // may need to setAddr again, because changing the resolver means that
    // existing address resolutions disappear
    let needToUpdateAddr = needToUpdateResolver;
    if (!needToUpdateAddr) {
      let currentAddr;
      try {
        currentAddr = await rns.addr(name);
      } catch (ex) {
        if (ex.message === 'No addr resolution set') {
          needToUpdateAddr = true;
        } else {
          throw ex;
        }
      }
      needToUpdateAddr = !currentAddr ||
        (currentAddr.toLowerCase() !== address.toLowerCase());
    }

    if (needToUpdateAddr) {
      const txHashForSetAddr = await rns.setAddr(name, address.toLowerCase());
      // console.log({ txHashForSetAddr });

      // wait until above tx has been mined
      const txReceiptForSetAddr = await web3Util.waitForTxToMine(txHashForSetAddr);
      if (!txReceiptForSetAddr.status) {
        throw new Error('Failure in setAddr for tx ' + txHashForSetAddr);
      }
    }

    if (needToUpdateContenthash) {
      const txHashForSetContenthash = await rns.setContenthash(
        name,
        contenthash,
      );
      // console.log({ txHashForSetContenthash });

      // wait until above tx has been mined
      const txReceiptForSetContenthash = await web3Util.waitForTxToMine(txHashForSetContenthash);
      if (!txReceiptForSetContenthash.status) {
        throw new Error('Failure in setContenthash for tx ' + txHashForSetContenthash);
      }
    }

    const updatedContentHash = await rns.contenthash(name);
    let localUrl;
    let remoteUrl;
    if (updatedContentHash.protocolType === 'ipfs') {
      localUrl = `http://localhost:8080/ipfs/${updatedContentHash.decoded}`;
      remoteUrl = `https://ipfs.io/ipfs/${updatedContentHash.decoded}`;
    }

    return {
      name,
      address,
      ...updatedContentHash,
      localUrl,
      remoteUrl,
    };
  }

  async function publish(label, address, duration, contenthash) {
    const rns = await getNameService();

    let lookedUpAddress;
    let noResolver = false;
    let noResolution = false;
    const name = `${label}.rsk`;
    try {
      lookedUpAddress = await rns.addr(name);
    } catch (lookupError) {
      if (lookupError.message !== 'No resolver') {
        if (lookupError.message !== 'No addr resolution set') {
          throw lookupError; // rethrow
        } else {
          noResolution = true;
        }
      } else {
        noResolver = true;
      }
    }
    // console.log({ noResolution, noResolver });
    if (noResolver) {
      // then register the address for the first time
      await register(label, address, duration);
      // console.log('register completed');
    } else if (lookedUpAddress &&
      lookedUpAddress.toLowerCase() !== address.toLowerCase()) {
      throw new Error(
        'Name already registered to a different address: ' +
        lookedUpAddress);
    }

    const updatedContentHash = await contentUpdate(label, address, contenthash);
    let localUrl;
    let remoteUrl;
    if (updatedContentHash.type === 'ipfs') {
      localUrl = `http://localhost:8080/ipfs/${updatedContentHash.decoded}`;
      remoteUrl = `https://ipfs.io/ipfs/${updatedContentHash.decoded}`;
    }

    return {
      name,
      address,
      ...updatedContentHash,
      localUrl,
      remoteUrl,
    };
  }

  return {
    getNameService,
    getRnsRegistrar,
    getRifToken,
    getRnsFifsRegistrarRegisterCallData,
    registerCommit,
    registerFinalise,
    register,
    contentUpdate,
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
      web3Util: require('./web3-util.js').default,
      Rns: require('@rsksmart/rns'),
      RnsFifsAddrRegistrarData: require('@rsksmart/rns-rskregistrar/FIFSAddrRegistrarData.json'),
      Erc677Data: require('@rsksmart/erc677/ERC677Data.json'),
    });
    return defaultInstance;
  },
}

module.exports = moduleWrap;
