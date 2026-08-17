System.register(["./application.js"], function (_export, _context) {
  "use strict";

  var Application, canvas, container, application, splashShownAt;
  /** Brief company brand flash; gameplay continues on HomePanel. */
  var SPLASH_MIN_MS = 400;
  function hideHtmlSplash() {
    var overlay = document.getElementById('SplashOverlay');
    if (!overlay) return;
    if (overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
  }
  /**
   * Keep #SplashOverlay until HomePanel has drawn (GameBootstrap notify),
   * and never shorter than SPLASH_MIN_MS.
   */
  function scheduleHideHtmlSplash() {
    var elapsed = Date.now() - splashShownAt;
    var waitMin = Math.max(0, SPLASH_MIN_MS - elapsed);
    var g = window;
    var homeReady = false;
    var minElapsed = waitMin <= 0;
    var tryHide = function () {
      if (homeReady && minElapsed) hideHtmlSplash();
    };
    if (waitMin > 0) {
      window.setTimeout(function () {
        minElapsed = true;
        tryHide();
      }, waitMin);
    }
    if (g.__unravelHomeReady) {
      homeReady = true;
      tryHide();
      return;
    }
    var prev = g.__unravelNotifyHomeReady;
    g.__unravelNotifyHomeReady = function () {
      try {
        if (typeof prev === 'function') prev();
      } catch (e) { /* ignore */ }
      homeReady = true;
      tryHide();
    };
    window.setTimeout(hideHtmlSplash, Math.max(waitMin, 12000));
  }
  function topLevelImport(url) {
    return System["import"](url);
  }
  return {
    setters: [function (_applicationJs) {
      Application = _applicationJs.Application;
    }],
    execute: function () {
      splashShownAt = Date.now();
      canvas = document.getElementById('GameCanvas');
      container = canvas.parentElement;
      var containerRect = container.getBoundingClientRect();
      canvas.width = containerRect.width;
      canvas.height = containerRect.height;
      application = new Application();
      topLevelImport('cc').then(function (engine) {
        var originalGameInit = engine.game.init.bind(engine.game);
        engine.game.init = function (config) {
          var overrideSettings = config.overrideSettings || (config.overrideSettings = {});
          var screenSettings = overrideSettings.screen || (overrideSettings.screen = {});
          screenSettings.exactFitScreen = true;

          var splashScreenSettings = overrideSettings.splashScreen || (overrideSettings.splashScreen = {});
          splashScreenSettings.totalTime = 0;
          splashScreenSettings.logo = {
            type: 'none'
          };
          splashScreenSettings.background = {
            type: 'color',
            color: {
              x: 254 / 255,
              y: 255 / 255,
              z: 241 / 255,
              w: 1
            }
          };

          engine.game.init = originalGameInit;
          return originalGameInit(config);
        };
        return application.init(engine);
      }).then(function () {
        return application.start();
      }).then(function () {
        scheduleHideHtmlSplash();
      })["catch"](function (err) {
        hideHtmlSplash();
        console.error(err);
      });
    }
  };
});
