function rifWebUtilFactory({
  // dependencies
  web3Util,
  rifStorageUtil,
  rifNameUtil,
  // config
}) {
  if (!web3Util ||
    !rifStorageUtil ||
    !rifNameUtil) {
    throw new Error('One or more dependencies unspecified');
  }

  return {
    web3Util,
    rifStorageUtil,
    rifNameUtil,
  };
}

const moduleWrap = {
  factory: rifWebUtilFactory,
  get default () {
    return rifWebUtilFactory({
      web3Util: require('./web3-util.js').default,
      rifStorageUtil: require('./rif-storage-util.js').default,
      rifNameUtil: require('./rif-name-util.js').default,
    });
  },
}

module.exports = moduleWrap;
