sap.ui.define([
  "sap/ui/core/UIComponent"
], function (UIComponent) {
  "use strict";

  return UIComponent.extend("com.redigo.logistics.cockpit.Component", {
    metadata: {
      manifest: "json"
    },

    init: function () {
      UIComponent.prototype.init.apply(this, arguments);
    },

    showView: function (sKey) {
      var oRootView = this.getRootControl();
      if (oRootView && oRootView.getController()) {
        oRootView.getController()._showView(sKey);
      }
    }
  });
});
