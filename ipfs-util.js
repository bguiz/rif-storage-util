function ipfsUtilFactory({
  // dependencies
  fs,
  path,
  rifStorage,
  recursiveReaddir,
  pMap,
  // config
  ipfsOptions = {
    host: 'localhost',
    port: '5001',
    protocol: 'http',
  },
  fileReadBufferSize = 64e3,
  fileReadConcurrency = 4,
}) {
  if (!fs ||
    !path ||
    !rifStorage ||
    !recursiveReaddir ||
    !pMap) {
    throw new Error('One or more dependencies unspecified');
  }

  return {
    getStorage,
    debugPrintContents,
    fileToStorageData,
    readDirContents,
    uploadToIpfs,
    pinToIpfs,
    unpinFromIpfs,
  };

  function getStorage() {
    const rifStorageInst = rifStorage.default(
      rifStorage.Provider.IPFS,
      ipfsOptions,
    );
    return rifStorageInst;
  }

  async function debugPrintContents(ipfsCid) {
    const storage = getStorage();
    console.log('retrieving...', ipfsCid);
    const retrievedData = await storage.get(ipfsCid);
    console.log(retrievedData);
    return ipfsCid;
  }

  function fileToStorageData(filePath) {
    // NOTE use read streams instead of buffers to
    // avoid reading all contents into memory at once,
    // which is not a good idea for large dirs.
    return {
      data: fs.createReadStream(filePath, {
        flags: 'r',
        bufferSize: fileReadBufferSize,
      }),
    };
  }

  async function readDirContents(dir) {
    const fileList = await recursiveReaddir(dir, []);
    console.log(fileList);
    const contentList = await pMap(
      fileList,
      fileToStorageData,
      { concurrency: fileReadConcurrency },
    );
    const dirContents = Object.assign(
      {},
      ...fileList.map(
        (filePath, idx) => {
          const relativeFilePath = path.relative(
            dir,
            filePath,
          );
          return { [relativeFilePath]: contentList[idx] };
        },
      ),
    );
    return dirContents;
  }

  async function uploadToIpfs(data) {
    console.log(data);
    const storage = getStorage();
    const ipfsHash = await storage.put(data);
    console.log('ipfsHash:' + ipfsHash);

    return ipfsHash;
  }

  async function pinToIpfs(ipfsHash) {
    const storage = getStorage();
    await storage.ipfs.pin.add(ipfsHash);
    const pins = await storage.ipfs.pin.ls();

    console.log('foundPin:');
    const foundPin = pins.find((pin) => (pin.hash === ipfsHash));
    console.log(foundPin);

    const ipfsCid = foundPin.hash
    return ipfsCid;
  }

  async function unpinFromIpfs(ipfsHash) {
    await storage.ipfs.pin.rm(ipfsHash);

    return ipfsHash;
  }
}

let defaultInstance;
const moduleWrap = {
  factory: ipfsUtilFactory,
  get default () {
    if (defaultInstance) {
      return defaultInstance;
    }
    defaultInstance = ipfsUtilFactory({
      fs: require('fs'),
      path: require('path'),
      rifStorage: require('@rsksmart/rif-storage'),
      recursiveReaddir: require('recursive-readdir'),
      pMap: require('p-map'),
    });
    return defaultInstance;
  },
}

module.exports = moduleWrap;
