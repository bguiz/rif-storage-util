function rifStorageUtilFactory({
  // dependencies
  ipfsUtil,
  // config
}) {
  if (!ipfsUtil) {
    throw new Error('One or more dependencies unspecified');
  }
  console.log(ipfsUtil);

  return {
    ipfs: ipfsUtil,
  };
}

const moduleWrap = {
  factory: rifStorageUtilFactory,
  get default () {
    return rifStorageUtilFactory({
      ipfsUtil: require('./ipfs-util.js').default,
    });
  },
}

module.exports = moduleWrap;
