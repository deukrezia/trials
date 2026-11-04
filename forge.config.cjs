module.exports = {
  packagerConfig: {
    asar: true,
    name: 'Trials',
    executableName: 'Trials',
    appBundleId: 'app.trials.battlemap',
    ignore: [/^\/(?!desktop(?:\/|$)|dist(?:\/|$)|package\.json$)/, /^\/dist\/(?!desktop(?:\/|$))/, /^\/desktop\/(?!main\.cjs$|preload\.cjs$)/],
  },
  makers: [{ name: '@electron-forge/maker-zip', platforms: ['win32'] }],
};
