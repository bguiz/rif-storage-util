const rifNameUtil = require('./rif-web-util.js')
  .default.rifNameUtil;
const web3Util = require('./rif-web-util.js')
  .default.web3Util;

async function demoRifNameUtil() {
  try {
    await rifNameUtil.getNameService();
    await rifNameUtil.getRnsRegistrar();
    await rifNameUtil.getRifToken();
    const mainAccount = await web3Util.getMainAccount();
    console.log('init ok');

    const publishResult = await rifNameUtil.publish(
      'bguiztest001',
      // unfortunately web3.js does not use the chainId in checksum calculations
      // see EIP-155 vs EIP-1191. This necessitates the use of all-lowercase
      // in order to bypass checksum calculations altogether
      mainAccount.toLowerCase(),
      1,
      'ipfs://Qmc4BZGtayUqbMdcgc4ThBy933evjFc8REVCpyWv5PuX7B',
    );
    console.log({ publishResult });

    const publishResult2 = await rifNameUtil.contentUpdate(
      'bguiztest001',
      '0x7361Ec744610348c4e8Ab71b4f65077035ce935d',
      'ipfs://Qmc4BZGtayUqbMdcgc4ThBy933evjFc8REVCpyWv5PuX7B',
    );
    console.log({ publishResult2 });
  } catch (ex) {
    console.error(ex);
  }

  await web3Util.stopWeb3();
}

demoRifNameUtil();
