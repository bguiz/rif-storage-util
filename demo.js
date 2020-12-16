const ipfs = require('./rif-storage-util.js').default.ipfs;

const dirPath = process.argv[2] || './test-data/';
ipfs.readDirContents(dirPath)
  .then(ipfs.uploadToIpfs)
  .then(ipfs.printContents) // to demo that previous step worked
  .then(ipfs.pinToIpfs)
  .then(ipfs.printContents) // to demo that previous step worked
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
