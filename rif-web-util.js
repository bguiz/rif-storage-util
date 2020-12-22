function rifWebUtilFactory({
  // dependencies
  rifStorageUtil,
  // config
}) {
  if (!rifStorageUtil) {
    throw new Error('One or more dependencies unspecified');
  }

  return {
    rifStorageUtil,
  };
}

const moduleWrap = {
  factory: rifWebUtilFactory,
  get default () {
    return rifWebUtilFactory({
      rifStorageUtil: require('./rif-storage-util.js').default,
    });
  },
}

module.exports = moduleWrap;
