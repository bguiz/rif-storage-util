const web3Util = require('./rif-web-util.js')
  .default.web3Util;

async function demoWeb3Util() {
  try {
    const web3 = await web3Util.getWeb3();
    const chainId = await web3.eth.net.getId();
    const mainAccount = await web3Util.getMainAccount();
    console.log({ chainId, mainAccount });
  } catch (ex) {
    console.error(ex);
  }

  await web3Util.stopWeb3();
}

demoWeb3Util();
