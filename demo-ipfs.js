const ipfsUtil = require('./rif-web-util.js')
  .default.rifStorageUtil.ipfsUtil;

async function demoIpfsUtil() {
  try {
    const dirPath = process.argv[2] || './test-data/';
    await ipfsUtil.readDirContents(dirPath)
      .then(ipfsUtil.uploadToIpfs)
      .then(ipfsUtil.printContents) // to demo that previous step worked
      .then(ipfsUtil.pinToIpfs)
      .then(ipfsUtil.printContents) // to demo that previous step worked
  } catch (ex) {
    console.error(ex);
  }
}

demoIpfsUtil();
