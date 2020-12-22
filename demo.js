const ipfsUtil = require('./rif-web-util.js')
  .default.rifStorageUtil.ipfsUtil;

const dirPath = process.argv[2] || './test-data/';
ipfsUtil.readDirContents(dirPath)
  .then(ipfsUtil.uploadToIpfs)
  .then(ipfsUtil.printContents) // to demo that previous step worked
  .then(ipfsUtil.pinToIpfs)
  .then(ipfsUtil.printContents) // to demo that previous step worked
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
