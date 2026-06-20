const app = (() => {
  const readyContext = {}

  const ready = new Promise((resolve, reject) => {
    readyContext.resolve = resolve
    readyContext.reject = reject
  })

  let isActive = false,
    root

  return {
    activate: function () {
      isActive = true

      root = document.querySelector('.a-app')
      root.classList.add('a-app-active')

      readyContext.resolve()

      return this
    },
    isActive: () => isActive,
    isElectron: () => typeof ElectronApi != 'undefined',
    name: () => 'Audio Breakout',
    quit: function () {
      if (this.isElectron()) {
        ElectronApi.quit()
      } else {
        window.location.href = '../../'
      }
    },
    ready: async (callback) => {
      return typeof callback == 'function'
        ? ready.then(callback)
        : ready
    },
    screen: {},
    utility: {},
    version: () => '0.0.0', // Replaced via Gulpfile.js
  }
})()
