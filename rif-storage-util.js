function rifStorageUtilFactory({
  // dependencies
  ipfsUtil,
  // config
}) {
  if (!ipfsUtil) {
    throw new Error('One or more dependencies unspecified');
  }

  return {
    ipfsUtil,
  };
}

let defaultInstance;
const moduleWrap = {
  factory: rifStorageUtilFactory,
  get default () {
    if (defaultInstance) {
      return defaultInstance;
    }
    defaultInstance = rifStorageUtilFactory({
      ipfsUtil: require('./ipfs-util.js').default,
    });
    return defaultInstance;
  },
}

module.exports = moduleWrap;
