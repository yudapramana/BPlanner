const shared = [];
module.exports = { isAvailableAsync: async () => true, shareAsync: async (uri, opts) => { shared.push({ uri, ...opts }); }, __shared: shared };
