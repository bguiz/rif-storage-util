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

function web3UtilFactory({
  // dependencies
  setTimeout,
  fs,
  Web3,
  HDWalletProvider,
  // config
  web3ProviderOptions = { ...defaultWeb3ProviderOptions },
  web3ProviderSeedPhrase = '',
  web3ProviderSeedPhraseFile = '.testnet.seed-phrase',
  // web3ProviderGasPrice = 0,
  // web3ProviderGasMultiplier = 1.1,
  waitForTxToMineIntervalSeconds = 33,
  waitForTxToMineIntervalCount = 4,
}) {
  if (!fs ||
    !Web3 ||
    !HDWalletProvider) {
    throw new Error('One or more dependencies unspecified');
  }

  function validateSeedPhrase(seedPhrase) {
    if (!seedPhrase) {
      throw new Error('No seed phrase');
    }
    const seedPhraseWordCount = seedPhrase.split(' ').length
    if (seedPhraseWordCount < 12 ||
      seedPhraseWordCount > 24 ||
      (seedPhraseWordCount % 3) !== 0) {
      throw new Error('Invalid seed phrase');
    }
  }

  async function getSeedPhraseFromFile(filePath) {
    const seedPhrase = fs
      .readFileSync(filePath)
      .toString()
      .trim() || '';
    return seedPhrase;
  }

  let web3ProviderInstance;
  let web3Instance;
  async function getWeb3() {
    if (web3Instance) {
      return web3Instance;
    }
    let seedPhrase = web3ProviderSeedPhrase;
    if (!seedPhrase && web3ProviderSeedPhraseFile) {
      seedPhrase = await getSeedPhraseFromFile(web3ProviderSeedPhraseFile);
    }
    validateSeedPhrase(seedPhrase);
    const web3ProviderOptionsFilled = {
      ...web3ProviderOptions,
      mnemonic: {
        ...(web3ProviderOptions.mnemonic),
        phrase: seedPhrase,
      },
    };
    web3ProviderInstance = new HDWalletProvider(web3ProviderOptionsFilled);
    web3Instance = new Web3(web3ProviderInstance);

    return web3Instance;
  }

  /**
   * Stops the network polling, and performs other clean up, to gracefully
   * shutdown.
   * Note that this operation is not instant, and may take as long as the
   * polling interval.
   */
  function stopWeb3() {
    if (web3ProviderInstance) {
      web3ProviderInstance.engine.stop();
    }
  }

  async function waitSeconds(s) {
    return await new Promise((resolve) => {
      setTimeout(resolve, s * 1e3)
    });
  }

  async function waitForTxToMine(
    txHash,
    intervalSeconds = waitForTxToMineIntervalSeconds,
    intervalCount = waitForTxToMineIntervalCount,
  ) {
    const web3 = await getWeb3();
    for (let iter = intervalCount + 1; iter > 0; --iter) {
      const txReceipt = await web3.eth.getTransactionReceipt(txHash);
      if (txReceipt) {
        // NOTE that a mined transaction may be either successful or reverted,
        // based on txReceipt.status
        return txReceipt;
      }
      // if !txReceipt, the transaction is still pending, poll again
      await waitSeconds(intervalSeconds);
    }
    throw new Error('Transaction did not get mined');
  }

  async function getAccounts() {
    const web3 = await getWeb3();
    return web3.eth.getAccounts();
  }

  async function getMainAccount() {
    return (await getAccounts())[0];
  }

  return {
    getWeb3,
    stopWeb3,
    getSeedPhraseFromFile,
    getAccounts,
    getMainAccount,
    // supporting functions
    waitSeconds,
    waitForTxToMine,
  };
}

let defaultInstance;
const moduleWrap = {
  factory: web3UtilFactory,
  get default () {
    if (defaultInstance) {
      return defaultInstance;
    }
    defaultInstance = web3UtilFactory({
      setTimeout,
      fs: require('fs'),
      Web3: require('web3'),
      HDWalletProvider: require('@truffle/hdwallet-provider'),
    });
    return defaultInstance;
  },
}

module.exports = moduleWrap;
